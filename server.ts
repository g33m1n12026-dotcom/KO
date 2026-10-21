// Polyfills for Node serverless environment where pdfjs-dist requires browser globals
if (typeof (globalThis as any).DOMMatrix === 'undefined') {
  (globalThis as any).DOMMatrix = class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    m11 = 1; m12 = 0; m21 = 0; m22 = 1; m41 = 0; m42 = 0;
  };
}
if (typeof (globalThis as any).ImageData === 'undefined') {
  (globalThis as any).ImageData = class ImageData {};
}
if (typeof (globalThis as any).Path2D === 'undefined') {
  (globalThis as any).Path2D = class Path2D {};
}

import express from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import dotenv from 'dotenv';
import QRCode from 'qrcode';

import {
  getAvailableKeys,
  recommendBooksByDescription,
  getAIAssist,
  chatWithAdvisor,
  getFallbackCuratedRecommendations,
} from './server/ai';
import { fetchBookSummaryAndMetadata, getOpenCodeStatus } from './server/opencode';
import {
  getAllJobs,
  getJobById,
  createUploadJob,
  createDirectFileJob,
  createSearchOrderJob,
  createStorybookJob,
  getEpubFilePath,
  deleteJob,
  clearFailedJobs,
  saveJobsToDisk,
  resumeJob,
  packageJobNow,
  convertExistingJobToFormat,
  extractChaptersForWebReader,
  importJobs,
} from './server/jobs';
import { generateEpubBuffer, sanitizeToAsciiFilename } from './server/epub';
import { searchOnlineBooks, findDirectBookDownload } from './server/search';
import { SHADOW_LIBRARY_MIRRORS } from './server/mirrors';
import {
  generatePluginZip,
  getMetaLua,
  getMainLua,
} from './server/koreaderPlugin';
import {
  startTunnel,
  stopTunnel,
  getTunnelStatus,
} from './server/tunnel';
import { getPublicAccountStatus, saveSettings, loginZlibrary, loginDocer, login4shared, testAllAccounts, getLatestApiHealth, checkAllApiHealth } from './server/settings';
import {
  AVAILABLE_VOICES,
  synthesizeSpeech,
  verifyElevenLabsKey,
  fetchElevenLabsVoices,
  parseChapterToDramaticScript,
  generateChapterDramaAudio,
} from './server/tts';
import { updateReadingProgress, getReadingProgress, getAllReadingProgress } from './server/sync';
import { extractBookCharacters, generateChapterRecap } from './server/ai';
import { KNOWN_SERIES } from './server/series';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3000', 10);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // up to 100 MB
});

