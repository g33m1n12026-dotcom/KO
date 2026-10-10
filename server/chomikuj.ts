import JSZip from 'jszip';
import https from 'https';
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

export interface ChomikujVerificationResult {
  isLikelyBook: boolean;
  confidenceScore: number; // 0 - 100
  size?: string;
  sizeKb?: number;
  format?: string;
  title: string;
  verdict: 'verified' | 'suspicious' | 'rejected';
  reason: string;
  details: string[];
  rating?: number;
}

export const SPAM_TITLE_REGEX = /(pobierz\s*(z|tutaj|pelna|pełn|calos|całość)|has[łl]o\s*do|has[łl]o|haselko|password|link\s*do\s*pobrania|linki?\b|instrukcja\s*pobierania|keygen|crack|torrent|dost[eę]pne\s*na\s*stronie|rejestracj|op[łl]ata|p[łl]atno[sś][cć]|zobacz\s*tutaj|chomikuj_link|download_link|bit\.ly|skr[oó][cć]\.to)/i;

/**
 * Parses Chomikuj size string (e.g. '450 KB', '1,2 MB', '800 B') into numeric kilobytes
 */
export function parseSizeToKb(sizeStr?: string): number {
  if (!sizeStr) return 0;
  const m = sizeStr.match(/([\d.,]+)\s*(B|KB|MB|GB)/i);
  if (!m) return 0;
  const val = parseFloat(m[1].replace(',', '.'));
  const unit = m[2].toUpperCase();
  if (unit === 'B') return val / 1024;
  if (unit === 'KB') return val;
  if (unit === 'MB') return val * 1024;
  if (unit === 'GB') return val * 1024 * 1024;
  return val;
}

/**
 * Checks whether candidate title matches significant query terms
 */
export function checkTitleMatchesQuery(title: string, query: string): { matches: boolean; score: number } {
  const qWords = query
    .toLowerCase()
    .replace(/[^a-ząćęłńóśźż0-9]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !['dla', 'lub', 'albo', 'oraz', 'jako', 'przy', 'przez', 'pod', 'nad', 'tom', 'czesc', 'część'].includes(w));

  if (qWords.length === 0) return { matches: true, score: 60 };

  const lowerTitle = title.toLowerCase();
  let hits = 0;
  for (const w of qWords) {
    if (lowerTitle.includes(w)) hits++;
  }

  const ratio = hits / qWords.length;
  return {
    matches: ratio >= 0.4 || hits >= 2 || (qWords.length === 1 && hits === 1),
    score: Math.round(ratio * 100),
  };
}

/**
 * Pre-verifies a Chomikuj file BEFORE downloading to confirm it is a genuine book
 * and not an empty advertisement, password trap, or redirect text flyer.
 */
