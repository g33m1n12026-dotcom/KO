import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
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
Twoim zadaniem jest przetłumaczenie fragmentu książki na piękny, naturalny i literacki język ${targetLang}.

ZASADY PRZEKŁADU:
1. Zachowaj oryginalny styl, ton, tempo i ładunek emocjonalny autora (np. ironię, dramatyzm, dowcip).
2. Unikaj dosłownych kalk językowych i sztywnych sformułowań. Tłumacz idiomy na ich naturalne polskie odpowiedniki kulturowe i frazeologiczne.
3. Dialogi formatuj zgodnie z polską typografią książkową: używaj myślników (pauzy '—' lub półpauzy '–') na początku wypowiedzi postaci, a nie cudzysłowów czy myślników maszynowych.
4. Zachowaj podział na akapity i strukturę tekstu.
5. Nie dodawaj od siebie żadnych komentarzy, wstępów typu "Oto tłumaczenie:", ani przypisów od tłumacza, chyba że są integralną częścią tekstu. Zwróć WYŁĄCZNIE przetłumaczony tekst.
${context ? `KONTEKST KSIĄŻKI / ROZDZIAŁU:\n${context}` : ''}`;
}

/**
 * Call Anthropic Claude API (Claude 3.5 Sonnet / Haiku)
 */
async function translateWithClaude(prompt: string, text: string): Promise<string> {
  if (!ANTHROPIC_KEY) throw new Error('Brak klucza Anthropic Claude API');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
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
  const models = ['gemini-3.1-flash-lite', 'gemini-2.5-flash'];
  let lastError = '';

  for (const model of models) {
    try {
      const response = await gemini.models.generateContent({
        model,
        contents: `${prompt}\n\nOto tekst do przetłumaczenia:\n\n${text}`,
        config: {
          temperature: 0.3,
        },
      });

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
 * Orchestrator: translates text using preferred engine, with automatic fallback
 * hierarchy (Gemini -> OpenRouter -> Claude -> OpenAI)
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
          return { text: translated.trim(), usedEngine: 'Google Gemini 3.1 Flash' };
        }
      } else if (eng === 'openrouter' && OPENROUTER_KEY) {
        const translated = await translateWithOpenRouter(systemPrompt, text);
        if (translated && translated.trim().length > 0) {
          return { text: translated.trim(), usedEngine: 'OpenRouter (DeepSeek / LLaMA)' };
        }
      } else if (eng === 'claude' && ANTHROPIC_KEY) {
        const translated = await translateWithClaude(systemPrompt, text);
        if (translated && translated.trim().length > 0) {
          return { text: translated.trim(), usedEngine: 'Claude 3.5 Sonnet' };
        }
      } else if (eng === 'openai' && OPENAI_KEY) {
        const translated = await translateWithOpenAI(systemPrompt, text);
        if (translated && translated.trim().length > 0) {
          return { text: translated.trim(), usedEngine: 'OpenAI GPT-4o-mini' };
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

  const prompt = `Jesteś genialnym doradcą literackim, erudycyjnym bibliotekarzem i ekspertem światowej literatury.
Użytkownik opisał, na jaką książkę ma dziś ochotę / co chciałby przeczytać:
"${userDescription.trim()}"

Twoje zadanie:
1. Zinterpretuj nastrój, motywy, tematykę, tempo i specyfikę tego opisu.
2. Zaproponuj od 4 do 6 rzeczywistych, istniejących, wybitnych książek (zarówno klasykę jak i współczesne pozycje, zagraniczne lub polskie), które idealnie trafiają w te oczekiwania.
3. Zwróć wynik w formacie czystego JSON (bez znaczników markdown \`\`\` ani dodatkowego tekstu):

{
  "analysis": "1-2 zdaniowe podsumowanie Twojego zrozumienia nastroju i motywów użytkownika w języku polskim",
  "recommendations": [
    {
      "title": "Oryginalny tytuł książki (np. Solaris, Neuromancer, The Shadow of the Wind)",
      "polishTitle": "Oficjalny polski tytuł (jeśli istnieje, np. Cień wiatru)",
      "author": "Imię i nazwisko autora",
      "year": "Rok pierwszego wydania",
      "genre": "Gatunek literacki (np. Sci-Fi / Cyberpunk, Thriller psychologiczny)",
      "matchReason": "1-2 zdania w języku polskim wyjaśniające, dlaczego ta książka to strzał w dziesiątkę pod kątem opisu użytkownika",
      "synopsis": "Krótki (2-3 zdania) nastrojowy zarys fabuły bez spoilerów po polsku",
      "originalLang": "Język oryginału (np. English, German, French, Polish, Japanese)",
      "searchQuery": "Precyzyjna fraza do wyszukania pliku w bazach (np. William Gibson Neuromancer)"
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
      return {
        id: `rec_${Date.now()}_${idx}`,
        title: r.title || 'Nieznany tytuł',
        polishTitle: r.polishTitle,
        author: r.author || 'Nieznany autor',
        year: r.year ? String(r.year) : undefined,
        genre: r.genre || 'Literatura',
        matchReason: r.matchReason || 'Idealnie koresponduje z Twoim opisem.',
        synopsis: r.synopsis || '',
        originalLang: r.originalLang || 'EN',
        searchQuery: q,
        mirrorLinks: generateMirrorSearchLinks(q),
      };
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

  return 'Nie udało się uzyskać odpowiedzi asystenta AI.';
}