export const app = express();
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

  // Auto-start public tunnel in background for Kindle connectivity (skip on Vercel serverless)
  if (!process.env.VERCEL) {
    startTunnel(PORT).catch((err) => console.warn('Początkowy start tunelu:', err));
  }

  // Helper to determine base public URL (uses current live host, proxy or tunnel)
  const getAppBaseUrl = (req: express.Request) => {
    if (process.env.APP_URL) {
      return process.env.APP_URL.replace(/\/+$/, '');
    }
    const proto = (req.headers['x-forwarded-proto'] as string) || (req.secure ? 'https' : 'http');
    const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || '';
    if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
      return `${proto}://${host}`;
    }
    if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
      return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`.replace(/\/+$/, '');
    }
    if (process.env.VERCEL) {
      return 'https://ko-kohl.vercel.app';
    }
    if (process.env.VERCEL_URL) {
      return `https://${process.env.VERCEL_URL}`.replace(/\/+$/, '');
    }
    if (process.env.SPACE_HOST) {
      return `https://${process.env.SPACE_HOST}`.replace(/\/+$/, '');
    }
    if (process.env.KOYEB_PUBLIC_DOMAIN) {
      return `https://${process.env.KOYEB_PUBLIC_DOMAIN}`.replace(/\/+$/, '');
    }
    if (process.env.APP_BASE_URL) {
      return process.env.APP_BASE_URL.replace(/\/+$/, '');
    }
    if (process.env.RENDER_EXTERNAL_URL) {
      return process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, '');
    }
    const tunnel = getTunnelStatus();
    if (tunnel.url) {
      return tunnel.url;
    }
    if (host) {
      return `${proto}://${host}`;
    }
    return `http://localhost:${PORT}`;
  };

  // ----------------------------------------------------
  // API Endpoints: System, Diagnostics & Live Tunnel
  // ----------------------------------------------------
  app.get('/api/status', (req, res) => {
    res.json({
      status: 'online',
      serverTime: new Date().toISOString(),
      baseUrl: getAppBaseUrl(req),
      tunnel: getTunnelStatus(),
      keys: getAvailableKeys(),
    });
  });

  app.get('/api/tunnel', (req, res) => {
    res.json({
      ...getTunnelStatus(),
      recommendedHeader: {
        'bypass-tunnel-reminder': '1',
      },
    });
  });

  app.post('/api/tunnel/start', async (req, res) => {
    const url = await startTunnel(PORT);
    res.json({ success: Boolean(url), ...getTunnelStatus() });
  });

  app.post('/api/tunnel/stop', (req, res) => {
    stopTunnel();
    res.json({ success: true, ...getTunnelStatus() });
  });

  // List all supported shadow library mirrors & repositories
  app.get('/api/mirrors', (req, res) => {
    res.json(SHADOW_LIBRARY_MIRRORS);
  });

  // ----------------------------------------------------
  // API Endpoints: AI Thematic Book Recommendations
  // ----------------------------------------------------
  app.post(['/api/recommend', '/api/koreader/recommend'], async (req, res) => {
    const { description, engine = 'auto' } = req.body;
    if (!description || typeof description !== 'string' || !description.trim()) {
      return res.status(400).json({ error: 'Proszę podać opis poszukiwanej książki.' });
    }

    try {
      const data = await recommendBooksByDescription(description, engine);

      // Auto-scan mirrors for each recommended book so reader/user can download with 1 click
      if (Array.isArray(data.recommendations) && data.recommendations.length > 0) {
        await Promise.race([
          Promise.all(
            data.recommendations.map(async (rec) => {
              try {
                const q = rec.searchQuery || `${rec.author} ${rec.title}`;
                const found = await findDirectBookDownload(q, 'PL');
                if (found) {
                  rec.downloadUrl = found.downloadUrl;
                  rec.downloadFormat = found.format;
                  if (found.language) rec.downloadLanguage = found.language;
                }
              } catch {
                // Ignore individual mirror lookup timeout
              }
            })
          ),
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
      }

      res.json(data);
    } catch (err: any) {
      console.warn('Ostrzeżenie doradcy AI, użycie inteligentnego trybu awaryjnego:', err?.message || err);
      const fallback = getFallbackCuratedRecommendations(description);
      res.json(fallback);
    }
  });

  // ----------------------------------------------------
  // API Endpoints: Interactive 2-Column AI Advisor Chat
  // ----------------------------------------------------
  app.post(['/api/advisor/chat', '/api/koreader/advisor/chat'], async (req, res) => {
    try {
      const { messages, modelTier = 'smart_auto', premiumProvider = 'openrouter' } = req.body;
      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'Brak wiadomości w historii czatu.' });
      }

      const data = await chatWithAdvisor(messages, modelTier, premiumProvider);

      // Auto-scan mirrors for recommended books in background (with 3s cap)
      if (Array.isArray(data.recommendations) && data.recommendations.length > 0) {
        await Promise.race([
          Promise.all(
            data.recommendations.map(async (rec) => {
              try {
                const q = rec.searchQuery || `${rec.author} ${rec.title}`;
                const found = await findDirectBookDownload(q, 'PL');
                if (found) {
                  rec.downloadUrl = found.downloadUrl;
                  rec.downloadFormat = found.format;
                  if (found.language) rec.downloadLanguage = found.language;
                }
              } catch {}
            })
          ),
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
      }

      res.json(data);
    } catch (err: any) {
      console.warn('Ostrzeżenie czatu doradcy AI, użycie trybu awaryjnego:', err?.message || err);
      const lastMsg = Array.isArray(req.body?.messages) ? req.body.messages.slice(-1)[0]?.content : '';
      const fallback = getFallbackCuratedRecommendations(lastMsg || '');
      const titlesMentioned = fallback.recommendations.slice(0, 3).map((r) => `„${r.title}” (${r.author})`).join(', ');
      res.json({
        reply: `Z przyjemnością pomogę Ci wybrać wspaniałą lekturę. Na podstawie Twoich słów wytypowałem: ${titlesMentioned}. Wszystkie te pozycje pojawiły się po prawej stronie na Twojej wirtualnej półce wraz z opcją natychmiastowego pobrania lub streszczenia.\n\nPowiedz mi jeszcze: czy wolisz literaturę polską czy zagraniczną?`,
        followUpQuestions: ['Wolisz literaturę polską czy zagraniczną?', 'Wolisz lżejszy czy głębszy klimat?'],
        analysis: fallback.analysis,
        recommendations: fallback.recommendations,
        usedEngine: 'Doradca KOReader (Smart Auto)',
      });
    }
  });

  // ----------------------------------------------------
  // API Endpoints: Duck.ai & Free AI Book Assistant
  // ----------------------------------------------------
  app.post(['/api/assistant', '/api/koreader/assistant'], async (req, res) => {
    try {
      const { text, query, mode = 'explain', context, engine = 'auto' } = req.body;
      const input = (text || query || '').trim();
      if (!input) {
        return res.status(400).json({ error: 'Proszę podać treść pytania lub fragment tekstu.' });
      }
      const answer = await getAIAssist(input, mode, context, engine);
      res.json({ answer, mode, input });
    } catch (err: any) {
      console.error('Błąd asystenta AI:', err);
      res.status(500).json({ error: err.message || 'Błąd odpowiedzi asystenta AI' });
    }
  });

  // ----------------------------------------------------
  // API Endpoints: OpenCode.ai Book Summaries & Metadata
  // ----------------------------------------------------
  app.post(['/api/book-summary', '/api/koreader/book-summary'], async (req, res) => {
    try {
      const { title, author, modelTier = 'free_opencode', premiumProvider = 'openrouter', language = 'Polish' } = req.body;
      if (!title || typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ error: 'Proszę podać tytuł książki.' });
      }
      const data = await fetchBookSummaryAndMetadata({
        title: title.trim(),
        author: author ? String(author).trim() : undefined,
        modelTier: modelTier === 'premium' ? 'premium' : 'free_opencode',
        premiumProvider: premiumProvider === 'openai' ? 'openai' : 'openrouter',
        language,
      });
      res.json(data);
    } catch (err: any) {
      console.error('Błąd pobierania streszczenia książki:', err);
      res.status(500).json({ error: err.message || 'Błąd pobierania streszczenia książki' });
    }
  });

  app.get('/api/opencode/status', async (_req, res) => {
    try {
      const status = await getOpenCodeStatus();
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Błąd sprawdzania statusu OpenCode.ai' });
    }
  });

  // ----------------------------------------------------
  // API Endpoints: Book Search & Ordering
  // ----------------------------------------------------
  app.get(['/api/search', '/api/koreader/search'], async (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      const results: any = await searchOnlineBooks(q);
      if (req.path.includes('/koreader/')) {
        // Return flat array for KOReader Lua compatibility
        return res.json(Array.from(results));
      }
      // Return rich object for web SPA
      res.json({
        results: Array.from(results),
        multilingual: results.multilingual || null,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Błąd wyszukiwania' });
    }
  });

  app.get('/api/verify-chomikuj', async (req, res) => {
    try {
      const url = String(req.query.url || '').trim();
      const q = String(req.query.q || '').trim();
      if (!url) {
        return res.status(400).json({ error: 'Brak adresu URL do weryfikacji' });
      }
      const { preverifyChomikujFile } = await import('./server/chomikuj');
      const result = await preverifyChomikujFile(url, q);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Błąd weryfikacji pliku' });
    }
  });

  app.get('/api/settings/accounts', (req, res) => {
    res.json(getPublicAccountStatus());
  });

  app.post('/api/settings/accounts', async (req, res) => {
    try {
      const saved = saveSettings(req.body);
      if (req.body.zlibrary?.email && req.body.zlibrary?.password && (!saved.zlibrary.userKey || !saved.zlibrary.userId)) {
        await loginZlibrary(req.body.zlibrary.email, req.body.zlibrary.password);
      }
      if (req.body.docer?.email && req.body.docer?.password) {
        await loginDocer(req.body.docer.email, req.body.docer.password);
      }
      if (req.body.fourShared?.email && req.body.fourShared?.password) {
        await login4shared(req.body.fourShared.email, req.body.fourShared.password);
      }
      res.json({ success: true, status: getPublicAccountStatus() });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Nie udało się zapisać ustawień kont' });
    }
  });

  app.get('/api/settings/accounts/test', async (_req, res) => {
    try {
      const results = await testAllAccounts();
      res.json({ results });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Błąd testowania kont' });
    }
  });

  app.get(['/api/settings/api-health', '/api/settings/health'], async (req, res) => {
    try {
      if (req.query.refresh === '1' || req.query.refresh === 'true') {
        const fresh = await checkAllApiHealth();
        return res.json(fresh);
      }
      res.json(getLatestApiHealth());
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Błąd sprawdzania statusu API' });
    }
  });

  app.post(['/api/order', '/api/koreader/order'], async (req, res) => {
    try {
      let { title, downloadUrl, engine = 'auto', targetLang = 'Polish', conversionMode = 'translate', expectedLang } = req.body;
      if (!title || typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ error: 'Brak tytułu książki do pobrania' });
      }

      // If downloadUrl was not provided (e.g. metadata-only result on Kindle), auto-resolve it from mirrors/sources!
      if (!downloadUrl || downloadUrl === 'auto' || typeof downloadUrl !== 'string' || !downloadUrl.trim()) {
        console.log(`[Order] Brak bezpośredniego linku dla "${title}". Przeszukiwanie mirrorów i źródeł...`);
        try {
          const found = await findDirectBookDownload(title, expectedLang || 'PL');
          if (found && found.downloadUrl) {
            downloadUrl = found.downloadUrl;
            console.log(`[Order] Sukces: Odnaleziono link dla "${title}": ${downloadUrl}`);
          }
        } catch (e: any) {
          console.warn(`[Order] Błąd szukania mirrora dla ${title}:`, e?.message);
        }
      }

      if (!downloadUrl || downloadUrl === 'auto') {
        return res.status(404).json({
          error: `Nie znaleziono bezpośredniego pliku do pobrania dla: "${title}". Wybierz inną pozycję z listy wyników wyszukiwania.`
        });
      }

      const job = createSearchOrderJob(title, downloadUrl, engine, targetLang, conversionMode, expectedLang);
      res.status(201).json(job);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Błąd zlecenia' });
    }
  });

  // ----------------------------------------------------
  // API Endpoints: Książka na życzenie (AI Storybook Generator)
  // ----------------------------------------------------
  app.post(['/api/storybook/create', '/api/koreader/storybook/create'], async (req, res) => {
    try {
      const {
        type = 'story',
        title,
        prompt,
        characters,
        genre,
        chapterCount = 5,
        targetAudience = 'all',
        includeIllustrations = true,
        engine = 'auto',
        author,
      } = req.body;

      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        return res.status(400).json({ error: 'Proszę podać opis, fabułę lub temat książki.' });
      }

      const job = createStorybookJob({
        type,
        title: title?.trim() || undefined,
        prompt: prompt.trim(),
        characters: characters?.trim() || undefined,
        genre: genre?.trim() || undefined,
        chapterCount: Math.min(Math.max(Number(chapterCount) || 5, 2), 12),
        targetAudience,
        includeIllustrations: Boolean(includeIllustrations),
        engine,
        author: author?.trim() || undefined,
      });

      res.status(201).json(job);
    } catch (err: any) {
      console.error('Błąd tworzenia zlecenia książki na życzenie:', err);
      res.status(500).json({ error: err.message || 'Błąd tworzenia książki na życzenie' });
    }
  });

  // ----------------------------------------------------
  // API Endpoints: File Upload & Processing
  // ----------------------------------------------------
  app.post(
    ['/api/convert', '/api/koreader/upload'],
    upload.single('file'),
    async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: 'Nie przesłano żadnego pliku' });
        }
        const engine = (req.body.engine || 'auto') as any;
        const targetLang = req.body.targetLang || 'Polish';
        const conversionMode = (req.body.conversionMode || 'translate') as any;
        const job = createUploadJob(
          req.file.originalname,
          req.file.buffer,
          engine,
          targetLang,
          conversionMode
        );
        res.status(201).json(job);
      } catch (err: any) {
        console.error('Błąd podczas uploadu:', err);
        res.status(500).json({ error: err.message || 'Błąd przetwarzania pliku' });
      }
    }
  );

  // Direct upload for instant OPDS publishing (no heavy conversion, ready on Kindle immediately)
  app.post(
    ['/api/upload-direct', '/api/koreader/upload-direct'],
    upload.single('file'),
    async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: 'Nie przesłano żadnego pliku' });
        }

        const originalname = req.file.originalname || 'ksiazka.epub';
        const extMatch = originalname.match(/\.(epub|pdf|mobi|cbz|txt|azw3|fb2)$/i);
        const ext = extMatch ? extMatch[1].toLowerCase() : 'epub';

        const cleanTitle = (req.body.title || originalname.replace(/\.[^/.]+$/, '')).replace(/[_.-]+/g, ' ').trim();
        const safeFilename = `${sanitizeToAsciiFilename(cleanTitle)}_${Date.now()}.${ext}`;
        const outputPath = path.join(process.cwd(), 'data', 'epubs', safeFilename);

        fs.writeFileSync(outputPath, req.file.buffer);

        const job = createDirectFileJob(
          cleanTitle,
          safeFilename,
          ext as any,
          req.file.buffer.length,
          req.body.author
        );

        res.status(201).json(job);
      } catch (err: any) {
        console.error('Błąd bezpośredniego uploadu do OPDS:', err);
        res.status(500).json({ error: err.message || 'Błąd zapisu pliku' });
      }
    }
  );

  // ----------------------------------------------------
  // API Endpoints: Jobs & Status
  // ----------------------------------------------------
  app.get(['/api/jobs', '/api/koreader/tasks'], (req, res) => {
    res.json(getAllJobs());
  });

  app.post(['/api/jobs/sync', '/api/koreader/tasks/sync'], (req, res) => {
    const incoming = Array.isArray(req.body) ? req.body : req.body?.jobs || [];
    if (Array.isArray(incoming) && incoming.length > 0) {
      importJobs(incoming);
    }
    res.json(getAllJobs());
  });

  app.get('/api/jobs/:id', (req, res) => {
    const job = getJobById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Zadanie nie zostało znalezione' });
    res.json(job);
  });

  app.get(['/api/jobs/:id/chapters', '/api/koreader/tasks/:id/chapters'], async (req, res) => {
    try {
      const data = await extractChaptersForWebReader(req.params.id);
      res.json(data);
    } catch (err: any) {
      console.warn('Błąd ekstrakcji rozdziałów do czytnika web:', err.message);
      res.status(500).json({ error: err.message || 'Nie udało się otworzyć pliku w czytniku' });
    }
  });

  app.post(['/api/jobs/:id/resume', '/api/koreader/tasks/:id/resume'], (req, res) => {
    const success = resumeJob(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Nie można wznowić zadania (brak rozdziałów lub zadanie nie istnieje)' });
    }
    res.json({ success: true, message: 'Wznowiono zadanie tłumaczenia od miejsca przerwania.' });
  });

  app.post(['/api/jobs/:id/package-now', '/api/koreader/tasks/:id/package-now'], async (req, res) => {
    const success = await packageJobNow(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Nie można spakować zadania (brak rozdziałów)' });
    }
    res.json({ success: true, message: 'Zadanie zostało spakowane i jest gotowe do pobrania.' });
  });

  app.post(['/api/jobs/:id/convert', '/api/koreader/tasks/:id/convert'], async (req, res) => {
    try {
      const targetFormat = req.body.format || 'epub';
      const updatedJob = await convertExistingJobToFormat(req.params.id, targetFormat);
      res.json({ success: true, job: updatedJob, message: `Pomyślnie przekonwertowano książkę do formatu ${targetFormat.toUpperCase()}.` });
    } catch (err: any) {
      console.error('Błąd konwersji formatu książki:', err);
      res.status(500).json({ error: err.message || 'Błąd konwersji formatu książki' });
    }
  });

  app.delete(['/api/jobs/:id', '/api/koreader/tasks/:id'], (req, res) => {
    const deleted = deleteJob(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Książka lub zadanie nie istnieje albo zostało już usunięte' });
    }
    res.json({ success: true, message: 'Książka została usunięta z biblioteki i pamięci serwera' });
  });

  app.post(['/api/jobs/clear-failed', '/api/koreader/tasks/clear-failed'], (req, res) => {
    const count = clearFailedJobs();
    res.json({ success: true, count, message: `Usunięto ${count} błędnych zadań z serwera.` });
  });

  // ----------------------------------------------------
  // API Endpoints: Reader AI Assistant (translate/explain/summarize selected text)
  // ----------------------------------------------------
  app.post('/api/reader/assist', async (req, res) => {
    try {
      const { text, mode = 'explain', context, engine = 'auto' } = req.body;
      if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: 'Brak zaznaczonego tekstu' });
      }
      const answer = await getAIAssist(text, mode, context, engine);
      res.json({ answer });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Błąd asystenta czytnika' });
    }
  });

  // ----------------------------------------------------
  // API Endpoints: Android APK Download (Native Companion App)
  // ----------------------------------------------------
  app.get(['/api/download/apk', '/api/download/app.apk', '/app.apk', '/KOReader-Companion.apk'], (req, res) => {
    const candidates = [
      path.join(process.cwd(), 'public', 'download', 'KOReader-Companion.apk'),
      path.join(process.cwd(), 'public', 'KOReader-Companion.apk'),
      path.join(process.cwd(), 'tmp', 'android_apk_build', 'bin', 'KOReader-Companion.apk'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        res.setHeader('Content-Type', 'application/vnd.android.package-archive');
        res.setHeader('Content-Disposition', 'attachment; filename="KOReader-Companion.apk"');
        return res.sendFile(p);
      }
    }
    return res.status(404).json({ error: 'Plik APK nie został jeszcze wygenerowany' });
  });

  // ----------------------------------------------------
  // API Endpoints: QR Code for Mobile Web App on Smartphones
  // ----------------------------------------------------
  app.get(['/api/koreader/qr.png', '/api/qr.png'], async (req, res) => {
    try {
      const baseUrl = getAppBaseUrl(req);
      const targetUrl = (typeof req.query.url === 'string' && req.query.url.trim())
        ? req.query.url.trim()
        : `${baseUrl}/?mobile=1`;

      const pngBuffer = await QRCode.toBuffer(targetUrl, {
        type: 'png',
        width: 380,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      });

      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Content-Length', pngBuffer.length);
      res.send(pngBuffer);
    } catch (e: any) {
      res.status(500).json({ error: 'Nie udało się wygenerować kodu QR' });
    }
  });

  app.get(['/api/koreader/qr', '/api/qr'], (req, res) => {
    const baseUrl = getAppBaseUrl(req);
    const targetUrl = (typeof req.query.url === 'string' && req.query.url.trim())
      ? req.query.url.trim()
      : `${baseUrl}/?mobile=1`;
    res.json({ url: targetUrl });
  });

  // ----------------------------------------------------
  // API Endpoints: Natural AI Text-to-Speech (Gemini & ElevenLabs)
  // ----------------------------------------------------
  app.get('/api/tts/voices', (req, res) => {
    res.json({
      voices: AVAILABLE_VOICES,
      defaultVoice: 'pl-PL-MarekNeural',
    });
  });

  app.get(['/api/tts/elevenlabs/voices', '/api/tts/elevenlabs-voices'], async (req, res) => {
    try {
      const apiKey = typeof req.query.apiKey === 'string' ? req.query.apiKey : undefined;
      const voices = await fetchElevenLabsVoices(apiKey);
      res.json({ voices });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Nie udało się pobrać głosów ElevenLabs' });
    }
  });

  app.post('/api/tts', async (req, res) => {
    try {
      const { text, voice, provider, elevenLabsApiKey, elevenLabsVoiceId, speed } = req.body || {};
      if (!text || typeof text !== 'string' || !text.trim()) {
        return res.status(400).json({ error: 'Brak tekstu do odczytania.' });
      }

      const { buffer, mimeType } = await synthesizeSpeech({
        text,
        voice,
        provider,
        elevenLabsApiKey,
        elevenLabsVoiceId,
        speed,
      });

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', buffer.length);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(buffer);
    } catch (err: any) {
      console.warn('Błąd syntezy mowy:', err.message);
      res.status(500).json({ error: err.message || 'Błąd generowania głosu lektora' });
    }
  });

  app.post('/api/tts/elevenlabs/verify', async (req, res) => {
    try {
      const { apiKey } = req.body || {};
      const result = await verifyElevenLabsKey(apiKey || '');
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ valid: false, error: err.message || 'Błąd sprawdzania klucza' });
    }
  });

  // ----------------------------------------------------
  // API Endpoints: Two-Way Reading Progress Sync (Kindle ↔ Web Reader)
  // ----------------------------------------------------
  app.post(['/api/sync/progress', '/api/koreader/sync/progress'], (req, res) => {
    try {
      const { bookId, title, progressPercent, chapterIndex, currentPosition, totalChapters, device } = req.body;
      if (!bookId) {
        return res.status(400).json({ error: 'Brak bookId' });
      }
      const updated = updateReadingProgress({
        bookId,
        title: title || 'Książka',
        progressPercent: Number(progressPercent) || 0,
        chapterIndex: Number(chapterIndex) || 0,
        currentPosition: Number(currentPosition) || 0,
        totalChapters: Number(totalChapters) || 0,
        device: device || 'Web Reader',
      });
      res.json({ success: true, progress: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Błąd synchronizacji postępu' });
    }
  });

  app.get(['/api/sync/progress/:bookId', '/api/koreader/sync/progress/:bookId'], (req, res) => {
    const progress = getReadingProgress(req.params.bookId);
    res.json({ success: true, progress });
  });

  app.get(['/api/sync/all', '/api/koreader/sync/all'], (req, res) => {
    const all = getAllReadingProgress();
    res.json({ success: true, progressMap: all });
  });

  // ----------------------------------------------------
  // API Endpoints: Multi-Voice Radio Drama Studio
  // ----------------------------------------------------
  app.get('/api/audio/script/:jobId/:chapterIndex', async (req, res) => {
    try {
      const { jobId, chapterIndex } = req.params;
      const idx = parseInt(chapterIndex, 10) || 0;
      const job = getJobById(jobId);
      if (!job) {
        return res.status(404).json({ error: 'Nie znaleziono książki' });
      }

      let chapterText = '';
      let chapterTitle = `Rozdział ${idx + 1}`;

      if (job.chapters && job.chapters[idx]) {
        chapterText = job.chapters[idx].translatedText || job.chapters[idx].originalText || '';
        chapterTitle = job.chapters[idx].title || chapterTitle;
      } else {
        // Try extracting from file
        const extracted = await extractChaptersForWebReader(jobId);
        if (extracted && extracted.chapters && extracted.chapters[idx]) {
          chapterText = extracted.chapters[idx].content || '';
          chapterTitle = extracted.chapters[idx].title || chapterTitle;
        }
      }

      if (!chapterText) {
        return res.status(404).json({ error: 'Brak treści dla tego rozdziału' });
      }

      const script = parseChapterToDramaticScript(chapterText, chapterTitle, jobId, idx);
      res.json({ success: true, script });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Błąd generowania scenariusza słuchowiska' });
    }
  });

  app.post('/api/audio/export-chapter-mp3/:jobId/:chapterIndex', async (req, res) => {
    try {
      const { jobId, chapterIndex } = req.params;
      const idx = parseInt(chapterIndex, 10) || 0;
      const job = getJobById(jobId);
      if (!job) {
        return res.status(404).json({ error: 'Nie znaleziono książki' });
      }

      let chapterText = '';
      let chapterTitle = `Rozdział ${idx + 1}`;

      if (job.chapters && job.chapters[idx]) {
        chapterText = job.chapters[idx].translatedText || job.chapters[idx].originalText || '';
        chapterTitle = job.chapters[idx].title || chapterTitle;
      } else {
        const extracted = await extractChaptersForWebReader(jobId);
        if (extracted && extracted.chapters && extracted.chapters[idx]) {
          chapterText = extracted.chapters[idx].content || '';
          chapterTitle = extracted.chapters[idx].title || chapterTitle;
        }
      }

      if (!chapterText) {
        return res.status(404).json({ error: 'Brak treści dla tego rozdziału' });
      }

      const script = parseChapterToDramaticScript(chapterText, chapterTitle, jobId, idx);
      const generated = await generateChapterDramaAudio(jobId, idx, script);

      res.json({
        success: true,
        fileName: generated.fileName,
        downloadUrl: `/api/audio/download-drama/${jobId}/${idx}`,
        sizeKb: Math.round(generated.buffer.length / 1024),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Błąd eksportu słuchowiska MP3' });
    }
  });

  app.get('/api/audio/download-drama/:jobId/:chapterIndex', async (req, res) => {
    try {
      const { jobId, chapterIndex } = req.params;
      const idx = parseInt(chapterIndex, 10) || 0;
      const job = getJobById(jobId);

      let chapterText = '';
      let chapterTitle = `Rozdział ${idx + 1}`;

      if (job?.chapters && job.chapters[idx]) {
        chapterText = job.chapters[idx].translatedText || job.chapters[idx].originalText || '';
        chapterTitle = job.chapters[idx].title || chapterTitle;
      } else {
        const extracted = await extractChaptersForWebReader(jobId);
        if (extracted && extracted.chapters && extracted.chapters[idx]) {
          chapterText = extracted.chapters[idx].content || '';
          chapterTitle = extracted.chapters[idx].title || chapterTitle;
        }
      }

      const script = parseChapterToDramaticScript(chapterText, chapterTitle, jobId, idx);
      const generated = await generateChapterDramaAudio(jobId, idx, script);

      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Disposition', `attachment; filename="${generated.fileName}"`);
      res.setHeader('Content-Length', generated.buffer.length);
      res.send(generated.buffer);
    } catch (err: any) {
      res.status(500).send('Błąd pobierania słuchowiska');
    }
  });

  // ----------------------------------------------------
  // API Endpoints: AI Companion (Character Tree & Recap)
  // ----------------------------------------------------
  app.get('/api/books/:id/characters', async (req, res) => {
    try {
      const job = getJobById(req.params.id);
      if (!job) {
        return res.status(404).json({ error: 'Nie znaleziono książki' });
      }

      let sampleText = '';
      if (job.chapters && job.chapters.length > 0) {
        sampleText = job.chapters.slice(0, 4).map((c) => c.translatedText || c.originalText).join('\n\n');
      } else {
        const extracted = await extractChaptersForWebReader(req.params.id);
        if (extracted && extracted.chapters && extracted.chapters.length > 0) {
          sampleText = extracted.chapters.slice(0, 4).map((c) => c.content).join('\n\n');
        }
      }

      const characters = await extractBookCharacters(job.title, sampleText);
      res.json({ success: true, characters });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Błąd generowania przewodnika po postaciach' });
    }
  });

  app.get('/api/books/:id/recap', async (req, res) => {
    try {
      const job = getJobById(req.params.id);
      if (!job) {
        return res.status(404).json({ error: 'Nie znaleziono książki' });
      }

      const chapterIndex = parseInt(req.query.chapterIndex as string, 10) || 0;
      let previousText = '';
      let chapterTitle = `Rozdział ${chapterIndex + 1}`;

      let textList: string[] = [];
      if (job.chapters && job.chapters.length > 0) {
        if (job.chapters[chapterIndex]) chapterTitle = job.chapters[chapterIndex].title || chapterTitle;
        textList = job.chapters.slice(0, Math.max(1, chapterIndex)).map((c) => c.translatedText || c.originalText || '');
      } else {
        const extracted = await extractChaptersForWebReader(req.params.id);
        if (extracted && extracted.chapters && extracted.chapters.length > 0) {
          if (extracted.chapters[chapterIndex]) chapterTitle = extracted.chapters[chapterIndex].title || chapterTitle;
          textList = extracted.chapters.slice(0, Math.max(1, chapterIndex)).map((c) => c.content || '');
        }
      }
      previousText = textList.join('\n\n');

      const recap = await generateChapterRecap(job.title, chapterTitle, previousText);
      res.json({ success: true, recap, chapterTitle });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Błąd generowania przypomnienia' });
    }
  });

  // ----------------------------------------------------
  // API Endpoints: Series Catalog
  // ----------------------------------------------------
  app.get('/api/series/known', (req, res) => {
    res.json({ success: true, series: KNOWN_SERIES });
  });

  // ----------------------------------------------------
  // API Endpoints: Book/Comic Download (EPUB or CBZ)
  // ----------------------------------------------------
  app.get(['/api/download/:id', '/api/koreader/download/:id'], async (req, res) => {
    const rawId = req.params.id;
    const job = getJobById(rawId);
    let fullPath: string | null = null;
    let filename = '';
    let isCbz = false;

    if (job && job.outputEpubFilename) {
      fullPath = getEpubFilePath(job.outputEpubFilename);
      filename = job.outputEpubFilename;
      isCbz = filename.toLowerCase().endsWith('.cbz') || job.outputFormat === 'cbz';
    } else {
      // Fallback: check if id is a direct filename in data/epubs
      fullPath = getEpubFilePath(rawId);
      if (fullPath) {
        filename = path.basename(fullPath);
        isCbz = filename.toLowerCase().endsWith('.cbz');
      }
    }

    // Auto-rebuild on-the-fly if file is missing on disk but chapters exist in memory/disk
    if ((!fullPath || !fs.existsSync(fullPath)) && job && job.chapters && job.chapters.length > 0) {
      try {
        const epubBuffer = await generateEpubBuffer({
          title: job.title,
          author: 'KOReader AI Cloud',
          language: 'pl',
          chapters: job.chapters,
        });
        const safeTitle = sanitizeToAsciiFilename(job.title);
        const newFilename = `${safeTitle}_pl_${job.id.substring(4, 9)}.epub`;
        const newPath = path.join(process.cwd(), 'data', 'epubs', newFilename);
        fs.writeFileSync(newPath, epubBuffer);
        job.outputEpubFilename = newFilename;
        job.outputFormat = 'epub';
        saveJobsToDisk();
        fullPath = newPath;
        filename = newFilename;
        isCbz = false;
      } catch (err: any) {
        console.error('Błąd regeneracji pliku EPUB w locie:', err);
      }
    }

    if (!fullPath || !fs.existsSync(fullPath)) {
      const remoteUrl = process.env.REMOTE_SYNC_URL;
      if (remoteUrl) {
        try {
          const remoteRes = await fetch(`${remoteUrl.replace(/\/+$/, '')}/api/download/${encodeURIComponent(rawId)}`, {
            signal: AbortSignal.timeout(4000),
          });
          if (remoteRes.ok) {
            const ab = await remoteRes.arrayBuffer();
            const buf = Buffer.from(ab);
            if (buf.length > 500) {
              const fallbackName = job?.outputEpubFilename || `${rawId}.epub`;
              const savePath = path.join(process.cwd(), 'data', 'epubs', fallbackName);
              fs.writeFileSync(savePath, buf);
              fullPath = savePath;
              filename = fallbackName;
            }
          }
        } catch (err: any) {
          console.warn(`Nie udało się pobrać pliku ${rawId} z serwera zapasowego:`, err?.message);
        }
      }
    }

    if (!fullPath || !fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Plik nie jest jeszcze gotowy lub zadanie nie istnieje' });
    }

    const safeAscii = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const isPdf = filename.toLowerCase().endsWith('.pdf') || job?.outputFormat === 'pdf';
    const isTxt = filename.toLowerCase().endsWith('.txt') || job?.outputFormat === 'txt';
    const contentType = isPdf
      ? 'application/pdf'
      : isTxt
      ? 'text/plain; charset=utf-8'
      : isCbz
      ? 'application/vnd.comicbook+zip'
      : 'application/epub+zip';

    const stat = fs.statSync(fullPath);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    res.sendFile(fullPath);
  });

  // ----------------------------------------------------
  // API Endpoints: OPDS Catalog Feed (for KOReader built-in OPDS client)
  // ----------------------------------------------------
  app.get(['/opds', '/api/koreader/opds'], (req, res) => {
    const baseUrl = getAppBaseUrl(req);
    const allJobs = getAllJobs();
    const completedJobs = allJobs.filter(j => j.status === 'completed' && j.outputEpubFilename);
    const activeJobs = allJobs.filter(j => ['queued', 'extracting', 'translating', 'packaging'].includes(j.status));

    let entriesXml = '';

    // Individual live status entries for each job currently processing in cloud
    if (activeJobs.length > 0) {
      for (const aj of activeJobs) {
        const stepDesc = aj.status === 'translating'
          ? `Tłumaczenie AI (${aj.progress || 0}%) - rozdział ${aj.currentChapter || 0}/${aj.totalChapters || 0}`
          : aj.status === 'extracting'
          ? 'Ekstrakcja tekstu i analiza...'
          : aj.status === 'packaging'
          ? 'Budowanie e-booka EPUB/CBZ...'
          : 'Oczekuje w kolejce...';

        entriesXml += `
  <entry>
    <title>⏳ [W TOKU ${aj.progress || 0}%] ${aj.title}</title>
    <id>urn:uuid:active-${aj.id}</id>
    <updated>${new Date(aj.updatedAt || Date.now()).toISOString()}</updated>
    <author><name>Kolejka Chmury AI</name></author>
    <summary>${stepDesc}. Odśwież stronę za chwilę w KOReaderze, aby pobrać po ukończeniu.</summary>
    <link rel="alternate" href="${baseUrl}/opds" type="application/atom+xml;profile=opds-catalog"/>
  </entry>`;
      }
    }

    for (const job of completedJobs) {
      const isCbz = job.outputFormat === 'cbz' || (job.outputEpubFilename || '').toLowerCase().endsWith('.cbz');
      const isPdf = job.outputFormat === 'pdf' || (job.outputEpubFilename || '').toLowerCase().endsWith('.pdf');
      const mime = isCbz
        ? 'application/vnd.comicbook+zip'
        : isPdf
        ? 'application/pdf'
        : 'application/epub+zip';
      const sizeAttr = job.originalSize ? ` length="${job.originalSize}"` : '';
      const typeTag = isCbz ? '🎨 [CBZ]' : isPdf ? '📄 [PDF]' : '📚 [EPUB]';

      entriesXml += `
  <entry>
    <title>${typeTag} ${job.title}</title>
    <id>urn:uuid:${job.id}</id>
    <updated>${new Date(job.updatedAt).toISOString()}</updated>
    <author><name>KOReader AI Cloud</name></author>
    <summary>Gotowa książka. Format: ${job.outputFormat || 'epub'}. Silnik AI: ${job.engine || 'auto'}. Kliknij, aby natychmiast pobrać i otworzyć w czytniku.</summary>
    <link rel="http://opds-spec.org/acquisition"
          href="${baseUrl}/api/download/${job.id}"
          type="${mime}"${sizeAttr}/>
  </entry>`;
    }

    const opdsXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>urn:uuid:koreader-ai-catalog</id>
  <title>📚 KOReader AI Cloud Library</title>
  <updated>${new Date().toISOString()}</updated>
  <link rel="self" href="${baseUrl}/opds" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <link rel="start" href="${baseUrl}/opds" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  ${entriesXml}
</feed>`;

    res.setHeader('Content-Type', 'application/atom+xml;profile=opds-catalog;charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Connection', 'close');
    res.send(opdsXml);
  });

  // ----------------------------------------------------
  // API Endpoints: KOReader Lua Plugin Generator & ZIP
  // ----------------------------------------------------
  app.get('/api/koreader/plugin.zip', async (req, res) => {
    try {
      const customUrl = typeof req.query.serverUrl === 'string' && req.query.serverUrl.trim()
        ? req.query.serverUrl.trim().replace(/\/+$/, '')
        : getAppBaseUrl(req);
      const zipBuffer = await generatePluginZip(customUrl);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="aibooks.koplugin.zip"');
      res.send(zipBuffer);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Błąd generowania wtyczki' });
    }
  });

  app.get('/api/koreader/plugin/code', (req, res) => {
    const customUrl = typeof req.query.serverUrl === 'string' && req.query.serverUrl.trim()
      ? req.query.serverUrl.trim().replace(/\/+$/, '')
      : getAppBaseUrl(req);
    res.json({
      serverUrl: customUrl,
      metaLua: getMetaLua(),
      mainLua: getMainLua(customUrl),
    });
  });

  // ----------------------------------------------------
  // Vite Integration (Dev vs Production) & Listen
  // ----------------------------------------------------
  async function startServer() {
    if (process.env.NODE_ENV !== 'production') {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true, allowedHosts: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`KOReader AI Cloud Server running on http://0.0.0.0:${PORT}`);
    });
  }

  if (!process.env.VERCEL) {
    startServer().catch(err => {
      console.error('Błąd startu serwera:', err);
    });
  }

  export default app;
