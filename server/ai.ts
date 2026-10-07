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
  preferredEngine?: 'auto' | 'claude' | 'openai' | 'openrouter' | 'gemini';
}

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';

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
};

export function getAvailableKeys() {
  return {
    openrouter: Boolean(OPENROUTER_KEY && OPENROUTER_KEY.startsWith('sk-')),
    openai: Boolean(OPENAI_KEY && OPENAI_KEY.startsWith('sk-')),
    claude: Boolean(ANTHROPIC_KEY && ANTHROPIC_KEY.startsWith('sk-ant-')),
    gemini: Boolean(GEMINI_KEY),
    quotaExhausted: { ...quotaExhausted },
  };
}

function getSortedEngines(preferred: 'auto' | 'claude' | 'openai' | 'openrouter' | 'gemini'): Array<'claude' | 'openai' | 'openrouter' | 'gemini'> {
  let base: Array<'claude' | 'openai' | 'openrouter' | 'gemini'> = [];
  if (preferred === 'gemini') base = ['gemini', 'openrouter', 'claude', 'openai'];
  else if (preferred === 'claude') base = ['claude', 'gemini', 'openrouter', 'openai'];
  else if (preferred === 'openai') base = ['openai', 'gemini', 'openrouter', 'claude'];
  else if (preferred === 'openrouter') base = ['openrouter', 'gemini', 'claude', 'openai'];
  else {
    // smart auto: prioritize available and healthy engines (Gemini & OpenRouter currently active)
    base = ['gemini', 'openrouter', 'claude', 'openai'];
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
 * Call Gemini API (gemini-3.1-flash-lite / gemini-2.5-flash)
 */
async function translateWithGemini(prompt: string, text: string): Promise<string> {
  if (!GEMINI_KEY) throw new Error('Brak klucza Gemini API');

  const gemini = getGemini();
  const models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.1-flash-lite'];
  let lastError = '';

  for (const model of models) {
    try {
      const callPromise = gemini.models.generateContent({
        model,
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
      console.warn(`Gemini (${model}) translate notice:`, lastError);
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
      if (eng === 'gemini' && GEMINI_KEY) {
        const translated = await translateWithGemini(systemPrompt, text);
        if (translated && translated.trim().length > 0) {
          return { text: postProcessPolishKindle(translated), usedEngine: 'Google Gemini 3.1 Flash' };
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

import { BookRecommendation } from '../src/types';
import { generateMirrorSearchLinks } from './mirrors';

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

  // Attempt using prioritized healthy models
  const engines = getSortedEngines(preferredEngine);

  for (const eng of engines) {
    try {
      if (eng === 'gemini' && GEMINI_KEY) {
        const gemini = getGemini();
        const models = ['gemini-3.1-flash-lite', 'gemini-2.5-flash'];
        for (const m of models) {
          try {
            const resp = await gemini.models.generateContent({
              model: m,
              contents: `${prompt}\n\nPamiętaj: zwróć WYŁĄCZNIE poprawny JSON!`,
              config: {
                temperature: 0.4,
                responseMimeType: 'application/json',
              },
            });
            const text = resp.text?.trim();
            if (text) {
              rawJson = text;
              break;
            }
          } catch (gErr: any) {
            console.warn(`Gemini (${m}) doradca notice:`, gErr?.message || gErr);
          }
        }
        if (rawJson) break;
      } else if (eng === 'openrouter' && OPENROUTER_KEY) {
        const orModels = ['deepseek/deepseek-chat', 'meta-llama/llama-3.3-70b-instruct:free', 'openrouter/auto'];
        for (const m of orModels) {
          try {
            const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${OPENROUTER_KEY}`,
                'HTTP-Referer': 'https://koreader-cloud.local',
                'X-Title': 'KOReader Cloud Book Bridge',
              },
              body: JSON.stringify({
                model: m,
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
    throw new Error('Nie udało się wygenerować rekomendacji książkowych przez AI.');
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
    console.error('Błąd parsowania odpowiedzi rekomendacji AI:', err, rawJson);
    throw new Error('Błąd przetwarzania struktury rekomendacji.');
  }
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
      if (eng === 'gemini' && GEMINI_KEY) {
        const ai = getGemini();
        for (const model of ['gemini-3.1-flash-lite', 'gemini-2.5-flash']) {
          try {
            const response = await ai.models.generateContent({
              model,
              contents: userPrompt,
            });
            if (response.text) return response.text.trim();
          } catch (e) {
            // try next model
          }
        }
      } else if (eng === 'openrouter' && OPENROUTER_KEY) {
        const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${OPENROUTER_KEY}`,
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
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

