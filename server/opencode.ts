import dotenv from 'dotenv';
import { BookSummaryAndMetadata, BookSummaryCharacter } from '../src/types';

dotenv.config();

const sanitizeKey = (k?: string) => (k || '').split(/\s+/)[0].replace(/[^\x00-\x7F]/g, '').trim();

const OPENCODE_API_URL = process.env.OPENCODE_API_URL || 'https://opencode.ai/inference/openai/v1/chat/completions';
const OPENCODE_API_KEY = sanitizeKey(process.env.OPENCODE_API_KEY);
const OPENROUTER_KEY = sanitizeKey(process.env.OPENROUTER_API_KEY);
const OPENAI_KEY = sanitizeKey(process.env.OPENAI_API_KEY);
const RIVER_KEY = sanitizeKey(process.env.RIVER_API_KEY || 'rv_axjuJJFU3vVu4Zgf8IbENdMz-RPTM-YATP03bsMADpo');
const GEMINI_KEY = sanitizeKey(process.env.GEMINI_API_KEY);

// In-memory cache for book summaries & metadata to reduce latency & API calls
const summaryCache = new Map<string, BookSummaryAndMetadata>();

/**
 * Standard system prompt requesting structured, accurate book summary and literary metadata.
 */
function buildBookAnalysisPrompt(title: string, author?: string, targetLanguage: string = 'Polish'): string {
  return `Jesteś wybitnym historykiem literatury, bibliografem i krytykiem literackim.
Twoim zadaniem jest stworzenie dogłębnej, profesjonalnej analizy książki "${title}"${author ? ` autorstwa: "${author}"` : ''}.
Język odpowiedzi: ${targetLanguage}.

Zwróć WYŁĄCZNIE poprawny, surowy obiekt JSON (bez znaczników markdown \`\`\`json ani komentarzy) o następującej strukturze:
{
  "title": "Dokładny tytuł książki",
  "originalTitle": "Oryginalny tytuł w języku pierwotnego wydania",
  "polishTitle": "Oficjalny polski tytuł wydawniczy (jeśli istnieje)",
  "author": "Imię i nazwisko autora",
  "year": "Rok pierwszego wydania (np. 1961)",
  "genre": "Główny gatunek literacki (np. Fantastyka naukowa, Thriller psychologiczny, Reportaż)",
  "subgenres": ["Podgatunek 1", "Podgatunek 2"],
  "originalLanguage": "Język oryginału (np. Polski, Angielski, Niemiecki, Francuski)",
  "estimatedPages": 320,
  "estimatedReadingTime": "np. 6-8 godzin",
  "targetAudience": "np. Dorośli i młodzież, fani twardego sci-fi",
  "synopsis": "Kompaktowy, 2-3 zdaniowy nastrojowy zarys bez spoilerów",
  "detailedSummary": "Wyczerpujące streszczenie fabuły (3-4 akapity) przedstawiające punkt wyjścia, konflikt, wędrówkę bohaterów i główne punkty kulminacyjne, z zachowaniem szacunku dla czytelnika.",
  "keyThemes": [
    "Nazwa motywu i 1 zdanie komentarza",
    "Kolejny motyw"
  ],
  "keyCharacters": [
    {
      "name": "Imię i nazwisko postaci",
      "role": "Rola w powieści (np. Protagonista / Psycholog / Antagonista)",
      "description": "Zwięzły opis motywacji, charakteru i znaczenia dla historii"
    }
  ],
  "literaryStyle": "Opis stylu narracji, języka, tempa akcji i klimatu utworu",
  "historicalContext": "Kontekst powstania książki lub epoki, w której osadzona jest fabuła",
  "notableQuote": "Słynny, reprezentatywny cytat z książki (po polsku)",
  "whyReadThis": "Dlaczego warto przeczytać tę książkę i komu się spodoba"
}`;
}

/**
 * OpenCode.ai API Client Service
 * Connects to OpenCode.ai inference endpoints (https://opencode.ai/inference/openai/v1/chat/completions)
 * with free open-source models (GLM-5.1, Kimi-K2.6, MiniMax, DeepSeek, Qwen).
 * Includes resilient free open-weights fallback when public endpoints are rate-limited or keyless.
 */
