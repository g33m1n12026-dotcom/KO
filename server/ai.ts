import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { heuristicOcrProofread } from './extractor';
import { cleanHtmlEntitiesToUtf8 } from './epub';
dotenv.config();

export interface TranslationOptions {
  text: string;
  sourceLang?: string;
  targetLang?: string;
  context?: string; // chapter title, book title, or glossary
  preferredEngine?: 'auto' | 'claude' | 'openai' | 'openrouter' | 'gemini' | 'cohere' | 'river' | 'groq' | 'mistral' | 'llm7';
}

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const COHERE_KEY = process.env.COHERE_API_KEY || '';
const LLM7_KEY = process.env.LLM7_API_KEY || '';
const GROQ_KEY = process.env.GROQ_API_KEY || '';
const MISTRAL_KEY = process.env.MISTRAL_API_KEY || '';
const sanitizeKey = (k?: string) => (k || '').split(/\s+/)[0].replace(/[^\x00-\x7F]/g, '').trim();
const RIVER_KEY = sanitizeKey(process.env.RIVER_API_KEY || 'rv_axjuJJFU3vVu4Zgf8IbENdMz-RPTM-YATP03bsMADpo');

// Lazy Google GenAI instance
let geminiClient: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI {
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey: GEMINI_KEY });
  }
  return geminiClient;
}

// Track provider quota status to avoid slow failing retries on exhausted accounts
const quotaExhausted = {
  claude: false,
  openai: false,
  openrouter: false,
  gemini: false,
  cohere: false,
  llm7: false,
  groq: false,
  mistral: false,
  river: false,
};

export function getAvailableKeys() {
  return {
    openrouter: Boolean(OPENROUTER_KEY && OPENROUTER_KEY.startsWith('sk-')),
    openai: Boolean(OPENAI_KEY && OPENAI_KEY.startsWith('sk-')),
    claude: Boolean(ANTHROPIC_KEY && ANTHROPIC_KEY.startsWith('sk-ant-')),
    gemini: Boolean(GEMINI_KEY),
    cohere: Boolean(COHERE_KEY),
    llm7: Boolean(LLM7_KEY),
    groq: Boolean(GROQ_KEY),
    mistral: Boolean(MISTRAL_KEY),
    river: Boolean(RIVER_KEY),
    quotaExhausted: { ...quotaExhausted },
  };
}

function getSortedEngines(preferred: 'auto' | 'claude' | 'openai' | 'openrouter' | 'gemini' | 'cohere' | 'llm7' | 'groq' | 'mistral' | 'river'): Array<'claude' | 'openai' | 'openrouter' | 'gemini' | 'cohere' | 'llm7' | 'groq' | 'mistral' | 'river'> {
  let base: Array<'claude' | 'openai' | 'openrouter' | 'gemini' | 'cohere' | 'llm7' | 'groq' | 'mistral' | 'river'> = [];
  if (preferred === 'river') base = ['river', 'gemini', 'groq', 'cohere', 'llm7', 'mistral', 'openrouter', 'claude', 'openai'];
  else if (preferred === 'groq') base = ['groq', 'river', 'gemini', 'cohere', 'llm7', 'mistral', 'openrouter', 'claude', 'openai'];
  else if (preferred === 'mistral') base = ['mistral', 'river', 'groq', 'gemini', 'cohere', 'llm7', 'openrouter', 'claude', 'openai'];
  else if (preferred === 'cohere') base = ['cohere', 'river', 'gemini', 'groq', 'llm7', 'mistral', 'openrouter', 'claude', 'openai'];
  else if (preferred === 'llm7') base = ['llm7', 'river', 'cohere', 'groq', 'gemini', 'mistral', 'openrouter', 'claude', 'openai'];
  else if (preferred === 'gemini') base = ['gemini', 'river', 'groq', 'cohere', 'llm7', 'mistral', 'openrouter', 'claude', 'openai'];
  else if (preferred === 'claude') base = ['claude', 'river', 'gemini', 'groq', 'cohere', 'llm7', 'mistral', 'openrouter', 'openai'];
  else if (preferred === 'openai') base = ['openai', 'river', 'gemini', 'groq', 'cohere', 'llm7', 'mistral', 'openrouter', 'claude'];
  else if (preferred === 'openrouter') base = ['openrouter', 'river', 'gemini', 'groq', 'cohere', 'llm7', 'mistral', 'claude', 'openai'];
  else {
    // smart auto: ultra-fast River AI (DeepSeek-V4.1) & Gemini Flash -> Groq -> Cohere -> LLM7 -> OpenRouter
    base = ['river', 'gemini', 'groq', 'cohere', 'llm7', 'mistral', 'openrouter', 'claude', 'openai'];
  }

  // Sort so engines with quotaExhausted are tried last
  return base.sort((a, b) => {
    const aDead = quotaExhausted[a] ? 1 : 0;
    const bDead = quotaExhausted[b] ? 1 : 0;
    return aDead - bDead;
  });
}

/**
 * Literary translation prompt ensuring natural Polish prose, proper dialogue formatting with myślniki (—),
 * natural Polish idiom translation, correct grammatical declensions, and avoidance of robotic calques.
 */
function buildTranslationSystemPrompt(targetLang: string = 'Polish', context?: string): string {
  return `Jesteś wybitnym tłumaczem literatury i redaktorem książkowym, specjalizującym się w przekładzie na język ${targetLang}.
Twoim zadaniem jest przetłumaczenie fragmentu książki na piękny, naturalny i literacki język ${targetLang} z bezwzględnym ZACHOWANIEM ORYGINALNEGO FORMATOWANIA I STRUKTURY.

ZASADY PRZEKŁADU LITERACKIEGO:
1. Zachowaj oryginalny styl, ton, tempo i ładunek emocjonalny autora (np. ironię, dramatyzm, dowcip, melancholię).
2. Unikaj dosłownych kalk językowych i sztywnych sformułowań. Tłumacz idiomy na ich naturalne polskie odpowiedniki kulturowe i frazeologiczne.
3. Dialogi formatuj zgodnie z polską typografią książkową: używaj myślników (pauzy '—' lub półpauzy '–') na początku wypowiedzi postaci, a nie cudzysłowów.

ZASADY FORMATOWANIA I STRUKTURY HTML (KRYTYCZNIE WAŻNE):
4. Tekst zawiera znaczniki HTML formatowania: <p>, <p class="center"> (wyśrodkowane tytuły/śródtytuły), <i>kursywa</i>, <b>pogrubienie</b>, <strong>, <em>, <sup>przypisy</sup>, <blockquote>cytaty/akapity wcięte</blockquote>, nagłówki <h1>-<h3>, <hr/> oraz znaczniki obrazków <img ... />.
5. BEZWZGLĘDNIE ZACHOWAJ wszystkie znaczniki HTML w tych samych miejscach tekstu! Przetłumacz tekst wewnątrz znaczników, ale nie usuwaj, nie zmieniaj ani nie przekręcaj tagów HTML.
6. Jeśli w tekście występują odnośniki do przypisów w <sup>[1]</sup> lub <sup>1</sup>, zachowaj je dokładnie przy przetłumaczonych odpowiednich słowach.
7. Tytuły rozdziałów i podtytuły wyśrodkowane (<p class="center"> lub nagłówki) muszą pozostać wyśrodkowane.
8. Nie dodawaj od siebie żadnych komentarzy, wstępów typu "Oto tłumaczenie:", ani uwag od tłumacza. Zwróć WYŁĄCZNIE przetłumaczony tekst z nienaruszonymi tagami HTML.
9. BEZWZGLĘDNY ZAKAZ UŻYWANIA ENCYJNYCH ZNACZNIKÓW HTML TYPU &nbsp;, &quot;, &amp;, &mdash;, &#39;, &oacute;, &bdquo;, &rdquo; itd. Wszystkie znaki narodowe, myślniki dialogowe (—), cudzysłowy („ ”) oraz spacje zapisuj WYŁĄCZNIE bezpośrednio jako czyste znaki standardu UTF-8.
${context ? `KONTEKST KSIĄŻKI / ROZDZIAŁU:\n${context}` : ''}`;
}

/**
 * Call Anthropic Claude API (Claude 3.5 Sonnet / Haiku)
 */
