import { BookSearchResult, MultilingualBookMeta } from '../src/types';
import { generateMirrorSearchLinks } from './mirrors';
import { resolveMultilingualBook } from './multilingual';
import { loadSettings } from './settings';
import { searchChomikujBooks } from './chomikuj';

/**
 * Normalizes language string or detects from text
 */
export function normalizeLanguageCode(raw: string, title?: string): string {
  const l = (raw || '').toLowerCase().trim();
  if (l.includes('pol') || l === 'pl' || l.includes('polski')) return 'PL';
  if (l.includes('eng') || l === 'en' || l.includes('angielski')) return 'EN';
  if (l.includes('ger') || l.includes('deu') || l === 'de' || l.includes('deutsch') || l.includes('niem')) return 'DE';
  if (l.includes('rus') || l === 'ru' || l.includes('rosyj')) return 'RU';
  if (l.includes('chi') || l.includes('zho') || l === 'zh' || l.includes('chiń')) return 'ZH';
  if (l.includes('fre') || l.includes('fra') || l === 'fr' || l.includes('franc')) return 'FR';
  if (l.includes('spa') || l.includes('esp') || l === 'es' || l.includes('hiszp')) return 'ES';
  if (l.includes('ita') || l === 'it' || l.includes('włos')) return 'IT';
  if (l.includes('ukr') || l === 'uk' || l.includes('ukraiń')) return 'UK';

  // Heuristic based on characters in title:
  if (title) {
    if (/[\u0400-\u04FF]/.test(title)) return 'RU'; // Cyrillic
    if (/[\u4E00-\u9FFF]/.test(title)) return 'ZH'; // Chinese CJK
    if (/[ąćęłńóśźż]/i.test(title)) return 'PL';
    if (/[äöüß]/i.test(title)) return 'DE';
  }
  return raw ? raw.toUpperCase().slice(0, 4) : 'EN';
}

/**
 * Searches for books via Gutendex (Project Gutenberg API), OpenLibrary,
 * and attaches deep links to shadow libraries (Anna's Archive, Z-Library, LibGen, Sci-Hub, Liber3).
 * Automatically resolves multilingual editions and author names across languages.
 */