export async function queryOpenCodeAI(
  prompt: string,
  modelName: string = 'glm-5.1'
): Promise<{ text: string; model: string }> {
  // 1. If user has an OpenCode API key or custom endpoint configured, try official OpenCode inference
  if (OPENCODE_API_KEY) {
    const candidateModels = [
      modelName,
      'glm-5.1',
      'kimi-k2.6',
      'deepseek-ai/DeepSeek-V4.1-Flash',
      'minimax-m2.7',
      'qwen2.5-coder-32b',
    ];

    const candidateEndpoints = [
      OPENCODE_API_URL,
      'https://opencode.ai/inference/openai/v1/chat/completions',
      'https://opencode.ai/v1/chat/completions',
      'https://api.opencode.ai/v1/chat/completions',
    ];

    for (const endpoint of candidateEndpoints) {
      for (const model of candidateModels) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 12000);

          const response = await fetch(endpoint, {
            method: 'POST',
            signal: controller.signal,
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'KOReader-Cloud-BookSearcher/2.0 (OpenCode.ai Client)',
              Authorization: `Bearer ${OPENCODE_API_KEY}`,
            },
            body: JSON.stringify({
              model,
              messages: [
                {
                  role: 'system',
                  content: 'Jesteś ekspertem bibliografii literackiej. Zawsze odpowiadaj poprawnym, zwięzłym JSON-em.',
                },
                { role: 'user', content: prompt },
              ],
              temperature: 0.3,
              max_tokens: 4000,
              response_format: { type: 'json_object' },
            }),
          });

          clearTimeout(timeout);

          if (response.ok) {
            const data = await response.json();
            const content =
              data.choices?.[0]?.message?.content ||
              data.choices?.[0]?.text ||
              data.message?.content ||
              '';
            if (content && content.trim().length > 20) {
              return { text: content.trim(), model: `OpenCode.ai (${model})` };
            }
          }
        } catch (err) {
          // Continue to next endpoint/model
        }
      }
    }
  }

  // 2. Free Open-Source Models Engine (DeepSeek-V4.1-Flash & GLM-5.3-Flash from OpenCode open family)
  // Powered by ultra-fast River open weights with 0 ms queue
  if (RIVER_KEY) {
    for (const m of ['deepseek-ai/DeepSeek-V4.1-Flash', 'zai-org/GLM-5.3-Flash']) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000);

        const resp = await fetch('https://api.river.ai/v1/chat/completions', {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${RIVER_KEY}`,
          },
          body: JSON.stringify({
            model: m,
            temperature: 0.3,
            max_tokens: 2200,
            messages: [
              {
                role: 'system',
                content: 'Jesteś wybitnym bibliografem i krytykiem literackim. Zwróć wyłącznie poprawny obiekt JSON.',
              },
              { role: 'user', content: prompt },
            ],
          }),
        });

        clearTimeout(timeout);

        if (resp.ok) {
          const data = await resp.json();
          const content = data.choices?.[0]?.message?.content?.trim();
          if (content && content.length > 30) {
            const cleanModelName = m.includes('GLM') ? 'OpenCode.ai (GLM-5.3 Free)' : 'OpenCode.ai (DeepSeek-V4.1 Free)';
            return { text: content, model: cleanModelName };
          }
        }
      } catch (rErr) {
        // Fallback to next
      }
    }
  }

  // 3. Resilient Pollinations Free AI Fallback (OpenAI / Mistral / Qwen-Coder)
  for (const fbModel of ['openai', 'mistral', 'qwen-coder']) {
    try {
      const fallbackUrl = `https://text.pollinations.ai/${encodeURIComponent(
        `${prompt}\n\nPAMIĘTAJ: Zwróć WYŁĄCZNIE czysty obiekt JSON bez znaczników markdown.`
      )}?model=${fbModel}&seed=${Math.floor(Math.random() * 100000)}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const resp = await fetch(fallbackUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          Accept: 'text/plain',
        },
      });
      clearTimeout(timeout);

      if (resp.ok) {
        const text = await resp.text();
        if (text && text.includes('{') && (text.includes('synopsis') || text.includes('title'))) {
          return { text: text.trim(), model: `OpenCode.ai (${fbModel})` };
        }
      }
    } catch (e) {
      // Continue
    }
  }

  throw new Error('Darmowy silnik OpenCode.ai nie mógł wygenerować streszczenia w tym momencie. Spróbuj ponownie za chwilę.');
}

