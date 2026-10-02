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

import https from 'https';

class ChomikujClient {
  private cookies = new Map<string, string>();

  saveCookies(headers: any) {
    const raw = headers['set-cookie'];
    if (!raw) return;
    const arr = Array.isArray(raw) ? raw : [raw];
    for (const c of arr) {
      const part = c.split(';')[0];
      const eq = part.indexOf('=');
      if (eq > 0) {
        this.cookies.set(part.substring(0, eq).trim(), part.substring(eq + 1).trim());
      }
    }
  }

  getCookieHeader(): string {
    return Array.from(this.cookies.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
  }

  async request(urlStr: string, options: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<{ statusCode: number; headers: any; buffer: Buffer; text: string }> {
    return new Promise((resolve, reject) => {
      const url = new URL(urlStr);
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8',
        ...(options.headers || {}),
      };
      const cookieHeader = this.getCookieHeader();
      if (cookieHeader) headers['Cookie'] = cookieHeader;

      const req = https.request(url, {
        method: options.method || 'GET',
        headers,
      }, (res) => {
        this.saveCookies(res.headers);
        const chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          resolve({
            statusCode: res.statusCode || 200,
            headers: res.headers,
            buffer: buf,
            text: buf.toString('utf-8'),
          });
        });
      });
      req.on('error', reject);
      if (options.body) req.write(options.body);
      req.end();
    });
  }
}

/**
 * Downloads or extracts content from a Chomikuj file URL or preview URL.
 * Automatically authenticates using the user's Chomikuj account (e.g. diweg68665)
 * to claim files and download directly without manual browser interaction.
 */
