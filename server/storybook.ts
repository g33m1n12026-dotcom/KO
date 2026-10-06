import { GoogleGenAI } from '@google/genai';
import { StorybookRequest, ChapterData, Job } from '../src/types';
import { generateEpubBuffer, sanitizeToAsciiFilename, cleanHtmlEntitiesToUtf8 } from './epub';
import { saveJobsToDisk } from './jobs';
import fs from 'fs';
import path from 'path';

function getGemini(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY || '';
  return new GoogleGenAI({ apiKey: key });
}

interface GeneratedOutline {
  title: string;
  author: string;
  synopsis: string;
  coverImagePrompt: string;
  chapters: {
    title: string;
    summary: string;
    imagePrompt: string;
  }[];
}

/**
 * Calls AI to generate JSON or text with automatic fallback across available providers
 */
async function callAiText(systemPrompt: string, userPrompt: string, engine: string = 'auto'): Promise<string> {
  const geminiKey = process.env.GEMINI_API_KEY || '';
  const openrouterKey = process.env.OPENROUTER_API_KEY || '';
  const openaiKey = process.env.OPENAI_API_KEY || '';
  const anthropicKey = process.env.ANTHROPIC_API_KEY || '';

  const providers = engine === 'claude' ? ['claude', 'gemini', 'openrouter']
    : engine === 'openai' ? ['openai', 'gemini', 'openrouter']
    : engine === 'openrouter' ? ['openrouter', 'gemini', 'claude']
    : ['gemini', 'openrouter', 'claude', 'openai'];

  let lastErr = '';

  // 1. Try Gemini with retry and alternative model fallbacks
  if (geminiKey) {
    const gemini = getGemini();
    const geminiModels = ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-2.0-flash'];

    for (const m of geminiModels) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await gemini.models.generateContent({
            model: m,
            contents: `${systemPrompt}\n\n${userPrompt}`,
            config: {
              temperature: 0.7,
            },
          });
          const text = res.text?.trim();
          if (text) return text;
        } catch (e: any) {
          lastErr = e?.message || String(e);
          console.warn(`Gemini (${m}) próba ${attempt + 1}/3 ostrzeżenie:`, lastErr);
          if (lastErr.includes('503') || lastErr.includes('high demand') || lastErr.includes('429')) {
            await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
            continue;
          }
          break; // Try next model if non-retriable error
        }
      }
    }
  }

  // 2. Try OpenRouter if configured
  if (openrouterKey) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openrouterKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek/deepseek-chat',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.7,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text) return text;
      }
    } catch (e: any) {
      lastErr = e?.message || String(e);
    }
  }

  // 3. Try OpenAI if configured
  if (openaiKey) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.7,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text) return text;
      }
    } catch (e: any) {
      lastErr = e?.message || String(e);
    }
  }

  // 4. Automatic Free AI Fallback (Pollinations / Duck-compatible)
  try {
    console.log('[Storybook] Uruchamianie darmowego silnika zapasowego AI (Pollinations)...');
    const combinedPrompt = `${systemPrompt}\n\n${userPrompt}`;
    const url = `https://text.pollinations.ai/${encodeURIComponent(combinedPrompt)}?model=openai`;
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(20000),
      headers: {
        'User-Agent': 'KOReader-AI-Storybook/1.0',
        Accept: 'text/plain, application/json',
      },
    });
    if (resp.ok) {
      const text = await resp.text();
      if (text && text.trim().length > 30) {
        return text.trim();
      }
    }
  } catch (freeErr: any) {
    console.warn('Free AI fallback notice:', freeErr?.message || freeErr);
  }

  throw new Error(`Nie udało się wygenerować tekstu przez AI: ${lastErr || 'Przeciążenie modeli'}`);
}

/**
 * Strips meta-references to physical books, pages, covers, paper, and mockups so the
 * image model renders direct 2D artwork scenes rather than a photograph of an open book or paper page.
 */