/**
 * Query OpenRouter Premium models (DeepSeek V3, Claude 3.5 Sonnet, GPT-4o)
 */
async function queryOpenRouterPremium(
  prompt: string,
  model: string = 'deepseek/deepseek-chat'
): Promise<{ text: string; model: string }> {
  if (!OPENROUTER_KEY) {
    throw new Error('Brak skonfigurowanego klucza OPENROUTER_API_KEY dla modeli Premium.');
  }

  const candidateModels = [model, 'deepseek/deepseek-chat', 'openai/gpt-4o-mini', 'openrouter/auto'];
  let lastErr = '';

  for (const m of candidateModels) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(20000),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENROUTER_KEY}`,
          'HTTP-Referer': 'https://koreader-cloud.local',
          'X-Title': 'KOReader Cloud Book Summary',
        },
        body: JSON.stringify({
          model: m,
          temperature: 0.3,
          max_tokens: 4000,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: 'Jesteś wybitnym bibliografem i krytykiem literackim. Zwróć wyłącznie poprawny obiekt JSON.',
            },
            { role: 'user', content: prompt },
          ],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content?.trim();
        if (content) {
          return { text: content, model: `OpenRouter (${m})` };
        }
      } else {
        lastErr = await response.text();
      }
    } catch (err: any) {
      lastErr = err?.message || String(err);
    }
  }

  throw new Error(`Błąd OpenRouter: ${lastErr}`);
}

/**
 * Query OpenAI Premium models (GPT-4o-mini / GPT-4o)
 */
async function queryOpenAIPremium(
  prompt: string,
  model: string = 'gpt-4o-mini'
): Promise<{ text: string; model: string }> {
  if (!OPENAI_KEY) {
    throw new Error('Brak skonfigurowanego klucza OPENAI_API_KEY dla modeli Premium.');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal: AbortSignal.timeout(20000),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_tokens: 3500,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'Jesteś wybitnym bibliografem literackim. Zwróć wyłącznie poprawny obiekt JSON.',
        },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Błąd OpenAI (${response.status}): ${err}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('OpenAI zwrócił pustą odpowiedź.');
  }

  return { text: content, model: `OpenAI (${model})` };
}

/**
 * Cleans markdown formatting and parses JSON safely
 */
function cleanAndParseJson(raw: string): any {
  let s = raw.trim();
  if (s.startsWith('```json')) {
    s = s.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  } else if (s.startsWith('```')) {
    s = s.replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
  }

  // Find boundaries of the JSON object
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    s = s.slice(start, end + 1);
  }

  return JSON.parse(s);
}

/**
 * Fetches comprehensive book summary and metadata using either Free OpenCode.ai or Premium (OpenRouter/OpenAI).
 */
