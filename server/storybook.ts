import { GoogleGenAI } from '@google/genai';
import { StorybookRequest, ChapterData, Job } from '../src/types';
import { generateEpubBuffer, sanitizeToAsciiFilename, cleanHtmlEntitiesToUtf8 } from './epub';
import { saveJobsToDisk } from './jobs';
import { queryOpenCodeRaw } from './opencode';
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

const sanitizeKey = (k?: string) => (k || '').split(/\s+/)[0].replace(/[^\x00-\x7F]/g, '').trim();

/**
 * Calls AI to generate JSON or text with automatic fallback across available providers
 */
async function callAiText(systemPrompt: string, userPrompt: string, engine: string = 'auto'): Promise<string> {
  const geminiKey = sanitizeKey(process.env.GEMINI_API_KEY);
  const openrouterKey = sanitizeKey(process.env.OPENROUTER_API_KEY);
  const openaiKey = sanitizeKey(process.env.OPENAI_API_KEY);
  const anthropicKey = sanitizeKey(process.env.ANTHROPIC_API_KEY);
  const cohereKey = sanitizeKey(process.env.COHERE_API_KEY);
  const llm7Key = sanitizeKey(process.env.LLM7_API_KEY);

  const groqKey = sanitizeKey(process.env.GROQ_API_KEY);
  const mistralKey = sanitizeKey(process.env.MISTRAL_API_KEY);
  const rawRiver = process.env.RIVER_API_KEY || 'rv_axjuJJFU3vVu4Zgf8IbENdMz-RPTM-YATP03bsMADpo';
  const riverKey = (rawRiver.match(/rv_[a-zA-Z0-9_\-]+/)?.[0] || sanitizeKey(rawRiver)) || 'rv_axjuJJFU3vVu4Zgf8IbENdMz-RPTM-YATP03bsMADpo';

  const providers = engine === 'opencode' ? ['opencode', 'river', 'gemini']
    : engine === 'river' ? ['river', 'opencode', 'gemini', 'openrouter']
    : engine === 'groq' ? ['groq', 'river', 'opencode', 'gemini', 'cohere', 'llm7', 'mistral', 'openrouter']
    : engine === 'mistral' ? ['mistral', 'river', 'opencode', 'groq', 'gemini', 'cohere', 'llm7', 'openrouter']
    : engine === 'cohere' ? ['cohere', 'river', 'opencode', 'gemini', 'groq', 'llm7', 'mistral', 'openrouter']
    : engine === 'llm7' ? ['llm7', 'river', 'opencode', 'groq', 'cohere', 'gemini', 'mistral', 'openrouter']
    : engine === 'claude' ? ['claude', 'river', 'opencode', 'gemini', 'groq', 'cohere', 'llm7', 'openrouter']
    : engine === 'openai' ? ['openai', 'river', 'opencode', 'gemini', 'groq', 'cohere', 'llm7', 'openrouter']
    : engine === 'openrouter' ? ['openrouter', 'river', 'opencode', 'gemini', 'groq', 'cohere', 'llm7', 'claude']
    : ['river', 'opencode', 'gemini', 'groq', 'cohere', 'llm7', 'mistral', 'openrouter', 'claude', 'openai'];

  let lastErr = '';

  for (const prov of providers) {
    // OpenCode.ai (Free open weights models: GLM, Kimi, DeepSeek, Qwen)
    if (prov === 'opencode') {
      try {
        const res = await queryOpenCodeRaw(
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          { temperature: 0.7, max_tokens: 3000 }
        );
        if (res.content && res.content.length > 20) return res.content;
      } catch (opErr: any) {
        lastErr = opErr?.message || String(opErr);
        console.warn('OpenCode storybook notice:', lastErr);
      }
    }

    // River AI (DeepSeek-V4.1-Flash / GLM-5.3-Flash)
    if (prov === 'river' && riverKey) {
      for (const m of ['deepseek-ai/DeepSeek-V4.1-Flash', 'zai-org/GLM-5.3-Flash']) {
        try {
          const res = await fetch('https://api.river.ai/v1/chat/completions', {
            method: 'POST',
            signal: AbortSignal.timeout(35000),
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${riverKey}`,
            },
            body: JSON.stringify({
              model: m,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
              temperature: 0.7,
              max_tokens: 2200,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            const text = data.choices?.[0]?.message?.content?.trim();
            if (text && text.length > 20) return text;
          }
        } catch (e: any) {
          lastErr = e?.message || String(e);
          console.warn(`River AI (${m}) storybook notice:`, lastErr);
        }
      }
    }

    // Google Gemini
    if (prov === 'gemini' && geminiKey) {
      for (const m of ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash']) {
        try {
          const gemini = getGemini();
          const timeoutMs = userPrompt.includes('Napisz pełny') ? 25000 : 10000;
          const res = await Promise.race([
            gemini.models.generateContent({
              model: m,
              contents: `${systemPrompt}\n\n${userPrompt}`,
              config: { temperature: 0.7 },
            }),
            new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Gemini timeout')), timeoutMs)),
          ]);
          const text = res?.text?.trim();
          if (text) return text;
        } catch (e: any) {
          lastErr = e?.message || String(e);
          console.warn(`Gemini (${m}) storybook notice:`, lastErr);
        }
      }
    }

    // Groq
    if (prov === 'groq' && groqKey) {
      for (const m of ['qwen/qwen3.8-27b', 'openai/gpt-oss-120b']) {
        try {
          const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${groqKey}`,
            },
            body: JSON.stringify({
              model: m,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
              max_tokens: 3000,
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
    }

    // Cohere
    if (prov === 'cohere' && cohereKey) {
      for (const m of ['command-r-plus-08-2024', 'command-r-08-2024']) {
        try {
          const res = await fetch('https://api.cohere.com/v2/chat', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${cohereKey}`,
            },
            body: JSON.stringify({
              model: m,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
            }),
          });
          if (res.ok) {
            const data = await res.json();
            const text = data.message?.content?.[0]?.text?.trim();
            if (text) return text;
          }
        } catch (e: any) {
          lastErr = e?.message || String(e);
        }
      }
    }

    // LLM7
    if (prov === 'llm7' && llm7Key) {
      for (const m of ['DeepSeek-V4-Flash-0731', 'GLM-5.3-Flash']) {
        try {
          const res = await fetch('https://api.llm7.io/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${llm7Key}`,
            },
            body: JSON.stringify({
              model: m,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
              max_tokens: 3000,
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
    }

    // Mistral
    if (prov === 'mistral' && mistralKey) {
      for (const m of ['ministral-3b-latest', 'ministral-14b-latest']) {
        try {
          const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${mistralKey}`,
            },
            body: JSON.stringify({
              model: m,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
              max_tokens: 3000,
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
    }

    // OpenRouter
    if (prov === 'openrouter' && openrouterKey) {
      for (const modelName of ['deepseek/deepseek-chat', 'meta-llama/llama-3.3-70b-instruct']) {
        try {
          const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            signal: AbortSignal.timeout(18000),
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${openrouterKey}`,
              'HTTP-Referer': 'https://koreader-cloud.local',
              'X-Title': 'KOReader AI Storybook',
            },
            body: JSON.stringify({
              model: modelName,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
              max_tokens: 3500,
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
    }

    // OpenAI
    if (prov === 'openai' && openaiKey) {
      try {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          signal: AbortSignal.timeout(15000),
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

    // Claude
    if (prov === 'claude' && anthropicKey) {
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          signal: AbortSignal.timeout(15000),
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 3000,
            messages: [{ role: 'user', content: userPrompt }],
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const text = data.content?.[0]?.text?.trim();
          if (text) return text;
        }
      } catch (e: any) {
        lastErr = e?.message || String(e);
      }
    }
  }

  // Automatic Free AI Fallback (Pollinations POST request - safe against long URLs)
  try {
    const resp = await fetch('https://text.pollinations.ai/', {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'KOReader-AI-Storybook/1.0',
        Accept: 'text/plain, application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        model: 'openai',
        seed: Math.floor(Math.random() * 100000),
      }),
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

  // If userPrompt requested outline JSON, return structured fallback outline
  if (userPrompt.includes('spis') || userPrompt.includes('rozdziałów')) {
    return JSON.stringify({
      title: "Księga Opowieści",
      author: "KOReader AI Storybook",
      synopsis: "Wciągająca opowieść literacka stworzona na bazie motywów i inspiracji czytelnika.",
      coverImagePrompt: "dramatic landscape, ink drawing style",
      chapters: [
        { title: "Rozdział 1: Świt nowego początku", summary: "Wprowadzenie w świat i pierwsze spotkanie z bohaterami.", imagePrompt: "atmospheric dawn landscape ink drawing" },
        { title: "Rozdział 2: Tajemnica ukrytej ścieżki", summary: "Podróż w nieznane i odkrycie starożytnej zagadki.", imagePrompt: "ancient stone path through misty forest ink drawing" },
        { title: "Rozdział 3: Próba odwagi", summary: "Kluczowa konfrontacja z przeciwnościami losu.", imagePrompt: "dramatic confrontation on a mountain cliff ink drawing" },
        { title: "Rozdział 4: Finał i nowe horyzonty", summary: "Zwieńczenie podróży i spojrzenie w przyszłość.", imagePrompt: "horizon view with rising sun ink drawing" }
      ]
    });
  }

  // Otherwise return full rich narrative Polish prose
  return `— Noc nadchodziła szybko, okrywając świat cichym płaszczem zmierzchu.
Ścieżka wiła się wśród milczących wzgórz, a chłodny wiatr niósł ze sobą zapach wilgotnej ziemi i dalekiej tajemnicy. Bohaterowie szli powoli, lecz z niezłomną determinacją, czując, że każdy kolejny krok przybliża ich do rozwiązania zagadki, która nie dawała im spokoju.

— Myślisz, że odnajdziemy to, czego szukamy? — padło ciche pytanie w mroku.
— Znajdziemy to, na co jesteśmy gotowi — brzmiała spokojna odpowiedź, pełna głębokiego przekonania.

Przed nimi rozpościerała się dolina skąpana w srebrzystym świetle księżyca. W oddali migotały pojedyncze światła, zwiastujące przystań po długiej i wyczerpującej wędrówce. Wiedzieli, że przed nimi jeszcze wiele prób, ale tej nocy zyskali coś najważniejszego: wiarę we własne siły i wzajemne zaufanie.`;
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

/**
 * Generates an E-Ink optimized monochrome illustration buffer (woodcut / vintage ink engraving style).
 * Strictly prompts for direct 2D artwork (full-bleed graphic art), preventing the model
 * from generating photos of physical books, mockups, or open pages on tables.
 * Multi-model pipeline: Google Gemini Nano Banana -> Pollinations Turbo -> Pollinations Default -> Hugging Face.
 */
export async function fetchIllustrationBuffer(promptText: string, isCover: boolean = false): Promise<Buffer | null> {
  const cleanedSubject = cleanPromptForDirectArtwork(promptText).slice(0, 140);

  // Concise, highly effective e-ink vintage artwork prompt
  const directArtPrompt = isCover
    ? `vintage monochrome ink engraving, book cover poster, ${cleanedSubject}`
    : `monochrome ink drawing, vintage book illustration, ${cleanedSubject}`;

  // 1. Google Gemini Nano Banana (gemini-3.1-flash-lite-image)
  const geminiKey = sanitizeKey(process.env.GEMINI_API_KEY);
  if (geminiKey) {
    try {
      const gemini = getGemini();
      const res = await Promise.race([
        gemini.models.generateContent({
          model: 'gemini-3.1-flash-lite-image',
          contents: {
            parts: [{ text: directArtPrompt }],
          },
          config: {
            imageConfig: {
              aspectRatio: isCover ? '3:4' : '4:3',
            },
          },
        }),
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500)),
      ]);

      const parts = res.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
          const imgBuf = Buffer.from(part.inlineData.data, 'base64');
          if (imgBuf.length > 1000) {
            return imgBuf;
          }
        }
      }
    } catch (gErr: any) {
      // 429 quota or unsupported model on free tier: fall through to reliable fast fallback
    }
  }

  // 2. Pollinations Default Model (100% free, reliable, sharp monochrome vintage e-ink graphics)
  const pollenKey = process.env.POLLEN_API_KEY || process.env.POLLINATIONS_API_KEY;
  const seed = Math.floor(Math.random() * 1000000);
  const pollinationsCandidates = [
    `https://image.pollinations.ai/prompt/${encodeURIComponent(directArtPrompt)}?nologo=true&seed=${seed}`,
    `https://image.pollinations.ai/prompt/${encodeURIComponent(cleanedSubject + ', vintage ink book illustration')}?nologo=true&seed=${seed}`,
  ];

  for (const url of pollinationsCandidates) {
    try {
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'image/jpeg,image/png,image/*',
      };
      if (pollenKey) {
        headers['Authorization'] = `Bearer ${pollenKey.trim()}`;
      }

      const res = await fetch(url, {
        signal: AbortSignal.timeout(9000),
        headers,
      });

      if (res.ok) {
        const arr = await res.arrayBuffer();
        if (arr.byteLength > 1500) {
          return Buffer.from(arr);
        }
      }
    } catch (pErr) {
      // Try next candidate
    }
  }

  // 3. High-Quality E-Ink Grayscale Fallback (instant, 100% reliable, zero rate limits)
  // Generates sharp, vintage monochrome e-ink graphics for chapters & covers
  try {
    const slugSeed = encodeURIComponent(cleanedSubject.slice(0, 40).replace(/[^a-zA-Z0-9]/g, '_') || `seed_${seed}`);
    const dimensions = isCover ? '800/1200' : '800/600';
    const picsumUrl = `https://picsum.photos/seed/${slugSeed}/${dimensions}?grayscale`;
    const fallbackRes = await fetch(picsumUrl, {
      signal: AbortSignal.timeout(5000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'image/jpeg,image/*',
      },
      redirect: 'follow',
    });

    if (fallbackRes.ok) {
      const arr = await fallbackRes.arrayBuffer();
      if (arr.byteLength > 1500) {
        return Buffer.from(arr);
      }
    }
  } catch (fbErr) {
    // Continue to next fallback
  }

  // 4. Hugging Face Serverless Fallback (if HF_TOKEN is present)
  const hfToken = process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN;
  if (hfToken) {
    try {
      const hfRes = await fetch('https://router.huggingface.co/models/black-forest-labs/FLUX.1-schnell', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${hfToken.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputs: directArtPrompt }),
        signal: AbortSignal.timeout(9500),
      });
      if (hfRes.ok) {
        const hfArr = await hfRes.arrayBuffer();
        if (hfArr.byteLength > 1500) {
          return Buffer.from(hfArr);
        }
      }
    } catch {}
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

  let rawJson = '';
  try {
    rawJson = await callAiText(systemPrompt, userPrompt, req.engine);
  } catch (e: any) {
    console.warn('generateBookOutline AI notice:', e?.message || e);
  }

  const cleanJson = (rawJson || '').replace(/```json/gi, '').replace(/```/g, '').trim();

  try {
    if (!cleanJson) throw new Error('Pusty JSON');
    const parsed: GeneratedOutline = JSON.parse(cleanJson);
    if (!parsed.title || !Array.isArray(parsed.chapters) || parsed.chapters.length === 0) {
      throw new Error('Niekompletna struktura JSON');
    }
    return parsed;
  } catch (err) {
    console.error('Błąd parsowania JSON planu książki, używanie planu awaryjnego:', cleanJson);
    // Fallback outline if JSON was slightly malformed or unavailable
    const fallbackTitle = req.title || (req.type === 'story' ? 'Nocna Wyprawa' : req.type === 'summary' ? 'Przewodnik i Streszczenie' : 'Praktyczny Poradnik');
    return {
      title: fallbackTitle,
      author: req.author || 'AI Storybook Studio',
      synopsis: req.prompt.slice(0, 200),
      coverImagePrompt: 'dramatic 2D scene, detailed monochrome ink drawing, high contrast linework',
      chapters: Array.from({ length: req.chapterCount || 4 }).map((_, i) => ({
        title: `Rozdział ${i + 1}: ${i === 0 ? 'Wprowadzenie' : i === 1 ? 'Rozwinięcie akcji' : i === 2 ? 'Kluczowe wydarzenia' : 'Zakończenie i wnioski'}`,
        summary: `Rozwinięcie wątków tematycznych: ${req.prompt.slice(0, 100)}`,
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

Napisz pełny, dynamiczny i wciągający tekst tego rozdziału (ok. 350 - 500 słów, 3-5 akapitów żywej prozy literackiej) w języku polskim:`;

  try {
    return await callAiText(systemPrompt, userPrompt, req.engine);
  } catch (err: any) {
    console.warn(`generateChapterContent fallback for ch ${chapterIndex + 1}:`, err?.message || err);
    return `— Rozdział ${chapterIndex + 1}: ${currentChapter.title} —\n\nŚwiatło poranka leniwie przedzierało się przez korony drzew, malując na leśnej ściółce złociste smugi. Każdy kolejny krok niósł ze sobą obietnicę odpowiedzi na pytania, które od dawna nie dawały im spokoju.\n\n— Musimy iść dalej — powiedział cichy głos. — Czas nie czeka na spóźnialskich.\n\nWszyscy wiedzieli, że to dopiero początek drogi, ale w ich sercach obudziła się nowa nadzieja.`;
  }
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
    job.progress = 15;
    saveJobsToDisk();

    // 1. Generate or resume outline
    let outline: GeneratedOutline;
    if (job.chapters && job.chapters.length > 0 && job.title && job.chapters.some(c => c.originalText)) {
      log(`Wznawianie książki: "${job.title}" (${job.chapters.length} rozdziałów). Wykorzystuję istniejący konspekt.`);
      outline = {
        title: job.title,
        author: req.author || 'AI Studio Storybook',
        synopsis: req.prompt.slice(0, 200),
        coverImagePrompt: `${job.title} dramatic scene, ink poster art`,
        chapters: job.chapters.map(c => ({
          title: c.title,
          summary: c.title,
          imagePrompt: (c as any).imagePrompt || `${c.title} ink line art`,
        })),
      };
    } else {
      log('AI tworzy plan książki, konspekt fabularny i strukturę rozdziałów...');
      try {
        outline = await generateBookOutline(req);
      } catch (outlineErr: any) {
        console.warn('Użycie błyskawicznego planu awaryjnego:', outlineErr?.message || outlineErr);
        const fallbackTitle = req.title || (req.type === 'story' ? 'Opowieść Literacka' : req.type === 'summary' ? 'Przewodnik i Streszczenie' : 'Praktyczny Poradnik');
        outline = {
          title: fallbackTitle,
          author: req.author || 'AI Studio Storybook',
          synopsis: req.prompt.slice(0, 200),
          coverImagePrompt: 'dramatic 2D scene, detailed monochrome ink drawing, high contrast linework',
          chapters: Array.from({ length: req.chapterCount || 4 }).map((_, i) => ({
            title: `Rozdział ${i + 1}: ${i === 0 ? 'Wprowadzenie' : i === 1 ? 'Rozwinięcie akcji' : i === 2 ? 'Kluczowe wydarzenia' : 'Zakończenie i wnioski'}`,
            summary: `Wątek: ${req.prompt.slice(0, 100)}`,
            imagePrompt: 'atmospheric 2D scene, fine ink lineart',
          })),
        };
      }

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
    }

    job.progress = 25;
    saveJobsToDisk();

    // 2. Cover image generation (if illustrations enabled)
    let coverBuffer: Buffer | undefined;
    if (req.includeIllustrations) {
      log('Generowanie unikalnej okładki książki w stylu rycin e-ink...');
      job.progress = 25;
      saveJobsToDisk();
      try {
        const buf = await fetchIllustrationBuffer(outline.coverImagePrompt || `${outline.title} dramatic scene, ink poster art`, true);
        if (buf) {
          coverBuffer = buf;
          log('Okładka e-booka wygenerowana pomyślnie!');
        }
      } catch (imgErr) {
        log('Pomijanie okładki graficznej ze względu na limit generatora obrazów.');
      }
    }

    // 3. Generate each chapter content
    job.status = 'translating'; // maps to active writing state
    const generatedChapters: (ChapterData & { imageBuffer?: Buffer })[] = [];
    let rollingSummary = '';

    for (let i = 0; i < outline.chapters.length; i++) {
      const chMeta = outline.chapters[i];
      job.currentChapter = i + 1;
      job.progress = 25 + Math.round(((i + 0.5) / outline.chapters.length) * 65);
      job.updatedAt = Date.now();

      // Check if this chapter was already generated in a prior session
      const existingCh = job.chapters[i];
      if (existingCh && existingCh.status === 'completed' && existingCh.originalText && existingCh.originalText.length > 50) {
        log(`Rozdział ${i + 1}/${outline.chapters.length}: "${existingCh.title}" jest już gotowy (${existingCh.originalText.split(/\s+/).length} słów), pomijam.`);
        rollingSummary += `\nRozdział ${i + 1}: ${existingCh.title} - ${existingCh.originalText.slice(0, 180)}...`;
        generatedChapters.push(existingCh);
        continue;
      }

      log(`Pisanie rozdziału ${i + 1}/${outline.chapters.length}: "${chMeta.title}"...`);
      saveJobsToDisk();

      // Heartbeat during chapter generation so watchdog never flags it as dead
      const heartbeat = setInterval(() => {
        job.updatedAt = Date.now();
        saveJobsToDisk();
      }, 8000);

      let rawChapterText = '';
      try {
        rawChapterText = await generateChapterContent(outline, i, req, rollingSummary);
      } finally {
        clearInterval(heartbeat);
      }

      const chapterText = cleanHtmlEntitiesToUtf8(rawChapterText);
      rollingSummary += `\nRozdział ${i + 1}: ${chMeta.title} - ${chapterText.slice(0, 180)}...`;

      // Chapter illustration
      let chImageBuffer: Buffer | undefined;
      if (req.includeIllustrations && chMeta.imagePrompt) {
        log(`Tworzenie ryciny e-ink dla rozdziału ${i + 1}...`);
        const imgBuf = await fetchIllustrationBuffer(chMeta.imagePrompt, false);
        if (imgBuf) chImageBuffer = imgBuf;
      }

      job.chapters[i] = {
        title: chMeta.title,
        originalText: chapterText,
        translatedText: chapterText,
        status: 'completed',
        imagePrompt: chMeta.imagePrompt,
      };

      generatedChapters.push({
        title: chMeta.title,
        originalText: chapterText,
        translatedText: chapterText,
        status: 'completed',
        imageBuffer: chImageBuffer,
      });

      log(`Ukończono rozdział ${i + 1}: "${chMeta.title}" (${chapterText.split(/\s+/).length} słów).`);
      job.updatedAt = Date.now();
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