async function translateWithClaude(prompt: string, text: string): Promise<string> {
  if (!ANTHROPIC_KEY) throw new Error('Brak klucza Anthropic Claude API');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: AbortSignal.timeout(35000),
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      system: prompt,
      messages: [
        {
          role: 'user',
          content: `Przetłumacz poniższy fragment na język polski zachowując wysokie walory literackie:\n\n${text}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    // Try haiku fallback if sonnet model fails or is unavailable
    if (response.status === 404 || response.status === 400) {
      const fallbackResp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: AbortSignal.timeout(35000),
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 4096,
          system: prompt,
          messages: [
            {
              role: 'user',
              content: `Przetłumacz poniższy fragment na język polski:\n\n${text}`,
            },
          ],
        }),
      });
      if (fallbackResp.ok) {
        const data = await fallbackResp.json();
        return data.content?.[0]?.text || '';
      }
    }
    throw new Error(`Błąd Anthropic API (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || '';
}

/**
 * Call OpenAI API (GPT-4o / GPT-4o-mini)
 */
async function translateWithOpenAI(prompt: string, text: string): Promise<string> {
  if (!OPENAI_KEY) throw new Error('Brak klucza OpenAI API');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal: AbortSignal.timeout(35000),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: `Przetłumacz ten fragment tekstu:\n\n${text}` },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Błąd OpenAI API (${response.status}): ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

/**
 * Call Cohere API (Command-R+ / Command-R) for high-quality literary translation
 */
async function translateWithCohere(prompt: string, text: string): Promise<string> {
  const key = COHERE_KEY;
  if (!key) throw new Error('Brak klucza Cohere API');

  const models = ['command-r-plus-08-2024', 'command-r-08-2024'];
  let lastError = '';

  for (const model of models) {
    try {
      const response = await fetch('https://api.cohere.com/v2/chat', {
        method: 'POST',
        signal: AbortSignal.timeout(35000),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: `Przetłumacz ten fragment tekstu:\n\n${text}` },
          ],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.message?.content?.[0]?.text;
        if (content && content.trim().length > 0) {
          return content.trim();
        }
      } else {
        lastError = await response.text();
      }
    } catch (e: any) {
      lastError = e?.message || String(e);
    }
  }

  throw new Error(`Błąd Cohere API: ${lastError}`);
}

/**
 * Call LLM7 API using free-tier high speed models (DeepSeek-V4-Flash / GLM-5.3-Flash)
 * 100 000 tokens / day, 250 req/h
 */
async function translateWithLlm7(prompt: string, text: string): Promise<string> {
  const key = LLM7_KEY;
  if (!key) throw new Error('Brak klucza LLM7 API');

  const models = ['DeepSeek-V4-Flash-0731', 'GLM-5.3-Flash', 'codestral-latest'];
  let lastError = '';

  for (const model of models) {
    try {
      const response = await fetch('https://api.llm7.io/v1/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(35000),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: `Przetłumacz ten fragment tekstu:\n\n${text}` },
          ],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content && content.trim().length > 0) {
          return content.trim();
        }
      } else {
        lastError = await response.text();
      }
    } catch (e: any) {
      lastError = e?.message || String(e);
    }
  }

  throw new Error(`Błąd LLM7 API: ${lastError}`);
}

/**
 * Call Groq API for ultra-fast translation (Qwen 3.8 27B / GPT-OSS 120B / LLaMA)
 */
async function translateWithGroq(prompt: string, text: string): Promise<string> {
  const key = GROQ_KEY;
  if (!key) throw new Error('Brak klucza Groq API');

  const models = ['qwen/qwen3.8-27b', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'];
  let lastError = '';

  for (const model of models) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(25000),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: `Przetłumacz ten fragment tekstu:\n\n${text}` },
          ],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content && content.trim().length > 0) {
          return content.trim();
        }
      } else {
        lastError = await response.text();
      }
    } catch (e: any) {
      lastError = e?.message || String(e);
    }
  }

  throw new Error(`Błąd Groq API: ${lastError}`);
}

/**
 * Call Mistral AI API for translation (ministral-3b / ministral-14b / codestral)
 */
async function translateWithMistral(prompt: string, text: string): Promise<string> {
  const key = MISTRAL_KEY;
  if (!key) throw new Error('Brak klucza Mistral API');

  const models = ['ministral-3b-latest', 'ministral-14b-latest', 'codestral-latest'];
  let lastError = '';

  for (const model of models) {
    try {
      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(30000),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: `Przetłumacz ten fragment tekstu:\n\n${text}` },
          ],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content && content.trim().length > 0) {
          return content.trim();
        }
      } else {
        lastError = await response.text();
      }
    } catch (e: any) {
      lastError = e?.message || String(e);
    }
  }

  throw new Error(`Błąd Mistral API: ${lastError}`);
}

/**
 * Call River AI API (DeepSeek-V4.1-Flash / GLM-5.3-Flash)
 */
async function translateWithRiver(prompt: string, text: string): Promise<string> {
  if (!RIVER_KEY) throw new Error('Brak klucza River API');
  const models = ['deepseek-ai/DeepSeek-V4.1-Flash', 'zai-org/GLM-5.3-Flash'];
  let lastError = '';

  for (const model of models) {
    try {
      const response = await fetch('https://api.river.ai/v1/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(35000),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${RIVER_KEY}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: `Oto tekst do przetłumaczenia:\n\n${text}` },
          ],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const translated = data.choices?.[0]?.message?.content?.trim();
        if (translated) return translated;
      } else {
        lastError = await response.text();
      }
    } catch (e: any) {
      lastError = e?.message || String(e);
    }
  }

  throw new Error(`Błąd River API: ${lastError}`);
}

/**
 * Call Gemini API (gemini-3.1-flash-lite / gemini-2.5-flash)
 */
async function translateWithGemini(prompt: string, text: string): Promise<string> {
  if (!GEMINI_KEY) throw new Error('Brak klucza Gemini API');

  const gemini = getGemini();
  const models = ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash'];
  let lastError = '';

  for (const m of models) {
    try {
      const callPromise = gemini.models.generateContent({
        model: m,
        contents: `${prompt}\n\nOto tekst do przetłumaczenia:\n\n${text}`,
        config: {
          temperature: 0.3,
        },
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout zapytania Gemini (35s)')), 35000)
      );

      const response = await Promise.race([callPromise, timeoutPromise]);
      const translated = response.text?.trim();
      if (translated) return translated;
    } catch (err: any) {
      lastError = err?.message || String(err);
      console.warn(`Gemini (${m}) translate notice:`, lastError);
    }
  }

  throw new Error(`Błąd Gemini API: ${lastError}`);
}

/**
 * Call OpenRouter API (DeepSeek / Gemini / Llama via OpenRouter)
 */
async function translateWithOpenRouter(prompt: string, text: string): Promise<string> {
  if (!OPENROUTER_KEY) throw new Error('Brak klucza OpenRouter API');

  const models = ['deepseek/deepseek-chat', 'meta-llama/llama-3.3-70b-instruct:free', 'openrouter/auto'];
  let lastError = '';

  for (const model of models) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(35000),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENROUTER_KEY}`,
          'HTTP-Referer': 'https://koreader-cloud.local',
          'X-Title': 'KOReader Cloud Book Bridge',
        },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: `Przetłumacz ten fragment tekstu:\n\n${text}` },
          ],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) return content;
      } else {
        lastError = await response.text();
      }
    } catch (e: any) {
      lastError = e?.message || String(e);
    }
  }

  throw new Error(`Błąd OpenRouter API: ${lastError}`);
}

/**
 * Free fallback AI without any API key or registration (Free AI Engine / Pollinations / Duck-compatible).
 * Automatically invoked when Gemini / Claude / OpenAI quotas or keys are exhausted,
 * ensuring translations, proofreading, and literary advice never stop functioning.
 */
async function translateWithFreeAi(prompt: string, text: string): Promise<string> {
  const fullPrompt = `${prompt}\n\nOto tekst do przetłumaczenia (zwróć WYŁĄCZNIE przetłumaczony tekst z nienaruszonymi tagami HTML):\n\n${text}`;
  const models = ['openai', 'mistral', 'qwen-coder', 'searchgpt'];
  let lastErr = '';

  for (const model of models) {
    try {
      const url = `https://text.pollinations.ai/${encodeURIComponent(fullPrompt)}?model=${model}&seed=${Math.floor(Math.random() * 100000)}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);

      const resp = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Accept': 'text/plain',
        },
      });
      clearTimeout(timeout);

      if (resp.ok) {
        const result = (await resp.text()).trim();
        if (result && result.length > 5 && !result.startsWith('{') && !result.startsWith('<!DOCTYPE')) {
          return result;
        }
      }
    } catch (e: any) {
      lastErr = e?.message || String(e);
    }
  }

  throw new Error(`Darmowy silnik AI nie mógł zrealizować zadania: ${lastErr}`);
}

/**
 * Polish typographic refinement layer for Kindle / e-ink:
 * - Converts dialogue quotation marks / hyphens into standard Polish book em-dashes (— )
 * - Attaches non-breaking spaces &nbsp; to single-letter Polish prepositions (w, z, o, i, a, u)
 *   so they never hang awkwardly orphaned at the end of lines on 6-inch Kindle screens.
 */
