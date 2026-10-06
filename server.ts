import express from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import dotenv from 'dotenv';
import QRCode from 'qrcode';
import { createServer as createViteServer } from 'vite';

import { getAvailableKeys, recommendBooksByDescription, getAIAssist } from './server/ai';
import {
  getAllJobs,
  getJobById,
  createUploadJob,
  createDirectFileJob,
  createSearchOrderJob,
  createStorybookJob,
  getEpubFilePath,
  deleteJob,
  saveJobsToDisk,
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
import { getPublicAccountStatus, saveSettings, loginZlibrary, loginDocer, login4shared, testAllAccounts } from './server/settings';

dotenv.config();

const PORT = 3000;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // up to 100 MB
});

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Auto-start public tunnel in background for Kindle connectivity
  startTunnel(PORT).catch((err) => console.warn('Początkowy start tunelu:', err));

  // Helper to determine base public URL (prioritizes Render.com and active live tunnel for Kindle)
  const getAppBaseUrl = (req: express.Request) => {
    if (process.env.RENDER_EXTERNAL_URL) {
      return process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, '');
    }
    const host = req.headers['x-forwarded-host'] || req.get('host') || '';
    if (typeof host === 'string' && host.includes('onrender.com')) {
      return `https://${host}`;
    }
    // Domyślny, w 100% działający serwer produkcyjny Render użytkownika (bez błędu 302)
    return 'https://ko-zviz.onrender.com';
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
    try {
      const { description, engine = 'auto' } = req.body;
      if (!description || typeof description !== 'string' || !description.trim()) {
        return res.status(400).json({ error: 'Proszę podać opis poszukiwanej książki.' });
      }
      const data = await recommendBooksByDescription(description, engine);

      // Auto-scan mirrors for each recommended book so reader/user can download with 1 click
      if (Array.isArray(data.recommendations) && data.recommendations.length > 0) {
        await Promise.all(
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
        );
      }

      res.json(data);
    } catch (err: any) {
      console.error('Błąd generowania rekomendacji AI:', err);
      res.status(500).json({ error: err.message || 'Błąd generowania rekomendacji' });
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

  app.get('/api/jobs/:id', (req, res) => {
    const job = getJobById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Zadanie nie zostało znalezione' });
    res.json(job);
  });

  app.delete(['/api/jobs/:id', '/api/koreader/tasks/:id'], (req, res) => {
    const deleted = deleteJob(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Książka lub zadanie nie istnieje albo zostało już usunięte' });
    }
    res.json({ success: true, message: 'Książka została usunięta z biblioteki i pamięci serwera' });
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
      try {
        const remoteRes = await fetch(`https://ko-zviz.onrender.com/api/download/${encodeURIComponent(rawId)}`, {
          signal: AbortSignal.timeout(15000),
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
        console.warn(`Nie udało się pobrać pliku ${rawId} z Render:`, err?.message);
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
    res.setHeader('Connection', 'close');
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
  // Vite Integration (Dev vs Production)
  // ----------------------------------------------------
  if (process.env.NODE_ENV !== 'production') {
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

startServer().catch(err => {
  console.error('Błąd startu serwera:', err);
});