export function cleanPromptForDirectArtwork(promptText: string): string {
  let cleaned = promptText
    .replace(/\b(book\s*cover|book\s*covers|book\s*page|book\s*pages|open\s*book|closed\s*book|vintage\s*book|physical\s*book|kindle\s*device|kindle\s*screen|paper\s*sheet|paper\s*texture|photo\s*of|picture\s*of\s*a\s*book|photograph\s*of|in\s*a\s*book|on\s*paper|on\s*clean\s*white\s*paper|mockup|table\s*surface|wooden\s*table|desk)\b/gi, ' ')
    .replace(/\b(book|books|cover|covers|page|pages|paper|papers|mockup|mockups)\b/gi, ' ')
    .replace(/[^\w\s,.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || 'dramatic atmospheric scene, high contrast lineart';
}

let imageQueue: Promise<void> = Promise.resolve();

/**
 * Generates an E-Ink optimized monochrome illustration buffer (woodcut / vintage ink engraving style).
 * Strictly prompts for direct 2D artwork (full-bleed graphic art), preventing the model
 * from generating photos of physical books, mockups, or open pages on tables.
 * Employs a sequential queue lock and 429 backoff to respect provider limits.
 */
export async function fetchIllustrationBuffer(promptText: string, isCover: boolean = false): Promise<Buffer | null> {
  const previous = imageQueue;
  let resolveCurrent: () => void = () => {};
  imageQueue = new Promise<void>((r) => {
    resolveCurrent = r;
  });

  try {
    await previous;
  } catch {
    // Ignore prior queue errors
  }

  try {
    const cleanedSubject = cleanPromptForDirectArtwork(promptText);

    // Direct 2D artwork prompt specifying full-bleed graphic scene
    const directArtPrompt = isCover
      ? `direct 2D artwork, dynamic vertical poster art depicting ${cleanedSubject}, crisp woodcut engraving and etching style, high contrast black and white ink line art, detailed graphic novel artwork, cinematic composition, subject fills entire image, centered, sharp focus, 2D vector etching, full bleed visual, no photograph, no open book, no book cover, no pages, no table`
      : `direct 2D scene, wide artwork depicting ${cleanedSubject}, high contrast monochrome ink line art, fine woodcut crosshatching style, graphic novel drawing, sharp black and white illustration, full bleed image, no margins, no text, no book, no pages, no photograph`;

    const seed = Math.floor(Math.random() * 1000000);
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(directArtPrompt)}?model=flux&nologo=true&seed=${seed}`;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(10000),
          headers: {
            'User-Agent': 'KOReader-AI-Storybook/1.0',
            Accept: 'image/jpeg,image/png,image/*',
          },
        });

        if (res.status === 429) {
          console.warn(`Pollinations 429 (próba ${attempt + 1}/2), oczekiwanie 2s...`);
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }

        if (res.ok) {
          const arr = await res.arrayBuffer();
          if (arr.byteLength > 1000) {
            await new Promise((r) => setTimeout(r, 800));
            return Buffer.from(arr);
          }
        }
      } catch (err) {
        console.warn(`Błąd pobierania ilustracji (próba ${attempt + 1}):`, err);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  } catch (e) {
    console.warn('Illustration generation skipped or timed out:', e);
  } finally {
    resolveCurrent();
  }
  return null;
}

/**
 * Generates book outline based on user specification
 */
export async function generateBookOutline(req: StorybookRequest): Promise<GeneratedOutline> {
  const systemPrompt = `Jesteś uznanym autorem książek, redaktorem naczelnym wydawnictwa i mistrzem narracji.
Twoim celem jest stworzenie kompletnego planu książki / e-booka w języku polskim w formacie czystego JSON.

Książka może być:
- Powieścią / opowiadaniem fabularnym (bogata intryga, rozwój bohaterów, dramatyzm lub humor)
- Wyczerpującym streszczeniem i przewodnikiem po istniejącym dziele (np. rozdział po rozdziale, kluczowe koncepcje, cytaty, wnioski)
- Praktycznym poradnikiem lub instrukcją (logiczny podział tematu, od podstaw do zaawansowanych praktyk, studia przypadków).

Odpowiedz WYŁĄCZNIE poprawnym obiektem JSON (bez markdowna \`\`\`json i bez wstępów):
{
  "title": "Tytuł książki",
  "author": "Imię Nazwisko autora (lub AI Studio)",
  "synopsis": "Krótki, fascynujący opis książki na tylną okładkę (2-3 zdania)",
  "coverImagePrompt": "Krótki angielski opis samej sceny graficznej na plakat/okładkę (np. 'A massive retro spaceship drifting through a cosmic starfield, detailed ink drawing'). BARDZO WAŻNE: opisuj wyłącznie widoczną scenę, postacie lub otoczenie. NIGDY nie używaj słów 'book', 'book cover', 'page', 'paper', 'photo', 'mockup', 'table' - generator musi narysować samą bezpośrednią grafikę, a nie zdjęcie leżącej książki!",
  "chapters": [
    {
      "title": "Tytuł Rozdziału 1",
      "summary": "Co dokładnie wydarzy się lub zostanie omówione w tym rozdziale",
      "imagePrompt": "Krótki angielski opis konkretnej sceny fabularnej z tego rozdziału (np. 'A shadowy detective entering a dimly lit retro room with rain on the window, noir ink line art'). NIGDY nie używaj słów 'book', 'page', 'illustration', 'reading', 'paper' ani 'open book'."
    }
  ]
}`;

  const userPrompt = `DANE WEJŚCIOWE OD CZYTELNIKA:
Typ książki: ${req.type === 'story' ? 'Powieść / Opowiadanie' : req.type === 'summary' ? 'Kompleksowe streszczenie i przewodnik po książce' : 'Praktyczny poradnik / instrukcja'}
Tytuł lub temat przewodni: ${req.title || 'Wymyśl intrygujący tytuł na bazie opisu'}
Opis czytelnika: "${req.prompt}"
Bohaterowie: ${req.characters || 'Brak sprecyzowanych (dobierz odpowiednie postacie)'}
Gatunek / Styl: ${req.genre || 'Dopasowany do tematyki'}
Liczba rozdziałów: ${req.chapterCount || 5}
Grupa docelowa: ${req.targetAudience || 'Wszyscy czytelnicy'}
Czy generować ilustracje: ${req.includeIllustrations ? 'Tak' : 'Nie'}

Stwórz zrównoważony, wciągający i kompletny spis ${req.chapterCount || 5} rozdziałów.`;

  const rawJson = await callAiText(systemPrompt, userPrompt, req.engine);
  const cleanJson = rawJson.replace(/```json/gi, '').replace(/```/g, '').trim();

  try {
    const parsed: GeneratedOutline = JSON.parse(cleanJson);
    if (!parsed.title || !Array.isArray(parsed.chapters) || parsed.chapters.length === 0) {
      throw new Error('Niekompletna struktura JSON');
    }
    return parsed;
  } catch (err) {
    console.error('Błąd parsowania JSON planu książki:', rawJson);
    // Fallback outline if JSON was slightly malformed
    return {
      title: req.title || 'Książka na życzenie',
      author: req.author || 'KOReader AI Storybook',
      synopsis: req.prompt.slice(0, 200),
      coverImagePrompt: 'dramatic 2D scene, detailed monochrome ink drawing, high contrast linework',
      chapters: Array.from({ length: req.chapterCount || 4 }).map((_, i) => ({
        title: `Rozdział ${i + 1}`,
        summary: `Omówienie i rozwinięcie wątków: ${req.prompt.slice(0, 100)}`,
        imagePrompt: 'atmospheric 2D scene, fine ink lineart, graphic novel style',
      })),
    };
  }
}

/**
 * Generates full text for a single chapter
 */
export async function generateChapterContent(
  outline: GeneratedOutline,
  chapterIndex: number,
  req: StorybookRequest,
  previousContext: string = ''
): Promise<string> {
  const currentChapter = outline.chapters[chapterIndex];
  const isFirst = chapterIndex === 0;
  const isLast = chapterIndex === outline.chapters.length - 1;

  const systemPrompt = `Jesteś uznanym polskim pisarzem i eseistą. Piszesz rozdział do książki "${outline.title}".
Formatuj tekst w piękny, czysty sposób gotowy do druku i na czytnik E-Ink Kindle:
- Dialogi ZAWSZE rozpoczynaj od polskiego myślnika (pauzy '—' lub półpauzy '–'), a nie cudzysłowu!
- Dbaj o bogaty język, metafory, żywe dialogi i wciągające tempo narracji.
- Rozwijaj szczegóły, nie streszczaj zdarzeń w dwóch zdaniach – pisz pełną scenę lub wyczerpujący wykład poradnikowy.
- Nie dodawaj nagłówka rozdziału w treści (będzie dodany automatycznie przez czytnik).
- Nie dodawaj komentarzy typu "Oto rozdział:", zacznij bezpośrednio od pierwszego akapitu.`;

  const userPrompt = `INFORMACJE O KSIĄŻCE:
Tytuł: "${outline.title}"
Typ: ${req.type === 'story' ? 'Powieść / Opowiadanie fabularne' : req.type === 'summary' ? 'Kompleksowe streszczenie i analiza' : 'Poradnik / Instrukcja'}
Gatunek: ${req.genre || 'Ogólny'}
Bohaterowie: ${req.characters || 'Bohaterowie książki'}
Ogólny zarys: ${outline.synopsis}

BIEŻĄCY ROZDZIAŁ (${chapterIndex + 1}/${outline.chapters.length}):
Tytuł: "${currentChapter.title}"
Plan tego rozdziału: "${currentChapter.summary}"
${isFirst ? 'To jest rozdział otwierający – wprowadź klimat, świat i bohaterów lub nakreśl tezę poradnika.' : ''}
${isLast ? 'To jest rozdział finałowy – doprowadź wątki do satysfakcjonującego punktu kulminacyjnego i zakończenia.' : ''}
${previousContext ? `Dotychczasowe wydarzenia w skrócie:\n${previousContext}` : ''}

Napisz pełny, obszerny tekst tego rozdziału (ok. 600 - 1000 słów) w języku polskim:`;

  return await callAiText(systemPrompt, userPrompt, req.engine);
}

/**
 * Main execution loop for creating a Storybook Job
 */
export async function executeStorybookJob(job: Job, req: StorybookRequest): Promise<void> {
  const EPUB_DIR = path.join(process.cwd(), 'data', 'epubs');
  if (!fs.existsSync(EPUB_DIR)) fs.mkdirSync(EPUB_DIR, { recursive: true });

  const log = (msg: string) => {
    job.logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
    job.updatedAt = Date.now();
  };

  try {
    log(`Rozpoczynanie generowania książki na życzenie: "${req.title || req.prompt.slice(0, 40)}"`);
    job.status = 'extracting';
    job.progress = 10;

    // 1. Generate Outline
    log('AI tworzy plan książki, konspekt fabularny i strukturę rozdziałów...');
    const outline = await generateBookOutline(req);
    job.title = outline.title;
    job.totalChapters = outline.chapters.length;
    job.chapters = outline.chapters.map(ch => ({
      title: ch.title,
      originalText: '',
      translatedText: '',
      status: 'pending',
      imagePrompt: ch.imagePrompt,
    }));
    log(`Stworzono plan: "${outline.title}" (${outline.chapters.length} rozdziałów).`);

    // 2. Cover image generation (if illustrations enabled)
    let coverBuffer: Buffer | undefined;
    if (req.includeIllustrations) {
      log('Generowanie unikalnej okładki książki w stylu rycin e-ink...');
      job.progress = 18;
      const buf = await fetchIllustrationBuffer(outline.coverImagePrompt || `${outline.title} dramatic scene, ink poster art`, true);
      if (buf) {
        coverBuffer = buf;
        log('Okładka e-booka wygenerowana pomyślnie!');
      }
    }

    // 3. Generate each chapter content
    job.status = 'translating'; // maps to active writing state
    const generatedChapters: (ChapterData & { imageBuffer?: Buffer })[] = [];
    let rollingSummary = '';

    for (let i = 0; i < outline.chapters.length; i++) {
      const chMeta = outline.chapters[i];
      job.currentChapter = i + 1;
      job.progress = 20 + Math.round(((i + 0.5) / outline.chapters.length) * 60);
      log(`Pisanie rozdziału ${i + 1}/${outline.chapters.length}: "${chMeta.title}"...`);

      // Write chapter text
      const rawChapterText = await generateChapterContent(outline, i, req, rollingSummary);
      const chapterText = cleanHtmlEntitiesToUtf8(rawChapterText);
      rollingSummary += `\nRozdział ${i + 1}: ${chMeta.title} - ${chapterText.slice(0, 180)}...`;

      // Chapter illustration
      let chImageBuffer: Buffer | undefined;
      if (req.includeIllustrations && chMeta.imagePrompt) {
        log(`Tworzenie ryciny e-ink dla rozdziału ${i + 1}...`);
        const imgBuf = await fetchIllustrationBuffer(chMeta.imagePrompt, false);
        if (imgBuf) chImageBuffer = imgBuf;
      }

      job.chapters[i].status = 'completed';
      job.chapters[i].originalText = chapterText;
      job.chapters[i].translatedText = chapterText;

      generatedChapters.push({
        title: chMeta.title,
        originalText: chapterText,
        translatedText: chapterText,
        status: 'completed',
        imageBuffer: chImageBuffer,
      });

      log(`Ukończono rozdział ${i + 1}: "${chMeta.title}" (${chapterText.split(/\s+/).length} słów).`);
      saveJobsToDisk();
    }

    // 4. Packaging EPUB
    job.status = 'packaging';
    job.progress = 90;
    saveJobsToDisk();
    log('Kompilowanie książki do formatu EPUB 3 zoptymalizowanego dla Kindle 10 i KOReadera...');

    const epubBuffer = await generateEpubBuffer({
      title: outline.title,
      author: outline.author || 'AI Studio Storybook',
      language: 'pl',
      chapters: generatedChapters,
      coverImageBuffer: coverBuffer,
    });

    const safeTitle = sanitizeToAsciiFilename(outline.title);
    const filename = `${safeTitle}_${Date.now()}.epub`;
    const outputPath = path.join(EPUB_DIR, filename);

    fs.writeFileSync(outputPath, epubBuffer);

    job.status = 'completed';
    job.progress = 100;
    job.outputEpubFilename = filename;
    job.originalSize = epubBuffer.length;
    log(`Książka została pomyślnie utworzona i spakowana! Rozmiar: ${(epubBuffer.length / 1024).toFixed(1)} KB. Gotowa do pobrania na Kindle.`);
    saveJobsToDisk();
  } catch (err: any) {
    console.error(`Błąd generowania książki ${job.id}:`, err);
    job.status = 'failed';
    job.error = err.message || 'Wystąpił nieznany błąd podczas pisania książki';
    log(`BŁĄD: ${job.error}`);
    saveJobsToDisk();
  }
}