export async function downloadChomikujFile(targetUrl: string): Promise<{ buffer: Buffer; filename: string }> {
  const client = new ChomikujClient();

  // 1. If it is a docs*.chomikuj.pl preview URL, extract plain text directly
  if (targetUrl.includes('docs') && targetUrl.includes('chomikuj.pl')) {
    const resp = await client.request(targetUrl);
    if (resp.statusCode >= 400) throw new Error(`Błąd pobierania podglądu z Chomikuj: status ${resp.statusCode}`);

    const paragraphs: string[] = [];
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let m;
    while ((m = pRegex.exec(resp.text)) !== null) {
      const cleanP = m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
      if (cleanP) paragraphs.push(cleanP);
    }

    const fullText = paragraphs.join('\n\n');
    return {
      buffer: Buffer.from(fullText, 'utf-8'),
      filename: 'chomikuj_dokument.txt',
    };
  }

  // 2. Extract fileId and file name from URL (e.g. /mbirkhoff/.../Dziki+robot+-+Peter+Brown,8850774744.epub)
  const fileIdMatch = targetUrl.match(/,(\d+)(?:\.[a-zA-Z0-9]+)?(?:[?#]|$)/) || targetUrl.match(/fileid[=:_]+(\d+)/i);
  let resolvedFileId = fileIdMatch ? fileIdMatch[1] : null;

  const rawFilename = targetUrl.split('/').pop()?.split(',')[0]?.replace(/\+/g, ' ') || 'chomikuj_plik';
  const extMatch = targetUrl.match(/\.(epub|pdf|mobi|cbz|txt|azw3|doc|docx)(?:[?#]|$)/i);
  const detectedExt = extMatch ? extMatch[1].toLowerCase() : 'epub';
  const cleanFilename = `${rawFilename.replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ._ -]/g, '_').trim()}.${detectedExt}`;

  const settings = loadSettings();
  const accountLogin = settings.chomikuj?.accountName || process.env.CHOMIKUJ_ACCOUNT || 'diweg68665';
  const accountPassword = settings.chomikuj?.password || process.env.CHOMIKUJ_PASSWORD || 'QAZxsw321';

  console.log(`[Chomikuj] Rozpoczynanie autoryzowanego pobierania "${cleanFilename}" z konta ${accountLogin}...`);

  // Step A: Visit homepage to obtain initial cookies and RequestVerificationToken
  const homeResp = await client.request('https://chomikuj.pl');
  const homeTokenMatch = homeResp.text.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/i);
  const homeToken = homeTokenMatch ? homeTokenMatch[1] : '';

  // Step B: Authenticate via TopBarLogin
  if (accountLogin && accountPassword) {
    const loginBody = `Login=${encodeURIComponent(accountLogin)}&Password=${encodeURIComponent(accountPassword)}&__RequestVerificationToken=${encodeURIComponent(homeToken || '')}`;
    await client.request('https://chomikuj.pl/action/Login/TopBarLogin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://chomikuj.pl/',
      },
      body: loginBody,
    });
  }

  // Step C: Visit the file page as logged-in user
  const pageResp = await client.request(targetUrl, {
    headers: { 'Referer': 'https://chomikuj.pl/' },
  });

  // Check if file details page contains alternative preview docs link
  const docsMatch = pageResp.text.match(/href="(\/\/[^"]*docs\d*\.chomikuj\.pl\/[^"]+)"/i);
  if (docsMatch) {
    return downloadChomikujFile(`https:${docsMatch[1]}`);
  }

  if (!resolvedFileId) {
    const fidMatch = pageResp.text.match(/name="FileId"[^>]*value="(\d+)"/i) || pageResp.text.match(/fileid["':= ]+(\d+)/i);
    if (fidMatch) resolvedFileId = fidMatch[1];
  }

  const pageTokenMatch = pageResp.text.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/i);
  const fileToken = pageTokenMatch ? pageTokenMatch[1] : homeToken;

  if (resolvedFileId) {
    // Step D: Request DownloadContext to retrieve download license payload
    const ctxBody = `fileId=${encodeURIComponent(resolvedFileId)}&__RequestVerificationToken=${encodeURIComponent(fileToken || '')}`;
    const ctxResp = await client.request('https://chomikuj.pl/action/License/DownloadContext', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Referer': targetUrl,
      },
      body: ctxBody,
    });

    if (ctxResp.statusCode === 200) {
      try {
        const ctxJson = JSON.parse(ctxResp.text);
        const htmlContent = ctxJson.Content || '';
        const selMatch = htmlContent.match(/name="SerializedUserSelection"[^>]*value="([^"]+)"/i);
        const orgMatch = htmlContent.match(/name="SerializedOrgFile"[^>]*value="([^"]+)"/i);

        if (selMatch && orgMatch) {
          // Step E: Confirm DownloadWarningAccept to get redirectUrl
          const acceptBody = `FileId=${encodeURIComponent(resolvedFileId)}&SerializedUserSelection=${encodeURIComponent(selMatch[1])}&SerializedOrgFile=${encodeURIComponent(orgMatch[1])}&__RequestVerificationToken=${encodeURIComponent(fileToken || '')}`;
          const acceptResp = await client.request('https://chomikuj.pl/action/License/DownloadWarningAccept', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              'X-Requested-With': 'XMLHttpRequest',
              'Accept': 'application/json, text/javascript, */*; q=0.01',
              'Referer': targetUrl,
            },
            body: acceptBody,
          });

          if (acceptResp.statusCode === 200) {
            const acceptJson = JSON.parse(acceptResp.text);
            const redirectUrl = acceptJson.redirectUrl;
            if (redirectUrl) {
              console.log(`[Chomikuj] Uzyskano bezpośredni link pobierania: ${redirectUrl.substring(0, 50)}...`);
              const fileStreamResp = await client.request(redirectUrl, {
                headers: { 'Referer': 'https://chomikuj.pl/' },
              });

              if (fileStreamResp.statusCode === 200 && fileStreamResp.buffer.length > 500) {
                const buf = fileStreamResp.buffer;
                const magic = buf.slice(0, 4);
                const isEpubOrZip = magic[0] === 0x50 && magic[1] === 0x4b;
                const isPdf = buf.slice(0, 4).toString('utf-8').startsWith('%PDF');
                const finalExt = isPdf ? 'pdf' : isEpubOrZip ? 'epub' : detectedExt;
                const finalName = `${rawFilename.replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ._ -]/g, '_').trim()}.${finalExt}`;

                console.log(`[Chomikuj] Pomyślnie pobrano książkę "${finalName}" (${(buf.length / 1024).toFixed(1)} KB)`);
                return {
                  buffer: buf,
                  filename: finalName,
                };
              }
            }
          }
        }
      } catch (e: any) {
        console.warn('[Chomikuj] Błąd w procedurze akceptacji pobierania:', e.message);
      }
    }
  }

  throw new Error(`Plik "${cleanFilename}" na Chomikuj wymaga płatnego transferu lub konto ${accountLogin} nie ma wystarczających uprawnień.`);
}



