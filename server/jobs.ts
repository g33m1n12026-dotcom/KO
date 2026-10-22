import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { Job, ChapterData, StorybookRequest } from '../src/types';
import { translateText, proofreadChapterF7 } from './ai';
import {
  generateEpubBuffer,
  sanitizeToAsciiFilename,
  cleanHtmlEntitiesToUtf8,
  resolveDisplayChapterTitle,
} from './epub';
import { parseDocumentBuffer, heuristicOcrProofread, unpackZipArchive } from './extractor';
import { fetchRemoteBookBuffer } from './search';
import { convertToCbz } from './comic';
import { executeStorybookJob } from './storybook';
import { detectBookSeries } from './series';

const SEED_DATA_DIR = path.join(process.cwd(), 'data');
const SEED_EPUB_DIR = path.join(SEED_DATA_DIR, 'epubs');
const SEED_JOBS_FILE = path.join(SEED_DATA_DIR, 'jobs.json');

const WRITABLE_DATA_DIR = process.env.VERCEL ? path.join('/tmp', 'data') : SEED_DATA_DIR;
const EPUB_DIR = path.join(WRITABLE_DATA_DIR, 'epubs');
const JOBS_FILE = path.join(WRITABLE_DATA_DIR, 'jobs.json');
const DELETED_JOBS_FILE = path.join(WRITABLE_DATA_DIR, 'deleted_jobs.json');

try {
  if (!fs.existsSync(EPUB_DIR)) {
    fs.mkdirSync(EPUB_DIR, { recursive: true });
  }
} catch (err) {
  console.warn('Nie można utworzyć katalogu EPUB_DIR:', err);
}

// Job registry with disk persistence
const jobs: Map<string, Job> = new Map();
const deletedJobIds: Set<string> = new Set();
const deletedTitles: Set<string> = new Set();
const deletedFilenames: Set<string> = new Set();

function normalizeKey(str?: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (c) => {
      const map: Record<string, string> = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' };
      return map[c] || c;
    })
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function loadDeletedJobs(): void {
  try {
    if (fs.existsSync(DELETED_JOBS_FILE)) {
      const raw = fs.readFileSync(DELETED_JOBS_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        for (const id of data) deletedJobIds.add(id);
      } else if (data && typeof data === 'object') {
        if (Array.isArray(data.ids)) data.ids.forEach((id: string) => deletedJobIds.add(id));
        if (Array.isArray(data.titles)) data.titles.forEach((t: string) => deletedTitles.add(t));
        if (Array.isArray(data.filenames)) data.filenames.forEach((f: string) => deletedFilenames.add(f));
      }
    }
  } catch (err) {
    console.warn('Błąd odczytu data/deleted_jobs.json:', err);
  }
}

function saveDeletedJobs(): void {
  try {
    fs.writeFileSync(
      DELETED_JOBS_FILE,
      JSON.stringify({
        ids: Array.from(deletedJobIds),
        titles: Array.from(deletedTitles),
        filenames: Array.from(deletedFilenames),
      }, null, 2),
      'utf-8'
    );
  } catch {}
}

loadDeletedJobs();

