import express from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

import { getAvailableKeys, recommendBooksByDescription, getAIAssist } from './server/ai';
import {
  getAllJobs,
  getJobById,
  createUploadJob,
  createSearchOrderJob,
  createStorybookJob,
  getEpubFilePath,
} from './server/jobs';
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
              const found = await findDirectBookDownload(q);
              if (found) {
                rec.downloadUrl = found.downloadUrl;
                rec.downloadFormat = found.format;
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
  // API Endpoints: Book Search & Ordering
  // ----------------------------------------------------
  app.get(['/api/search', '/api/koreader/search'], async (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      const results = await searchOnlineBooks(q);
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Błąd wyszukiwania' });
    }
  });

  app.post(['/api/order', '/api/koreader/order'], async (req, res) => {
    try {
      const { title, downloadUrl, engine = 'auto', targetLang = 'Polish', conversionMode = 'translate' } = req.body;
      if (!title || !downloadUrl) {
        return res.status(400).json({ error: 'Brak tytułu lub linku do pobrania' });
      }
      const job = createSearchOrderJob(title, downloadUrl, engine, targetLang, conversionMode);
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
  // API Endpoints: Book/Comic Download (EPUB or CBZ)
  // ----------------------------------------------------
  app.get(['/api/download/:id', '/api/koreader/download/:id'], (req, res) => {
    const job = getJobById(req.params.id);
    if (!job || !job.outputEpubFilename) {
      return res.status(404).json({ error: 'Plik nie jest jeszcze gotowy lub zadanie nie istnieje' });
    }
    const fullPath = getEpubFilePath(job.outputEpubFilename);
    if (!fullPath) {
      return res.status(404).json({ error: 'Plik nie został znaleziony na dysku' });
    }

    const isCbz = job.outputEpubFilename.toLowerCase().endsWith('.cbz') || job.outputFormat === 'cbz';
    res.setHeader('Content-Type', isCbz ? 'application/vnd.comicbook+zip' : 'application/epub+zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(job.outputEpubFilename)}"`
    );
    res.sendFile(fullPath);
  });

  // ----------------------------------------------------
  // API Endpoints: OPDS Catalog Feed (for KOReader built-in OPDS client)
  // ----------------------------------------------------
  app.get(['/opds', '/api/koreader/opds'], (req, res) => {
    const baseUrl = getAppBaseUrl(req);
    const completedJobs = getAllJobs().filter(j => j.status === 'completed' && j.outputEpubFilename);

    let entriesXml = '';
    for (const job of completedJobs) {
      entriesXml += `
  <entry>
    <title>${job.title} (Polski Przekład AI)</title>
    <id>urn:uuid:${job.id}</id>
    <updated>${new Date(job.updatedAt).toISOString()}</updated>
    <author><name>KOReader AI Cloud</name></author>
    <summary>Format: EPUB 3. Rozdziały: ${job.totalChapters}. Silnik AI: ${job.engine}.</summary>
    <link rel="http://opds-spec.org/acquisition"
          href="${baseUrl}/api/download/${job.id}"
          type="application/epub+zip"/>
  </entry>`;
    }

    const opdsXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>urn:uuid:koreader-ai-catalog</id>
  <title>KOReader AI Cloud Library</title>
  <updated>${new Date().toISOString()}</updated>
  <link rel="self" href="${baseUrl}/opds" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <link rel="start" href="${baseUrl}/opds" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  ${entriesXml}
</feed>`;

    res.setHeader('Content-Type', 'application/atom+xml;profile=opds-catalog;charset=utf-8');
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