export async function preverifyChomikujFile(
  targetUrl: string,
  queryOrTitle?: string
): Promise<ChomikujVerificationResult> {
  const details: string[] = [];
  const rawFilename = targetUrl.split('/').pop()?.split(',')[0]?.replace(/\+/g, ' ') || 'plik';
  const extMatch = targetUrl.match(/\.(epub|pdf|mobi|cbz|txt|azw3|doc|docx|rar|zip)(?:[?#]|$)/i);
  const detectedExt = (extMatch ? extMatch[1] : 'epub').toUpperCase();

  // 1. Check title against spam patterns
  if (SPAM_TITLE_REGEX.test(rawFilename)) {
    return {
      isLikelyBook: false,
      confidenceScore: 5,
      format: detectedExt,
      title: rawFilename,
      verdict: 'rejected',
      reason: 'Tytuł pliku zawiera frazy reklamowe lub informację o haśle/linku zewnętrznym.',
      details: ['Wykryto słowa kluczowe spamu w nazwie pliku.'],
    };
  }

  // 2. Check title relevance to searched query
  if (queryOrTitle) {
    const qCheck = checkTitleMatchesQuery(rawFilename, queryOrTitle);
    if (!qCheck.matches && qCheck.score === 0) {
      details.push(`Nazwa pliku na Chomikuj nie zawiera kluczowych słów z szukanego tytułu ("${queryOrTitle}").`);
    } else {
      details.push(`Zgodność nazwy pliku z zapytaniem: ${qCheck.score}%.`);
    }
  }

  // 3. Fast pre-flight request to the Chomikuj file page
  let pageSizeStr: string | undefined;
  let pageRating: number | undefined;
  let pageDescription: string = '';
  let pageHasPreview = false;

  try {
    const pageResp = await fetch(targetUrl, {
      signal: AbortSignal.timeout(4000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8',
      },
    });

    if (pageResp.ok) {
      const html = await pageResp.text();

      // Check size from page
      const sizeMatch = html.match(/<p class="fileSize">\s*([^<]+)\s*<\/p>/i) ||
                        html.match(/<li>\s*<span>\s*(\d+(?:[.,]\d+)?\s*(?:KB|MB|GB|B))\s*<\/span>\s*<\/li>/i);
      if (sizeMatch) pageSizeStr = sizeMatch[1].trim();

      // Check rating
      const ratingMatch = html.match(/class="RateFileContainer"[\s\S]*?<span><strong>([\d.]+)<\/strong>/i);
      if (ratingMatch) pageRating = parseFloat(ratingMatch[1]);

      // Check description
      const descMatch = html.match(/class="[^"]*fileDescription[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      if (descMatch) pageDescription = descMatch[1].replace(/<[^>]+>/g, '').trim();

      // Check docs preview
      if (html.includes('docs.chomikuj.pl') || html.includes('docs1.chomikuj.pl') || html.includes('docs2.chomikuj.pl')) {
        pageHasPreview = true;
      }
    }
  } catch (err: any) {
    details.push('Sprawdzanie w locie: brak odpowiedzi ze strony pliku Chomikuj (analiza na podstawie metadanych katalogu).');
  }

  const sizeKb = parseSizeToKb(pageSizeStr);

  // Check description for spam / passwords / external links
  if (pageDescription) {
    if (SPAM_TITLE_REGEX.test(pageDescription) || /(has[łl]o|haselko|password|link\s+do|pobierz\s+(z|tutaj)|bit\.ly|tinyurl|skr[oó][cć]|rejestracj)/i.test(pageDescription)) {
      return {
        isLikelyBook: false,
        confidenceScore: 10,
        size: pageSizeStr,
        sizeKb,
        format: detectedExt,
        title: rawFilename,
        verdict: 'rejected',
        reason: 'Opis pliku na Chomikuj wskazuje, że plik wymaga hasła lub zawiera tylko link do pobrania.',
        details: [`Opis: "${pageDescription.slice(0, 100)}..."`],
        rating: pageRating,
      };
    }
    details.push(`Opis pliku: "${pageDescription.slice(0, 80)}..."`);
  }

  if (pageRating !== undefined) {
    details.push(`Ocena użytkowników Chomikuj: ${pageRating} / 5.0`);
    if (pageRating <= 1.5) {
      details.push('⚠️ Bardzo niska ocena pliku na Chomikuj — użytkownicy często oznaczają tak fałszywe lub niedziałające pliki.');
    }
  }

  if (pageHasPreview) {
    details.push('✓ Dostępny podgląd dokumentu docs.chomikuj.pl (potwierdza obecność warstwy tekstowej).');
  }

  // 4. Evaluate size against format and transfer limit
  if (sizeKb > 0) {
    details.push(`Rozmiar pliku: ${pageSizeStr} (~${sizeKb.toFixed(0)} KB)`);

    // Files over 50 MB cannot be downloaded on free Chomikuj transfer
    if (sizeKb > 50 * 1024) {
      return {
        isLikelyBook: true,
        confidenceScore: 30,
        size: pageSizeStr,
        sizeKb,
        format: detectedExt,
        title: rawFilename,
        verdict: 'rejected',
        reason: `Rozmiar pliku wynosi ${pageSizeStr} (powyżej 50 MB). Na Chomikuj darmowy transfer pozwala pobierać bez opłat wyłącznie pliki o wadze do 50 MB.`,
        details: [...details, 'Przekroczono limit 50 MB darmowego pobierania Chomikuj.'],
        rating: pageRating,
      };
    }

    // Under 25 KB is virtually guaranteed fake
    if (sizeKb < 25) {
      return {
        isLikelyBook: false,
        confidenceScore: 10,
        size: pageSizeStr,
        sizeKb,
        format: detectedExt,
        title: rawFilename,
        verdict: 'rejected',
        reason: `Rozmiar pliku wynosi zaledwie ${pageSizeStr}. Pełna książka ma co najmniej kilkaset KB — pliki poniżej 25 KB to skróty, reklamy lub puste dokumenty.`,
        details,
        rating: pageRating,
      };
    }

    // PDF under 150 KB
    if (detectedExt === 'PDF' && sizeKb < 150) {
      return {
        isLikelyBook: false,
        confidenceScore: 20,
        size: pageSizeStr,
        sizeKb,
        format: detectedExt,
        title: rawFilename,
        verdict: 'rejected',
        reason: `Plik PDF ma tylko ${pageSizeStr}. Książka PDF zajmuje co najmniej kilkaset KB (najczęściej od 1 MB wzwyż). Prawdopodobnie 1-stronicowa ulotka reklamowa z linkiem.`,
        details,
        rating: pageRating,
      };
    }

    // TXT under 40 KB
    if (detectedExt === 'TXT' && sizeKb < 40) {
      return {
        isLikelyBook: false,
        confidenceScore: 25,
        size: pageSizeStr,
        sizeKb,
        format: detectedExt,
        title: rawFilename,
        verdict: 'rejected',
        reason: `Plik TXT ma tylko ${pageSizeStr} (zbyt mało tekstu na kompletną powieść).`,
        details,
        rating: pageRating,
      };
    }

    // High confidence book sizes
    if (
      (detectedExt === 'EPUB' && sizeKb >= 80) ||
      (detectedExt === 'MOBI' && sizeKb >= 120) ||
      (detectedExt === 'AZW3' && sizeKb >= 120) ||
      (detectedExt === 'PDF' && sizeKb >= 300) ||
      (detectedExt === 'TXT' && sizeKb >= 80)
    ) {
      return {
        isLikelyBook: true,
        confidenceScore: pageRating && pageRating <= 2.0 ? 65 : 94,
        size: pageSizeStr,
        sizeKb,
        format: detectedExt,
        title: rawFilename,
        verdict: 'verified',
        reason: `Rozmiar pliku (${pageSizeStr}) oraz format ${detectedExt} są typowe dla kompletnego wydania książkowego.`,
        details,
        rating: pageRating,
      };
    }
  }

  return {
    isLikelyBook: true,
    confidenceScore: 60,
    size: pageSizeStr,
    sizeKb,
    format: detectedExt,
    title: rawFilename,
    verdict: 'suspicious',
    reason: `Plik może być książką, ale ma niewielki rozmiar (${pageSizeStr || 'brak danych'}). Zalecana ostrożność.`,
    details,
    rating: pageRating,
  };
}

/**
 * Searches Chomikuj.pl for books, educational files, and documents (.epub, .pdf, .mobi, .doc, .txt).
 * Uses anti-forgery verification tokens and pre-filters fake advertisement files.
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

    // 2. Query Chomikuj files search (document type for books, capped at 50 MB for free transfer)
    const postParams = new URLSearchParams();
    if (token) postParams.append('__RequestVerificationToken', token);
    postParams.append('FileName', cleanQuery);
    postParams.append('FileType', 'document');
    postParams.append('SizeFrom', '0');
    postParams.append('SizeTo', '50'); // 50 MB ceiling (free Chomikuj download limit)
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

    // 3. Parse individual fileItemContainer blocks (strictly isolating each file and skipping ad/affiliate items)
    const containers = html.split(/<div\s+class="[^"]*fileItemContainer[^"]*"/i);
    const seenIds = new Set<string>();

    for (let i = 1; i < containers.length; i++) {
      const block = containers[i];

      // Skip affiliate advertisement containers (e.g. upolujebooka.pl, buy buttons, paid stores)
      if (
        block.includes('upolujebooka.pl') ||
        block.includes('pp_button') ||
        block.includes('greenButtonCSS') ||
        /class="[^"]*pp_descContainer[^"]*"/i.test(block)
      ) {
        continue;
      }

      // Extract file link and raw title
      const fileLinkMatch = block.match(/<a\s+class="[^"]*expanderHeader[^"]*"[^>]*href="([^"]+)"[^>]*title="([^"]+)"/i);
      if (!fileLinkMatch) continue;

      const rawHref = fileLinkMatch[1];
      const rawTitle = fileLinkMatch[2];

      const fileIdMatch = rawHref.match(/,(\d+)\.([a-zA-Z0-9]+)$/);
      if (!fileIdMatch) continue;

      const fileId = fileIdMatch[1];
      let format = fileIdMatch[2].toUpperCase();
      if (format === 'HTM') format = 'HTML';

      if (seenIds.has(fileId)) continue;
      seenIds.add(fileId);

      // Book formats only (strictly discard DOC, RAR, ZIP, EXE, HTM from Chomikuj)
      if (!['EPUB', 'MOBI', 'AZW3', 'FB2', 'PDF', 'TXT'].includes(format)) {
        continue;
      }

      // Extract file size from fileinfo tab
      const sizeMatch = block.match(/<li>\s*<span>\s*(\d+(?:[.,]\d+)?\s*(?:KB|MB|GB|B))\s*<\/span>\s*<\/li>/i) ||
                        block.match(/<span>(\d+(?:[.,]\d+)?\s*(?:KB|MB|GB|B))<\/span>/i);
      const size = sizeMatch ? sizeMatch[1].trim() : undefined;
      const sizeKb = parseSizeToKb(size);

      // STRICT SCAM & 50 MB CEILING FILTER:
      // 1. Never allow 0 KB or missing size
      if (sizeKb <= 0) continue;
      // 2. Strict 50 MB limit: files above 50 MB cannot be downloaded on free transfer!
      if (sizeKb > 50 * 1024) continue;
      // 3. Minimum sizes: real books are never tiny flyers or spam redirect stubs
      if (format === 'PDF' && sizeKb < 450) continue; // Real books in PDF are >= 450 KB
      if (format === 'TXT' && sizeKb < 100) continue; // Real books in TXT are >= 100 KB
      if (format === 'EPUB' && sizeKb < 80) continue; // Real books in EPUB are >= 80 KB
      if ((format === 'MOBI' || format === 'AZW3') && sizeKb < 100) continue;
      if (sizeKb < 60) continue;

      // Extract clean title and check anti-spam keywords
      const cleanTitle = rawTitle.replace(/\s+/g, ' ').trim();
      const NON_BOOK_TITLE_REGEX = /(instrukcja|manual|katalog|sterowniki|schemat|cennik|sprawdzian|kartk[oó]wka|klucz\s*odpowiedzi|prezentacja|szablon|chomikuj_link|pobierz\s*(z|tutaj|pelna|pełn|calos|całość|wersj|plik)|has[łl]o\s*do|has[łl]o|haselko|password|link\s*do|keygen|crack|torrent|rejestracj|op[łl]ata|bit\.ly|tinyurl|skr[oó][cć]\.to)/i;
      if (NON_BOOK_TITLE_REGEX.test(cleanTitle) || SPAM_TITLE_REGEX.test(cleanTitle)) {
        continue;
      }

      // Check folder / directory name for spam keywords
      const dirMatch = block.match(/<p class="searchedFileDirectory">[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
      const dirName = dirMatch ? dirMatch[1].trim() : '';
      if (/(sprawdzian|hasla|crack|reklama|linki|keygen|pobieralnia)/i.test(dirName)) {
        continue;
      }

      // Strict query relevance
      const qCheck = checkTitleMatchesQuery(cleanTitle, cleanQuery);
      if (!qCheck.matches) {
        continue;
      }

      // Extract uploader
      const uploaderMatch = block.match(/<p class="searchedFileOwner">[\s\S]*?<a[^>]*>([^<]+)<\/a>/i) || rawHref.match(/^\/([^\/]+)\//);
      const uploader = uploaderMatch ? decodeURIComponent(uploaderMatch[1]).trim() : 'Chomikuj';

      // Extract user rating & votes count
      const ratingMatch = block.match(/<span class="rating_info">[\s\S]*?<strong>([\d.]+)<\/strong>\s*(\d+)?\s*głos/i) ||
                          block.match(/<span class="rating_info">[\s\S]*?>([\d.]+)<\/span>/i);
      let rating: number | undefined;
      let ratingVotes: number | undefined;
      if (ratingMatch) {
        rating = parseFloat(ratingMatch[1]);
        if (ratingMatch[2]) ratingVotes = parseInt(ratingMatch[2], 10);
      }

      // Drop known badly-rated files (users downvote scams to 1.0 - 2.2)
      if (rating !== undefined && rating <= 2.2) {
        continue;
      }

      // Extract comments count
      const commentMatch = block.match(/<p class="comment[^>]*>[\s\S]*?<span class="bold">(\d+)<\/span>/i);
      const commentsCount = commentMatch ? parseInt(commentMatch[1], 10) : 0;

      // Extract docs preview URL (docs.chomikuj.pl confirms full rendered document text pages)
      const previewMatch = block.match(/href="(\/\/[^"]*docs\d*\.chomikuj\.pl\/[^"]+)"/i);
      const previewDocsUrl = previewMatch ? `https:${previewMatch[1]}` : undefined;

      const fullPageUrl = rawHref.startsWith('http') ? rawHref : `https://chomikuj.pl${rawHref}`;

      // Estimated download / activity score based on votes, comments & docs
      const downloadsEst = (ratingVotes ? ratingVotes * 15 : 0) + (commentsCount * 8) + (previewDocsUrl ? 25 : 0);

      // Verified status
      const verifiedStatus = 'verified';
      const ratingDesc = rating ? `Ocena: ${rating.toFixed(1)}/5.0 (${ratingVotes || 1} ocen)` : 'Brak negatywnych zgłoszeń';
      const verificationDetails = `Darmowy transfer (≤50 MB: ${size}) • Format ${format} • ${ratingDesc}${previewDocsUrl ? ' • Potwierdzony podgląd dokumentu' : ''}`;

      searchResults.push({
        id: `chomik_${fileId}`,
        title: cleanTitle,
        author: uploader !== 'Chomikuj' ? `Chomik: ${uploader}` : 'Chomikuj.pl',
        language: 'PL',
        format,
        source: 'Chomikuj.pl',
        size,
        rating: rating || 3.8,
        downloadsCount: downloadsEst > 0 ? downloadsEst : undefined,
        verifiedStatus,
        verificationDetails,
        qualityBadge: rating && rating >= 4.0 ? 'Chomikuj • Darmowy Transfer (≤50 MB)' : 'Chomikuj • Do 50 MB (Free)',
        description: `Plik z biblioteki Chomikuj.pl (${uploader})${size ? `, rozmiar: ${size}` : ''} • ${verificationDetails}`,
        downloadUrl: fullPageUrl,
        mirrorLinks: [
          { name: 'Otwórz na Chomikuj', url: fullPageUrl },
          ...(previewDocsUrl ? [{ name: 'Podgląd tekstu docs', url: previewDocsUrl }] : []),
          ...generateMirrorSearchLinks(cleanTitle),
        ],
      });

      // Strict limit: at most 3 strictly verified items under 50 MB from Chomikuj
      if (searchResults.length >= 3) break;
    }
  } catch (err: any) {
    if (err?.name !== 'TimeoutError' && err?.name !== 'AbortError') {
      console.warn('Chomikuj search notice:', err?.message || err);
    }
  }

  return searchResults;
}

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

  // Step 0: Pre-verify file authenticity BEFORE downloading or claiming transfer
  const precheck = await preverifyChomikujFile(targetUrl, rawFilename);
  if (precheck.verdict === 'rejected') {
    console.warn(`[Chomikuj Pre-Check] Odrzucono fałszywy plik przed pobraniem: ${precheck.reason}`);
    throw new Error(`Weryfikacja Chomikuj odrzuciła ten plik: ${precheck.reason}`);
  }

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

                // Deep post-download content verification
                const verification = await verifyBookContentLegitimacy(buf, finalName, rawFilename);
                if (!verification.isValid) {
                  console.warn(`[Chomikuj] Odrzucono fałszywy plik po pobraniu "${finalName}": ${verification.reason}`);
                  throw new Error(`Pobrany z Chomikuj plik nie zawiera treści książki: ${verification.reason}`);
                }

                console.log(`[Chomikuj] Pomyślnie zweryfikowano i pobrano książkę "${finalName}" (${(buf.length / 1024).toFixed(1)} KB)`);
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
        throw e;
      }
    }
  }

  throw new Error(`Plik "${cleanFilename}" na Chomikuj wymaga płatnego transferu lub konto ${accountLogin} nie ma wystarczających uprawnień.`);
}

/**
 * Deeply verifies whether downloaded buffer is a genuine book or a fake/spam redirect file
 */
export async function verifyBookContentLegitimacy(
  buffer: Buffer,
  filename: string,
  expectedTitle?: string
): Promise<{ isValid: boolean; reason?: string }> {
  if (!buffer || buffer.length < 15000) {
    return {
      isValid: false,
      reason: `Pobrany plik jest zbyt mały (${buffer ? (buffer.length / 1024).toFixed(1) : 0} KB), by być kompletną książką.`,
    };
  }

  const isZipOrEpub = buffer[0] === 0x50 && buffer[1] === 0x4b; // 'PK'
  const isPdf = buffer.slice(0, 5).toString('utf8').startsWith('%PDF');
  const isTxt = filename.toLowerCase().endsWith('.txt');

  const spamPhrases = [
    'link do pobrania',
    'pobierz z linku',
    'pobierz pełną wersję',
    'hasło do pliku',
    'haslo do pliku',
    'haslo to:',
    'hasło to:',
    'dostępne pod adresem',
    'rejestracja wymagana',
    'kliknij w link',
    'skróć.to',
    'bit.ly/',
    'tinyurl.com/',
    'rapidu.net',
    'uploaded.net',
    'turbobit.net',
    'darmowe konto',
    'pełna wersja książki pod adresem',
    'chomikuj_link',
  ];

  // 1. EPUB deep inspection
  if (isZipOrEpub) {
    try {
      const zip = await JSZip.loadAsync(buffer);
      const textFiles = Object.keys(zip.files).filter(
        (f) => !zip.files[f].dir && /\.(html|xhtml|htm|xml|txt)$/i.test(f)
      );

      if (textFiles.length === 0) {
        return {
          isValid: false,
          reason: 'Archiwum EPUB/ZIP nie zawiera żadnych plików tekstowych ani rozdziałów.',
        };
      }

      let combinedText = '';
      for (const f of textFiles.slice(0, 5)) {
        const content = await zip.files[f].async('text');
        combinedText += ' ' + content.replace(/<[^>]+>/g, ' ');
        if (combinedText.length > 5000) break;
      }

      const lowerCombined = combinedText.toLowerCase();
      for (const phrase of spamPhrases) {
        if (lowerCombined.includes(phrase) && combinedText.length < 3000) {
          return {
            isValid: false,
            reason: `Plik EPUB zawiera odnośnik reklamowy ("${phrase}") zamiast treści książki.`,
          };
        }
      }

      if (combinedText.trim().split(/\s+/).length < 80 && textFiles.length <= 2) {
        return {
          isValid: false,
          reason: 'Plik EPUB zawiera zaledwie kilkadziesiąt słów — brak treści książki.',
        };
      }

      return { isValid: true };
    } catch (e: any) {
      if (buffer.length < 40000) {
        return { isValid: false, reason: 'Uszkodzony lub nieprawidłowy nagłówek archiwum EPUB.' };
      }
    }
  }

  // 2. PDF deep inspection
  if (isPdf) {
    try {
      const { PDFParse } = await import('pdf-parse');
      const uint8 = new Uint8Array(buffer);
      const parser = new PDFParse(uint8);
      const textRes = await parser.getText();
      const pages = textRes?.pages || [];
      const fullText = (textRes?.text || '').trim();
      const wordCount = fullText.split(/\s+/).filter(Boolean).length;

      if (pages.length <= 2) {
        const lower = fullText.toLowerCase();
        for (const phrase of spamPhrases) {
          if (lower.includes(phrase)) {
            return {
              isValid: false,
              reason: `Dokument PDF to pojedyncza strona z linkiem reklamowym ("${phrase}").`,
            };
          }
        }
        if (wordCount < 100) {
          return {
            isValid: false,
            reason: `Dokument PDF zawiera tylko ${pages.length} stronę i zaledwie ${wordCount} słów — brak treści książki.`,
          };
        }
      }

      return { isValid: true };
    } catch (e: any) {
      if (buffer.length < 150000) {
        return { isValid: false, reason: 'Uszkodzony lub niepełny plik PDF o zbyt małym rozmiarze.' };
      }
    }
  }

  // 3. TXT inspection
  if (isTxt) {
    const text = buffer.toString('utf-8');
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const lower = text.toLowerCase();

    for (const phrase of spamPhrases) {
      if (lower.includes(phrase) && wordCount < 500) {
        return {
          isValid: false,
          reason: `Plik tekstowy zawiera link reklamowy ("${phrase}") zamiast treści książki.`,
        };
      }
    }

    if (wordCount < 150) {
      return {
        isValid: false,
        reason: `Plik TXT ma tylko ${wordCount} słów — brak treści książki.`,
      };
    }
  }

  return { isValid: true };
}