function postProcessPolishKindle(html: string): string {
  let s = html.trim();
  s = s.replace(/<p>\s*[-–—]\s*/gi, '<p>— ');
  s = s.replace(/<p>"/gi, '<p>— ');
  // Thoroughly decode any multi-escaped or stray HTML entities into real UTF-8
  s = cleanHtmlEntitiesToUtf8(s);
  s = s.replace(/ ([wzouiWZOUIA]) /g, ' $1\u00A0');
  s = s.replace(/>([wzouiWZOUIA]) /g, '>$1\u00A0');
  return s;
}

/**
 * Orchestrator: translates text using preferred engine, with automatic fallback
 * hierarchy (Gemini -> OpenRouter -> Claude -> OpenAI -> Free AI)
 * and final typographic polish for Kindle e-ink displays.
 */
export async function translateText(options: TranslationOptions): Promise<{ text: string; usedEngine: string }> {
  const { text, targetLang = 'Polish', context, preferredEngine = 'auto' } = options;
  const systemPrompt = buildTranslationSystemPrompt(targetLang, context);

  // List of engines to try in prioritized order
  const order = getSortedEngines(preferredEngine);
  const errors: string[] = [];

  for (const eng of order) {
    try {
      if (eng === 'river' && RIVER_KEY) {
        const translated = await translateWithRiver(systemPrompt, text);
        if (translated && translated.trim().length > 0) {
          return { text: postProcessPolishKindle(translated), usedEngine: 'River AI (DeepSeek-V4.1-Flash)' };
        }
      } else if (eng === 'groq' && GROQ_KEY) {
        const translated = await translateWithGroq(systemPrompt, text);
        if (translated && translated.trim().length > 0) {
          return { text: postProcessPolishKindle(translated), usedEngine: 'Groq (Qwen 27B / GPT-OSS 120B)' };
        }
      } else if (eng === 'gemini' && GEMINI_KEY) {
        const translated = await translateWithGemini(systemPrompt, text);
        if (translated && translated.trim().length > 0) {
          return { text: postProcessPolishKindle(translated), usedEngine: 'Google Gemini 3.8 Flash' };
        }
      } else if (eng === 'mistral' && MISTRAL_KEY) {
        const translated = await translateWithMistral(systemPrompt, text);
        if (translated && translated.trim().length > 0) {
          return { text: postProcessPolishKindle(translated), usedEngine: 'Mistral (Ministral / Codestral)' };
        }
      } else if (eng === 'cohere' && COHERE_KEY) {
        const translated = await translateWithCohere(systemPrompt, text);
        if (translated && translated.trim().length > 0) {
          return { text: postProcessPolishKindle(translated), usedEngine: 'Cohere (Command-R+)' };
        }
      } else if (eng === 'llm7' && LLM7_KEY) {
        const translated = await translateWithLlm7(systemPrompt, text);
        if (translated && translated.trim().length > 0) {
          return { text: postProcessPolishKindle(translated), usedEngine: 'LLM7 (DeepSeek-V4-Flash)' };
        }
      } else if (eng === 'openrouter' && OPENROUTER_KEY) {
        const translated = await translateWithOpenRouter(systemPrompt, text);
        if (translated && translated.trim().length > 0) {
          return { text: postProcessPolishKindle(translated), usedEngine: 'OpenRouter (DeepSeek / LLaMA)' };
        }
      } else if (eng === 'claude' && ANTHROPIC_KEY) {
        const translated = await translateWithClaude(systemPrompt, text);
        if (translated && translated.trim().length > 0) {
          return { text: postProcessPolishKindle(translated), usedEngine: 'Claude 3.5 Sonnet' };
        }
      } else if (eng === 'openai' && OPENAI_KEY) {
        const translated = await translateWithOpenAI(systemPrompt, text);
        if (translated && translated.trim().length > 0) {
          return { text: postProcessPolishKindle(translated), usedEngine: 'OpenAI GPT-4o-mini' };
        }
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (
        errMsg.includes('credit balance is too low') ||
        errMsg.includes('credit') ||
        errMsg.includes('insufficient_quota') ||
        errMsg.includes('429')
      ) {
        quotaExhausted[eng] = true;
      }
      console.warn(`Silnik ${eng} zgłosił błąd, sprawdzam kolejny silnik:`, errMsg);
      errors.push(`${eng}: ${errMsg}`);
    }
  }

  // Automatic fallback to Free AI Engine without API keys / limits
  try {
    const translated = await translateWithFreeAi(systemPrompt, text);
    if (translated && translated.trim().length > 0) {
      return { text: postProcessPolishKindle(translated), usedEngine: 'Mózg Free AI (bez limitów / Duck & Pollinations)' };
    }
  } catch (freeErr: any) {
    errors.push(`free_ai: ${freeErr?.message || freeErr}`);
  }

  throw new Error(`Wszystkie silniki AI zawiodły przy próbie tłumaczenia. Błędy:\n${errors.join('\n')}`);
}

import { BookRecommendation, AdvisorChatResponse } from '../src/types';
import { generateMirrorSearchLinks } from './mirrors';
import { queryOpenCodeRaw } from './opencode';

/**
 * Recommends curated, high-quality books based on user's natural language description,
 * mood, thematic tropes, or desired feeling.
 */
export async function recommendBooksByDescription(
  userDescription: string,
  preferredEngine: 'auto' | 'claude' | 'openai' | 'openrouter' | 'gemini' = 'auto'
): Promise<{ recommendations: BookRecommendation[]; analysis: string }> {
  if (!userDescription || !userDescription.trim()) {
    return { recommendations: [], analysis: 'Brak opisu poszukiwanej książki.' };
  }

  const prompt = `Jesteś genialnym doradcą literackim, erudycyjnym bibliotekarzem i ekspertem światowej i polskiej literatury.
Użytkownik opisał, na jaką książkę ma dziś ochotę / co chciałby przeczytać:
"${userDescription.trim()}"

Twoje zadanie:
1. Zinterpretuj nastrój, motywy, tematykę, tempo i specyfikę tego opisu.
2. ZASADA BEZWZGLĘDNEGO PRIORYTETU: W PIERWSZEJ KOLEJNOŚCI zaproponuj wybitne książki W JĘZYKU POLSKIM (zarówno polskich pisarzy, jak i dzieła zagraniczne z powszechnie dostępnymi, znakomitymi polskimi przekładami). Pozycje polskojęzyczne MUSZĄ zająć pierwsze pozycje na liście!
3. Jeśli proponujesz książkę zagraniczną niemającą polskiego wydania, umieść ją na dalszych pozycjach z wyraźnym oznaczeniem "originalLang" (np. EN, DE, FR) i wyjaśnij w rekomendacji, że wymaga ona przekładu AI.
4. Zaproponuj od 4 do 6 rzeczywistych, istniejących, wybitnych książek.
5. Zwróć wynik w formacie czystego JSON (bez znaczników markdown \`\`\` ani dodatkowego tekstu):

{
  "analysis": "1-2 zdaniowe podsumowanie Twojego zrozumienia nastroju i motywów użytkownika w języku polskim",
  "recommendations": [
    {
      "title": "Tytuł książki",
      "polishTitle": "Oficjalny polski tytuł (jeśli oryginał jest obcy)",
      "author": "Imię i nazwisko autora",
      "year": "Rok pierwszego wydania",
      "genre": "Gatunek literacki (np. Sci-Fi / Cyberpunk, Thriller psychologiczny, Reportaż)",
      "matchReason": "1-2 zdania w języku polskim wyjaśniające, dlaczego ta książka to strzał w dziesiątkę pod kątem opisu użytkownika",
      "synopsis": "Krótki (2-3 zdania) nastrojowy zarys fabuły bez spoilerów po polsku",
      "originalLang": "Język dostępnego wydania: PL (jeśli polskie/po polsku) lub EN / DE / FR (jeśli wydanie obcojęzyczne)",
      "searchQuery": "Precyzyjna fraza do wyszukania pliku w bazach (np. Stanisław Lem Niezwyciężony lub Peter Brown Dziki robot)"
    }
  ]
}`;

  let rawJson = '';

  // 1. Fast resilient attempt via OpenCode.ai / River AI
  try {
    const ocRes = await queryOpenCodeRaw(
      [
        { role: 'system', content: 'Jesteś wybitnym doradcą literackim i bibliografem. Zwróć wyłącznie poprawny obiekt JSON.' },
        { role: 'user', content: prompt },
      ],
      { jsonMode: true, temperature: 0.4 }
    );
    if (ocRes.content && ocRes.content.includes('{') && ocRes.content.includes('recommendations')) {
      rawJson = ocRes.content;
    }
  } catch (ocErr) {
    console.warn('Initial OpenCode try notice for recommendations:', ocErr);
  }

  // 2. Attempt using prioritized healthy models if rawJson not yet populated
  if (!rawJson) {
    const engines = getSortedEngines(preferredEngine);

    for (const eng of engines) {
      try {
        if (eng === 'river' && RIVER_KEY && !quotaExhausted.river) {
          try {
            const resp = await fetch('https://api.river.ai/v1/chat/completions', {
              method: 'POST',
              signal: AbortSignal.timeout(15000),
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${RIVER_KEY}`,
              },
              body: JSON.stringify({
                model: 'deepseek-ai/DeepSeek-V4.1-Flash',
                temperature: 0.4,
                response_format: { type: 'json_object' },
                messages: [
                  { role: 'user', content: `${prompt}\n\nPamiętaj: zwróć WYŁĄCZNIE poprawny JSON!` },
                ],
              }),
            });
            if (resp.ok) {
              const data = await resp.json();
              rawJson = data.choices?.[0]?.message?.content || '';
              if (rawJson) break;
            }
          } catch (rErr: any) {
            console.warn('River AI doradca notice:', rErr?.message || rErr);
          }
        } else if (eng === 'gemini' && GEMINI_KEY && !quotaExhausted.gemini) {
          for (const gemModel of ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash']) {
            try {
              const gemini = getGemini();
              const resp = await Promise.race([
                gemini.models.generateContent({
                  model: gemModel,
                  contents: `${prompt}\n\nPamiętaj: zwróć WYŁĄCZNIE poprawny JSON!`,
                  config: {
                    temperature: 0.4,
                    responseMimeType: 'application/json',
                  },
                }),
                new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Gemini timeout')), 7000)),
              ]);
              const text = resp?.text?.trim();
              if (text) {
                rawJson = text;
                break;
              }
            } catch (gErr: any) {
              console.warn(`Gemini (${gemModel}) doradca notice:`, gErr?.message || gErr);
            }
          }
          if (rawJson) break;
      } else if (eng === 'groq' && GROQ_KEY) {
        for (const m of ['qwen/qwen3.8-27b', 'openai/gpt-oss-120b']) {
          try {
            const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${GROQ_KEY}`,
              },
              body: JSON.stringify({
                model: m,
                response_format: { type: 'json_object' },
                messages: [
                  { role: 'user', content: `${prompt}\n\nPamiętaj: zwróć WYŁĄCZNIE poprawny JSON!` },
                ],
              }),
            });
            if (resp.ok) {
              const data = await resp.json();
              rawJson = data.choices?.[0]?.message?.content || '';
              if (rawJson) break;
            }
          } catch (gErr: any) {
            console.warn(`Groq (${m}) doradca notice:`, gErr?.message || gErr);
          }
        }
        if (rawJson) break;
      } else if (eng === 'cohere' && COHERE_KEY) {
        for (const m of ['command-r-plus-08-2024', 'command-r-08-2024']) {
          try {
            const resp = await fetch('https://api.cohere.com/v2/chat', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${COHERE_KEY}`,
              },
              body: JSON.stringify({
                model: m,
                response_format: { type: 'json_object' },
                messages: [
                  { role: 'user', content: `${prompt}\n\nPamiętaj: zwróć WYŁĄCZNIE poprawny JSON!` },
                ],
              }),
            });
            if (resp.ok) {
              const data = await resp.json();
              rawJson = data.message?.content?.[0]?.text || '';
              if (rawJson) break;
            }
          } catch (cErr: any) {
            console.warn(`Cohere (${m}) doradca notice:`, cErr?.message || cErr);
          }
        }
        if (rawJson) break;
      } else if (eng === 'llm7' && LLM7_KEY) {
        for (const m of ['DeepSeek-V4-Flash-0731', 'GLM-5.3-Flash']) {
          try {
            const resp = await fetch('https://api.llm7.io/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${LLM7_KEY}`,
              },
              body: JSON.stringify({
                model: m,
                response_format: { type: 'json_object' },
                messages: [
                  { role: 'user', content: `${prompt}\n\nPamiętaj: zwróć WYŁĄCZNIE poprawny JSON!` },
                ],
              }),
            });
            if (resp.ok) {
              const data = await resp.json();
              rawJson = data.choices?.[0]?.message?.content || '';
              if (rawJson) break;
            }
          } catch (lErr: any) {
            console.warn(`LLM7 (${m}) doradca notice:`, lErr?.message || lErr);
          }
        }
        if (rawJson) break;
      } else if (eng === 'openrouter' && OPENROUTER_KEY) {
        const orModels = ['deepseek/deepseek-chat', 'meta-llama/llama-3.3-70b-instruct:free', 'openrouter/auto'];
        for (const m of orModels) {
          try {
            const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
              method: 'POST',
              signal: AbortSignal.timeout(9000),
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${OPENROUTER_KEY}`,
                'HTTP-Referer': 'https://koreader-cloud.local',
                'X-Title': 'KOReader Cloud Book Bridge',
              },
              body: JSON.stringify({
                model: m,
                temperature: 0.5,
                max_tokens: 3000,
                response_format: { type: 'json_object' },
                messages: [{ role: 'user', content: prompt }],
              }),
            });
            if (resp.ok) {
              const data = await resp.json();
              rawJson = data.choices?.[0]?.message?.content || '';
              if (rawJson) break;
            } else {
              const errText = await resp.text();
              console.warn(`OpenRouter (${m}) doradca HTTP ${resp.status}:`, errText);
            }
          } catch (e) {
            console.warn(`Błąd OpenRouter (${m}):`, e);
          }
        }
        if (rawJson) break;
      } else if (eng === 'claude' && ANTHROPIC_KEY) {
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 3000,
            messages: [{ role: 'user', content: prompt }],
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          rawJson = data.content?.[0]?.text || '';
          if (rawJson) break;
        } else {
          const errText = await resp.text();
          if (errText.includes('credit balance is too low') || resp.status === 400) {
            quotaExhausted.claude = true;
          }
          console.warn(`Claude doradca notice HTTP ${resp.status}`);
        }
      } else if (eng === 'openai' && OPENAI_KEY) {
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${OPENAI_KEY}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            temperature: 0.5,
            response_format: { type: 'json_object' },
            messages: [{ role: 'user', content: prompt }],
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          rawJson = data.choices?.[0]?.message?.content || '';
          if (rawJson) break;
        } else {
          const errText = await resp.text();
          if (errText.includes('insufficient_quota') || errText.includes('credit') || resp.status === 429) {
            quotaExhausted.openai = true;
          }
          console.warn(`OpenAI doradca notice HTTP ${resp.status}`);
        }
      }
    } catch (e) {
      console.warn(`Błąd doradcy AI z silnikiem ${eng}:`, e);
    }
  }
  }

  // Automatic fallback to Free AI Engine (Pollinations / Duck-compatible)
  if (!rawJson) {
    try {
      const freePrompt = `${prompt}\n\nPAMIĘTAJ: Zwróć WYŁĄCZNIE poprawny, surowy obiekt JSON bez markdownu.`;
      const url = `https://text.pollinations.ai/${encodeURIComponent(freePrompt)}?model=openai&json=true`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      const resp = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Accept': 'application/json, text/plain',
        },
      });
      clearTimeout(timeout);
      if (resp.ok) {
        const textRes = await resp.text();
        if (textRes && textRes.includes('{') && textRes.includes('recommendations')) {
          rawJson = textRes;
        }
      }
    } catch (err: any) {
      console.warn('Free AI fallback notice for recommendations:', err?.message);
    }
  }

  if (!rawJson) {
    console.warn('AI models unavailable, using intelligent thematic fallback for:', userDescription);
    const descLower = userDescription.toLowerCase();
    if (descLower.includes('cyber') || descLower.includes('sci-fi') || descLower.includes('robot') || descLower.includes('kosmos') || descLower.includes('mars')) {
      rawJson = JSON.stringify({
        analysis: "Szukasz fascynującej fantastyki naukowej z technologicznymi lub kosmicznymi motywami.",
        recommendations: [
          {
            title: "Solaris",
            polishTitle: "Solaris",
            author: "Stanisław Lem",
            year: "1961",
            genre: "Sci-Fi / Filozoficzna",
            matchReason: "Absolutne arcydzieło polskiej fantastyki naukowej badające granice ludzkiego poznania.",
            synopsis: "Baza badawcza na planecie pokrytej żywym, myślącym oceanem, który materializuje najskrytsze wspomnienia załogi.",
            originalLang: "PL",
            searchQuery: "Stanisław Lem Solaris"
          },
          {
            title: "Limes inferior",
            polishTitle: "Limes inferior",
            author: "Janusz A. Zajdel",
            year: "1982",
            genre: "Sci-Fi / Cyber / Dystopia",
            matchReason: "Klasyk polskiej fantastyki socjologicznej o społeczeństwie podzielonym na klasy i punkty.",
            synopsis: "W mieście rządzonym przez system punktowy, sprytny Sneer pomaga ludziom obchodzić biurokratyczną machinę.",
            originalLang: "PL",
            searchQuery: "Janusz Zajdel Limes inferior"
          },
          {
            title: "Neuromancer",
            polishTitle: "Neuromancer",
            author: "William Gibson",
            year: "1984",
            genre: "Cyberpunk",
            matchReason: "Biblia cyberpunku z hakerami, sztuczną inteligencją i neonowym klimatem.",
            synopsis: "Zdegradowany haker Case dostaje ostatnią szansę włamując się do potężnej korporacyjnej AI.",
            originalLang: "EN",
            searchQuery: "William Gibson Neuromancer"
          }
        ]
      });
    } else if (descLower.includes('krym') || descLower.includes('noir') || descLower.includes('detekt') || descLower.includes('morder') || descLower.includes('zagadk')) {
      rawJson = JSON.stringify({
        analysis: "Szukasz wciągającego kryminału z tajemniczą intrygą.",
        recommendations: [
          {
            title: "Zaginięcie",
            polishTitle: "Zaginięcie",
            author: "Remigiusz Mróz",
            year: "2015",
            genre: "Kryminał / Prawniczy",
            matchReason: "Błyskotliwa warszawska adwokat Joanna Chyłka w sprawie zaginionego dziecka.",
            synopsis: "Trzyletnia dziewczynka znika bez śladu z zamkniętego domu bogatych rodziców.",
            originalLang: "PL",
            searchQuery: "Remigiusz Mróz Zaginięcie"
          },
          {
            title: "Ziarno prawdy",
            polishTitle: "Ziarno prawdy",
            author: "Zygmunt Miłoszewski",
            year: "2011",
            genre: "Kryminał / Śledczy",
            matchReason: "Świetny sandomierski klimat i prokurator Szacki rozwikłujący makabryczną zbrodnię.",
            synopsis: "Ciało cenionej mieszkanki zostaje odnalezione w pobliżu sandomierskiej synagogi.",
            originalLang: "PL",
            searchQuery: "Zygmunt Miłoszewski Ziarno prawdy"
          }
        ]
      });
    } else {
      rawJson = JSON.stringify({
        analysis: "Dobrano wybitne pozycje literatury idealnie pasujące do czytania na czytniku e-ink.",
        recommendations: [
          {
            title: "Ostatnie życzenie",
            polishTitle: "Ostatnie życzenie",
            author: "Andrzej Sapkowski",
            year: "1993",
            genre: "Fantasy",
            matchReason: "Kultowy początek sagi o Geralcie z Rivii pełen ironii i mądrości.",
            synopsis: "Zbiór opowiadań wprowadzający w świat wiedźmina, potworów i przeznaczenia.",
            originalLang: "PL",
            searchQuery: "Andrzej Sapkowski Ostatnie życzenie"
          },
          {
            title: "Pan Lodowego Ogrodu",
            polishTitle: "Pan Lodowego Ogrodu",
            author: "Jarosław Grzędowicz",
            year: "2005",
            genre: "Science-Fantasy",
            matchReason: "Jedna z najlepszych polskich serii łączących zaawansowaną technologię i świat magii.",
            synopsis: "Vuko Drakkainen rusza na obcą planetę Midgaard z samotną misją ratunkową naukowców.",
            originalLang: "PL",
            searchQuery: "Jarosław Grzędowicz Pan Lodowego Ogrodu"
          }
        ]
      });
    }
  }

  // Clean markdown if present
  let clean = rawJson.trim();
  if (clean.startsWith('```json')) {
    clean = clean.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  } else if (clean.startsWith('```')) {
    clean = clean.replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
  }

  try {
    const parsed = JSON.parse(clean);
    const recs: BookRecommendation[] = (parsed.recommendations || []).map((r: any, idx: number) => {
      const q = r.searchQuery || `${r.author} ${r.title}`;
      const rawLang = String(r.originalLang || '').toUpperCase();
      const isPolish = rawLang.includes('PL') || rawLang.includes('POL') || (!rawLang.includes('EN') && !rawLang.includes('GER') && !rawLang.includes('FR') && Boolean(r.polishTitle));
      const langCode = isPolish ? 'PL' : (rawLang.includes('EN') ? 'EN' : rawLang || 'INNY');
      const recAction = isPolish
        ? 'Pobierz od razu (Polskie wydanie)'
        : 'Przetłumacz na polski (Przekład AI)';

      return {
        id: `rec_${Date.now()}_${idx}`,
        title: r.title || 'Nieznany tytuł',
        polishTitle: r.polishTitle,
        author: r.author || 'Nieznany autor',
        year: r.year ? String(r.year) : undefined,
        genre: r.genre || 'Literatura',
        matchReason: r.matchReason || 'Idealnie koresponduje z Twoim opisem.',
        synopsis: r.synopsis || '',
        originalLang: langCode,
        language: langCode,
        isPolishAvailable: isPolish,
        recommendedAction: recAction,
        searchQuery: q,
        mirrorLinks: generateMirrorSearchLinks(q),
      };
    });

    // Ensure Polish language recommendations are strictly prioritized at the top
    recs.sort((a, b) => {
      if (a.isPolishAvailable && !b.isPolishAvailable) return -1;
      if (!a.isPolishAvailable && b.isPolishAvailable) return 1;
      return 0;
    });

    return {
      recommendations: recs,
      analysis: parsed.analysis || 'Oto starannie dobrane tytuły odpowiadające Twoim oczekiwaniom:',
    };
  } catch (err: any) {
    console.error('Błąd rekomendacji AI:', err, rawJson);
    return getFallbackCuratedRecommendations(userDescription);
  }
}

