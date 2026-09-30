import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { Job, ChapterData, StorybookRequest } from '../src/types';
import { translateText, proofreadChapterF7 } from './ai';
import { generateEpubBuffer, sanitizeToAsciiFilename } from './epub';
import { parseDocumentBuffer, heuristicOcrProofread, unpackZipArchive } from './extractor';
import { fetchRemoteBookBuffer } from './search';
import { convertToCbz } from './comic';
import { executeStorybookJob } from './storybook';

const DATA_DIR = path.join(process.cwd(), 'data');
const EPUB_DIR = path.join(DATA_DIR, 'epubs');
const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');

if (!fs.existsSync(EPUB_DIR)) {
  fs.mkdirSync(EPUB_DIR, { recursive: true });
}

// Job registry with disk persistence
const jobs: Map<string, Job> = new Map();

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

function loadJobsFromDisk(): void {
  try {
    if (fs.existsSync(JOBS_FILE)) {
      const raw = fs.readFileSync(JOBS_FILE, 'utf-8');
      const parsed: Job[] = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const job of parsed) {
          if (job.title) {
            job.title = job.title
              .replace(/&apos;/g, "'")
              .replace(/&quot;/g, '"')
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>');
          }

          // Validate file presence on disk for completed jobs
          if (job.status === 'completed' && job.outputEpubFilename) {
            const filePath = path.join(EPUB_DIR, job.outputEpubFilename);
            if (!fs.existsSync(filePath)) {
              if (job.chapters && job.chapters.length > 0) {
                // Auto-repair missing file from existing chapter data
                generateEpubBuffer({
                  title: job.title,
                  author: 'KOReader AI Cloud',
                  language: 'pl',
                  chapters: job.chapters,
                }).then((buf) => {
                  fs.writeFileSync(filePath, buf);
                  console.log(`Pomyślnie zregenerowano brakujący plik EPUB: ${job.outputEpubFilename}`);
                }).catch((e) => console.warn(`Nie udało się zregenerować pliku ${job.outputEpubFilename}:`, e));
              } else {
                job.status = 'failed';
                job.error = 'Plik źródłowy nie jest już dostępny na dysku serwera';
              }
            }
          }

          jobs.set(job.id, job);
        }
      }
    }
  } catch (err) {
    console.warn('Błąd odczytu data/jobs.json:', err);
  }

  // Auto-scan EPUB_DIR for any completed files on disk not yet in jobs
  try {
    if (fs.existsSync(EPUB_DIR)) {
      const files = fs.readdirSync(EPUB_DIR);
      for (const file of files) {
        if (!file.endsWith('.epub') && !file.endsWith('.cbz')) continue;
        const alreadyIndexed = Array.from(jobs.values()).some(j => j.outputEpubFilename === file);
        if (!alreadyIndexed) {
          const filePath = path.join(EPUB_DIR, file);
          const stat = fs.statSync(filePath);
          const cleanTitle = file.replace(/\.[^/.]+$/, '').replace(/[_.-]+/g, ' ').trim();
          const autoId = `job_file_${file.replace(/[^a-zA-Z0-9]/g, '_')}`;
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

// Initial load
loadJobsFromDisk();

export function getAllJobs(): Job[] {
  return Array.from(jobs.values()).sort((a, b) => b.createdAt - a.createdAt);
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
  const directPath = path.join(EPUB_DIR, safeFilename);
  if (fs.existsSync(directPath)) {
    return directPath;
  }

  // 1. Try URL decoded path
  try {
    const decoded = decodeURIComponent(safeFilename);
    const decodedPath = path.join(EPUB_DIR, decoded);
    if (fs.existsSync(decodedPath)) return decodedPath;
  } catch {}

  // 2. Try sanitized ASCII filename
  const cleanBase = sanitizeToAsciiFilename(safeFilename.replace(/\.(epub|cbz)$/i, ''));
  const ext = safeFilename.endsWith('.cbz') ? '.cbz' : '.epub';
  const asciiPath = path.join(EPUB_DIR, `${cleanBase}${ext}`);
  if (fs.existsSync(asciiPath)) return asciiPath;

  // 3. Scan directory for matching prefix or timestamp
  if (fs.existsSync(EPUB_DIR)) {
    const files = fs.readdirSync(EPUB_DIR);
    const tsMatch = safeFilename.match(/\d{10,}/);
    if (tsMatch) {
      const match = files.find(f => f.includes(tsMatch[0]));
      if (match) return path.join(EPUB_DIR, match);
    }

    const normTarget = cleanBase.replace(/[^a-z0-9]/gi, '').substring(0, 20);
    if (normTarget.length > 4) {
      const match = files.find(f => f.replace(/[^a-z0-9]/gi, '').includes(normTarget));
      if (match) return path.join(EPUB_DIR, match);
    }
  }

  return null;
}

export function deleteJob(id: string): boolean {
  const job = getJobById(id);
  if (!job) return false;

  // Delete output EPUB/CBZ file from disk if present
  if (job.outputEpubFilename) {
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

  // Remove from Map
  jobs.delete(job.id);
  for (const [key, val] of jobs.entries()) {
    if (val.id === job.id) {
      jobs.delete(key);
    }
  }

  saveJobsToDisk();
  return true;
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

export function createSearchOrderJob(
  title: string,
  downloadUrl: string,
  engine: Job['engine'] = 'auto',
  targetLang: string = 'Polish',
  conversionMode: Job['conversionMode'] = 'translate'
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
      newJob.logs.push(`[${new Date().toLocaleTimeString()}] Pobieranie pliku źródłowego z ${new URL(downloadUrl).hostname}...`);
      const { buffer, filename } = await fetchRemoteBookBuffer(downloadUrl, newJob.title, (msg) => {
        newJob.logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
        saveJobsToDisk();
      });
      newJob.originalSize = buffer.length;
      newJob.logs.push(`[${new Date().toLocaleTimeString()}] Pobrano plik: ${(buffer.length / 1024).toFixed(1)} KB (${filename})`);
      saveJobsToDisk();
      await processJobAsync(id, buffer, filename);
    } catch (err: any) {
      newJob.status = 'failed';
      newJob.error = err.message || 'Błąd pobierania ze źródła';
      newJob.logs.push(`[${new Date().toLocaleTimeString()}] BŁĄD: ${newJob.error}`);
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
      job.logs.push(
        `[${new Date().toLocaleTimeString()}] SUKCES! Plik (${(targetBuffer.length / 1024).toFixed(1)} KB) został zapisany i jest gotowy w bibliotece oraz do wysłania na Kindle.`
      );
      job.updatedAt = Date.now();
      saveJobsToDisk();
      return;
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
        chapter.title = heuristicOcrProofread(chapter.title);
        const clean = heuristicOcrProofread(chapter.originalText);
        chapter.translatedText = clean
          .replace(/ ([wzouiWZOUIA]) /g, ' $1&nbsp;')
          .replace(/>([wzouiWZOUIA]) /g, '>$1&nbsp;');
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
        job.currentChapter = i + 1;
        chapter.status = 'in_progress';

        const progressStart = 20;
        const progressRange = 70; // 20 to 90%
        job.progress = Math.round(progressStart + (i / chapters.length) * progressRange);
        job.logs.push(`[${new Date().toLocaleTimeString()}] Tłumaczenie: [${i + 1}/${chapters.length}] "${chapter.title}"...`);

        try {
          const { text, usedEngine } = await translateText({
            text: chapter.originalText,
            targetLang: job.targetLang,
            context: `Tytuł dzieła: ${job.title}. Autor: ${author || 'autor'}. Rozdział: ${chapter.title}. Rozdział ${i + 1} z ${chapters.length}.`,
            preferredEngine: job.engine,
          });

          chapter.translatedText = text;
          chapter.status = 'completed';
          job.logs.push(`[${new Date().toLocaleTimeString()}] Ukończono rozdział ${i + 1} (${usedEngine})`);
        } catch (err: any) {
          console.error(`Błąd tłumaczenia rozdziału ${i + 1}:`, err);
          chapter.translatedText = chapter.originalText;
          chapter.status = 'failed';
          job.logs.push(`[${new Date().toLocaleTimeString()}] Ostrzeżenie: Rozdział ${i + 1} zachowany w oryginale z powodu błędu AI.`);
        }

        job.updatedAt = Date.now();
        saveJobsToDisk();
      }
    }

    // Budowanie pliku EPUB
    job.status = 'packaging';
    job.progress = 92;
    job.logs.push(`[${new Date().toLocaleTimeString()}] Generowanie zoptymalizowanego pliku EPUB 3 (okładka, ilustracje, formatowanie e-ink)...`);
    saveJobsToDisk();

    const safeTitle = sanitizeToAsciiFilename(job.title);
    const langSuffix = skipTranslation ? 'clean' : 'pl';
    const outputFilename = `${safeTitle}_${langSuffix}_${job.id.substring(4, 9)}.epub`;
    const outputPath = path.join(EPUB_DIR, outputFilename);

    const epubBuffer = await generateEpubBuffer({
      title: skipTranslation ? job.title : `${job.title} (Polski przekład AI)`,
      author: skipTranslation ? (author || job.title) : (author ? `${author} (przekład AI)` : 'Przekład AI (KOReader Cloud)'),
      language: 'pl',
      chapters: job.chapters,
      coverImageBuffer,
    });

    fs.writeFileSync(outputPath, epubBuffer);

    job.status = 'completed';
    job.progress = 100;
    job.outputEpubFilename = outputFilename;
    job.outputFormat = 'epub';
    job.logs.push(`[${new Date().toLocaleTimeString()}] SUKCES! Plik ${outputFilename} jest gotowy do pobrania na Kindle.`);
    job.updatedAt = Date.now();
    saveJobsToDisk();
  } catch (err: any) {
    job.status = 'failed';
    job.error = err.message || 'Wystąpił nieoczekiwany błąd';
    job.logs.push(`[${new Date().toLocaleTimeString()}] KRYTYCZNY BŁĄD: ${job.error}`);
    job.updatedAt = Date.now();
    saveJobsToDisk();
  }
}