export function saveJobsToDisk(): void {
  try {
    const list = Array.from(jobs.values()).map((j) => {
      if (j.chapters && j.chapters.length > 0) {
        return {
          ...j,
          chapters: j.chapters.map((c) => {
            if ((c as any).imageBuffer) {
              const { imageBuffer, ...rest } = c as any;
              return rest;
            }
            return c;
          }),
        };
      }
      return j;
    });
    fs.writeFileSync(JOBS_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Nie udało się zapisać data/jobs.json:', err);
  }
}

export async function detectFileDetailedFormat(filename?: string, buffer?: Buffer): Promise<string> {
  if (!filename) return 'EPUB';
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return 'PDF';
  if (lower.endsWith('.cbz') || lower.endsWith('.cbr')) return 'CBZ';
  if (lower.endsWith('.mobi') || lower.endsWith('.azw') || lower.endsWith('.azw3')) return 'MOBI';
  if (lower.endsWith('.txt')) return 'TXT';

  if (lower.endsWith('.epub')) {
    try {
      const dataBuf = buffer || (fs.existsSync(path.join(EPUB_DIR, filename)) ? fs.readFileSync(path.join(EPUB_DIR, filename)) : (fs.existsSync(path.join(SEED_EPUB_DIR, filename)) ? fs.readFileSync(path.join(SEED_EPUB_DIR, filename)) : null));
      if (dataBuf) {
        const zip = await JSZip.loadAsync(dataBuf);
        for (const name of Object.keys(zip.files)) {
          if (name.endsWith('.opf')) {
            const opf = await zip.files[name].async('text');
            const vMatch = opf.match(/<package[^>]*version=["']([^"']+)["']/i);
            if (vMatch && vMatch[1].startsWith('3')) {
              return 'EPUB 3';
            }
            return 'EPUB 2';
          }
        }
      }
    } catch {}
    return 'EPUB';
  }

  const extMatch = filename.match(/\.([a-z0-9]+)$/i);
  return extMatch ? extMatch[1].toUpperCase() : 'EPUB';
}

function loadJobsFromDisk(): void {
  const filesToRead = [SEED_JOBS_FILE];
  if (JOBS_FILE !== SEED_JOBS_FILE && fs.existsSync(JOBS_FILE)) {
    filesToRead.push(JOBS_FILE);
  }

  for (const fpath of filesToRead) {
    try {
      if (fs.existsSync(fpath)) {
        const raw = fs.readFileSync(fpath, 'utf-8');
        const parsed: Job[] = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const now = Date.now();
          for (const job of parsed) {
            const normTitle = normalizeKey(job.title);
            const normFile = (job.outputEpubFilename || '').toLowerCase();

            if (
              !job.id ||
              deletedJobIds.has(job.id) ||
              (normTitle && deletedTitles.has(normTitle)) ||
              (normFile && deletedFilenames.has(normFile))
            ) {
              continue; // Skip previously deleted jobs
            }

            if (job.title) {
              job.title = job.title
                .replace(/&apos;/g, "'")
                .replace(/&quot;/g, '"')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>');
            }

            // Watchdog: Un-stick jobs interrupted by previous server restart
            if (['queued', 'extracting', 'translating', 'packaging'].includes(job.status)) {
              const ageMs = now - (job.updatedAt || job.createdAt || 0);
              if (ageMs > 5 * 60 * 1000) {
                job.status = 'failed';
                job.error = 'Zadanie zostało przerwane z powodu restartu serwera lub przekroczenia limitu czasu.';
                job.logs.push(`[${new Date().toLocaleTimeString()}] Zatrzymano zadanie wiszące w kolejce po restarcie.`);
              }
            }

            // Validate file presence on disk (check both writable and seed epubs directory)
            if (job.status === 'completed' && job.outputEpubFilename) {
              const fileInWritable = path.join(EPUB_DIR, job.outputEpubFilename);
              const fileInSeed = path.join(SEED_EPUB_DIR, job.outputEpubFilename);
              const fileExists = fs.existsSync(fileInWritable) || fs.existsSync(fileInSeed);

              if (!fileExists) {
                if (job.chapters && job.chapters.length > 0) {
                  // Auto-repair missing file from existing chapter data
                  generateEpubBuffer({
                    title: job.title,
                    author: 'KOReader AI Cloud',
                    language: 'pl',
                    chapters: job.chapters,
                  }).then((buf) => {
                    fs.writeFileSync(fileInWritable, buf);
                    console.log(`Pomyślnie zregenerowano brakujący plik EPUB: ${job.outputEpubFilename}`);
                  }).catch((e) => console.warn(`Nie udało się zregenerować pliku ${job.outputEpubFilename}:`, e));
                } else {
                  job.status = 'failed';
                  job.error = 'Plik źródłowy nie jest już dostępny na dysku serwera';
                }
              }
            }

            if (job.status === 'completed' && job.outputEpubFilename && !job.detailedFormat) {
              detectFileDetailedFormat(job.outputEpubFilename).then((fmt) => {
                job.detailedFormat = fmt;
              }).catch(() => {});
            }

            if (!job.series) {
              const ser = detectBookSeries(job.title);
              if (ser) job.series = ser;
            }

            jobs.set(job.id, job);
          }
        }
      }
    } catch (err) {
      console.warn(`Błąd odczytu ${fpath}:`, err);
    }
  }

  // Auto-scan EPUB_DIR for any completed files on disk not yet in jobs
  try {
    if (fs.existsSync(EPUB_DIR)) {
      const files = fs.readdirSync(EPUB_DIR);
      for (const file of files) {
        if (!file.endsWith('.epub') && !file.endsWith('.cbz')) continue;
        const normFile = file.toLowerCase();
        if (deletedFilenames.has(normFile)) continue;
        const alreadyIndexed = Array.from(jobs.values()).some(j => j.outputEpubFilename === file);
        if (!alreadyIndexed) {
          const filePath = path.join(EPUB_DIR, file);
          const stat = fs.statSync(filePath);
          const cleanTitle = file.replace(/\.[^/.]+$/, '').replace(/[_.-]+/g, ' ').trim();
          const normTitle = normalizeKey(cleanTitle);
          if (normTitle && deletedTitles.has(normTitle)) continue;
          const autoId = `job_file_${file.replace(/[^a-zA-Z0-9]/g, '_')}`;
          if (deletedJobIds.has(autoId)) continue;
          const isCbz = file.toLowerCase().endsWith('.cbz');
          const autoJob: Job = {
            id: autoId,
            title: cleanTitle,
            sourceLang: 'pl',
            targetLang: 'pl',
            engine: 'auto',
            conversionMode: isCbz ? 'comic_cbz' : 'translate',
            outputFormat: isCbz ? 'cbz' : 'epub',
            status: 'completed',
            progress: 100,
            totalChapters: 1,
            currentChapter: 1,
            chapters: [],
            createdAt: stat.mtimeMs || Date.now(),
            updatedAt: stat.mtimeMs || Date.now(),
            sourceType: 'storybook',
            originalSize: stat.size,
            outputEpubFilename: file,
            logs: [`Zindeksowano gotowy plik: ${file}`],
          };
          jobs.set(autoId, autoJob);


          // Asynchronously enrich with real OPF title if EPUB
          if (file.endsWith('.epub')) {
            JSZip.loadAsync(fs.readFileSync(filePath)).then(async zip => {
              for (const name of Object.keys(zip.files)) {
                if (name.endsWith('.opf')) {
                  const opf = await zip.files[name].async('text');
                  const tm = opf.match(/<dc:title[^>]*>(.*?)<\/dc:title>/i);
                  if (tm && tm[1]) {
                    autoJob.title = tm[1]
                      .replace(/<[^>]+>/g, '')
                      .replace(/&apos;/g, "'")
                      .replace(/&#39;/g, "'")
                      .replace(/&#x27;/g, "'")
                      .replace(/&quot;/g, '"')
                      .replace(/&amp;/g, '&')
                      .replace(/&lt;/g, '<')
                      .replace(/&gt;/g, '>')
                      .trim();
                    saveJobsToDisk();
                  }
                  break;
                }
              }
            }).catch(() => {});
          }
        }
      }
    }
  } catch (err) {
    console.warn('Błąd skanowania katalogu epubs:', err);
  }
}

// Auto sync with remote Render server (so Kindle and Web UI share the exact same library and tasks)
let lastRenderSync = 0;
export async function syncWithRenderServer(): Promise<void> {
  const remoteUrl = process.env.REMOTE_SYNC_URL;
  if (!remoteUrl) return; // Do not poll suspended servers if not configured

  const now = Date.now();
  if (now - lastRenderSync < 10000) return; // rate limit sync to every 10s
  lastRenderSync = now;

  try {
    const res = await fetch(`${remoteUrl.replace(/\/+$/, '')}/api/jobs`, {
      signal: AbortSignal.timeout(3000),
      headers: { 'Accept': 'application/json' },
    });
    if (res.ok) {
      const remoteJobs = await res.json();
      if (Array.isArray(remoteJobs)) {
        let changed = false;
        for (const rj of remoteJobs) {
          if (!rj.id) continue;

          // If this job ID, title or filename was deleted by the user, ensure it stays deleted
          const rjNormTitle = normalizeKey(rj.title);
          const isDeleted = deletedJobIds.has(rj.id) ||
            (rj.outputEpubFilename && deletedFilenames.has(rj.outputEpubFilename)) ||
            (rjNormTitle && deletedTitles.has(rjNormTitle));

          if (isDeleted) {
            if (remoteUrl) {
              fetch(`${remoteUrl.replace(/\/+$/, '')}/api/jobs/${encodeURIComponent(rj.id)}`, { method: 'DELETE', signal: AbortSignal.timeout(3000) }).catch(() => {});
              fetch(`${remoteUrl.replace(/\/+$/, '')}/api/koreader/tasks/${encodeURIComponent(rj.id)}`, { method: 'DELETE', signal: AbortSignal.timeout(3000) }).catch(() => {});
            }
            continue;
          }

          const local = jobs.get(rj.id);
          if (!local) {
            jobs.set(rj.id, rj);
            changed = true;
          } else if (rj.status === 'completed' && local.status !== 'completed') {
            jobs.set(rj.id, rj);
            changed = true;
          }
        }
        if (changed) {
          saveJobsToDisk();
          console.log(`[Sync] Zsynchronizowano bibliotekę z czytnikiem / Render (${remoteJobs.length} pozycji)`);
        }
      }
    }
  } catch {}
}

// Background queue watchdog to prevent truly orphaned / dead jobs from hanging forever
setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const job of jobs.values()) {
    if (['queued', 'extracting', 'translating', 'packaging'].includes(job.status)) {
      const ageMs = now - (job.updatedAt || job.createdAt || 0);
      // Increased from 6m to 25m so large books with dozens of chapters are never prematurely aborted
      if (ageMs > 25 * 60 * 1000) {
        job.status = 'failed';
        job.error = 'Zadanie przekroczyło limit czasu przetwarzania w kolejce.';
        job.logs.push(`[${new Date().toLocaleTimeString()}] Przekroczono limit czasu oczekiwania.`);
        job.updatedAt = now;
        changed = true;
      }
    }
  }
  if (changed) {
    saveJobsToDisk();
  }
}, 30000);

