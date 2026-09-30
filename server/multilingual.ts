import { MultilingualBookMeta } from '../src/types';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

// In-memory cache for fast multilingual lookups
const titleCache = new Map<string, MultilingualBookMeta>();

const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || '';

let geminiClient: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI | null {
  if (!GEMINI_KEY) return null;
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey: GEMINI_KEY });
  }
  return geminiClient;
}

/**
 * Uses Gemini (with OpenRouter fallback) to resolve authentic, published international
 * book titles that are frequently not literal 1:1 translations (e.g. "Do Androids Dream..." ->
 * "Мечтают ли андроиды об электроовцах?", "仿生人会梦见电子羊吗", "Träumen Androiden...",
 * "The Catcher in the Rye" -> "Buszujący w zbożu", "Над пропастью во ржи", "麦田里的守望者", etc.).
 */
async function resolveTitlesWithAI(query: string): Promise<{
  canonicalTitle?: string;
  canonicalAuthor?: string;
  titles: Record<string, string>;
  searchVariants: string[];
}> {
  const result: {
    canonicalTitle?: string;
    canonicalAuthor?: string;
    titles: Record<string, string>;
    searchVariants: string[];
  } = {
    titles: {},
    searchVariants: [],
  };

  const prompt = `Jesteś wybitnym bibliografem i ekspertem światowego rynku wydawniczego.
Dla podanego zapytania użytkownika (tytuł książki, autor lub fraza) zidentyfikuj dzieło literackie.
Podaj autentyczne, oficjalnie opublikowane tytuły tego dzieła w różnych krajach i językach.
Pamiętaj, że tytuły książek za granicą często NIE są tłumaczone 1 do 1, lecz mają specyficzne oficjalne tytuły wydawnicze (np. 'The Catcher in the Rye' -> 'Buszujący w zbożu' [PL], 'Над пропастью во ржи' [RU], '麦田里的守望者' [ZH], 'Der Fänger im Roggen' [DE]; 'Do Androids Dream of Electric Sheep?' -> 'Czy androidy śnią o elektrycznych owcach?' [PL], 'Мечтают ли андроиды об электроовцах?' [RU], '仿生人会梦见电子羊吗' [ZH], 'Träumen Androiden von elektrischen Schafen?' [DE]).

Zapytanie: "${query}"

Zwróć WYŁĄCZNIE poprawny, surowy obiekt JSON (bez markdown, bez znaczników \`\`\`json):
{
  "canonicalTitle": "Główny tytuł w języku oryginału",
  "canonicalAuthor": "Imię i nazwisko autora",
  "titles": {
    "pl": "Oficjalny polski tytuł wydania",
    "en": "Oficjalny angielski tytuł wydania",
    "de": "Oficjalny niemiecki tytuł wydania",
    "ru": "Oficjalny rosyjski tytuł wydania (cyrylica)",
    "zh": "Oficjalny chiński tytuł wydania (uproszczony)",
    "fr": "Oficjalny francuski tytuł wydania",
    "es": "Oficjalny hiszpański tytuł wydania"
  },
  "searchVariants": ["fraza 1", "fraza 2"]
}`;

  // 1. Try Gemini
  const gemini = getGemini();
  if (gemini) {
    for (const model of ['gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-2.5-flash']) {
      try {
        const resp = await gemini.models.generateContent({
          model,
          contents: prompt,
        });
        const rawText = resp.text?.trim() || '';
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.canonicalTitle) result.canonicalTitle = parsed.canonicalTitle;
          if (parsed.canonicalAuthor) result.canonicalAuthor = parsed.canonicalAuthor;
          if (parsed.titles && typeof parsed.titles === 'object') {
            for (const [k, v] of Object.entries(parsed.titles)) {
              if (typeof v === 'string' && v.trim().length > 1) {
                result.titles[k.toLowerCase()] = v.trim();
              }
            }
          }
          if (Array.isArray(parsed.searchVariants)) {
            result.searchVariants = parsed.searchVariants.filter((s: any) => typeof s === 'string' && s.length > 2);
          }
          return result;
        }
      } catch (err: any) {
        // try next model
      }
    }
  }

  // 2. Fallback to OpenRouter if Gemini failed or key missing
  if (OPENROUTER_KEY) {
    try {
      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENROUTER_KEY}`,
          'HTTP-Referer': 'https://koreader-cloud.local',
          'X-Title': 'KOReader Multilingual Resolver',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        const rawText = data.choices?.[0]?.message?.content || '';
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.canonicalTitle) result.canonicalTitle = parsed.canonicalTitle;
          if (parsed.canonicalAuthor) result.canonicalAuthor = parsed.canonicalAuthor;
          if (parsed.titles && typeof parsed.titles === 'object') {
            for (const [k, v] of Object.entries(parsed.titles)) {
              if (typeof v === 'string' && v.trim().length > 1) {
                result.titles[k.toLowerCase()] = v.trim();
              }
            }
          }
          return result;
        }
      }
    } catch {}
  }

  return result;
}

/**
 * Resolves official published multilingual titles and author information for a book.
 * First checks Wikidata knowledge graph for authoritative literary titles,
 * then augments with Gemini AI for comprehensive cross-lingual real-world titles
 * (English, Polish, German, Russian, Chinese, French, Spanish).
 */
export async function resolveMultilingualBook(query: string): Promise<MultilingualBookMeta> {
  const cleanQ = query.trim().replace(/^["']+|["']+$/g, '');
  const cacheKey = cleanQ.toLowerCase();
  if (titleCache.has(cacheKey)) {
    return titleCache.get(cacheKey)!;
  }

  const result: MultilingualBookMeta = {
    originalQuery: cleanQ,
    detectedTitle: undefined,
    canonicalAuthor: undefined,
    titles: {},
    searchVariants: [cleanQ],
  };

  // 1. Query Wikidata multilingual knowledge graph
  try {
    const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(cleanQ)}&language=pl&format=json&limit=5`;
    const resp = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'KOReaderAICloud/1.0 (Ebook Translation and Companion; contact@koreader.cloud)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(3200),
    });

    if (resp.ok) {
      const sData = await resp.json();
      const items: Array<{ id: string; label: string; description?: string }> = sData.search || [];

      // Find best literary work match
      const literaryMatch = items.find((item) => {
        const desc = (item.description || '').toLowerCase();
        return (
          desc.includes('novel') ||
          desc.includes('book') ||
          desc.includes('powieść') ||
          desc.includes('książka') ||
          desc.includes('literary') ||
          desc.includes('work') ||
          desc.includes('opowiadanie') ||
          desc.includes('science fiction') ||
          desc.includes('fantasy') ||
          desc.includes('author') ||
          desc.includes('writer')
        );
      }) || items[0];

      if (literaryMatch) {
        const entityUrl = `https://www.wikidata.org/wiki/Special:EntityData/${literaryMatch.id}.json`;
        const eResp = await fetch(entityUrl, {
          headers: {
            'User-Agent': 'KOReaderAICloud/1.0',
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(3200),
        });

        if (eResp.ok) {
          const eData = await eResp.json();
          const entity = eData.entities?.[literaryMatch.id];
          if (entity && entity.labels) {
            result.detectedTitle =
              entity.labels.en?.value ||
              entity.labels.pl?.value ||
              literaryMatch.label;

            const targetLangs = ['en', 'pl', 'ru', 'de', 'fr', 'es', 'zh', 'it', 'uk'];
            for (const lang of targetLangs) {
              const val = entity.labels[lang]?.value;
              if (val) {
                result.titles[lang] = val;
              }
            }

            // Extract author if available from statements (P50 is author in Wikidata)
            if (entity.claims?.P50?.[0]?.mainsnak?.datavalue?.value?.id) {
              const authorId = entity.claims.P50[0].mainsnak.datavalue.value.id;
              try {
                const aResp = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${authorId}.json`, {
                  headers: { 'User-Agent': 'KOReaderAICloud/1.0' },
                  signal: AbortSignal.timeout(2200),
                });
                if (aResp.ok) {
                  const aData = await aResp.json();
                  const authorEntity = aData.entities?.[authorId];
                  if (authorEntity?.labels) {
                    result.canonicalAuthor =
                      authorEntity.labels.en?.value ||
                      authorEntity.labels.pl?.value;
                  }
                }
              } catch {}
            }

            // Include aliases (e.g. "Blade Runner" for "Do Androids Dream...")
            if (Array.isArray(entity.aliases?.en)) {
              for (const a of entity.aliases.en) {
                if (a.value && !result.searchVariants.includes(a.value)) {
                  result.searchVariants.push(a.value);
                }
              }
            }
          }
        }
      }
    }
  } catch (err: any) {
    // Wikidata timeout/fallback
  }

  // 2. If Wikidata didn't find the work OR key language editions (e.g. de, ru, zh, en) are incomplete:
  // Augment with Gemini AI Literary Title Resolution!
  const hasKeyLangs = Boolean(result.titles.en && (result.titles.de || result.titles.ru || result.titles.zh));
  if (!result.detectedTitle || !hasKeyLangs) {
    try {
      const aiData = await resolveTitlesWithAI(cleanQ);
      if (aiData.canonicalTitle && !result.detectedTitle) {
        result.detectedTitle = aiData.canonicalTitle;
      }
      if (aiData.canonicalAuthor && !result.canonicalAuthor) {
        result.canonicalAuthor = aiData.canonicalAuthor;
      }
      for (const [lang, title] of Object.entries(aiData.titles)) {
        if (!result.titles[lang]) {
          result.titles[lang] = title;
        }
      }
      for (const v of aiData.searchVariants) {
        if (!result.searchVariants.includes(v)) {
          result.searchVariants.push(v);
        }
      }
    } catch (err: any) {
      console.warn('AI multilingual resolver notice:', err?.message || err);
    }
  }

  // 3. Open Library fallback if still missing title
  if (!result.detectedTitle && cleanQ.length >= 3) {
    try {
      const olUrl = `https://openlibrary.org/search.json?q=${encodeURIComponent(cleanQ)}&limit=2`;
      const olResp = await fetch(olUrl, { signal: AbortSignal.timeout(2800) });
      if (olResp.ok) {
        const olData = await olResp.json();
        const doc = olData.docs?.[0];
        if (doc && doc.title) {
          result.detectedTitle = doc.title;
          result.canonicalAuthor = (doc.author_name || [])[0];
          result.titles.en = doc.title;
        }
      }
    } catch {}
  }

  // 4. Build comprehensive search variants for international mirrors
  if (result.titles.en) result.searchVariants.push(result.titles.en);
  if (result.titles.pl && result.titles.pl !== cleanQ) result.searchVariants.push(result.titles.pl);
  if (result.titles.de) result.searchVariants.push(result.titles.de);
  if (result.titles.ru) result.searchVariants.push(result.titles.ru);
  if (result.titles.zh) result.searchVariants.push(result.titles.zh);

  // Add author combinations
  if (result.canonicalAuthor) {
    if (result.titles.en) result.searchVariants.push(`${result.canonicalAuthor} ${result.titles.en}`);
    if (result.titles.pl) result.searchVariants.push(`${result.canonicalAuthor} ${result.titles.pl}`);
    if (result.titles.de) result.searchVariants.push(`${result.canonicalAuthor} ${result.titles.de}`);
  }

  // Deduplicate and sanitize
  result.searchVariants = Array.from(
    new Set(
      result.searchVariants
        .map((v) => v.trim())
        .filter((v) => v.length > 2)
    )
  );

  titleCache.set(cacheKey, result);
  return result;
}