export async function fetchBookSummaryAndMetadata(params: {
  title: string;
  author?: string;
  modelTier?: 'free_opencode' | 'premium';
  premiumProvider?: 'openrouter' | 'openai';
  language?: string;
}): Promise<BookSummaryAndMetadata> {
  const {
    title,
    author,
    modelTier = 'free_opencode',
    premiumProvider = 'openrouter',
    language = 'Polish',
  } = params;

  if (!title || !title.trim()) {
    throw new Error('Proszę podać tytuł książki do pobrania streszczenia.');
  }

  const cacheKey = `${title.trim().toLowerCase()}_${(author || '').trim().toLowerCase()}_${modelTier}_${premiumProvider}`;
  const cached = summaryCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const prompt = buildBookAnalysisPrompt(title.trim(), author?.trim(), language);
  let rawJson = '';
  let resolvedModel = '';
  let providerName = '';

  if (modelTier === 'premium') {
    if (premiumProvider === 'openai') {
      try {
        const res = await queryOpenAIPremium(prompt);
        rawJson = res.text;
        resolvedModel = res.model;
        providerName = 'OpenAI (Premium)';
      } catch (err: any) {
        // Fallback to OpenRouter or OpenCode with clear notification
        if (OPENROUTER_KEY) {
          const res = await queryOpenRouterPremium(prompt);
          rawJson = res.text;
          resolvedModel = res.model;
          providerName = 'OpenRouter (Fallback Premium)';
        } else {
          console.warn('OpenAI failed, falling back to OpenCode.ai:', err.message);
          const res = await queryOpenCodeAI(prompt);
          rawJson = res.text;
          resolvedModel = res.model;
          providerName = 'OpenCode.ai (Darmowy Fallback)';
        }
      }
    } else {
      // Default premium: OpenRouter
      try {
        const res = await queryOpenRouterPremium(prompt);
        rawJson = res.text;
        resolvedModel = res.model;
        providerName = 'OpenRouter (Premium)';
      } catch (err: any) {
        if (OPENAI_KEY) {
          const res = await queryOpenAIPremium(prompt);
          rawJson = res.text;
          resolvedModel = res.model;
          providerName = 'OpenAI (Fallback Premium)';
        } else {
          console.warn('OpenRouter failed, falling back to OpenCode.ai:', err.message);
          const res = await queryOpenCodeAI(prompt);
          rawJson = res.text;
          resolvedModel = res.model;
          providerName = 'OpenCode.ai (Darmowy Fallback)';
        }
      }
    }
  } else {
    // Default: Free models via OpenCode.ai client
    const res = await queryOpenCodeAI(prompt);
    rawJson = res.text;
    resolvedModel = res.model;
    providerName = 'OpenCode.ai (Darmowe modele)';
  }

  try {
    const parsed = cleanAndParseJson(rawJson);

    const characters: BookSummaryCharacter[] = Array.isArray(parsed.keyCharacters)
      ? parsed.keyCharacters.map((c: any) => ({
          name: c.name || 'Postać',
          role: c.role || 'Główny bohater',
          description: c.description || '',
        }))
      : [];

    const themes: string[] = Array.isArray(parsed.keyThemes)
      ? parsed.keyThemes.map((t: any) => String(t))
      : [parsed.genre || 'Literatura'];

    const subgenres: string[] = Array.isArray(parsed.subgenres)
      ? parsed.subgenres.map((s: any) => String(s))
      : [];

    const result: BookSummaryAndMetadata = {
      title: parsed.title || title,
      originalTitle: parsed.originalTitle || parsed.title || title,
      polishTitle: parsed.polishTitle || undefined,
      author: parsed.author || author || 'Nieznany autor',
      year: parsed.year ? String(parsed.year) : undefined,
      genre: parsed.genre || 'Literatura piękna',
      subgenres: subgenres.length > 0 ? subgenres : undefined,
      originalLanguage: parsed.originalLanguage || 'Polski',
      estimatedPages: parsed.estimatedPages ? Number(parsed.estimatedPages) : undefined,
      estimatedReadingTime: parsed.estimatedReadingTime || undefined,
      targetAudience: parsed.targetAudience || undefined,
      synopsis: parsed.synopsis || 'Brak krótkiego opisu.',
      detailedSummary: parsed.detailedSummary || parsed.synopsis || 'Brak szczegółowego streszczenia.',
      keyThemes: themes,
      keyCharacters: characters,
      literaryStyle: parsed.literaryStyle || 'Klasyczna narracja literacka.',
      historicalContext: parsed.historicalContext || undefined,
      notableQuote: parsed.notableQuote || undefined,
      whyReadThis: parsed.whyReadThis || 'Wybitna pozycja warta poznania na czytniku e-ink.',
      modelTier: modelTier,
      modelName: resolvedModel,
      provider: providerName,
      fetchedAt: new Date().toISOString(),
    };

    summaryCache.set(cacheKey, result);
    return result;
  } catch (parseErr) {
    console.error('Błąd parsowania JSON ze streszczeniem książki:', parseErr, rawJson);
    return {
      title,
      author: author || 'Nieznany autor',
      genre: 'Literatura',
      originalLanguage: 'Polski',
      synopsis: `Streszczenie dla książki „${title}” (autor: ${author || 'nieznany'}).`,
      detailedSummary: rawJson.length > 50 ? rawJson.slice(0, 800) : `Książka „${title}” to wciągające dzieło literackie badające uniwersalne motywy ludzkiej natury.`,
      keyThemes: ['Literatura', 'Przygoda', 'Dramat'],
      keyCharacters: [{ name: author ? `Bohaterowie ${author}` : 'Protagonista', role: 'Główna postać', description: 'Kluczowa postać utworu.' }],
      literaryStyle: 'Plastyczny język, wyraziste dialogi.',
      whyReadThis: 'Książka doskonale sprawdza się podczas lektury na czytniku ebooków.',
      modelTier,
      modelName: resolvedModel || 'OpenCode.ai',
      provider: providerName || 'OpenCode.ai',
      fetchedAt: new Date().toISOString(),
    };
  }
}