export function getFallbackCuratedRecommendations(userDescription: string): { recommendations: BookRecommendation[]; analysis: string } {
  const desc = userDescription.toLowerCase();
  let analysis = 'Dopasowano wybitne książki odpowiadające podanej tematyce z natychmiastową dostępnością.';
  const recsData: any[] = [];

  if (desc.includes('mag') || desc.includes('smok') || desc.includes('fantasy') || desc.includes('miecz')) {
    analysis = 'Wybrano klasykę literatury fantasy o magii, smokach i epickich przygodach:';
    recsData.push(
      { title: 'Ostatnie życzenie', author: 'Andrzej Sapkowski', genre: 'Fantasy', year: '1993', matchReason: 'Kultowy początek sagi wiedźmińskiej z polowaniami na potwory i magią.', originalLang: 'PL', searchQuery: 'Andrzej Sapkowski Ostatnie życzenie' },
      { title: 'Hobbit, czyli tam i z powrotem', polishTitle: 'Hobbit', author: 'J.R.R. Tolkien', genre: 'High Fantasy', year: '1937', matchReason: 'Epicka wyprawa z czarodziejem Gandalfem i smokiem Smaugiem.', originalLang: 'PL', searchQuery: 'Tolkien Hobbit' },
      { title: 'Eragon', polishTitle: 'Eragon', author: 'Christopher Paolini', genre: 'Fantasy', year: '2002', matchReason: 'Historia smoczego jeźdźca i więzi łączącej go ze smoczycą Saphirą.', originalLang: 'PL', searchQuery: 'Christopher Paolini Eragon' },
      { title: 'Pan Lodowego Ogrodu', author: 'Jarosław Grzędowicz', genre: 'Science-Fantasy', year: '2005', matchReason: 'Świetne połączenie technologii z magicznym światem planety Midgaard.', originalLang: 'PL', searchQuery: 'Jarosław Grzędowicz Pan Lodowego Ogrodu' }
    );
  } else if (desc.includes('sci-fi') || desc.includes('kosmos') || desc.includes('robot') || desc.includes('przyszł') || desc.includes('cyber')) {
    analysis = 'Wybrano najwybitniejsze dzieła fantastyki naukowej i cyberpunku:';
    recsData.push(
      { title: 'Solaris', author: 'Stanisław Lem', genre: 'Sci-Fi', year: '1961', matchReason: 'Absolutne arcydzieło polskiej fantastyki o kontakcie z obcą cywilizacją.', originalLang: 'PL', searchQuery: 'Stanisław Lem Solaris' },
      { title: 'Diuna', polishTitle: 'Diuna', author: 'Frank Herbert', genre: 'Space Opera', year: '1965', matchReason: 'Monumentalna opowieść o pustynnej planecie Arrakis i przyprawie.', originalLang: 'PL', searchQuery: 'Frank Herbert Diuna' },
      { title: 'Limes inferior', author: 'Janusz A. Zajdel', genre: 'Dystopia / Sci-Fi', year: '1982', matchReason: 'Genialny klasyk o manipulacji społeczeństwem i walce z biurokracją.', originalLang: 'PL', searchQuery: 'Janusz Zajdel Limes inferior' }
    );
  } else {
    analysis = 'Oto rekomendacje literackie na bazie Twojego zapytania:';
    recsData.push(
      { title: 'Ostatnie życzenie', author: 'Andrzej Sapkowski', genre: 'Fantasy', year: '1993', matchReason: 'Znakomita lektura z barwnymi postaciami i świetnym humorem.', originalLang: 'PL', searchQuery: 'Andrzej Sapkowski Ostatnie życzenie' },
      { title: 'Solaris', author: 'Stanisław Lem', genre: 'Sci-Fi', year: '1961', matchReason: 'Głęboka powieść filozoficzna i science-fiction.', originalLang: 'PL', searchQuery: 'Stanisław Lem Solaris' },
      { title: 'Wiedźmin: Miecz przeznaczenia', author: 'Andrzej Sapkowski', genre: 'Fantasy', year: '1992', matchReason: 'Drugi tom opowiadań wiedźmińskich z niezapomnianą historią Ciri.', originalLang: 'PL', searchQuery: 'Andrzej Sapkowski Miecz przeznaczenia' }
    );
  }

  const recommendations: BookRecommendation[] = recsData.map((r, idx) => ({
    id: `rec_fallback_${Date.now()}_${idx}`,
    title: r.title,
    polishTitle: r.polishTitle,
    author: r.author,
    year: r.year,
    genre: r.genre,
    matchReason: r.matchReason,
    synopsis: r.matchReason,
    originalLang: r.originalLang || 'PL',
    language: r.originalLang || 'PL',
    isPolishAvailable: true,
    recommendedAction: 'Pobierz od razu (Polskie wydanie)',
    searchQuery: r.searchQuery,
    mirrorLinks: generateMirrorSearchLinks(r.searchQuery),
  }));

  return { recommendations, analysis };
}

