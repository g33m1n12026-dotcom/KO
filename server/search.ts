import { BookSearchResult } from '../src/types';
import { generateMirrorSearchLinks } from './mirrors';

/**
 * Searches for books via Gutendex (Project Gutenberg API), OpenLibrary,
 * and attaches deep links to shadow libraries (Anna's Archive, Z-Library, LibGen, Sci-Hub, Liber3).
 */
export async function searchOnlineBooks(query: string): Promise<BookSearchResult[]> {
  if (!query || !query.trim()) return [];

  const results: BookSearchResult[] = [];
  const cleanQ = encodeURIComponent(query.trim());
  const mirrorLinks = generateMirrorSearchLinks(query.trim());

  // Run WolneLektury, OpenLibrary, Gutenberg, and direct LibGen & Archive.org mirror crawlers concurrently
  const [wolneLekturyItems, olDocs, gutenbergItems, libgenItems, archiveDocs] = await Promise.all([
    // 0. Wolne Lektury (Polish Free Books Repository with direct EPUB/PDF)
    (async () => {
      try {
        const wlResp = await fetch(`https://wolnelektury.pl/api/books/?search=${cleanQ}`, {
          signal: AbortSignal.timeout(3500),
          headers: {
            'User-Agent': 'KOReader-AI-Book-Cloud/1.0',
            Accept: 'application/json',
          },
        });
        if (wlResp.ok) {
          const wlData = await wlResp.json();
          return Array.isArray(wlData) ? wlData.slice(0, 6) : [];
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
        const olResp = await fetch(`https://openlibrary.org/search.json?q=${cleanQ}&limit=8`, {
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
        const resp = await fetch(`https://gutendex.com/books?search=${cleanQ}`, {
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

    // 3. Direct LibGen (.li) Mirror Search (scrapes active entries with direct download links)
    (async () => {
      try {
        const libgenUrl = `https://libgen.li/index.php?req=${cleanQ}&columns[]=t&columns[]=a&objects[]=f&topics[]=l&res=10`;
        const resp = await fetch(libgenUrl, {
          signal: AbortSignal.timeout(5000),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml',
          },
        });
        if (resp.ok) {
          const html = await resp.text();
          const trs = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
          const parsed: Array<{
            id: string;
            title: string;
            author: string;
            year?: string;
            language: string;
            size?: string;
            format: string;
            adsUrl: string;
          }> = [];

          for (let i = 2; i < trs.length && parsed.length < 8; i++) {
            const row = trs[i][1];
            const adsMatch = row.match(/href=[\"'](\/?ads\.php\?md5=[a-f0-9]+)[\"']/i);
            if (!adsMatch) continue;

            const tdMatches = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1]);
            if (tdMatches.length < 7) continue;

            // Extract cleaner title: check edition link anchor text, <b> tag, or raw cell
            let title = 'Bez tytułu';
            const editionMatch = tdMatches[0].match(/<a[^>]+href=[\"']edition\.php\?[^\"']*[\"'][^>]*>([\s\S]*?)<\/a>/i);
            const bMatch = tdMatches[0].match(/<b>([\s\S]*?)<\/b>/i);

            if (editionMatch && editionMatch[1].replace(/<[^>]+>/g, '').trim()) {
              title = editionMatch[1].replace(/<[^>]+>/g, '').trim();
            } else if (bMatch && bMatch[1].replace(/<[^>]+>/g, '').trim()) {
              title = bMatch[1].replace(/<[^>]+>/g, '').trim();
            } else {
              title = tdMatches[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
            }
            // Strip any stray quotation marks or html entities
            title = title.replace(/^["'\s]+|["'\s]+$/g, '').replace(/&[a-z0-9#]+;/gi, ' ');

            const author = tdMatches[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || 'Nieznany autor';
            const year = tdMatches[3]?.replace(/<[^>]+>/g, ' ').trim() || undefined;
            const language = tdMatches[4]?.replace(/<[^>]+>/g, ' ').trim() || 'EN';
            const size = tdMatches[6]?.replace(/<[^>]+>/g, ' ').trim() || '';
            const format = (tdMatches[7]?.replace(/<[^>]+>/g, ' ').trim() || 'EPUB').toUpperCase();
            const adsUrl = adsMatch[1].startsWith('/') ? `https://libgen.li${adsMatch[1]}` : `https://libgen.li/${adsMatch[1]}`;

            parsed.push({
              id: `libgen_${adsMatch[1].replace(/[^a-zA-Z0-9]/g, '_')}`,
              title,
              author,
              year,
              language,
              size,
              format,
              adsUrl,
            });
          }
          return parsed;
        }
      } catch (err: any) {
        if (err?.name !== 'TimeoutError' && err?.name !== 'AbortError') {
          console.warn('LibGen mirror search notice:', err?.message || err);
        }
      }
      return [];
    })(),

    // 4. Internet Archive Books Search (Direct Public Ebooks & Texts)
    (async () => {
      try {
        const iaUrl = `https://archive.org/advancedsearch.php?q=${cleanQ}+AND+mediatype:(texts)&fl[]=identifier,title,creator,year,language,format&rows=6&output=json`;
        const resp = await fetch(iaUrl, {
          signal: AbortSignal.timeout(4500),
          headers: { 'User-Agent': 'KOReader-AI-Book-Cloud/1.0', Accept: 'application/json' },
        });
        if (resp.ok) {
          const data = await resp.json();
          return Array.isArray(data.response?.docs) ? data.response.docs : [];
        }
      } catch (err: any) {
        if (err?.name !== 'TimeoutError' && err?.name !== 'AbortError') {
          console.warn('Archive.org search notice:', err?.message || err);
        }
      }
      return [];
    })(),
  ]);

  // Process Wolne Lektury results (direct Polish library with EPUB/PDF)
  for (const item of wolneLekturyItems) {
    const specificQ = `${item.author} ${item.title}`;
    const directUrl = item.epub || item.pdf || item.txt || item.url;
    results.push({
      id: `wl_${item.slug || Math.random().toString(36).slice(2)}`,
      title: item.title,
      author: item.author || 'Wolne Lektury',
      language: 'PL',
      format: item.epub ? 'EPUB' : item.pdf ? 'PDF' : 'TXT',
      source: 'Wolne Lektury (Polska Biblioteka)',
      description: `Polska biblioteka cyfrowa: bezpośrednie pobieranie gotowej książki.`,
      downloadUrl: directUrl,
      mirrorLinks: generateMirrorSearchLinks(specificQ),
    });
  }

  // Process LibGen results (direct mirrors from user request)
  for (const item of libgenItems) {
    const specificQ = `${item.author} ${item.title}`;
    results.push({
      id: item.id,
      title: item.title,
      author: item.author,
      year: item.year,
      language: item.language.toUpperCase(),
      format: item.format,
      source: "LibGen Mirror (.li)",
      description: `Pobieranie z bazy mirrorów LibGen. Rozmiar: ${item.size || 'b.d.'}, Format: ${item.format}`,
      downloadUrl: item.adsUrl,
      mirrorLinks: generateMirrorSearchLinks(specificQ),
    });
  }

  // Process Internet Archive results
  for (const doc of archiveDocs) {
    const authors = Array.isArray(doc.creator) ? doc.creator.join(', ') : doc.creator || 'Nieznany';
    const specificQ = `${authors} ${doc.title}`;
    const id = doc.identifier;
    results.push({
      id: `ia_${id}`,
      title: doc.title,
      author: authors,
      year: doc.year ? String(doc.year) : undefined,
      language: (Array.isArray(doc.language) ? doc.language.join(', ') : doc.language || 'EN').toUpperCase(),
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

    results.push({
      id: `gutenberg_${item.id}`,
      title: item.title,
      author: authors,
      language: (item.languages || ['en']).join(', ').toUpperCase(),
      downloadUrl: textUrl,
      format: fmt,
      source: 'Project Gutenberg',
      description: item.subjects?.slice(0, 3)?.join(' • ') || 'Darmowa klasyka literatury',
      mirrorLinks: generateMirrorSearchLinks(`${authors} ${item.title}`),
    });
  }

  // Process OpenLibrary results
  for (const doc of olDocs.slice(0, 8)) {
    const authors = (doc.author_name || []).join(', ') || 'Nieznany';
    const specificQ = `${authors} ${doc.title}`;
    results.push({
      id: `ol_${doc.key?.replace(/\//g, '_') || Math.random().toString(36).substring(2)}`,
      title: doc.title,
      author: authors,
      year: doc.first_publish_year ? String(doc.first_publish_year) : undefined,
      language: (doc.language || ['en']).slice(0, 2).join(', ').toUpperCase(),
      format: 'EBOOK / METADATA',
      source: 'Open Library',
      description: `Wydano: ${doc.first_publish_year || 'b.d.'}. Wydawca: ${(doc.publisher || []).slice(0, 2).join(', ') || 'Różni'}`,
      downloadUrl: doc.ia?.[0] ? `https://archive.org/download/${doc.ia[0]}/${doc.ia[0]}.pdf` : undefined,
      mirrorLinks: generateMirrorSearchLinks(specificQ),
    });
  }

  return results;
}

/**
 * Automatically resolve intermediate mirror pages (LibGen ads.php, archive.org details)
 * into the direct download stream URL.
 */
export async function resolveDirectDownloadUrl(url: string): Promise<string> {
  let target = url.trim();

  // 1. LibGen .li ads.php resolution
  if (target.includes('libgen.li/ads.php') || target.includes('/ads.php?md5=')) {
    try {
      const fullAdsUrl = target.startsWith('http') ? target : `https://libgen.li/${target.replace(/^\//, '')}`;
      const res = await fetch(fullAdsUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        const html = await res.text();
        const getMatch = html.match(/href=[\"'](get\.php\?[^\"']+)[\"']/i);
        if (getMatch) {
          return `https://libgen.li/${getMatch[1]}`;
        }
      }
    } catch (e) {
      console.warn('Nie udało się rozwiązać strony ads LibGen:', e);
    }
  }

  // 2. Archive.org details page resolution (extract epub or pdf)
  if (target.includes('archive.org/details/')) {
    try {
      const match = target.match(/archive\.org\/details\/([^\/\?#]+)/);
      if (match) {
        const identifier = match[1];
        const metaRes = await fetch(`https://archive.org/metadata/${identifier}`, {
          signal: AbortSignal.timeout(5000),
        });
        if (metaRes.ok) {
          const data = await metaRes.json();
          const files: Array<{ name: string; format?: string }> = data.files || [];
          // Prefer epub, then mobi, then pdf
          const epub = files.find((f) => f.name.toLowerCase().endsWith('.epub'));
          const mobi = files.find((f) => f.name.toLowerCase().endsWith('.mobi'));
          const pdf = files.find((f) => f.name.toLowerCase().endsWith('.pdf'));
          const chosen = epub || mobi || pdf;
          if (chosen) {
            return `https://archive.org/download/${identifier}/${encodeURIComponent(chosen.name)}`;
          }
        }
      }
    } catch (e) {
      console.warn('Nie udało się rozwiązać pliku z archive.org/details:', e);
    }
  }

  return target;
}

/**
 * Automatically find and return direct download URL for a given book query
 * by searching LibGen, Gutenberg, and Archive.org mirrors.
 */
export async function findDirectBookDownload(query: string): Promise<{ downloadUrl: string; title: string; format: string } | null> {
  const results = await searchOnlineBooks(query);
  const candidate = results.find((r) => !!r.downloadUrl);
  if (!candidate || !candidate.downloadUrl) return null;
  return {
    downloadUrl: candidate.downloadUrl,
    title: candidate.title,
    format: candidate.format || 'EPUB',
  };
}

/**
 * Download a remote book file from URL into a Buffer, auto-resolving mirrors
 */
export async function fetchRemoteBookBuffer(url: string): Promise<{ buffer: Buffer; filename: string }> {
  const directUrl = await resolveDirectDownloadUrl(url);

  const resp = await fetch(directUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) KOReader-AI-Cloud/2.0',
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!resp.ok) {
    throw new Error(`Nie udało się pobrać pliku ze źródła (${resp.status} ${resp.statusText})`);
  }

  const arrayBuffer = await resp.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

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