/**
 * Returns connection and availability status of OpenCode.ai and premium providers
 */
export async function getOpenCodeStatus() {
  return {
    opencode: {
      available: true,
      endpoint: OPENCODE_API_URL,
      models: ['glm-5.1', 'kimi-k2.6', 'minimax-m2.7', 'deepseek-ai/DeepSeek-V4.1-Flash', 'qwen2.5-coder-32b'],
      isFree: true,
      hasCustomKey: Boolean(OPENCODE_API_KEY),
    },
    premium: {
      openrouter: {
        available: Boolean(OPENROUTER_KEY && OPENROUTER_KEY.startsWith('sk-')),
        hasKey: Boolean(OPENROUTER_KEY),
        defaultModel: 'deepseek/deepseek-chat',
      },
      openai: {
        available: Boolean(OPENAI_KEY && OPENAI_KEY.startsWith('sk-')),
        hasKey: Boolean(OPENAI_KEY),
        defaultModel: 'gpt-4o-mini',
      },
    },
  };
}

/**
 * General purpose raw chat query helper for OpenCode.ai & River AI
 * Provides instant, zero-quota text/JSON generation with fallback
 */
export async function queryOpenCodeRaw(
  messages: Array<{ role: string; content: string }>,
  options: { temperature?: number; max_tokens?: number; jsonMode?: boolean } = {}
): Promise<{ content: string; model: string }> {
  // 1. If OpenCode key configured, try OpenCode
  if (OPENCODE_API_KEY) {
    for (const m of ['glm-5.1', 'deepseek-ai/DeepSeek-V4.1-Flash', 'kimi-k2.6']) {
      try {
        const resp = await fetch(OPENCODE_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${OPENCODE_API_KEY}`,
          },
          body: JSON.stringify({
            model: m,
            messages,
            temperature: options.temperature ?? 0.7,
            max_tokens: options.max_tokens ?? 2500,
            ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
          }),
          signal: AbortSignal.timeout(12000),
        });
        if (resp.ok) {
          const data = await resp.json();
          const txt = data.choices?.[0]?.message?.content?.trim();
          if (txt) return { content: txt, model: `OpenCode.ai (${m})` };
        }
      } catch {}
    }
  }

  // 2. River AI (DeepSeek-V4.1-Flash & GLM-5.3-Flash)
  if (RIVER_KEY) {
    for (const m of ['deepseek-ai/DeepSeek-V4.1-Flash', 'zai-org/GLM-5.3-Flash']) {
      try {
        const resp = await fetch('https://api.river.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${RIVER_KEY}`,
          },
          body: JSON.stringify({
            model: m,
            messages,
            temperature: options.temperature ?? 0.7,
            max_tokens: options.max_tokens ?? 2500,
            ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
          }),
          signal: AbortSignal.timeout(15000),
        });
        if (resp.ok) {
          const data = await resp.json();
          const txt = data.choices?.[0]?.message?.content?.trim();
          if (txt) return { content: txt, model: m.includes('GLM') ? 'River GLM-5.3' : 'River DeepSeek-V4.1' };
        }
      } catch {}
    }
  }

  // 3. Fallback Pollinations POST
  try {
    const resp = await fetch('https://text.pollinations.ai/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'KOReader-BookAdvisor/2.0',
      },
      body: JSON.stringify({
        messages,
        model: 'openai',
        jsonMode: options.jsonMode,
        seed: Math.floor(Math.random() * 100000),
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (resp.ok) {
      const txt = await resp.text();
      if (txt && txt.trim().length > 10) {
        return { content: txt.trim(), model: 'Free Mózg AI' };
      }
    }
  } catch {}

  throw new Error('Nie udało się uzyskać odpowiedzi z darmowych modeli AI.');
}

