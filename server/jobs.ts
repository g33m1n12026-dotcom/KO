import fs from 'fs';
import path from 'path';
import { Job, ChapterData, StorybookRequest } from '../src/types';
import { translateText } from './ai';
import { generateEpubBuffer } from './epub';
import { parseDocumentBuffer } from './extractor';
import { fetchRemoteBookBuffer } from './search';
import { convertToCbz } from './comic';
import { executeStorybookJob } from './storybook';

const EPUB_DIR = path.join(process.cwd(), 'data', 'epubs');
if (!fs.existsSync(EPUB_DIR)) {
  fs.mkdirSync(EPUB_DIR, { recursive: true });
}

// In-memory job registry
const jobs: Map<string, Job> = new Map();

export function getAllJobs(): Job[] {
  return Array.from(jobs.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export function getJobById(id: string): Job | undefined {
  return jobs.get(id);
}

export function getEpubFilePath(filename: string): string | null {
  const safeFilename = path.basename(filename);
  const fullPath = path.join(EPUB_DIR, safeFilename);
  if (fs.existsSync(fullPath)) {
    return fullPath;
  }
  return null;
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

  const newJob: Job = {
    id,
    title,
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
    sourceType: 'search',
    logs: [`[${new Date().toLocaleTimeString()}] Zlecenie pobrania i przetworzenia z Internetu: "${title}"`],
  };

  jobs.set(id, newJob);

  // Download and process
  (async () => {
    try {
      newJob.logs.push(`[${new Date().toLocaleTimeString()}] Pobieranie pliku źródłowego z ${new URL(downloadUrl).hostname}...`);
      const { buffer, filename } = await fetchRemoteBookBuffer(downloadUrl);
      newJob.originalSize = buffer.length;
      newJob.logs.push(`[${new Date().toLocaleTimeString()}] Pobrano plik: ${(buffer.length / 1024).toFixed(1)} KB`);
      await processJobAsync(id, buffer, filename);
    } catch (err: any) {
      newJob.status = 'failed';
      newJob.error = err.message || 'Błąd pobierania ze źródła';
      newJob.logs.push(`[${new Date().toLocaleTimeString()}] BŁĄD: ${newJob.error}`);
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
      return;
    }

    // ----------------------------------------------------
    // TRYB 2 & 3: Konwersja do EPUB (z tłumaczeniem lub bez)
    // ----------------------------------------------------
    job.status = 'extracting';
    job.progress = 15;
    job.logs.push(`[${new Date().toLocaleTimeString()}] Ekstrakcja tekstu, usuwanie nagłówków i numerów stron...`);

    const { title, chapters } = await parseDocumentBuffer(buffer, filename);
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
      job.progress = 85;
      job.logs.push(`[${new Date().toLocaleTimeString()}] Tryb bez tłumaczenia: wyczyszczono ${chapters.length} rozdziałów. Generowanie lekkiego EPUB...`);
      for (const chapter of job.chapters) {
        chapter.translatedText = chapter.originalText;
        chapter.status = 'completed';
      }
    } else {
      job.status = 'translating';
      job.logs.push(`[${new Date().toLocaleTimeString()}] Znaleziono ${chapters.length} rozdziałów. Rozpoczynanie literackiego tłumaczenia AI na polski...`);

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
            context: `Tytuł dzieła: ${job.title}. Rozdział: ${chapter.title}. Rozdział ${i + 1} z ${chapters.length}.`,
            preferredEngine: job.engine,
          });

          chapter.translatedText = text;
          chapter.status = 'completed';
          job.logs.push(`[${new Date().toLocaleTimeString()}] Ukończono rozdział ${i + 1} (${usedEngine})`);
        } catch (err: any) {
          console.error(`Błąd tłumaczenia rozdziału ${i + 1}:`, err);
          chapter.translatedText = `[Błąd automatycznego tłumaczenia: ${err?.message || 'timeout'}]\n\n${chapter.originalText}`;
          chapter.status = 'failed';
          job.logs.push(`[${new Date().toLocaleTimeString()}] Ostrzeżenie: Rozdział ${i + 1} zachowany w oryginale z powodu błędu AI.`);
        }

        job.updatedAt = Date.now();
      }
    }

    // Budowanie pliku EPUB
    job.status = 'packaging';
    job.progress = 92;
    job.logs.push(`[${new Date().toLocaleTimeString()}] Generowanie zoptymalizowanego, lekkiego pliku EPUB 3 dla KOReadera/Kindle...`);

    const safeTitle = job.title.replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ _-]/g, '').trim() || 'Ksiazka';
    const langSuffix = skipTranslation ? 'CLEAN' : 'PL';
    const outputFilename = `${safeTitle.replace(/\s+/g, '_')}_${langSuffix}_${job.id.substring(4, 9)}.epub`;
    const outputPath = path.join(EPUB_DIR, outputFilename);

    const epubBuffer = await generateEpubBuffer({
      title: skipTranslation ? job.title : `${job.title} (Polski przekład AI)`,
      author: skipTranslation ? 'Wydanie zoptymalizowane pod e-ink' : 'Przekład AI (KOReader Cloud)',
      language: skipTranslation ? 'pl' : 'pl',
      chapters: job.chapters,
    });

    fs.writeFileSync(outputPath, epubBuffer);

    job.status = 'completed';
    job.progress = 100;
    job.outputEpubFilename = outputFilename;
    job.outputFormat = 'epub';
    job.logs.push(`[${new Date().toLocaleTimeString()}] SUKCES! Plik ${outputFilename} jest gotowy do pobrania na Kindle.`);
    job.updatedAt = Date.now();
  } catch (err: any) {
    job.status = 'failed';
    job.error = err.message || 'Wystąpił nieoczekiwany błąd';
    job.logs.push(`[${new Date().toLocaleTimeString()}] KRYTYCZNY BŁĄD: ${job.error}`);
    job.updatedAt = Date.now();
  }
}
