import { BookSearchResult } from '../src/types';
import { generateMirrorSearchLinks } from './mirrors';
import { loadSettings } from './settings';

export interface ChomikujItem {
  fileId: string;
  title: string;
  uploader: string;
  format: string;
  size?: string;
  filePageUrl: string;
  previewDocsUrl?: string;
}

/**
 * Searches Chomikuj.pl for books, educational files, and documents (.epub, .pdf, .mobi, .doc, .txt).
 * Uses anti-forgery verification tokens and parses high-quality metadata.
 */
export async function searchChomikujBooks(query: string): Promise<BookSearchResult[]> {
  if (!query || !query.trim()) return [];

  const cleanQuery = query.trim();
  const searchResults: BookSearchResult[] = [];

  try {
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

    // 1. Initial GET to obtain session cookies and RequestVerificationToken
    const initResp = await fetch('https://chomikuj.pl/action/SearchFiles', {
      signal: AbortSignal.timeout(4000),
      headers: {
        'User-Agent': userAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    if (!initResp.ok) return [];

    const getCookies = initResp.headers.getSetCookie ? initResp.headers.getSetCookie() : [initResp.headers.get('set-cookie') || ''];
    const cookieHeader = getCookies.map((c) => c.split(';')[0]).filter(Boolean).join('; ');
    const initHtml = await initResp.text();

    const tokenMatch = initHtml.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/i);
    const token = tokenMatch ? tokenMatch[1] : '';

    // 2. Query Chomikuj files search (document type for books)
    const postParams = new URLSearchParams();
    if (token) postParams.append('__RequestVerificationToken', token);
    postParams.append('FileName', cleanQuery);
    postParams.append('FileType', 'document');
    postParams.append('SizeFrom', '0');
    postParams.append('SizeTo', '0');
    postParams.append('IsGallery', 'False');
    postParams.append('Extension', '');

    const searchResp = await fetch('https://chomikuj.pl/action/SearchFiles/Results', {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
      headers: {
        'User-Agent': userAgent,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        Cookie: cookieHeader,
        Referer: 'https://chomikuj.pl/action/SearchFiles',
      },
      body: postParams.toString(),
    });

    if (!searchResp.ok) return [];

    const html = await searchResp.text();

    // 3. Parse individual items
    // Matches the file link and title
    const fileLinkRegex = /<a\s+class="[^"]*expanderHeader[^"]*"[^>]*href="([^"]+)"[^>]*title="([^"]+)"[^>]*>/gi;
    let match: RegExpExecArray | null;

    const seenIds = new Set<string>();

    while ((match = fileLinkRegex.exec(html)) !== null) {
      const rawHref = match[1];
      const rawTitle = match[2];

      const fileIdMatch = rawHref.match(/,(\d+)\.([a-zA-Z0-9]+)$/);
      const fileId = fileIdMatch ? fileIdMatch[1] : Math.random().toString(36).slice(2);
      let format = fileIdMatch ? fileIdMatch[2].toUpperCase() : 'EPUB';
      if (format === 'HTM') format = 'HTML';

      if (seenIds.has(fileId)) continue;
      seenIds.add(fileId);

      // Extract uploader from path (e.g. /Username/...)
      const uploaderMatch = rawHref.match(/^\/([^\/]+)\//);
      const uploader = uploaderMatch ? decodeURIComponent(uploaderMatch[1]) : 'Chomikuj';

      // Find file size in surrounding context
      const snippetStart = Math.max(0, match.index - 1500);
      const snippetEnd = Math.min(html.length, match.index + 800);
      const context = html.slice(snippetStart, snippetEnd);

      const sizeMatch = context.match(/<li>\s*<span>\s*(\d+(?:[.,]\d+)?\s*(?:KB|MB|GB|B))\s*<\/span>\s*<\/li>/i) ||
                        context.match(/<span>(\d+(?:[.,]\d+)?\s*(?:KB|MB|GB|B))<\/span>/i) ||
                        context.match(/(\d+(?:[.,]\d+)?\s*(?:KB|MB|GB))\b/i);
      const size = sizeMatch ? sizeMatch[1].trim() : undefined;

      // Check if preview docs link is available
      const previewMatch = context.match(/href="(\/\/[^"]*docs\d*\.chomikuj\.pl\/[^"]+)"/i);
      const previewDocsUrl = previewMatch ? `https:${previewMatch[1]}` : undefined;

      const fullPageUrl = rawHref.startsWith('http') ? rawHref : `https://chomikuj.pl${rawHref}`;

      // Clean title
      const cleanTitle = rawTitle.replace(/\s+/g, ' ').trim();
      const specificQ = `${cleanTitle} ${uploader}`;

      searchResults.push({
        id: `chomik_${fileId}`,
        title: cleanTitle,
        author: uploader !== 'Chomikuj' ? `Chomik: ${uploader}` : 'Chomikuj.pl',
        language: 'PL',
        format,
        source: 'Chomikuj.pl',
        size,
        description: `Plik z biblioteki Chomikuj.pl (użytkownik: ${uploader})${size ? `, rozmiar: ${size}` : ''}. Dostępny do bezpośredniego importu lub pobrania.`,
        downloadUrl: fullPageUrl,
        mirrorLinks: [
          { name: 'Otwórz na Chomikuj', url: fullPageUrl },
          ...(previewDocsUrl ? [{ name: 'Podgląd tekstu docs', url: previewDocsUrl }] : []),
          ...generateMirrorSearchLinks(cleanTitle),
        ],
      });

      if (searchResults.length >= 25) break;
    }
  } catch (err: any) {
    if (err?.name !== 'TimeoutError' && err?.name !== 'AbortError') {
      console.warn('Chomikuj search notice:', err?.message || err);
    }
  }

  return searchResults;
}

/**
 * Downloads or extracts content from a Chomikuj file URL or preview URL.
 * Handles both docs*.chomikuj.pl HTML previews and file downloads.
 */
export async function downloadChomikujFile(targetUrl: string): Promise<{ buffer: Buffer; filename: string }> {
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

  // 1. If it is a docs*.chomikuj.pl preview URL, we can scrape the document text and pages directly!
  if (targetUrl.includes('docs') && targetUrl.includes('chomikuj.pl')) {
    const resp = await fetch(targetUrl, {
      headers: { 'User-Agent': userAgent },
    });
    if (!resp.ok) throw new Error(`Błąd pobierania podglądu z Chomikuj: status ${resp.status}`);
    const html = await resp.text();

    // Extract text from paragraphs
    const paragraphs: string[] = [];
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let m;
    while ((m = pRegex.exec(html)) !== null) {
      const cleanP = m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
      if (cleanP) paragraphs.push(cleanP);
    }

    const fullText = paragraphs.join('\n\n');
    return {
      buffer: Buffer.from(fullText, 'utf-8'),
      filename: 'chomikuj_dokument.txt',
    };
  }

  // 2. For standard chomikuj.pl file URLs (e.g. https://chomikuj.pl/.../File,12345.doc)
  const resp = await fetch(targetUrl, {
    headers: {
      'User-Agent': userAgent,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!resp.ok) {
    throw new Error(`Nie udało się otworzyć strony pliku na Chomikuj: status ${resp.status}`);
  }

  const html = await resp.text();

  // Check if there is a preview docs link on the page
  const docsMatch = html.match(/href="(\/\/[^"]*docs\d*\.chomikuj\.pl\/[^"]+)"/i);
  if (docsMatch) {
    const docsUrl = `https:${docsMatch[1]}`;
    return downloadChomikujFile(docsUrl);
  }

  // Extract filename
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const rawTitle = titleMatch ? titleMatch[1].split('-')[0].trim() : 'chomikuj_plik';
  const cleanFilename = rawTitle.replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ._-]/g, '_');

  const settings = loadSettings();
  const currentAccount = settings.chomikuj?.accountName || 'diweg68665';

  throw new Error(
    `Plik "${cleanFilename}" znajduje się na chronionym serwerze Chomikuj.pl. Otwórz go w przeglądarce pod adresem: ${targetUrl} aby pobrać go ze swojego zalogowanego konta (${currentAccount}).`
  );
}