/**
 * Interactive Conversational Advisor:
 * Conducts a 2-column conversational dialogue with the user, asking probing questions,
 * refining taste, and generating real-time matching book recommendations.
 */
export async function chatWithAdvisor(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  modelTier: 'smart_auto' | 'free_opencode' | 'premium' = 'smart_auto',
  premiumProvider: 'openrouter' | 'openai' = 'openrouter'
): Promise<AdvisorChatResponse> {
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')?.content || '';

  const systemPrompt = `Jesteś wybitnym, kulturalnym doradcą literackim i erudycyjnym bibliotekarzem w aplikacji czytnikowej KOReader Cloud.
Rozmawiasz po polsku z czytelnikiem, który szuka inspiracji lub idealnej książki dla siebie.
Twoje zadanie:
1. Odpowiedz w polu "reply" ciepło, zwięźle i naturalnie (1-2 akapity). Pokaż, że doskonale rozumiesz klimat, o który pyta użytkownik. Jeśli wymienił autorów lub motywy, krótko do nich nawiąż.
2. W "followUpQuestions" zaproponuj 2-3 zwięzłe, intrygujące pytania pomocnicze lub wątki do wyboru (np. "Wolisz powolne budowanie klimatu czy wartką akcję?", "Czy wolisz twarde science-fiction czy dystopię społeczną?").
3. W "recommendations" wytypuj od 2 do 5 konkretnych, istniejących, wybitnych książek pasujących do obecnego etapu rozmowy.
   ZASADA PRIORYTETU: Polscy autorzy oraz polskie wydania na pierwszych miejscach!
4. Zwróć WYŁĄCZNIE poprawny obiekt JSON (bez znaczników markdown \`\`\`json):
{
  "reply": "Tekst odpowiedzi doradcy po polsku...",
  "followUpQuestions": ["Pytanie pomocnicze 1", "Pytanie pomocnicze 2"],
  "analysis": "1-zdaniowe podsumowanie obecnych preferencji czytelnika",
  "recommendations": [
    {
      "title": "Tytuł książki",
      "polishTitle": "Oficjalny polski tytuł",
      "author": "Autor",
      "year": "Rok wydania",
      "genre": "Gatunek",
      "matchReason": "Dlaczego ta pozycja idealnie pasuje do słów czytelnika",
      "synopsis": "Krótki, 2-zdaniowy zarys fabuły bez spoilerów",
      "originalLang": "PL lub EN",
      "searchQuery": "Fraza do wyszukania w bazie e-booków"
    }
  ]
}`;

  const conversationPayload = [
    { role: 'system', content: systemPrompt },
    ...messages.slice(-8).map((m) => ({ role: m.role, content: m.content })),
  ];

  let rawJson = '';
  let usedEngineName = 'OpenCode.ai (Darmowy)';

  // 1. Premium tier (OpenRouter / OpenAI)
  if (modelTier === 'premium') {
    if (premiumProvider === 'openai' && OPENAI_KEY && !quotaExhausted.openai) {
      try {
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            response_format: { type: 'json_object' },
            messages: conversationPayload,
            temperature: 0.7,
          }),
          signal: AbortSignal.timeout(15000),
        });
        if (resp.ok) {
          const data = await resp.json();
          rawJson = data.choices?.[0]?.message?.content || '';
          usedEngineName = 'OpenAI GPT-4o-mini (Premium)';
        }
      } catch {}
    } else if (OPENROUTER_KEY && !quotaExhausted.openrouter) {
      try {
        const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENROUTER_KEY}` },
          body: JSON.stringify({
            model: 'deepseek/deepseek-chat',
            response_format: { type: 'json_object' },
            messages: conversationPayload,
            temperature: 0.7,
          }),
          signal: AbortSignal.timeout(15000),
        });
        if (resp.ok) {
          const data = await resp.json();
          rawJson = data.choices?.[0]?.message?.content || '';
          usedEngineName = 'OpenRouter DeepSeek (Premium)';
        }
      } catch {}
    }
  }

  // 2. Free OpenCode & River AI
  if (!rawJson) {
    try {
      const ocRes = await queryOpenCodeRaw(conversationPayload, { jsonMode: true, temperature: 0.7 });
      if (ocRes.content) {
        rawJson = ocRes.content;
        usedEngineName = ocRes.model;
      }
    } catch (e) {
      console.warn('OpenCode chat notice:', e);
    }
  }

  // 3. Parse JSON or fallback
  if (rawJson) {
    try {
      const clean = rawJson.replace(/^```json\s*|\s*```$/g, '').trim();
      const parsed = JSON.parse(clean);
      const recs: BookRecommendation[] = (parsed.recommendations || []).map((r: any, idx: number) => {
        const q = r.searchQuery || `${r.author} ${r.title}`;
        const rawLang = String(r.originalLang || '').toUpperCase();
        const isPolish = rawLang.includes('PL') || Boolean(r.polishTitle && !rawLang.includes('EN'));
        const langCode = isPolish ? 'PL' : (rawLang.includes('EN') ? 'EN' : rawLang || 'INNY');
        return {
          id: `rec_chat_${Date.now()}_${idx}`,
          title: r.title || 'Książka',
          polishTitle: r.polishTitle,
          author: r.author || 'Autor',
          year: r.year ? String(r.year) : undefined,
          genre: r.genre || 'Literatura',
          matchReason: r.matchReason || 'Dopasowana do Twojego opisu.',
          synopsis: r.synopsis || '',
          originalLang: langCode,
          language: langCode,
          isPolishAvailable: isPolish,
          recommendedAction: isPolish ? 'Pobierz od razu (Polskie wydanie)' : 'Przetłumacz na polski (Przekład AI)',
          searchQuery: q,
          mirrorLinks: generateMirrorSearchLinks(q),
        };
      });

      return {
        reply: parsed.reply || 'Oto starannie dobrane tytuły, które najlepiej korespondują z Twoimi preferencjami. Przejrzyj je w panelu po prawej stronie.',
        followUpQuestions: Array.isArray(parsed.followUpQuestions) && parsed.followUpQuestions.length > 0 ? parsed.followUpQuestions : [
          'Czy wolisz wolniejsze budowanie napięcia czy wartką akcję?',
          'Czy interesują Cię bardziej polscy autorzy czy światowa klasyka?'
        ],
        analysis: parsed.analysis || 'Dopasowano na podstawie bieżącego dialogu z czytelnikiem.',
        recommendations: recs,
        usedEngine: usedEngineName,
      };
    } catch (e) {
      console.warn('Błąd parsowania JSON z czatu doradcy:', e);
    }
  }

  // 4. Safe fallback (NEVER throws 500)
  const fallback = getFallbackCuratedRecommendations(lastUserMsg);
  return {
    reply: `Z przyjemnością pomogę Ci wybrać idealną lekturę! Na podstawie Twojego pytania wytypowałem kilka wybitnych pozycji z polskiej i światowej bibliografii. Możesz je od razu pobrać lub przejrzeć streszczenie po prawej stronie.`,
    followUpQuestions: [
      'Wolisz wartką akcję czy filozoficzny, nastrojowy klimat?',
      'Czy wolisz literaturę polską, czy tłumaczenia zagraniczne?',
      'Szukasz pojedynczej powieści czy dłuższej serii?'
    ],
    analysis: fallback.analysis,
    recommendations: fallback.recommendations,
    usedEngine: 'Doradca KOReader (Smart Auto)',
  };
}

/**
 * Instant reader assistant: translates, explains historical/literary context, or summarizes text
 */
export async function getAIAssist(
  text: string,
  mode: 'translate' | 'explain' | 'summarize' = 'explain',
  context?: string,
  preferredEngine: 'auto' | 'claude' | 'openai' | 'openrouter' | 'gemini' = 'auto'
): Promise<string> {
  const promptMap = {
    translate: `Przetłumacz poniższy fragment na naturalny, piękny język polski. Zwróć wyłącznie polski przekład bez wstępów.\nFragment:\n"${text}"`,
    explain: `Jesteś asystentem czytelnika ebooków. Wyjaśnij krótko, prosto i merytorycznie (po polsku w 2-4 zdaniach) znaczenie tego pojęcia, postaci, nawiązania kulturowego lub historycznego w czytanej książce.\n${context ? `Kontekst: ${context}\n` : ''}Pojęcie/Fragment:\n"${text}"`,
    summarize: `Streszcz ten fragment książki w 2-3 zwięzłych, kluczowych zdaniach po polsku:\n"${text}"`,
  };

  const userPrompt = promptMap[mode] || promptMap.explain;
  const engines = getSortedEngines(preferredEngine);

  for (const eng of engines) {
    try {
      if (eng === 'river' && RIVER_KEY) {
        try {
          const resp = await fetch('https://api.river.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${RIVER_KEY}`,
            },
            body: JSON.stringify({
              model: 'deepseek-ai/DeepSeek-V4.1-Flash',
              messages: [{ role: 'user', content: userPrompt }],
            }),
            signal: AbortSignal.timeout(12000),
          });
          if (resp.ok) {
            const data = await resp.json();
            const textRes = data.choices?.[0]?.message?.content;
            if (textRes) return textRes.trim();
          }
        } catch (rErr: any) {
          console.warn('River AI assistant error:', rErr?.message || rErr);
        }
      } else if (eng === 'groq' && GROQ_KEY) {
        try {
          const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${GROQ_KEY}`,
            },
            body: JSON.stringify({
              model: 'qwen/qwen3.8-27b',
              messages: [{ role: 'user', content: userPrompt }],
            }),
            signal: AbortSignal.timeout(10000),
          });
          if (resp.ok) {
            const data = await resp.json();
            const textRes = data.choices?.[0]?.message?.content;
            if (textRes) return textRes.trim();
          }
        } catch (gErr: any) {
          console.warn('Groq assistant error:', gErr?.message || gErr);
        }
      } else if (eng === 'mistral' && MISTRAL_KEY) {
        try {
          const resp = await fetch('https://api.mistral.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${MISTRAL_KEY}`,
            },
            body: JSON.stringify({
              model: 'ministral-3b-latest',
              messages: [{ role: 'user', content: userPrompt }],
            }),
            signal: AbortSignal.timeout(10000),
          });
          if (resp.ok) {
            const data = await resp.json();
            const textRes = data.choices?.[0]?.message?.content;
            if (textRes) return textRes.trim();
          }
        } catch (mErr: any) {
          console.warn('Mistral assistant error:', mErr?.message || mErr);
        }
      } else if (eng === 'gemini' && GEMINI_KEY) {
        const ai = getGemini();
        for (const gemModel of ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash']) {
          try {
            const response = await ai.models.generateContent({
              model: gemModel,
              contents: userPrompt,
            });
            if (response.text) return response.text.trim();
          } catch (e: any) {
            console.warn(`Gemini (${gemModel}) assistant notice:`, e?.message || e);
          }
        }
      } else if (eng === 'cohere' && COHERE_KEY) {
        try {
          const resp = await fetch('https://api.cohere.com/v2/chat', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${COHERE_KEY}`,
            },
            body: JSON.stringify({
              model: 'command-r-plus-08-2024',
              messages: [{ role: 'user', content: userPrompt }],
            }),
            signal: AbortSignal.timeout(15000),
          });
          if (resp.ok) {
            const data = await resp.json();
            const textRes = data.message?.content?.[0]?.text;
            if (textRes) return textRes.trim();
          }
        } catch (cErr: any) {
          console.warn('Cohere assistant error:', cErr?.message || cErr);
        }
      } else if (eng === 'llm7' && LLM7_KEY) {
        try {
          const resp = await fetch('https://api.llm7.io/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${LLM7_KEY}`,
            },
            body: JSON.stringify({
              model: 'DeepSeek-V4-Flash-0731',
              max_tokens: 1500,
              messages: [{ role: 'user', content: userPrompt }],
            }),
            signal: AbortSignal.timeout(15000),
          });
          if (resp.ok) {
            const data = await resp.json();
            const textRes = data.choices?.[0]?.message?.content;
            if (textRes) return textRes.trim();
          }
        } catch (lErr: any) {
          console.warn('LLM7 assistant error:', lErr?.message || lErr);
        }
      } else if (eng === 'openrouter' && OPENROUTER_KEY) {
        const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${OPENROUTER_KEY}`,
          },
          body: JSON.stringify({
            model: 'deepseek/deepseek-chat',
            max_tokens: 1500,
            messages: [{ role: 'user', content: userPrompt }],
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          const textRes = data.choices?.[0]?.message?.content;
          if (textRes) return textRes.trim();
        }
      } else if (eng === 'openai' && OPENAI_KEY && !quotaExhausted.openai) {
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${OPENAI_KEY}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: userPrompt }],
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          const textRes = data.choices?.[0]?.message?.content;
          if (textRes) return textRes.trim();
        }
      }
    } catch (err) {
      console.warn(`Błąd AI assist (${eng}):`, err);
    }
  }

  // Automatic fallback to Free AI (Pollinations / Duck-compatible)
  try {
    const freeUrl = `https://text.pollinations.ai/${encodeURIComponent(userPrompt)}?model=openai`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const resp = await fetch(freeUrl, { signal: controller.signal });
    clearTimeout(timeout);
    if (resp.ok) {
      const txt = await resp.text();
      if (txt && txt.trim().length > 10 && !txt.startsWith('{')) {
        return txt.trim();
      }
    }
  } catch (err) {
    console.warn('Free AI assistant notice:', err);
  }

  return 'Nie udało się uzyskać odpowiedzi asystenta AI.';
}