export async function searchOnlineBooks(query: string): Promise<BookSearchResult[] & { multilingual?: MultilingualBookMeta }> {
  if (!query || !query.trim()) {
    const empty: any = [];
    return empty;
  }
  const trimmed = query.trim();

  // Direct URL support (e.g. Chomikuj file page link, direct EPUB/PDF/ZIP download URL)
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsedUrl = new URL(trimmed);
      let title = decodeURIComponent(parsedUrl.pathname.split('/').pop() || 'Pobrany plik');
      title = title.replace(/,\d+\.[a-zA-Z0-9]+(\([^)]*\))?$/i, '').replace(/[_+.-]+/g, ' ').trim();
      const extMatch = trimmed.match(/\.(epub|mobi|pdf|zip|cbz|txt|docx?)(\([^)]*\))?$/i);
      const format = extMatch ? extMatch[1].toUpperCase() : 'EPUB';
      const isChomik = parsedUrl.hostname.includes('chomikuj.pl');

      const directResult: BookSearchResult = {
        id: `url_${Date.now()}`,
        title: title || 'Plik ze wskazanego linku',
        author: isChomik ? 'Chomikuj.pl' : parsedUrl.hostname,
        language: /[ąćęłńóśźż]/i.test(title) ? 'PL' : 'EN',
        format,
        source: isChomik ? '🐹 Chomikuj.pl' : `🌐 ${parsedUrl.hostname}`,
        downloadUrl: trimmed,
        description: `Wskazano bezpośredni link: ${trimmed}`,
      };

      const out: any = [directResult];
      out.multilingual = null;
      return out;
    } catch (e) {
      console.warn('Błąd parsowania bezpośredniego URL:', e);
    }
  }

  const results: any = [];
  const cleanQ = encodeURIComponent(trimmed);
  const mirrorLinks = generateMirrorSearchLinks(trimmed);

  // 0. Resolve international multilingual aliases and author (e.g. Polish, English, German, Russian, Chinese)
  const multiMeta = await resolveMultilingualBook(query.trim());
  results.multilingual = multiMeta;

  // Build high-value queries across all official localized editions
  const queriesToRun: string[] = [cleanQ];
  const candidateQueries = [
    multiMeta.titles.en,
    multiMeta.titles.de,
    multiMeta.titles.ru,
    multiMeta.titles.zh,
    multiMeta.titles.pl,
  ].filter(Boolean) as string[];

  for (const cand of candidateQueries) {
    const enc = encodeURIComponent(cand.trim());
    if (enc && !queriesToRun.includes(enc) && queriesToRun.length < 6) {
      queriesToRun.push(enc);
    }
  }

  if (multiMeta.canonicalAuthor && multiMeta.titles.en && queriesToRun.length < 7) {
    const authAndTitle = encodeURIComponent(`${multiMeta.canonicalAuthor} ${multiMeta.titles.en}`.trim());
    if (!queriesToRun.includes(authAndTitle)) {
      queriesToRun.push(authAndTitle);
    }
  }

  const englishQuery = multiMeta.titles.en ? encodeURIComponent(multiMeta.titles.en) : null;
  const polishQuery = multiMeta.titles.pl ? multiMeta.titles.pl : query.trim();

  // Run WolneLektury, OpenLibrary, Gutenberg, LibGen, Archive.org, Z-Library, and Chomikuj.pl concurrently
  const [wolneLekturyItems, olDocs, gutenbergItems, libgenItems, archiveDocs, zlibItems, chomikujItems] = await Promise.all([
    // 0. Wolne Lektury (Polish Free Books Repository with direct EPUB/PDF)
    (async () => {
      try {
        const wlResp = await fetch(`https://wolnelektury.pl/api/books/`, {
          signal: AbortSignal.timeout(3500),
          headers: {
            'User-Agent': 'KOReader-AI-Book-Cloud/1.0',
            Accept: 'application/json',
          },
        });
        if (wlResp.ok) {
          const wlData = await wlResp.json();
          if (!Array.isArray(wlData)) return [];
          const stopWords = new Set(['czy', 'dla', 'lub', 'albo', 'pod', 'nad', 'przed', 'oraz', 'jako', 'jest', 'ona', 'ono', 'oni', 'jego', 'jej', 'ich', 'tym', 'ten', 'tam', 'sie', 'się', 'nie', 'tak', 'gdy', 'jak', 'oraz', 'the', 'and', 'for']);
          const genericWords = new Set(['przygody', 'historia', 'opowieści', 'opowiadania', 'książka', 'księga', 'dzieła', 'wybór', 'tom', 'wydanie', 'adventures', 'story', 'tales']);

          const allQueryWords = `${query} ${polishQuery}`
            .toLowerCase()
            .replace(/[^a-ząćęłńóśźż0-9]/gi, ' ')
            .split(/\s+/)
            .filter((w) => w.length >= 3 && !stopWords.has(w));

          const distinctiveQueryWords = allQueryWords.filter((w) => !genericWords.has(w));
          if (distinctiveQueryWords.length === 0 && allQueryWords.length === 0) return [];

          return wlData
            .filter((item: any) => {
              const haystack = `${item.title || ''} ${item.author || ''} ${item.slug || ''}`
                .toLowerCase()
                .replace(/[^a-ząćęłńóśźż0-9]/gi, ' ');
              const haystackWords = new Set(haystack.split(/\s+/));

              // If there are distinctive words (e.g. "kajtkowe"), they MUST match!
              if (distinctiveQueryWords.length > 0) {
                return distinctiveQueryWords.some((w) => haystackWords.has(w) || haystack.includes(w));
              }
              // If only generic words, require all
              return allQueryWords.every((w) => haystackWords.has(w));
            })
            .slice(0, 6);
        }
      } catch (err: any) {
        if (err?.name !== 'TimeoutError' && err?.name !== 'AbortError') {
          console.warn('WolneLektury search notice:', err?.message || err);
        }
      }
      return [];
    })(),

    // 1. OpenLibrary Search
    (async () => {
      try {
        const olTarget = englishQuery || cleanQ;
        const olResp = await fetch(`https://openlibrary.org/search.json?q=${olTarget}&limit=8`, {
          signal: AbortSignal.timeout(4500),
          headers: {
            'User-Agent': 'KOReader-AI-Book-Cloud/1.0',
            Accept: 'application/json',
          },
        });
        if (olResp.ok) {
          const olData = await olResp.json();
          return Array.isArray(olData.docs) ? olData.docs : [];
        }
      } catch (err: any) {
        if (err?.name !== 'TimeoutError' && err?.name !== 'AbortError') {
          console.warn('OpenLibrary search notice:', err?.message || err);
        }
      }
      return [];
    })(),

    // 2. Gutendex (Project Gutenberg)
    (async () => {
      try {
        const gtTarget = englishQuery || cleanQ;
        const resp = await fetch(`https://gutendex.com/books?search=${gtTarget}`, {
          signal: AbortSignal.timeout(2800),
          headers: {
            'User-Agent': 'KOReader-AI-Book-Cloud/1.0',
            Accept: 'application/json',
          },
        });
        if (resp.ok) {
          const data = await resp.json();
          return Array.isArray(data.results) ? data.results : [];
        }
      } catch (err: any) {
        if (err?.name !== 'TimeoutError' && err?.name !== 'AbortError') {
          console.warn('Gutendex search notice:', err?.message || err);
        }
      }
      return [];
    })(),

    // 3. Multi-Mirror LibGen & Shadow Libraries Search (scrapes active mirrors across all multilingual editions)
    (async () => {
      const mirrors = ['https://libgen.li', 'https://libgen.la'];
      const allParsed: Array<{
        id: string;
        title: string;
        author: string;
        year?: string;
        language: string;
        size?: string;
        format: string;
        adsUrl: string;
        mirrorDomain: string;
      }> = [];

      // Concurrently query multilingual variations across mirrors
      await Promise.allSettled(
        queriesToRun.slice(0, 5).map(async (qStr) => {
          for (const mirror of mirrors) {
            if (allParsed.length >= 35) break;
            try {
              const libgenUrl = `${mirror}/index.php?req=${qStr}&columns[]=t&columns[]=a&objects[]=f&topics[]=l&res=12`;
              const resp = await fetch(libgenUrl, {
                signal: AbortSignal.timeout(2600),
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  Accept: 'text/html,application/xhtml+xml',
                },
              });
              if (resp.ok) {
                const html = await resp.text();
                const trs = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];

                for (let i = 2; i < trs.length && allParsed.length < 35; i++) {
                  const row = trs[i][1];
                  const adsMatch = row.match(/href=[\"'](\/?ads\.php\?md5=[a-f0-9]+)[\"']/i);
                  if (!adsMatch) continue;

                  const tdMatches = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1]);
                  if (tdMatches.length < 7) continue;

                  // Clean cell of attributes containing '<' or '>' (such as tooltips like title="...<br>...")
                  const cellClean = tdMatches[0].replace(/title=(["']).*?\1/gi, '');
                  const editionMatch = cellClean.match(/<a[^>]*href=["'][^"']*edition\.php[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
                  const anyAMatch = cellClean.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
                  const bMatch = cellClean.match(/<b>([\s\S]*?)<\/b>/i);

                  let title = 'Bez tytułu';
                  if (editionMatch && editionMatch[1].replace(/<[^>]+>/g, '').trim()) {
                    title = editionMatch[1].replace(/<[^>]+>/g, '').trim();
                  } else if (anyAMatch && anyAMatch[1].replace(/<[^>]+>/g, '').trim()) {
                    title = anyAMatch[1].replace(/<[^>]+>/g, '').trim();
                  } else if (bMatch && bMatch[1].replace(/<[^>]+>/g, '').trim()) {
                    title = bMatch[1].replace(/<[^>]+>/g, '').trim();
                  } else {
                    title = tdMatches[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
                  }

                  title = title
                    .replace(/["']\s+href=[\s\S]*/gi, '')
                    .replace(/<[^>]+>/g, '')
                    .replace(/^["'\s]+|["'\s]+$/g, '')
                    .replace(/&[a-z0-9#]+;/gi, ' ')
                    .trim();

                  const author = tdMatches[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || 'Nieznany autor';
                  const year = tdMatches[3]?.replace(/<[^>]+>/g, ' ').trim() || undefined;
                  const rawLang = tdMatches[4]?.replace(/<[^>]+>/g, ' ').trim() || '';
                  const language = normalizeLanguageCode(rawLang, title);
                  const size = tdMatches[6]?.replace(/<[^>]+>/g, ' ').trim() || '';
                  const format = (tdMatches[7]?.replace(/<[^>]+>/g, ' ').trim() || 'EPUB').toUpperCase();
                  const adsUrl = adsMatch[1].startsWith('/') ? `${mirror}${adsMatch[1]}` : `${mirror}/${adsMatch[1]}`;

                  const itemId = `shadow_${adsMatch[1].replace(/[^a-zA-Z0-9]/g, '_')}`;
                  if (!allParsed.some((p) => p.id === itemId)) {
                    allParsed.push({
                      id: itemId,
                      title,
                      author,
                      year,
                      language,
                      size,
                      format,
                      adsUrl,
                      mirrorDomain: mirror.replace('https://', ''),
                    });
                  }
                }
                break; // One working mirror response per query is sufficient
              }
            } catch (err: any) {
              // try next mirror
            }
          }
        })
      );
      return allParsed;
    })(),

    // 4. Internet Archive Books Search (Direct Public Ebooks & Texts across query and international titles)
    (async () => {
      try {
        const iaQueries = queriesToRun.slice(0, 4);
        const allDocs: any[] = [];
        await Promise.allSettled(
          iaQueries.map(async (qStr) => {
            try {
              const iaUrl = `https://archive.org/advancedsearch.php?q=${qStr}+AND+mediatype:(texts)&fl[]=identifier,title,creator,year,language,format,access-restricted-item&rows=10&output=json`;
              const resp = await fetch(iaUrl, {
                signal: AbortSignal.timeout(3800),
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', Accept: 'application/json' },
              });
              if (resp.ok) {
                const data = await resp.json();
                const docs = Array.isArray(data.response?.docs) ? data.response.docs : [];
                for (const doc of docs) {
                  if (doc.identifier && !allDocs.some((d) => d.identifier === doc.identifier)) {
                    allDocs.push(doc);
                  }
                }
              }
            } catch {}
          })
        );
        return allDocs;
      } catch (err: any) {
        if (err?.name !== 'TimeoutError' && err?.name !== 'AbortError') {
          console.warn('Archive.org search notice:', err?.message || err);
        }
      }
      return [];
    })(),

    // 5. Z-Library Direct Search using Authenticated Account
    (async () => {
      try {
        const settings = loadSettings();
        const userId = settings.zlibrary?.userId;
        const userKey = settings.zlibrary?.userKey;
        if (!userId || !userKey) return [];

        const domains = ['https://singlelogin.rs', 'https://singlelogin.re', 'https://z-library.sk'];
        const allBooks: any[] = [];
        const seenIds = new Set<string>();

        // Query main query plus multilingual candidate queries
        const zQueries = queriesToRun.slice(0, 3).map((q) => decodeURIComponent(q));

        await Promise.allSettled(
          zQueries.map(async (searchMsg) => {
            for (const domain of domains) {
              try {
                const resp = await fetch(`${domain}/eapi/book/search`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Cookie': `remix_userid=${userId}; remix_userkey=${userKey}`,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                  },
                  body: new URLSearchParams({
                    message: searchMsg,
                    limit: '10',
                  }).toString(),
                  signal: AbortSignal.timeout(3800),
                });

                if (resp.ok) {
                  const data = await resp.json();
                  if (Array.isArray(data.books)) {
                    for (const b of data.books) {
                      const bId = String(b.id);
                      if (!seenIds.has(bId)) {
                        seenIds.add(bId);
                        allBooks.push(b);
                      }
                    }
                  }
                  break;
                }
              } catch {}
            }
          })
        );
        return allBooks;
      } catch (err: any) {
        return [];
      }
    })(),

    // 6. Chomikuj.pl (Polish user-shared ebooks, school readings, documents)
    (async () => {
      try {
        const qToSearch = polishQuery || query.trim();
        return await searchChomikujBooks(qToSearch);
      } catch {
        return [];
      }
    })(),
  ]);

  // Process Chomikuj.pl results
  if (Array.isArray(chomikujItems)) {
    for (const item of chomikujItems) {
      results.push(item);
    }
  }

  // Process Wolne Lektury results (direct Polish library with EPUB/PDF)
  for (const item of wolneLekturyItems) {
    const specificQ = `${item.author} ${item.title}`;
    const directUrl = item.epub || (item.slug ? `https://wolnelektury.pl/media/book/epub/${item.slug}.epub` : undefined);
    results.push({
      id: `wl_${item.slug || Math.random().toString(36).slice(2)}`,
      title: item.title,
      author: item.author || 'Wolne Lektury',
      language: 'PL',
      format: 'EPUB',
      source: 'Wolne Lektury (Polska Biblioteka)',
      description: `Polska biblioteka cyfrowa: gotowa klasyka w języku polskim.`,
      downloadUrl: directUrl,
      mirrorLinks: generateMirrorSearchLinks(specificQ),
    });
  }

  // Process Shadow Library & LibGen results
  for (const item of libgenItems) {
    const specificQ = `${item.author} ${item.title}`;
    const domain = (item as any).mirrorDomain || 'libgen.li';
    results.push({
      id: item.id,
      title: item.title,
      author: item.author,
      year: item.year,
      language: item.language,
      format: item.format,
      source: `LibGen / Shadow Mirror (${domain})`,
      description: `Pobieranie z bazy mirrorów Shadow Libraries (${domain}). Język: ${item.language}, Rozmiar: ${item.size || 'b.d.'}, Format: ${item.format}`,
      downloadUrl: item.adsUrl,
      mirrorLinks: generateMirrorSearchLinks(specificQ),
    });
  }

  // Process Internet Archive results
  for (const doc of archiveDocs) {
    const authors = Array.isArray(doc.creator) ? doc.creator.join(', ') : doc.creator || 'Nieznany';
    const specificQ = `${authors} ${doc.title}`;
    const id = doc.identifier;
    const rawLang = Array.isArray(doc.language) ? doc.language[0] : (doc.language || '');
    const lang = normalizeLanguageCode(rawLang, doc.title);
    results.push({
      id: `ia_${id}`,
      title: doc.title,
      author: authors,
      year: doc.year ? String(doc.year) : undefined,
      language: lang,
      format: 'EPUB / PDF',
      source: 'Internet Archive',
      description: `Repozytorium cyfrowe Archive.org (ID: ${id})`,
      downloadUrl: `https://archive.org/details/${id}`,
      mirrorLinks: generateMirrorSearchLinks(specificQ),
    });
  }

  // Process Gutenberg results (direct public domain downloads)
  for (const item of gutenbergItems.slice(0, 10)) {
    const authors = (item.authors || []).map((a: any) => a.name).join(', ') || 'Nieznany';
    const formats = item.formats || {};

    const textUrl =
      formats['text/plain; charset=utf-8'] ||
      formats['text/plain'] ||
      formats['application/epub+zip'] ||
      formats['text/html'];

    let fmt = 'TXT';
    if (formats['application/epub+zip']) fmt = 'EPUB';
    else if (formats['application/pdf']) fmt = 'PDF';

    const lang = normalizeLanguageCode(item.languages?.[0] || 'en', item.title);

    results.push({
      id: `gutenberg_${item.id}`,
      title: item.title,
      author: authors,
      language: lang,
      downloadUrl: textUrl,
      format: fmt,
      source: 'Project Gutenberg',
      description: item.subjects?.slice(0, 3)?.join(' • ') || 'Darmowa klasyka literatury',
      mirrorLinks: generateMirrorSearchLinks(`${authors} ${item.title}`),
    });
  }

  // Process OpenLibrary results (metadata and verified public records)
  for (const doc of olDocs.slice(0, 8)) {
    const authors = (doc.author_name || []).join(', ') || 'Nieznany';
    const specificQ = `${authors} ${doc.title}`;
    const dlUrl = (doc.has_fulltext && doc.ia?.[0] && !doc.ia[0].includes('borrow') && !doc.ia[0].includes('lend'))
      ? `https://archive.org/details/${doc.ia[0]}`
      : undefined;

    const lang = normalizeLanguageCode(doc.language?.[0] || 'en', doc.title);

    results.push({
      id: `ol_${doc.key?.replace(/\//g, '_') || Math.random().toString(36).substring(2)}`,
      title: doc.title,
      author: authors,
      year: doc.first_publish_year ? String(doc.first_publish_year) : undefined,
      language: lang,
      format: dlUrl ? 'EPUB / PDF' : 'METADATA',
      source: 'Open Library',
      description: `Wydano: ${doc.first_publish_year || 'b.d.'}. Wydawca: ${(doc.publisher || []).slice(0, 2).join(', ') || 'Różni'}`,
      downloadUrl: dlUrl,
      mirrorLinks: generateMirrorSearchLinks(specificQ),
    });
  }

  // Process Z-Library results (authenticated user account with instant CDN download)
  for (const item of (zlibItems || [])) {
    const specificQ = `${item.author} ${item.title}`;
    const rawLang = item.language || '';
    const lang = normalizeLanguageCode(rawLang, item.title);
    results.push({
      id: `zlib_${item.id}`,
      title: item.title,
      author: item.author || 'Nieznany autor',
      year: item.year ? String(item.year) : undefined,
      language: lang,
      format: (item.extension || 'EPUB').toUpperCase(),
      source: 'Z-Library (Konto Aktywne)',
      description: `Baza Z-Library (${item.filesizeString || 'b.d.'}). Bezpośrednie pobieranie z Twojego konta.`,
      downloadUrl: `zlib://${item.id}/${item.hash || ''}`,
      coverUrl: item.cover,
      mirrorLinks: generateMirrorSearchLinks(specificQ),
    });
  }

  // Cross-reference sources for the SAME book only (strict author & distinctive title check)
  const genericTitleWords = new Set([
    'przygody', 'historia', 'opowieści', 'opowiadania', 'książka', 'księga',
    'dzieła', 'wybór', 'tom', 'wydanie', 'część', 'adventures', 'tales',
    'story', 'stories', 'book', 'volume', 'edition', 'works', 'selected'
  ]);

  const getDistinctiveWords = (str: string) =>
    str
      .toLowerCase()
      .replace(/[^a-ząćęłńóśźż0-9]/gi, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !genericTitleWords.has(w));

  const extractAuthorSurname = (authorStr: string) => {
    const clean = (authorStr || '').toLowerCase().replace(/[^a-ząćęłńóśźż]/gi, ' ').trim();
    const parts = clean.split(/\s+/).filter((p) => p.length >= 3);
    return parts.length > 0 ? parts[parts.length - 1] : '';
  };

  const knownTitles = Object.values(multiMeta.titles || {}).map((t) => t.toLowerCase());

  for (const item of results) {
    const itemDistinctive = getDistinctiveWords(item.title);
    const itemSurname = extractAuthorSurname(item.author);

    const matched = results.filter((other: any) => {
      if (other.id === item.id) return true;

      // 1. Author conflict check: if both items have known authors, surnames must not conflict!
      const otherSurname = extractAuthorSurname(other.author);
      if (
        itemSurname &&
        otherSurname &&
        itemSurname !== 'autor' &&
        otherSurname !== 'autor' &&
        !itemSurname.includes(otherSurname) &&
        !otherSurname.includes(itemSurname)
      ) {
        return false; // Different authors (e.g. Kownacka vs Hašek vs Gintowt)
      }

      // 2. Canonical multilingual title check
      const itemTitleLower = item.title.toLowerCase();
      const otherTitleLower = other.title.toLowerCase();
      const itemKnown = knownTitles.some((kt) => kt.length >= 4 && (itemTitleLower.includes(kt) || kt.includes(itemTitleLower)));
      const otherKnown = knownTitles.some((kt) => kt.length >= 4 && (otherTitleLower.includes(kt) || kt.includes(otherTitleLower)));
      if (itemKnown && otherKnown) return true;

      // 3. Distinctive title words check
      const otherDistinctive = getDistinctiveWords(other.title);
      if (itemDistinctive.length > 0 && otherDistinctive.length > 0) {
        const common = itemDistinctive.filter((w) =>
          otherDistinctive.some((ow) => ow.includes(w) || w.includes(ow))
        );
        const minDistinctive = Math.min(itemDistinctive.length, otherDistinctive.length);
        if (common.length >= minDistinctive || common.length >= 2) {
          return true;
        }
      }
      return false;
    });

    if (matched.length > 1) {
      item.availableSources = matched.map((m: any) => ({
        id: m.id,
        title: m.title,
        author: m.author,
        source: m.source,
        format: m.format,
        language: m.language,
        size: m.size,
        downloadUrl: m.downloadUrl,
        isLendingDRM: m.isLendingDRM,
      }));
    }
  }

  return results;
}

/**
 * Automatically resolve intermediate mirror pages (LibGen ads.php, archive.org details)
 * into the direct download stream URL.
 */
export async function resolveDirectDownloadUrl(url: string): Promise<string> {
  let target = url.trim();

  // 0. Z-Library direct download resolution via EAPI (authenticated account)
  if (target.startsWith('zlib://')) {
    try {
      const parts = target.replace('zlib://', '').split('/');
      const bookId = parts[0];
      const hash = parts[1];
      if (bookId && hash) {
        const settings = loadSettings();
        const userId = settings.zlibrary?.userId;
        const userKey = settings.zlibrary?.userKey;
        const domains = ['https://singlelogin.rs', 'https://singlelogin.re', 'https://z-library.sk'];
        for (const domain of domains) {
          try {
            const res = await fetch(`${domain}/eapi/book/${bookId}/${hash}/file`, {
              headers: {
                'Cookie': `remix_userid=${userId}; remix_userkey=${userKey}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              },
              signal: AbortSignal.timeout(6500),
            });
            if (res.ok) {
              const data = await res.json();
              if (data.success && data.file?.downloadLink) {
                return data.file.downloadLink;
              }
            }
          } catch (err: any) {
            console.warn(`Z-Library file resolution error on ${domain}:`, err.message || err);
          }
        }
      }
    } catch (e: any) {
      console.warn('Nie udało się rozwiązać pliku z Z-Library:', e.message || e);
    }
  }

  // 1. LibGen ads.php resolution across all active mirrors
  if (target.includes('/ads.php?md5=') || target.includes('ads.php?md5=')) {
    try {
      const fullAdsUrl = target.startsWith('http') ? target : `https://libgen.li/${target.replace(/^\//, '')}`;
      const origin = new URL(fullAdsUrl).origin;
      const res = await fetch(fullAdsUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        const html = await res.text();
        const getMatch = html.match(/href=[\"'](get\.php\?[^\"']+)[\"']/i);
        if (getMatch) {
          return `${origin}/${getMatch[1]}`;
        }
      }
    } catch (e) {
      console.warn('Nie udało się rozwiązać strony ads LibGen:', e);
    }
  }

  // 2. Archive.org details page resolution (extract epub or pdf, utilizing S3 keys and resolving open copies)
  if (target.includes('archive.org/details/')) {
    try {
      const match = target.match(/archive\.org\/details\/([^\/\?#]+)/);
      if (match) {
        const identifier = match[1];
        const settings = loadSettings();
        const iaHeaders: Record<string, string> = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'application/json',
        };
        if (settings.internetArchive.accessKey && settings.internetArchive.secretKey) {
          iaHeaders['Authorization'] = `LOW ${settings.internetArchive.accessKey}:${settings.internetArchive.secretKey}`;
        }
        if (settings.internetArchive.sessionCookie) {
          iaHeaders['Cookie'] = settings.internetArchive.sessionCookie;
        }

        const metaRes = await fetch(`https://archive.org/metadata/${identifier}`, {
          headers: iaHeaders,
          signal: AbortSignal.timeout(5000),
        });
        if (metaRes.ok) {
          const data = await metaRes.json();
          const isRestricted = data.metadata?.['access-restricted-item'] === 'true';
          const files: Array<{ name: string; format?: string }> = data.files || [];
          const unencrypted = files.filter(f => !f.name.includes('_encrypted') && !f.format?.includes('Encrypted'));
          const epub = unencrypted.find((f) => f.name.toLowerCase().endsWith('.epub'));
          const mobi = unencrypted.find((f) => f.name.toLowerCase().endsWith('.mobi'));
          const pdf = unencrypted.find((f) => f.name.toLowerCase().endsWith('.pdf'));
          const chosen = epub || mobi || pdf;

          const hasIaAuth = Boolean(settings.internetArchive.accessKey && settings.internetArchive.secretKey) || Boolean(settings.internetArchive.sessionCookie);

          if ((!isRestricted || hasIaAuth) && chosen) {
            return `https://archive.org/download/${identifier}/${encodeURIComponent(chosen.name)}`;
          }

          // If restricted or no unencrypted file, find open public alternative on Archive.org
          const title = data.metadata?.title || identifier.replace(/[-_0-9]+/g, ' ').trim();
          const cleanTitle = encodeURIComponent(title.replace(/[^a-zA-Z0-9 ]/g, ' ').trim());
          const altSearch = await fetch(
            `https://archive.org/advancedsearch.php?q=${cleanTitle}+AND+mediatype:(texts)+AND+NOT+access-restricted-item:true&fl[]=identifier&rows=4&output=json`,
            { signal: AbortSignal.timeout(4500) }
          );
          if (altSearch.ok) {
            const sData = await altSearch.json();
            for (const doc of sData.response?.docs || []) {
              if (doc.identifier === identifier) continue;
              const altMetaRes = await fetch(`https://archive.org/metadata/${doc.identifier}`, { signal: AbortSignal.timeout(4000) });
              if (altMetaRes.ok) {
                const altData = await altMetaRes.json();
                const altFiles: Array<{ name: string; format?: string }> = altData.files || [];
                const altUnencrypted = altFiles.filter(f => !f.name.includes('_encrypted') && !f.format?.includes('Encrypted'));
                const altChosen = altUnencrypted.find(f => f.name.toLowerCase().endsWith('.epub')) ||
                                  altUnencrypted.find(f => f.name.toLowerCase().endsWith('.mobi')) ||
                                  altUnencrypted.find(f => f.name.toLowerCase().endsWith('.pdf'));
                if (altChosen) {
                  return `https://archive.org/download/${doc.identifier}/${encodeURIComponent(altChosen.name)}`;
                }
              }
            }
          }
        }
      }
    } catch (e: any) {
      console.warn('Nie udało się rozwiązać pliku z archive.org/details:', e.message || e);
    }
  }

  return target;
}

/**
 * Automatically find and return direct download URL for a given book query
 * by searching LibGen, Gutenberg, and Archive.org mirrors with relevance scoring.
 */
export async function findDirectBookDownload(query: string): Promise<{ downloadUrl: string; title: string; format: string } | null> {
  const results = await searchOnlineBooks(query);
  const qWords = query.toLowerCase().replace(/[^a-z0-9]/gi, ' ').split(/\s+/).filter(w => w.length >= 3);

  // Score candidates: prefer open shadow mirrors and direct EPUBs
  const scored = results
    .filter(r => Boolean(r.downloadUrl && !r.downloadUrl.includes('katalog/lektura/')))
    .map(r => {
      let score = 0;
      const haystack = `${r.title} ${r.author}`.toLowerCase();
      for (const w of qWords) {
        if (haystack.includes(w)) score += 30;
      }
      if (r.title.toLowerCase().includes(query.toLowerCase())) score += 50;
      if (r.format?.toUpperCase().includes('EPUB')) score += 30;
      if (r.source.includes('Z-Library')) score += 50;
      if (r.source.includes('LibGen') || r.source.includes('Shadow')) score += 25;
      if (r.source.includes('Wolne Lektury')) score += 20;
      if (r.source.includes('Archive') && !r.isLendingDRM) score += 10;
      return { item: r, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0]?.item;
  if (!best || !best.downloadUrl) return null;

  return {
    downloadUrl: best.downloadUrl,
    title: best.title,
    format: best.format || 'EPUB',
  };
}

/**
 * Download a remote book file from URL into a Buffer, auto-resolving mirrors and bypassing 401/403/503/HTML
 */
export async function fetchRemoteBookBuffer(
  url: string,
  bookTitle?: string,
  onLog?: (msg: string) => void
): Promise<{ buffer: Buffer; filename: string }> {
  // Chomikuj.pl handler with automatic mirror recovery
  if (url.includes('chomikuj.pl')) {
    const { downloadChomikujFile } = await import('./chomikuj');
    try {
      return await downloadChomikujFile(url);
    } catch (chomikErr: any) {
      console.warn('Pobieranie z Chomikuj wymagało transferu lub autoryzacji:', chomikErr.message);
      onLog?.(`[Chomikuj] Plik na Chomikuj jest chroniony lub wymaga transferu konta. Automatyczne przeszukiwanie innych repozytoriów (Z-Library, Anna's Archive, LibGen) w poszukiwaniu otwartej wersji EPUB/PDF...`);

      const searchTarget = bookTitle || url.split('/').pop()?.replace(/,\d+\.[a-zA-Z0-9]+$/, '').replace(/[_+]+/g, ' ') || 'ksiazka';
      const alt = await findDirectBookDownload(searchTarget);
      if (alt && alt.downloadUrl && !alt.downloadUrl.includes('chomikuj.pl')) {
        onLog?.(`[Chomikuj -> Mirror] Znaleziono wydanie w repozytorium alternatywnym: "${alt.title}" (${alt.format}). Pobieranie...`);
        let altDirectUrl = alt.downloadUrl;
        let altReferer = alt.downloadUrl;
        if (alt.downloadUrl.includes('ads.php') || alt.downloadUrl.includes('/ads.php?md5=')) {
          altDirectUrl = await resolveDirectDownloadUrl(alt.downloadUrl);
          altReferer = alt.downloadUrl;
        }
        if (altDirectUrl) {
          const altResp = await fetch(altDirectUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
              Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              Referer: altReferer,
            },
            signal: AbortSignal.timeout(30000),
          });
          if (altResp.ok) {
            const altBuf = Buffer.from(await altResp.arrayBuffer());
            if (altBuf.length > 1000) {
              const ext = alt.format.toLowerCase().includes('pdf') ? 'pdf' : alt.format.toLowerCase().includes('mobi') ? 'mobi' : 'epub';
              const cleanName = `${(bookTitle || alt.title).replace(/[^a-zA-Z0-9_-]/g, '_')}.${ext}`;
              return { buffer: altBuf, filename: cleanName };
            }
          }
        }
      }

      // If fallback couldn't find an alternate, propagate with clear guidance
      throw chomikErr;
    }
  }

  let directUrl = url;
  try {
    directUrl = await resolveDirectDownloadUrl(url);
  } catch (err: any) {
    console.warn('Błąd rozwiązywania URL:', err.message);
  }

  const browserHeaders: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/octet-stream,*/*;q=0.8',
    'Accept-Language': 'pl,en-US;q=0.9,en;q=0.8',
  };

  try {
    const settings = loadSettings();
    if (directUrl.includes('libgen') || url.includes('libgen') || url.includes('ads.php')) {
      browserHeaders['Referer'] = url.includes('ads.php') ? url : directUrl;
    } else if (directUrl.includes('archive.org')) {
      browserHeaders['Referer'] = 'https://archive.org/';
      if (settings.internetArchive.accessKey && settings.internetArchive.secretKey) {
        browserHeaders['Authorization'] = `LOW ${settings.internetArchive.accessKey}:${settings.internetArchive.secretKey}`;
      }
      if (settings.internetArchive.sessionCookie) {
        browserHeaders['Cookie'] = settings.internetArchive.sessionCookie;
      }
    }
  } catch {}

  let resp = await fetch(directUrl, {
    headers: browserHeaders,
    signal: AbortSignal.timeout(35000),
  });

  // If 401 Unauthorized or 403 or 503 or 404, try alternative mirrors / open copies!
  if (!resp.ok && (resp.status === 401 || resp.status === 403 || resp.status === 503 || resp.status === 404)) {
    console.warn(`Pobieranie z ${directUrl} zwróciło status ${resp.status}. Uruchamianie procedury ratunkowej i alternatywnych mirrorów...`);
    onLog?.(`[Pobieranie] Serwer zwrócił status ${resp.status}. Automatyczne przeszukiwanie innych mirrorów...`);

    // 1. LibGen / Shadow library MD5 fallback across .li, .vg, .bz, .la
    const md5Match = directUrl.match(/([a-f0-9]{32})/i) || url.match(/([a-f0-9]{32})/i);
    if (md5Match) {
      const md5 = md5Match[1];
      const mirrors = [
        'https://libgen.li',
        'https://libgen.vg',
        'https://libgen.bz',
        'https://libgen.la',
      ];

      for (const m of mirrors) {
        try {
          const adsUrl = `${m}/ads.php?md5=${md5}`;
          const adsResp = await fetch(adsUrl, {
            headers: browserHeaders,
            signal: AbortSignal.timeout(6000),
          });
          if (adsResp.ok) {
            const adsHtml = await adsResp.text();
            const getMatch = adsHtml.match(/href=[\"'](get\.php\?[^\"']+)[\"']/i);
            if (getMatch) {
              const fileUrl = `${m}/${getMatch[1]}`;
              const fbResp = await fetch(fileUrl, {
                headers: {
                  ...browserHeaders,
                  Referer: adsUrl,
                },
                signal: AbortSignal.timeout(25000),
              });
              if (fbResp.ok) {
                const cType = (fbResp.headers.get('content-type') || '').toLowerCase();
                const testBuf = Buffer.from(await fbResp.arrayBuffer());
                const testSnip = testBuf.slice(0, 100).toString('utf8').trim().toLowerCase();
                if (!cType.includes('text/html') && !testSnip.startsWith('<!doctype') && !testSnip.startsWith('<html') && testBuf.length > 1000) {
                  const filename = (bookTitle || 'ksiazka').replace(/[^a-zA-Z0-9_-]/g, '_') + '.epub';
                  return { buffer: testBuf, filename };
                }
              }
            }
          }
        } catch {}
      }
    }

    // 2. Archive.org 401 Unauthorized fallback: search open public copy without DRM
    if (!resp.ok && (directUrl.includes('archive.org') || url.includes('archive.org'))) {
      try {
        const titleToSearch = bookTitle || url.match(/archive\.org\/(?:details|download)\/([^\/\?#]+)/)?.[1]?.replace(/[-_0-9]+/g, ' ').trim() || '';
        if (titleToSearch) {
          const openSearch = await fetch(
            `https://archive.org/advancedsearch.php?q=${encodeURIComponent(titleToSearch)}+AND+mediatype:(texts)+AND+NOT+access-restricted-item:true&fl[]=identifier&rows=3&output=json`
          );
          if (openSearch.ok) {
            const data = await openSearch.json();
            for (const doc of data.response?.docs || []) {
              const openUrl = await resolveDirectDownloadUrl(`https://archive.org/details/${doc.identifier}`);
              if (openUrl && openUrl.startsWith('http') && !openUrl.includes('details/')) {
                const openResp = await fetch(openUrl, {
                  headers: browserHeaders,
                  signal: AbortSignal.timeout(20000),
                });
                if (openResp.ok) {
                  resp = openResp;
                  directUrl = openUrl;
                  break;
                }
              }
            }
          }
        }
      } catch (err: any) {
        console.warn('Błąd wyszukiwania otwartej kopii Archive.org:', err.message);
      }
    }
  }

  let contentType = (resp.headers.get('content-type') || '').toLowerCase();
  let arrayBuffer = resp.ok ? await resp.arrayBuffer() : new ArrayBuffer(0);
  let buffer = Buffer.from(arrayBuffer);
  let snippet = buffer.slice(0, 100).toString('utf8').trim().toLowerCase();

  // If response is an HTML webpage instead of an ebook (e.g. details page, loan paywall, or redirect page):
  if (!resp.ok || (contentType.includes('text/html') && (snippet.startsWith('<!doctype html') || snippet.startsWith('<html')))) {
    const searchTarget = bookTitle || directUrl;
    console.warn(`Odpowiedź to strona HTML. Próba automatycznego odnalezienia bezpośredniego pliku dla: "${searchTarget}"...`);
    onLog?.(`[Pobieranie] Źródło zwróciło widok WWW (HTML) zamiast pliku. Wyszukiwanie otwartej wersji EPUB w mirrorach...`);

    const alt = await findDirectBookDownload(searchTarget);
    if (alt && alt.downloadUrl && alt.downloadUrl !== url) {
      onLog?.(`[Pobieranie] Znaleziono otwarte wydanie w mirrorach: "${alt.title}" (${alt.format}). Pobieranie...`);
      let altDirectUrl = alt.downloadUrl;
      let altReferer = alt.downloadUrl;
      if (alt.downloadUrl.includes('ads.php') || alt.downloadUrl.includes('/ads.php?md5=')) {
        altDirectUrl = await resolveDirectDownloadUrl(alt.downloadUrl);
        altReferer = alt.downloadUrl;
      }
      if (altDirectUrl && !altDirectUrl.includes('details/')) {
        const altResp = await fetch(altDirectUrl, {
          headers: {
            ...browserHeaders,
            Referer: altReferer,
          },
          signal: AbortSignal.timeout(30000),
        });
        if (altResp.ok) {
          const altType = (altResp.headers.get('content-type') || '').toLowerCase();
          const altBuf = Buffer.from(await altResp.arrayBuffer());
          const altSnip = altBuf.slice(0, 100).toString('utf8').trim().toLowerCase();
          if (!altType.includes('text/html') && !altSnip.startsWith('<!doctype') && !altSnip.startsWith('<html') && altBuf.length > 1000) {
            const ext = alt.format.toLowerCase().includes('pdf') ? 'pdf' : alt.format.toLowerCase().includes('mobi') ? 'mobi' : 'epub';
            const cleanName = `${(bookTitle || alt.title).replace(/[^a-zA-Z0-9_-]/g, '_')}.${ext}`;
            return { buffer: altBuf, filename: cleanName };
          }
        }
      }
    }
  }

  if (!resp.ok) {
    if (resp.status === 401) {
      throw new Error(`To konkretne wydanie jest objęte cyfrowym wypożyczeniem DRM (401 Unauthorized). Wybierz inne źródło.`);
    }
    throw new Error(`Nie udało się pobrać pliku ze źródła (${resp.status} ${resp.statusText})`);
  }

  if (contentType.includes('text/html') && (snippet.startsWith('<!doctype html') || snippet.startsWith('<html'))) {
    throw new Error('Źródło zwróciło stronę WWW (HTML) zamiast pliku książki. Skorzystaj z opcji wyboru innego źródła przy tym tytule (np. LibGen lub Internet Archive).');
  }

  // Derive filename from Content-Disposition or URL
  const cd = resp.headers.get('content-disposition');
  let filename = '';
  if (cd) {
    const cdMatch = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i);
    if (cdMatch) filename = decodeURIComponent(cdMatch[1]);
  }

  if (!filename) {
    try {
      const urlPath = new URL(directUrl).pathname;
      filename = decodeURIComponent(urlPath.split('/').pop() || 'ksiazka.epub');
    } catch {
      filename = 'ksiazka.epub';
    }
  }

  if (!filename.includes('.')) filename += '.epub';

  return { buffer, filename };
}