// Initial load
loadJobsFromDisk();
syncWithRenderServer().catch(() => {});

export function getAllJobs(): Job[] {
  syncWithRenderServer().catch(() => {});
  return Array.from(jobs.values())
    .map(j => {
      // Strip heavy chapter texts from listing to prevent payload bloat and Kindle crashes
      if (j.chapters && j.chapters.length > 0) {
        const { chapters, ...rest } = j;
        return {
          ...rest,
          totalChapters: j.totalChapters || chapters.length,
        } as Job;
      }
      return j;
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function getJobById(id: string): Job | undefined {
  if (jobs.has(id)) return jobs.get(id);
  // Also check if id matches an output filename directly
  for (const job of jobs.values()) {
    if (job.outputEpubFilename === id || job.id === id) return job;
  }
  return undefined;
}

export function getEpubFilePath(filename: string): string | null {
  if (!filename) return null;
  const safeFilename = path.basename(filename);

  const searchDirs = [EPUB_DIR];
  if (SEED_EPUB_DIR !== EPUB_DIR) {
    searchDirs.push(SEED_EPUB_DIR);
  }

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;

    const directPath = path.join(dir, safeFilename);
    if (fs.existsSync(directPath)) {
      return directPath;
    }

    // 1. Try URL decoded path
    try {
      const decoded = decodeURIComponent(safeFilename);
      const decodedPath = path.join(dir, decoded);
      if (fs.existsSync(decodedPath)) return decodedPath;
    } catch {}

    // 2. Try sanitized ASCII filename
    const cleanBase = sanitizeToAsciiFilename(safeFilename.replace(/\.(epub|cbz)$/i, ''));
    const ext = safeFilename.endsWith('.cbz') ? '.cbz' : '.epub';
    const asciiPath = path.join(dir, `${cleanBase}${ext}`);
    if (fs.existsSync(asciiPath)) return asciiPath;

    // 3. Scan directory for matching prefix or timestamp
    const files = fs.readdirSync(dir);
    const tsMatch = safeFilename.match(/\d{10,}/);
    if (tsMatch) {
      const match = files.find(f => f.includes(tsMatch[0]));
      if (match) return path.join(dir, match);
    }

    const normTarget = cleanBase.replace(/[^a-z0-9]/gi, '').substring(0, 20);
    if (normTarget.length > 4) {
      const match = files.find(f => f.replace(/[^a-z0-9]/gi, '').includes(normTarget));
      if (match) return path.join(dir, match);
    }
  }

  return null;
}

export function importJobs(incoming: Job[]): void {
  let changed = false;
  for (const job of incoming) {
    if (!job || !job.id) continue;
    const normTitle = normalizeKey(job.title);
    const normFile = (job.outputEpubFilename || '').toLowerCase();
    if (
      deletedJobIds.has(job.id) ||
      (normTitle && deletedTitles.has(normTitle)) ||
      (normFile && deletedFilenames.has(normFile))
    ) {
      continue;
    }
    const existing = jobs.get(job.id);
    if (!existing || (job.updatedAt || 0) > (existing.updatedAt || 0)) {
      jobs.set(job.id, job);
      changed = true;
    }
  }
  if (changed) {
    saveJobsToDisk();
  }
}

export function deleteJob(id: string): boolean {
  const job = getJobById(id);
  const targetId = job ? job.id : id;

  // Track specific job ID, filename, and title as deleted so sync never re-adds it
  deletedJobIds.add(targetId);
  deletedJobIds.add(id);
  if (job?.outputEpubFilename) {
    deletedFilenames.add(job.outputEpubFilename);
  }
  if (job?.title) {
    deletedTitles.add(normalizeKey(job.title));
  }
  saveDeletedJobs();

  // Propagate deletion to remote server if configured
  const remoteSyncUrl = process.env.REMOTE_SYNC_URL;
  if (remoteSyncUrl) {
    fetch(`${remoteSyncUrl.replace(/\/+$/, '')}/api/jobs/${encodeURIComponent(targetId)}`, { method: 'DELETE', signal: AbortSignal.timeout(3000) }).catch(() => {});
    fetch(`${remoteSyncUrl.replace(/\/+$/, '')}/api/koreader/tasks/${encodeURIComponent(targetId)}`, { method: 'DELETE', signal: AbortSignal.timeout(3000) }).catch(() => {});
  }

  // Remove the specific job from Map
  jobs.delete(targetId);
  jobs.delete(id);

  // Delete output EPUB/CBZ file from disk ONLY if no other active job uses it
  if (job?.outputEpubFilename) {
    const isFileUsedByOtherJob = Array.from(jobs.values()).some(
      (j) => j.id !== targetId && j.outputEpubFilename === job.outputEpubFilename
    );

    if (!isFileUsedByOtherJob) {
      const filePath = getEpubFilePath(job.outputEpubFilename);
      if (filePath && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          console.log(`Usunięto plik książki z dysku: ${filePath}`);
        } catch (err) {
          console.warn(`Nie udało się usunąć pliku ${filePath}:`, err);
        }
      }
    }
  }

  saveJobsToDisk();
  return true;
}

export function clearFailedJobs(): number {
  let count = 0;
  for (const job of Array.from(jobs.values())) {
    if (job.status === 'failed' || (job.error && job.status !== 'completed')) {
      deleteJob(job.id);
      count++;
    }
  }
  return count;
}

export function createUploadJob(
  filename: string,
  buffer: Buffer,
  engine: Job['engine'] = 'auto',
  targetLang: string = 'Polish',
  conversionMode: Job['conversionMode'] = 'translate'
): Job {
  const id = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const cleanTitle = filename.replace(/\.[^/.]+$/, '').replace(/[_.-]+/g, ' ').trim();

  const newJob: Job = {
    id,
    title: cleanTitle,
    sourceLang: 'auto',
    targetLang,
    engine,
    conversionMode,
    outputFormat: conversionMode === 'comic_cbz' ? 'cbz' : 'epub',
    status: 'queued',
    progress: 5,
    totalChapters: 0,
    currentChapter: 0,
    chapters: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    sourceType: 'upload',
    originalSize: buffer.length,
    logs: [
      `[${new Date().toLocaleTimeString()}] Zadanie dodane do kolejki. Tryb: ${
        conversionMode === 'comic_cbz'
          ? 'Format komiksowy (CBZ dla e-ink)'
          : conversionMode === 'epub_clean'
          ? 'Lekki EPUB (bez tłumaczenia, płynny tekst)'
          : 'Tłumacz na polski + EPUB'
      }. Rozmiar pliku: ${(buffer.length / 1024).toFixed(1)} KB`,
    ],
  };

  jobs.set(id, newJob);
  saveJobsToDisk();

  // Trigger processing asynchronously in background
  processJobAsync(id, buffer, filename).catch(err => {
    console.error(`Błąd przetwarzania zadania ${id}:`, err);
  });

  return newJob;
}

export function createDirectFileJob(
  title: string,
  filename: string,
  format: 'epub' | 'pdf' | 'cbz' | 'mobi' | 'txt' | 'azw3' | 'fb2',
  size: number,
  author?: string
): Job {
  const id = `job_direct_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const cleanTitle = title.replace(/\.[^/.]+$/, '').replace(/[_.-]+/g, ' ').trim();

  const newJob: Job = {
    id,
    title: cleanTitle,
    author: author?.trim() || 'Własny plik (z telefonu)',
    sourceLang: 'auto',
    targetLang: 'original',
    engine: 'auto',
    conversionMode: 'original',
    outputFormat: format as any,
    outputEpubFilename: filename,
    status: 'completed',
    progress: 100,
    totalChapters: 1,
    currentChapter: 1,
    chapters: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    sourceType: 'upload',
    originalSize: size,
    logs: [
      `[${new Date().toLocaleTimeString()}] Wgrano plik bezpośrednio z telefonu/urządzenia (${(size / 1024).toFixed(1)} KB).`,
      `[${new Date().toLocaleTimeString()}] SUKCES! Plik został natychmiast udostępniony w katalogu OPDS czytnika oraz w bibliotece chmury.`,
    ],
  };

  detectFileDetailedFormat(filename).then((df) => {
    newJob.detailedFormat = df;
    saveJobsToDisk();
  }).catch(() => {});

  jobs.set(id, newJob);
  saveJobsToDisk();
  return newJob;
}

export function createSearchOrderJob(
  title: string,
  downloadUrl: string,
  engine: Job['engine'] = 'auto',
  targetLang: string = 'Polish',
  conversionMode: Job['conversionMode'] = 'translate',
  expectedLang?: string
): Job {
  const id = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const extMatch = downloadUrl.match(/\.(epub|pdf|mobi|cbz|txt|azw3|fb2)(?:[\?#]|$)/i);
  const detectedExt = extMatch ? extMatch[1].toLowerCase() : 'epub';

  const newJob: Job = {
    id,
    title,
    sourceLang: 'auto',
    targetLang,
    engine,
    conversionMode,
    outputFormat: conversionMode === 'comic_cbz' ? 'cbz' : (conversionMode === 'original' ? (detectedExt as any) : 'epub'),
    status: 'queued',
    progress: 5,
    totalChapters: 0,
    currentChapter: 0,
    chapters: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    sourceType: 'search',
    expectedLang: expectedLang || (/[ąćęłńóśźż]/i.test(title) ? 'PL' : undefined),
    logs: [
      `[${new Date().toLocaleTimeString()}] Zlecenie: "${title}". Tryb: ${
        conversionMode === 'original'
          ? 'Pobierz oryginał (bez modyfikacji)'
          : conversionMode === 'epub_clean'
          ? 'Lekki EPUB dla e-ink (bez tłumaczenia)'
          : 'Przetłumacz na polski (EPUB)'
      }`,
    ],
  };

  jobs.set(id, newJob);
  saveJobsToDisk();

  // Download and process
  (async () => {
    try {
      let host = 'repozytorium';
      try {
        if (downloadUrl.startsWith('http')) host = new URL(downloadUrl).hostname;
        else if (downloadUrl.startsWith('zlib://')) host = 'Z-Library';
        else if (downloadUrl.includes('chomikuj')) host = 'Chomikuj.pl';
      } catch {}

      newJob.status = 'extracting';
      newJob.progress = 10;
      newJob.updatedAt = Date.now();
      newJob.logs.push(`[${new Date().toLocaleTimeString()}] Rozpoczynanie pobierania pliku ze źródła (${host})...`);
      saveJobsToDisk();

      const { buffer, filename } = await fetchRemoteBookBuffer(downloadUrl, newJob.title, (msg) => {
        newJob.logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
        newJob.updatedAt = Date.now();
        saveJobsToDisk();
      });
      newJob.originalSize = buffer.length;
      newJob.logs.push(`[${new Date().toLocaleTimeString()}] Pobrano plik: ${(buffer.length / 1024).toFixed(1)} KB (${filename})`);
      newJob.updatedAt = Date.now();
      saveJobsToDisk();
      await processJobAsync(id, buffer, filename);
    } catch (err: any) {
      newJob.status = 'failed';
      newJob.error = err.message || 'Błąd pobierania ze źródła';
      newJob.logs.push(`[${new Date().toLocaleTimeString()}] BŁĄD: ${newJob.error}`);
      newJob.updatedAt = Date.now();
      saveJobsToDisk();
    }
  })();

  return newJob;
}

export function createStorybookJob(req: StorybookRequest): Job {
  const id = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const title = req.title || (req.type === 'story' ? 'Powieść na życzenie' : req.type === 'summary' ? 'Streszczenie książki' : 'Poradnik AI');

  const newJob: Job = {
    id,
    title,
    sourceLang: 'pl',
    targetLang: 'pl',
    engine: req.engine || 'auto',
    conversionMode: 'translate',
    outputFormat: 'epub',
    status: 'queued',
    progress: 5,
    totalChapters: req.chapterCount || 5,
    currentChapter: 0,
    chapters: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    sourceType: 'storybook',
    storybookConfig: req,
    logs: [
      `[${new Date().toLocaleTimeString()}] Utworzono zlecenie: Książka na życzenie (${
        req.type === 'story' ? 'Opowiadanie / Powieść' : req.type === 'summary' ? 'Streszczenie & Przewodnik' : 'Poradnik / Instrukcja'
      }). Rozdziałów: ${req.chapterCount || 5}, Ilustracje: ${req.includeIllustrations ? 'Tak' : 'Nie'}.`,
    ],
  };

  jobs.set(id, newJob);
  saveJobsToDisk();

  // Run in background asynchronously
  executeStorybookJob(newJob, req).catch((err) => {
    console.error(`Błąd pisania książki ${id}:`, err);
  });

  return newJob;
}

async function processJobAsync(jobId: string, buffer: Buffer, filename: string) {
  const job = jobs.get(jobId);
  if (!job) return;

  try {
    // ----------------------------------------------------
    // TRYB 0: Pobierz oryginał (bez modyfikacji i bez tłumaczenia)
    // ----------------------------------------------------
    if (job.conversionMode === 'original') {
      job.status = 'packaging';
      job.progress = 60;
      job.logs.push(`[${new Date().toLocaleTimeString()}] Tryb "Pobierz oryginał": przygotowywanie pliku źródłowego...`);
      saveJobsToDisk();

      let targetBuffer = buffer;
      let targetFilename = filename;

      // If the downloaded original is a multi-format ZIP archive (e.g. paczka [epub + mobi + pdf]),
      // automatically extract the best e-book format (EPUB) for direct reading and Kindle compatibility!
      const isZipArchive = filename.toLowerCase().endsWith('.zip') || filename.toLowerCase().includes('.zip(');
      if (isZipArchive) {
        const unpacked = await unpackZipArchive(buffer, filename);
        if (unpacked) {
          targetBuffer = unpacked.buffer;
          targetFilename = unpacked.filename;
          job.logs.push(
            `[${new Date().toLocaleTimeString()}] Rozpakowano paczkę ZIP! Z archiwum wyodrębniono najlepszy format e-booka: "${unpacked.filename}" (${(unpacked.buffer.length / 1024).toFixed(1)} KB).`
          );
        }
      }

      // Sprawdź czy użytkownik oczekiwał książki po polsku, ale pobrany plik z sieci okazał się po angielsku!
      const isRequestedPolish =
        (job as any).expectedLang === 'PL' ||
        job.targetLang === 'Polish' ||
        /[ąćęłńóśźż]/i.test(job.title) ||
        /dziki robot|robot|wiedźmin|przygody|lektur/i.test(job.title);

      if (isRequestedPolish) {
        try {
          const parsed = await parseDocumentBuffer(targetBuffer, targetFilename);
          const sampleText = (parsed.chapters || []).slice(0, 4).map((c) => c.originalText).join(' ').toLowerCase();
          const enWords = (sampleText.match(/\b(the|and|that|with|was|were|they|from|have|this|robot|she|his|her|said|about|into|which|their|would)\b/g) || []).length;
          const plWords = (sampleText.match(/\b(i|w|na|z|do|że|się|nie|to|jest|po|za|od|ale|tak|go|jej|ich|tym|ten|dla|jak|był|była|może)\b/g) || []).length;

          if (enWords > 15 && enWords > plWords * 1.5) {
            job.logs.push(
              `[${new Date().toLocaleTimeString()}] [Detekcja języka] ⚠️ Pobrana wersja książki okazała się wydaniem obcojęzycznym (angielskim: ${enWords} słów EN vs ${plWords} PL). Uruchamianie automatycznego literackiego przekładu AI na język polski, aby czytelnik otrzymał książkę po polsku!`
            );
            job.conversionMode = 'translate';
            job.targetLang = 'Polish';
            saveJobsToDisk();
            // Przechodzi dalej do tłumaczenia rozdziałów poniżej!
          }
        } catch (err: any) {
          // Jeśli parsowanie nie powiodło się, kontynuuj zapis oryginału
        }
      }

      if (job.conversionMode === 'original') {
        const safeTitle = sanitizeToAsciiFilename(job.title);
        const extMatch = targetFilename.match(/\.(epub|pdf|mobi|cbz|txt|azw3|fb2)$/i);
        const ext = extMatch ? extMatch[0].toLowerCase() : '.epub';
        const outputFilename = `${safeTitle}_oryginal_${Date.now()}${ext}`;
        const outputPath = path.join(EPUB_DIR, outputFilename);

        fs.writeFileSync(outputPath, targetBuffer);

        job.status = 'completed';
        job.progress = 100;
        job.outputEpubFilename = outputFilename;
        job.outputFormat = ext.replace('.', '') as any;
        job.detailedFormat = await detectFileDetailedFormat(outputFilename, targetBuffer);
        job.logs.push(
          `[${new Date().toLocaleTimeString()}] SUKCES! Plik (${(targetBuffer.length / 1024).toFixed(1)} KB, Format: ${job.detailedFormat}) został zapisany i jest gotowy w bibliotece oraz do wysłania na Kindle.`
        );
        job.updatedAt = Date.now();
        saveJobsToDisk();
        return;
      }
    }

    const isComic = job.conversionMode === 'comic_cbz';

    // ----------------------------------------------------
    // TRYB 1: Format komiksowy (CBZ) dla komiksów i mangi
    // ----------------------------------------------------
    if (isComic) {
      job.status = 'packaging';
      job.progress = 30;
      job.logs.push(`[${new Date().toLocaleTimeString()}] Wyodrębnianie stron komiksu/skanu i budowanie archiwum CBZ...`);

      const { filename: cbzFilename, buffer: cbzBuffer, pageCount } = await convertToCbz(buffer, job.title);
      const outputPath = path.join(EPUB_DIR, cbzFilename);
      fs.writeFileSync(outputPath, cbzBuffer);

      job.status = 'completed';
      job.progress = 100;
      job.outputEpubFilename = cbzFilename;
      job.outputFormat = 'cbz';
      job.detailedFormat = 'CBZ';
      job.logs.push(
        `[${new Date().toLocaleTimeString()}] SUKCES! Gotowy zoptymalizowany komiks CBZ (${pageCount} stron). Plik otwiera się błyskawicznie w KOReaderze bez zacinania czytnika!`
      );
      job.updatedAt = Date.now();
      saveJobsToDisk();
      return;
    }

    // ----------------------------------------------------
    // TRYB 2 & 3: Konwersja do EPUB (z tłumaczeniem lub lekki EPUB bez tłumaczenia)
    // ----------------------------------------------------
    job.status = 'extracting';
    job.progress = 15;
    job.logs.push(`[${new Date().toLocaleTimeString()}] Ekstrakcja tekstu, usuwanie nagłówków i numerów stron...`);
    saveJobsToDisk();

    const { title, author, chapters, coverImageBuffer } = await parseDocumentBuffer(buffer, filename);
    if (title && (!job.title || job.title.startsWith('job_'))) {
      job.title = title;
    }

    if (chapters.length === 0) {
      throw new Error('Nie udało się wyodrębnić czytelnego tekstu z przesłanego pliku. Jeśli to komiks lub skan graficzny, wybierz opcję "Format komiksowy (CBZ)".');
    }

    job.chapters = chapters;
    job.totalChapters = chapters.length;

    const skipTranslation = job.conversionMode === 'epub_clean' || job.targetLang === 'none' || job.targetLang === 'original';

    if (skipTranslation) {
      job.status = 'packaging';
      job.progress = 75;
      job.logs.push(`[${new Date().toLocaleTimeString()}] Redakcja tekstu F7: usuwanie błędów OCR, sprawdzanie pisowni i dzielenia wyrazów w ${chapters.length} rozdziałach...`);
      saveJobsToDisk();
      for (const chapter of job.chapters) {
        chapter.title = cleanHtmlEntitiesToUtf8(heuristicOcrProofread(chapter.title));
        const clean = cleanHtmlEntitiesToUtf8(heuristicOcrProofread(chapter.originalText));
        chapter.translatedText = clean
          .replace(/ ([wzouiWZOUIA]) /g, ' $1\u00A0')
          .replace(/>([wzouiWZOUIA]) /g, '>$1\u00A0');
        chapter.status = 'completed';
      }
      job.progress = 88;
      saveJobsToDisk();
    } else {
      job.status = 'translating';
      job.logs.push(`[${new Date().toLocaleTimeString()}] Znaleziono ${chapters.length} rozdziałów. Rozpoczynanie literackiego tłumaczenia AI na polski (z zachowaniem formatowania, przypisów i stylu)...`);
      saveJobsToDisk();

      for (let i = 0; i < chapters.length; i++) {
        const chapter = chapters[i];
        if (chapter.status === 'completed' && chapter.translatedText) {
          continue; // Already translated (e.g. from previous run)
        }

        job.currentChapter = i + 1;
        chapter.status = 'in_progress';
        job.updatedAt = Date.now();

        const progressStart = 20;
        const progressRange = 70; // 20 to 90%
        job.progress = Math.round(progressStart + (i / chapters.length) * progressRange);
        job.logs.push(`[${new Date().toLocaleTimeString()}] Tłumaczenie: [${i + 1}/${chapters.length}] "${chapter.title}"...`);
        saveJobsToDisk();

        // Active heartbeat to guarantee watchdog never prematurely aborts an actively translating chapter
        const heartbeat = setInterval(() => {
          job.updatedAt = Date.now();
        }, 15000);

        try {
          const { text, usedEngine } = await translateText({
            text: chapter.originalText,
            targetLang: job.targetLang,
            context: `Tytuł dzieła: ${job.title}. Autor: ${author || 'autor'}. Rozdział: ${chapter.title}. Rozdział ${i + 1} z ${chapters.length}.`,
            preferredEngine: job.engine,
          });

          chapter.translatedText = text;
          chapter.status = 'completed';
          const resolvedMeta = resolveDisplayChapterTitle(chapter, i, job.targetLang === 'Polish' ? 'pl' : 'en');
          if (resolvedMeta && resolvedMeta.title) {
            chapter.title = resolvedMeta.title;
          }
          job.logs.push(`[${new Date().toLocaleTimeString()}] Ukończono rozdział ${i + 1}: "${chapter.title}" (${usedEngine})`);
        } catch (err: any) {
          console.error(`Błąd tłumaczenia rozdziału ${i + 1}:`, err);
          chapter.translatedText = chapter.originalText;
          chapter.status = 'failed';
          job.logs.push(`[${new Date().toLocaleTimeString()}] Ostrzeżenie: Rozdział ${i + 1} zachowany w oryginale z powodu błędu AI.`);
        } finally {
          clearInterval(heartbeat);
          job.updatedAt = Date.now();
          saveJobsToDisk();
        }
      }
    }

    // Budowanie pliku EPUB
    await packageJobInternal(job, author, coverImageBuffer, skipTranslation);
  } catch (err: any) {
    job.status = 'failed';
    job.error = err.message || 'Wystąpił nieoczekiwany błąd';
    job.logs.push(`[${new Date().toLocaleTimeString()}] KRYTYCZNY BŁĄD: ${job.error}`);
    job.updatedAt = Date.now();
    saveJobsToDisk();
  }
}

async function packageJobInternal(
  job: Job,
  author?: string,
  coverImageBuffer?: Buffer,
  skipTranslation: boolean = false
): Promise<string> {
  job.status = 'packaging';
  job.progress = 92;
  job.logs.push(`[${new Date().toLocaleTimeString()}] Generowanie zoptymalizowanego pliku EPUB 3 (okładka, ilustracje, formatowanie e-ink)...`);
  job.updatedAt = Date.now();
  saveJobsToDisk();

  const safeTitle = sanitizeToAsciiFilename(job.title);
  const langSuffix = skipTranslation ? 'clean' : 'pl';
  const outputFilename = `${safeTitle}_${langSuffix}_${job.id.substring(4, 9)}.epub`;
  const outputPath = path.join(EPUB_DIR, outputFilename);

  // Guarantee all chapters have text & synchronize clean chapter titles from translated content
  if (job.chapters) {
    for (let i = 0; i < job.chapters.length; i++) {
      const c = job.chapters[i];
      if (!c.translatedText) {
        c.translatedText = c.originalText;
      }
      const meta = resolveDisplayChapterTitle(c, i, 'pl');
      if (meta && meta.title) {
        c.title = meta.title;
      }
    }
  }

  const epubBuffer = await generateEpubBuffer({
    title: skipTranslation ? job.title : `${job.title} (Polski przekład AI)`,
    author: skipTranslation ? (author || job.title) : (author ? `${author} (przekład AI)` : 'Przekład AI (KOReader Cloud)'),
    language: 'pl',
    chapters: job.chapters || [],
    coverImageBuffer,
  });

  fs.writeFileSync(outputPath, epubBuffer);

  job.status = 'completed';
  job.progress = 100;
  job.outputEpubFilename = outputFilename;
  job.outputFormat = 'epub';
  job.detailedFormat = 'EPUB 3';
  job.error = undefined;
  job.logs.push(`[${new Date().toLocaleTimeString()}] SUKCES! Plik ${outputFilename} jest gotowy do pobrania na Kindle.`);
  job.updatedAt = Date.now();
  saveJobsToDisk();
  return outputFilename;
}

export async function packageJobNow(jobId: string): Promise<boolean> {
  const job = jobs.get(jobId);
  if (!job || !job.chapters || job.chapters.length === 0) return false;
  try {
    await packageJobInternal(job, undefined, undefined, false);
    return true;
  } catch (err: any) {
    console.error(`Błąd natychmiastowego pakowania zadania ${jobId}:`, err);
    return false;
  }
}

export function resumeJob(jobId: string): boolean {
  const job = jobs.get(jobId);
  if (!job) return false;

  // 1. Storybook / Książka na życzenie
  if (job.sourceType === 'storybook' && job.storybookConfig) {
    job.status = 'extracting';
    job.error = undefined;
    job.updatedAt = Date.now();
    job.logs.push(`[${new Date().toLocaleTimeString()}] Wznowiono generowanie książki na życzenie.`);
    saveJobsToDisk();
    import('./storybook').then(({ executeStorybookJob }) => {
      executeStorybookJob(job, job.storybookConfig!).catch(console.error);
    }).catch(console.error);
    return true;
  }

  // 2. Tłumaczenie rozdziałów
  if (!job.chapters || job.chapters.length === 0) return false;

  job.status = 'translating';
  job.error = undefined;
  job.updatedAt = Date.now();
  job.logs.push(`[${new Date().toLocaleTimeString()}] Wznowiono zadanie tłumaczenia od miejsca przerwania.`);
  saveJobsToDisk();

  (async () => {
    try {
      const chapters = job.chapters;
      for (let i = 0; i < chapters.length; i++) {
        const chapter = chapters[i];
        if (chapter.status === 'completed' && chapter.translatedText) {
          continue;
        }

        job.currentChapter = i + 1;
        chapter.status = 'in_progress';
        job.updatedAt = Date.now();

        const progressStart = 20;
        const progressRange = 70;
        job.progress = Math.round(progressStart + (i / chapters.length) * progressRange);
        job.logs.push(`[${new Date().toLocaleTimeString()}] Tłumaczenie: [${i + 1}/${chapters.length}] "${chapter.title}"...`);
        saveJobsToDisk();

        const heartbeat = setInterval(() => {
          job.updatedAt = Date.now();
        }, 15000);

        try {
          const { text, usedEngine } = await translateText({
            text: chapter.originalText,
            targetLang: job.targetLang,
            context: `Tytuł: ${job.title}. Rozdział: ${chapter.title}. Rozdział ${i + 1} z ${chapters.length}.`,
            preferredEngine: job.engine,
          });

          chapter.translatedText = text;
          chapter.status = 'completed';
          job.logs.push(`[${new Date().toLocaleTimeString()}] Ukończono rozdział ${i + 1} (${usedEngine})`);
        } catch (err: any) {
          console.error(`Błąd tłumaczenia rozdziału ${i + 1}:`, err);
          chapter.translatedText = chapter.originalText;
          chapter.status = 'failed';
          job.logs.push(`[${new Date().toLocaleTimeString()}] Ostrzeżenie: Rozdział ${i + 1} zachowany w oryginale.`);
        } finally {
          clearInterval(heartbeat);
          job.updatedAt = Date.now();
          saveJobsToDisk();
        }
      }

      await packageJobInternal(job, undefined, undefined, false);
    } catch (err: any) {
      job.status = 'failed';
      job.error = err.message || 'Błąd wznowionego tłumaczenia';
      job.logs.push(`[${new Date().toLocaleTimeString()}] KRYTYCZNY BŁĄD: ${job.error}`);
      job.updatedAt = Date.now();
      saveJobsToDisk();
    }
  })();

  return true;
}

/**
 * Re-converts an existing book in the library to a different requested format:
 * - 'epub': Convert PDF/MOBI/TXT into standard lightweight reflowable EPUB 3
 * - 'cbz': Convert PDF/scan into optimized comic archive CBZ
 * - 'txt': Extract pure clean plain text
 */
export async function convertExistingJobToFormat(jobId: string, targetFormat: 'epub' | 'cbz' | 'txt'): Promise<Job> {
  const job = jobs.get(jobId);
  if (!job) {
    throw new Error('Nie znaleziono książki o podanym ID.');
  }

  const existingFilename = job.outputEpubFilename;
  if (!existingFilename) {
    throw new Error('Książka nie posiada jeszcze zapisanego pliku źródłowego.');
  }

  const filePath = getEpubFilePath(existingFilename);
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error('Plik źródłowy nie istnieje na dysku.');
  }

  const fileBuffer = fs.readFileSync(filePath);
  const safeTitle = sanitizeToAsciiFilename(job.title);
  const now = Date.now();

  if (targetFormat === 'cbz') {
    job.logs.push(`[${new Date().toLocaleTimeString()}] Rozpoczęto dodatkową konwersję do formatu komiksowego (CBZ)...`);
    const { filename: cbzFilename, buffer: cbzBuffer, pageCount } = await convertToCbz(fileBuffer, job.title);
    const newPath = path.join(EPUB_DIR, cbzFilename);
    fs.writeFileSync(newPath, cbzBuffer);

    job.outputEpubFilename = cbzFilename;
    job.outputFormat = 'cbz';
    job.detailedFormat = 'CBZ';
    job.originalSize = cbzBuffer.length;
    job.updatedAt = now;
    job.logs.push(`[${new Date().toLocaleTimeString()}] SUKCES! Utworzono komiks CBZ (${pageCount} stron, ${(cbzBuffer.length / 1024).toFixed(1)} KB).`);
    saveJobsToDisk();
    return job;
  }

  if (targetFormat === 'epub') {
    job.logs.push(`[${new Date().toLocaleTimeString()}] Rozpoczęto dodatkową konwersję do czytnikowego EPUB 3...`);
    const { title, author, chapters, coverImageBuffer } = await parseDocumentBuffer(fileBuffer, existingFilename);
    if (!chapters || chapters.length === 0) {
      throw new Error('Nie udało się wyodrębnić tekstu do utworzenia EPUB.');
    }

    job.chapters = chapters;
    job.totalChapters = chapters.length;

    for (const c of job.chapters) {
      c.title = cleanHtmlEntitiesToUtf8(heuristicOcrProofread(c.title));
      const clean = cleanHtmlEntitiesToUtf8(heuristicOcrProofread(c.originalText));
      c.translatedText = clean
        .replace(/ ([wzouiWZOUIA]) /g, ' $1\u00A0')
        .replace(/>([wzouiWZOUIA]) /g, '>$1\u00A0');
      c.status = 'completed';
    }

    const outputFilename = `${safeTitle}_epub3_${now}.epub`;
    const outputPath = path.join(EPUB_DIR, outputFilename);

    const epubBuffer = await generateEpubBuffer({
      title: job.title,
      author: author || job.author || 'Autor',
      language: 'pl',
      chapters: job.chapters,
      coverImageBuffer,
    });

    fs.writeFileSync(outputPath, epubBuffer);

    job.outputEpubFilename = outputFilename;
    job.outputFormat = 'epub';
    job.detailedFormat = 'EPUB 3';
    job.originalSize = epubBuffer.length;
    job.updatedAt = now;
    job.logs.push(`[${new Date().toLocaleTimeString()}] SUKCES! Przekonwertowano do lekkiego EPUB 3 (${chapters.length} rozdziałów, ${(epubBuffer.length / 1024).toFixed(1)} KB).`);
    saveJobsToDisk();
    return job;
  }

  if (targetFormat === 'txt') {
    job.logs.push(`[${new Date().toLocaleTimeString()}] Rozpoczęto ekstrakcję czystego tekstu (TXT)...`);
    const { chapters } = await parseDocumentBuffer(fileBuffer, existingFilename);
    let fullText = `${job.title}\n\n`;
    for (const c of chapters) {
      fullText += `=== ${c.title} ===\n\n${c.originalText.replace(/<[^>]+>/g, '')}\n\n`;
    }

    const txtFilename = `${safeTitle}_tekst_${now}.txt`;
    const txtPath = path.join(EPUB_DIR, txtFilename);
    const txtBuffer = Buffer.from(fullText, 'utf-8');
    fs.writeFileSync(txtPath, txtBuffer);

    job.outputEpubFilename = txtFilename;
    job.outputFormat = 'txt';
    job.detailedFormat = 'TXT';
    job.originalSize = txtBuffer.length;
    job.updatedAt = now;
    job.logs.push(`[${new Date().toLocaleTimeString()}] SUKCES! Utworzono plik czystego tekstu TXT (${(txtBuffer.length / 1024).toFixed(1)} KB).`);
    saveJobsToDisk();
    return job;
  }

  throw new Error(`Nieobsługiwany format docelowy: ${targetFormat}`);
}

/**
 * Extracts and formats chapters for the web reader for any book format (PDF, EPUB, MOBI, TXT)
 */
export async function extractChaptersForWebReader(jobId: string): Promise<{ title: string; chapters: Array<{ id: string; title: string; content: string }> }> {
  const job = jobs.get(jobId);
  if (!job) {
    throw new Error('Nie znaleziono książki');
  }

  // 1. If job already has extracted chapters with text
  if (job.chapters && job.chapters.length > 0) {
    return {
      title: job.title,
      chapters: job.chapters.map((c, i) => ({
        id: `ch_${i}`,
        title: c.title || `Rozdział ${i + 1}`,
        content: `<p>${(c.translatedText || c.originalText || '').replace(/\n\n+/g, '</p><p>')}</p>`,
      })),
    };
  }

  // 2. Read from file on disk (PDF, EPUB, MOBI, CBZ, TXT)
  const existingFilename = job.outputEpubFilename;
  if (!existingFilename) {
    throw new Error('Książka nie posiada jeszcze pliku na serwerze.');
  }

  const filePath = getEpubFilePath(existingFilename);
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error('Plik nie został odnaleziony na dysku serwera.');
  }

  const fileBuffer = fs.readFileSync(filePath);
  const parsed = await parseDocumentBuffer(fileBuffer, existingFilename);

  if (parsed.chapters && parsed.chapters.length > 0) {
    job.chapters = parsed.chapters;
    job.totalChapters = parsed.chapters.length;
    saveJobsToDisk();

    return {
      title: parsed.title || job.title,
      chapters: parsed.chapters.map((c, i) => ({
        id: `ch_${i}`,
        title: c.title || `Rozdział ${i + 1}`,
        content: `<p>${(c.translatedText || c.originalText || '').replace(/\n\n+/g, '</p><p>')}</p>`,
      })),
    };
  }

  throw new Error('Nie udało się wyodrębnić czytelnych rozdziałów z tego pliku.');
}