/**
 * Professional F7 Book Proofreader:
 * Simulates pressing "F7" in MS Word with AI and heuristic grammar/OCR spellcheck:
 * 1. Corrects OCR letter misreads and scanning dust (e.g. 1 -> i, Śś -> Ś, L co -> i co)
 * 2. Un-glues merged Polish prepositions and conjunctions (no ipotężny -> no i potężny)
 * 3. Polishes typography (Polish book dialogue dashes "— " with proper spaces, quotes, punctuation)
 * 4. Preserves 100% of HTML tags (<h2>, <p>, <div>, <img>) and author's original literary voice.
 */
export async function proofreadChapterF7(
  text: string,
  context?: string,
  preferredEngine: 'auto' | 'claude' | 'openai' | 'openrouter' | 'gemini' = 'auto'
): Promise<{ text: string; usedEngine: string }> {
  // First run heuristic baseline to immediately fix mechanical glitches
  const cleanedBaseline = heuristicOcrProofread(text);

  const engines = getSortedEngines(preferredEngine);

  const systemPrompt = `Jesteś profesjonalnym korektorem książkowym i redaktorem tekstu (jak autokorekta F7 w edytorze Word).
Otrzymujesz fragment rozdziału książki wyciągnięty ze skanu / OCR (PDF).
Twoim zadaniem jest usunięcie błędów skanowania i OCR, przywracając czysty, poprawny literacko polski tekst:
1. Rozdziel słowa, w których OCR zgubił spacje (np. "no ipotężny" -> "no i potężny", "wszyscynieproszeni" -> "wszyscy nieproszeni", "Ciąglewołałem" -> "Ciągle wołałem", "Czymprędzej" -> "Czym prędzej").
2. Popraw oczywiste błędy rozpoznawania znaków (np. cyfra "1" jako spójnik "i", "L co" -> "i co", "Śślimaku" -> "ślimaku", "Śni" -> "śni", zduplikowane litery przez paprochy na skanie).
3. Upewnij się, że dialogi mają prawidłowe polskie myślniki (—) ze spacjami.
4. BEZWZGLĘDNIE ZACHOWAJ wszystkie znaczniki HTML (<p>, <h2>, <div>, <img>, <em>, <strong>). Zwróć wyłącznie poprawiony kod HTML.
5. KRYTYCZNIE: Nie zmieniaj fabuły, nie streszczaj, nie usuwaj zdań. Zachowaj oryginalny styl, urok i słownictwo autorki.`;

  for (const eng of engines) {
    try {
      if (eng === 'gemini' && GEMINI_KEY && !quotaExhausted.gemini) {
        const gemini = getGemini();
        const models = ['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.8-flash', 'gemini-3.5-flash-lite'];
        for (const m of models) {
          try {
            const resp = await gemini.models.generateContent({
              model: m,
              contents: `${systemPrompt}\n\nKontekst: ${context || 'Książka'}\n\nTEKST DO KOREKTY:\n${cleanedBaseline}`,
              config: { temperature: 0.2 },
            });
            const resText = resp.text?.trim();
            if (resText && resText.length > cleanedBaseline.length * 0.5) {
              return { text: resText.replace(/^```html\s*|\s*```$/g, '').trim(), usedEngine: `Google Gemini (${m}) - F7 Redakcja` };
            }
          } catch (modelErr: any) {
            if (modelErr?.status === 429) quotaExhausted.gemini = true;
          }
        }
      } else if (eng === 'openrouter' && OPENROUTER_KEY && !quotaExhausted.openrouter) {
        const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${OPENROUTER_KEY}`,
          },
          body: JSON.stringify({
            model: 'deepseek/deepseek-chat',
            temperature: 0.2,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Kontekst: ${context || 'Książka'}\n\nTEKST DO KOREKTY:\n${cleanedBaseline}` },
            ],
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          const resText = data.choices?.[0]?.message?.content?.trim();
          if (resText && resText.length > cleanedBaseline.length * 0.5) {
            return { text: resText.replace(/^```html\s*|\s*```$/g, '').trim(), usedEngine: 'OpenRouter DeepSeek - F7 Redakcja' };
          }
        }
      } else if (eng === 'openai' && OPENAI_KEY && !quotaExhausted.openai) {
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${OPENAI_KEY}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            temperature: 0.2,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Kontekst: ${context || 'Książka'}\n\nTEKST DO KOREKTY:\n${cleanedBaseline}` },
            ],
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          const resText = data.choices?.[0]?.message?.content?.trim();
          if (resText && resText.length > cleanedBaseline.length * 0.5) {
            return { text: resText.replace(/^```html\s*|\s*```$/g, '').trim(), usedEngine: 'OpenAI GPT-4o-mini - F7 Redakcja' };
          }
        }
      }
    } catch (e) {
      console.warn(`Błąd F7 proofread (${eng}):`, e);
    }
  }

  // Fallback to high-fidelity rule-based F7 OCR proofreading
  return {
    text: cleanedBaseline,
    usedEngine: 'Autokorekta F7 (silnik regułowy)',
  };
}

// --------------------------------------------------------------------------
// AI Companion: Drzewo Bohaterów i Przypomnienie Fabularne (Recap)
// --------------------------------------------------------------------------

export interface BookCharacter {
  name: string;
  role: string;
  description: string;
  faction?: string;
  relations?: string[];
  importance?: 'main' | 'supporting' | 'minor';
}

export async function extractBookCharacters(
  bookTitle: string,
  sampleText: string
): Promise<BookCharacter[]> {
  const truncatedText = sampleText.slice(0, 15000);

  // 1. Try River AI
  if (RIVER_KEY && !quotaExhausted.river) {
    try {
      const prompt = `Jesteś ekspertem literackim. Na podstawie podanego fragmentu książki "${bookTitle}" sporządź przewodnik po postaciach (drzewo bohaterów).
Zwróć WYŁĄCZNIE poprawny format JSON (tablica obiektów) bez żadnych znaczników markdown:
[
  {
    "name": "Imię postaci",
    "role": "Kim jest (np. Wiedźmin, Król Temerii, Czarodziejka)",
    "description": "Krótki 1-2 zdaniowy opis cech i motywacji postaci bez spoilerów",
    "faction": "Frakcja / Pochodzenie (np. Kaer Morhen, Nilfgaard, Temeria)",
    "relations": ["Relacja z inną postacią (np. Przyjaciel Jaskra)"],
    "importance": "main"
  }
]

Tekst do analizy:
${truncatedText}`;

      const resp = await fetch('https://api.river.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${RIVER_KEY}`,
        },
        body: JSON.stringify({
          model: 'deepseek-ai/DeepSeek-V4.1-Flash',
          response_format: { type: 'json_object' },
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: AbortSignal.timeout(12000),
      });

      if (resp.ok) {
        const data = await resp.json();
        const content = data.choices?.[0]?.message?.content?.trim() || '';
        const clean = content.replace(/^```json\s*|\s*```$/g, '').trim();
        const parsed = JSON.parse(clean);
        const list = Array.isArray(parsed) ? parsed : parsed.characters || parsed.postacie;
        if (Array.isArray(list) && list.length > 0) return list;
      }
    } catch (rErr: any) {
      console.warn('River AI characters notice:', rErr?.message || rErr);
    }
  }

  // 2. Try Gemini with resilient model fallback
  if (GEMINI_KEY && !quotaExhausted.gemini) {
    const ai = getGemini();
    const prompt = `Jesteś ekspertem literackim. Na podstawie podanego fragmentu książki "${bookTitle}" sporządź przewodnik po postaciach (drzewo bohaterów).
Zwróć WYŁĄCZNIE poprawny format JSON (tablica obiektów) bez żadnych znaczników markdown:
[
  {
    "name": "Imię postaci",
    "role": "Kim jest (np. Wiedźmin, Król Temerii, Czarodziejka)",
    "description": "Krótki 1-2 zdaniowy opis cech i motywacji postaci bez spoilerów",
    "faction": "Frakcja / Pochodzenie (np. Kaer Morhen, Nilfgaard, Temeria)",
    "relations": ["Relacja z inną postacią (np. Przyjaciel Jaskra)"],
    "importance": "main"
  }
]

Tekst do analizy:
${truncatedText}`;

    for (const m of ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash']) {
      try {
        const res = await Promise.race([
          ai.models.generateContent({
            model: m,
            contents: prompt,
            config: { responseMimeType: 'application/json' },
          }),
          new Promise<any>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
        ]);

        const raw = res.text?.trim() || '';
        const cleanJson = raw.replace(/^```json\s*|\s*```$/g, '').trim();
        const parsed = JSON.parse(cleanJson);
        const list = Array.isArray(parsed) ? parsed : parsed.characters || parsed.postacie;
        if (Array.isArray(list) && list.length > 0) {
          return list;
        }
      } catch (e: any) {
        // Continue to next model
      }
    }
  }

  // Fallback heuristic extraction
  const detected: BookCharacter[] = [];
  const words = truncatedText.match(/[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]{2,}/g) || [];
  const freq = new Map<string, number>();
  for (const w of words) {
    if (!['Rozdział', 'Książka', 'Wtedy', 'Jednak', 'Kiedy', 'Potem', 'Nagle', 'Jeśli', 'Dlatego'].includes(w)) {
      freq.set(w, (freq.get(w) || 0) + 1);
    }
  }

  const sortedNames = Array.from(freq.entries())
    .filter(([_, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  for (const [name, count] of sortedNames) {
    detected.push({
      name,
      role: count > 10 ? 'Główna postać' : 'Postać drugoplanowa',
      description: `Występuje ${count} razy w tekście książki.`,
      importance: count > 10 ? 'main' : 'supporting',
      relations: [],
    });
  }

  return detected;
}

export async function generateChapterRecap(
  bookTitle: string,
  chapterTitle: string,
  previousText: string
): Promise<string> {
  const truncatedText = previousText.slice(0, 10000);
  const prompt = `Jesteś lektorem i asystentem czytelnika. Stwórz krótkie, wciągające przypomnienie „Co wydarzyło się dotychczas” dla książki "${bookTitle}", przed rozpoczęciem rozdziału: "${chapterTitle}".
Napisz 2-3 zwięzłe, klimatyczne akapity po polsku, które pozwolą czytelnikowi natychmiast wrócić do świata powieści po przerwie. Nie zdradzaj żadnych spoilerów na temat nadchodzącego rozdziału!
Poprzednie wydarzenia:
${truncatedText}`;

  // 1. Try River AI
  if (RIVER_KEY && !quotaExhausted.river) {
    try {
      const resp = await fetch('https://api.river.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${RIVER_KEY}`,
        },
        body: JSON.stringify({
          model: 'deepseek-ai/DeepSeek-V4.1-Flash',
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: AbortSignal.timeout(12000),
      });
      if (resp.ok) {
        const data = await resp.json();
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text && text.length > 20) return text;
      }
    } catch (rErr: any) {
      console.warn('River AI recap notice:', rErr?.message || rErr);
    }
  }

  // 2. Try Gemini
  if (GEMINI_KEY && !quotaExhausted.gemini) {
    const ai = getGemini();
    for (const m of ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash']) {
      try {
        const res = await Promise.race([
          ai.models.generateContent({
            model: m,
            contents: prompt,
          }),
          new Promise<any>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
        ]);

        if (res.text && res.text.trim().length > 20) {
          return res.text.trim();
        }
      } catch (e: any) {
        // Continue
      }
    }
  }

  return `Wracasz do lektury książki „${bookTitle}”. W poprzednich fragmentach bohaterowie stanęli w obliczu kluczowych decyzji i wydarzeń kształtujących ich dalsze losy. Czas sprawdzić, co przyniesie „${chapterTitle}”!`;
}


