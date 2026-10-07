import JSZip from 'jszip';
import * as he from 'he';
import { ChapterData } from '../src/types';
import { ExtractedImage } from './extractor';

export interface EpubChapter extends ChapterData {
  imageBuffer?: Buffer;
  extractedImages?: ExtractedImage[];
}

export interface EpubOptions {
  title: string;
  author?: string;
  language?: string;
  chapters: EpubChapter[];
  coverImageBuffer?: Buffer;
}

export function sanitizeToAsciiFilename(name: string): string {
  const polishMap: Record<string, string> = {
    'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n', 'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z',
    'Ą': 'A', 'Ć': 'C', 'Ę': 'E', 'Ł': 'L', 'Ń': 'N', 'Ó': 'O', 'Ś': 'S', 'Ź': 'Z', 'Ż': 'Z',
  };
  const transliterated = name.replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, (m) => polishMap[m] || m);
  return (
    transliterated
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .substring(0, 60) || 'ksiazka'
  );
}

export function cleanHtmlEntitiesToUtf8(str: string): string {
  if (!str) return '';

  let decoded = str;

  // 1. Decode all HTML/XML entities iteratively (up to 4 passes for multi-escaped entities like &amp;amp;nbsp;)
  for (let pass = 0; pass < 4; pass++) {
    if (!decoded.includes('&')) break;
    const next = he.decode(decoded);
    if (next === decoded) break;
    decoded = next;
  }

  // 2. Specific cleaning of non-breaking spaces and zero-width/soft-hyphen characters
  decoded = decoded
    // Double-check any literal &nbsp; or &#160; remnants
    .replace(/&nbsp;/gi, '\u00A0')
    .replace(/&#160;/g, '\u00A0')
    .replace(/&#xA0;/gi, '\u00A0')
    // Remove invisible soft hyphens and zero-width spaces that render as boxes on Kindle/KOReader
    .replace(/[\u00AD\u200B\u200C\u200D\uFEFF]/g, '')
    .replace(/&(?:shy|zwnj|zwj);/gi, '')
    // Replace non-standard whitespace / tabs with clean single spaces
    .replace(/[\r\t\v\f]/g, ' ')
    // Normalize any surviving numeric XML entities into UTF-8 chars
    .replace(/&#(\d+);/g, (_, code) => {
      const n = parseInt(code, 10);
      if (n === 38) return '&';
      if (n === 60) return '<';
      if (n === 62) return '>';
      if (n >= 32 && n <= 65535) return String.fromCharCode(n);
      return '';
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const n = parseInt(hex, 16);
      if (n === 38) return '&';
      if (n === 60) return '<';
      if (n === 62) return '>';
      if (n >= 32 && n <= 65535) return String.fromCharCode(n);
      return '';
    });

  return decoded;
}

export function escapeXml(unsafe: string): string {
  if (!unsafe) return '';
  const decoded = cleanHtmlEntitiesToUtf8(unsafe);
  return decoded
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Formats body text to pristine XHTML, preserving formatting:
 * - Centered paragraphs (<p class="center">)
 * - Headings (h1, h2, h3, h4)
 * - Bold / Strong (b, strong)
 * - Italics / Em (i, em)
 * - Footnotes (sup, sub)
 * - Quotes (blockquote)
 * - Images (<img ... />)
 * - Separators (<hr/>)
 */
export function formatTextToXhtml(text: string): string {
  if (!text) return '<p></p>';
  let clean = cleanHtmlEntitiesToUtf8(text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g, ''));

  // Ensure hanging Polish prepositions don't orphan on Kindle
  clean = clean.replace(/ ([wzouiWZOUIA]) /g, ' $1\u00A0');
  clean = clean.replace(/>([wzouiWZOUIA]) /g, '>$1\u00A0');

  // If text already has HTML paragraphs/headings:
  if (/<p[\s>]|<h[1-6][\s>]|<blockquote[\s>]|<div[\s>]/i.test(clean)) {
    // 1. Ensure valid XML self-closing tags
    clean = clean.replace(/<br(?:\s*\/|\s*)>/gi, '<br/>');
    clean = clean.replace(/<hr(?:\s*\/|\s*)>/gi, '<hr/>');
    clean = clean.replace(/<img\b([^>]*?)(?:\s*\/|\s*)>/gi, '<img $1 />');

    // 2. Escape naked ampersands without breaking valid XML entities
    clean = clean.replace(/&(?!(?:amp|lt|gt|quot|apos);)/g, '&amp;');

    return clean;
  }

  // Fallback for plain text: split into paragraphs
  const paragraphs = clean
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return '<p></p>';

  return paragraphs
    .map((p) => {
      const cleanP = escapeXml(p).replace(/\n/g, '<br/>');
      return `<p>${cleanP}</p>`;
    })
    .join('\n      ');
}

/**
 * Generates an EPUB buffer 100% compatible with KOReader (CREngine), Kindle, Calibre, and PC readers.
 * Preserves original cover image, chapter illustrations, centered headings, italics, bold, quotes, and footnotes.
 */
/**
 * Intelligently resolves the chapter title and heading status to prevent duplicate headers
 * (e.g. prevents "CHAPTER 1 \n ROZDZIAŁ 1 \n OCEAN" by suppressing redundant external <h1>)
 */
export function resolveDisplayChapterTitle(
  chapter: EpubChapter,
  index: number,
  language: string = 'pl',
  prevTitle?: string
): { title: string; hasInternalHeading: boolean; isIllustrationOnly: boolean; isContinuation: boolean } {
  const content = chapter.translatedText || chapter.originalText || '';
  const rawTitle = (chapter.title || '').trim();

  // 1. Check for top headings (h1, h2, h3) in the chapter text
  const headingMatches = [...content.slice(0, 1500).matchAll(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/gi)];
  const extractedHeadings = headingMatches
    .map((m) => cleanHtmlEntitiesToUtf8(m[1].replace(/<[^>]+>/g, '').trim()))
    .filter(Boolean);

  const hasInternalHeading = extractedHeadings.length > 0;

  // 2. Check if this section is purely a full-page illustration
  const textOnly = content.replace(/<[^>]+>/g, '').trim();
  const hasImages =
    content.includes('<img') ||
    content.includes('<image') ||
    (chapter.extractedImages && chapter.extractedImages.length > 0) ||
    Boolean(chapter.imageBuffer);
  const isIllustrationOnly = hasImages && textOnly.length < 90;

  if (isIllustrationOnly) {
    return {
      title: language === 'pl' ? 'Ilustracja' : 'Illustration',
      hasInternalHeading: false,
      isIllustrationOnly: true,
      isContinuation: false,
    };
  }

  // 3. Front matter without heading (Welcome, Rozpocznij czytanie, Spis treści)
  if (!hasInternalHeading && (content.includes('Rozpocznij czytanie') || content.includes('toc.xhtml') || content.includes('welcome') || index === 0)) {
    return {
      title: language === 'pl' ? 'Strona tytułowa' : 'Title Page',
      hasInternalHeading: false,
      isIllustrationOnly: false,
      isContinuation: false,
    };
  }

  // 4. Section without heading following a chapter (continuation of prose across illustrations/page breaks)
  if (!hasInternalHeading && prevTitle && prevTitle !== 'Ilustracja' && prevTitle !== 'Strona tytułowa' && !prevTitle.includes('Ilustracja')) {
    const cleanPrev = prevTitle.replace(/\s*\(cd\.\)$/i, '');
    return {
      title: `${cleanPrev} (cd.)`,
      hasInternalHeading: false,
      isIllustrationOnly: false,
      isContinuation: true,
    };
  }

  const toPolishTitleCase = (str: string) => {
    return str
      .split(/\s+/)
      .map((w, i) => {
        const lower = w.toLowerCase();
        if (i > 0 && ['i', 'w', 'na', 'z', 'do', 'o', 'ze', 'za', 'pod', 'nad', 'się', 'dla', 'od', 'po'].includes(lower)) {
          return lower;
        }
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      })
      .join(' ');
  };

  // 5. If internal headings exist (e.g. <h1>ROZDZIAŁ 1</h1> <h1>OCEAN</h1>)
  if (extractedHeadings.length >= 2) {
    const h0 = extractedHeadings[0];
    const h1 = extractedHeadings[1];
    if (/^(?:rozdzia[łl]|chapter)\s*\d+/i.test(h0)) {
      const numPart = h0.replace(/chapter\b/i, 'Rozdział').trim();
      const namePart = toPolishTitleCase(h1);
      return {
        title: `${numPart}: ${namePart}`,
        hasInternalHeading: true,
        isIllustrationOnly: false,
        isContinuation: false,
      };
    }
  }

  if (extractedHeadings.length >= 1) {
    let h0 = extractedHeadings[0];
    if (/^chapter\s+(\d+)/i.test(h0)) {
      h0 = h0.replace(/^chapter\s+(\d+)/i, 'Rozdział $1');
    }
    return {
      title: toPolishTitleCase(h0),
      hasInternalHeading: true,
      isIllustrationOnly: false,
      isContinuation: false,
    };
  }

  // 6. Fallback based on raw chapter title
  let fallback = rawTitle;
  if (/^chapter\s+(\d+)/i.test(fallback)) {
    fallback = fallback.replace(/^chapter\s+(\d+)/i, 'Rozdział $1');
  } else if (/^a\s+note\s+about\s+the\s+story/i.test(fallback)) {
    fallback = 'Słowo o tej historii';
  } else if (/^acknowledgments/i.test(fallback)) {
    fallback = 'Podziękowania';
  } else if (/^about\s+the\s+author/i.test(fallback)) {
    fallback = 'O autorze';
  } else if (/^copyright/i.test(fallback)) {
    fallback = 'Prawa autorskie';
  } else if (/^prologue/i.test(fallback)) {
    fallback = 'Prolog';
  } else if (/^epilogue/i.test(fallback)) {
    fallback = 'Epilog';
  } else if (/^preface/i.test(fallback)) {
    fallback = 'Przedmowa';
  } else if (/^introduction/i.test(fallback)) {
    fallback = 'Wprowadzenie';
  } else if (!fallback || fallback.startsWith('chapter_')) {
    fallback = `Rozdział ${index + 1}`;
  }

  return {
    title: fallback,
    hasInternalHeading,
    isIllustrationOnly: false,
    isContinuation: false,
  };
}

export async function generateEpubBuffer(options: EpubOptions): Promise<Buffer> {
  const { title, author = 'Nieznany autor', language = 'pl', chapters } = options;
  const zip = new JSZip();

  // 1. mimetype (MUST be first and uncompressed per EPUB spec)
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  // 2. META-INF/container.xml
  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
  zip.file('META-INF/container.xml', containerXml);

  // 3. OEBPS/style.css - Kindle & E-Ink optimized styles with typography preservation
  const css = `
body {
  margin: 5% 5%;
  padding: 0;
  font-family: "Literata", "Georgia", "Charis SIL", serif;
  font-size: 1.15em;
  line-height: 1.65;
  text-align: justify;
  color: #111111;
  background-color: #ffffff;
}

h1, h2, h3, h4 {
  text-align: center;
  font-weight: bold;
  margin-top: 1.6em;
  margin-bottom: 0.9em;
  page-break-after: avoid;
}

h1 {
  font-size: 1.6em;
  border-bottom: 1px solid #777777;
  padding-bottom: 0.3em;
}

h2 {
  font-size: 1.35em;
}

h3 {
  font-size: 1.2em;
}

p {
  margin: 0 0 0.2em 0;
  text-indent: 1.5em;
}

p:first-of-type, h1 + p, h2 + p, h3 + p, hr + p {
  text-indent: 0;
}

/* Centered titles, headings & epigraphs */
p.center, .center, .title-center, [style*="text-align: center"], [style*="text-align:center"] {
  text-align: center !important;
  text-indent: 0 !important;
  margin-top: 0.8em;
  margin-bottom: 0.8em;
}

/* Blockquotes / Excerpts */
blockquote {
  margin: 1.4em 4%;
  padding-left: 1.2em;
  border-left: 3px solid #888888;
  font-style: italic;
  text-align: justify;
}

blockquote p {
  text-indent: 0;
}

/* Footnotes & Superscripts */
sup, .footnote, .fn {
  font-size: 0.75em;
  vertical-align: super;
  line-height: 0;
}

sub {
  font-size: 0.75em;
  vertical-align: sub;
  line-height: 0;
}

/* Scene break divider */
hr, .separator {
  border: 0;
  height: 1px;
  background: #888888;
  margin: 2em auto;
  width: 35%;
}

/* Images & Illustrations */
img {
  max-width: 95%;
  height: auto;
  margin: 1.2em auto;
  display: block;
  border-radius: 4px;
}

.illustration-box {
  text-align: center;
  margin: 1.5em auto;
  page-break-inside: avoid;
}

.illustration-box img {
  max-width: 92%;
  max-height: 520px;
  height: auto;
  display: inline-block;
}

/* Cover container */
.cover-container {
  text-align: center;
  padding: 1em 0;
}

.cover-container img {
  max-width: 95%;
  max-height: 88vh;
  height: auto;
}
`;
  zip.file('OEBPS/style.css', css);

  // 4. Generate chapter XHTML files and bundle images
  const bookUuid = `urn:uuid:${crypto.randomUUID()}`;
  const manifestItems: string[] = [];
  const spineItems: string[] = [];
  const navPoints: string[] = [];
  const navListItems: string[] = [];
  const bundledImageFilenames = new Set<string>();

  manifestItems.push(`<item id="css" href="style.css" media-type="text/css"/>`);
  manifestItems.push(`<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`);
  manifestItems.push(`<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`);

function toSafeBuffer(raw: any): Buffer | null {
  if (!raw) return null;
  if (Buffer.isBuffer(raw)) return raw;
  if (raw.type === 'Buffer' && Array.isArray(raw.data)) {
    return Buffer.from(raw.data);
  }
  if (Array.isArray(raw)) {
    return Buffer.from(raw);
  }
  if (typeof raw === 'string') {
    return Buffer.from(raw, 'base64');
  }
  return null;
}

  const safeCoverBuf = toSafeBuffer(options.coverImageBuffer);
  const hasCover = Boolean(safeCoverBuf && safeCoverBuf.length > 0);

  // Handle Cover Image if present
  if (hasCover && safeCoverBuf) {
    zip.file('OEBPS/images/cover.jpg', safeCoverBuf, { compression: 'STORE' });
    manifestItems.push(`<item id="cover-image" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>`);

    const coverXhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(language)}" lang="${escapeXml(language)}">
  <head>
    <meta charset="utf-8"/>
    <title>Okładka</title>
    <link rel="stylesheet" type="text/css" href="style.css"/>
  </head>
  <body style="margin:0;padding:0;text-align:center;">
    <div class="cover-container">
      <img src="images/cover.jpg" alt="${escapeXml(title)}"/>
      <h1 style="border:none;margin-top:0.8em;font-size:1.4em;">${escapeXml(title)}</h1>
      <p style="text-align:center;font-style:italic;">${escapeXml(author)}</p>
    </div>
  </body>
</html>`;
    zip.file('OEBPS/cover.xhtml', coverXhtml);
    manifestItems.push(`<item id="cover_page" href="cover.xhtml" media-type="application/xhtml+xml"/>`);
    spineItems.push(`<itemref idref="cover_page" linear="yes"/>`);

    navPoints.push(`
    <navPoint id="np_cover" playOrder="1">
      <navLabel><text>Okładka</text></navLabel>
      <content src="cover.xhtml"/>
    </navPoint>`);

    navListItems.push(`<li><a href="cover.xhtml">Okładka</a></li>`);
  }

  // Include Nav in Spine so both EPUB 2 and EPUB 3 readers validate without spine errors
  spineItems.push(`<itemref idref="nav" linear="yes"/>`);


  let lastMajorTitle = '';

  chapters.forEach((chapter, index) => {
    const chapterId = `chapter_${index + 1}`;
    const filename = `${chapterId}.xhtml`;
    const resolvedMeta = resolveDisplayChapterTitle(chapter, index, language, lastMajorTitle);
    if (!resolvedMeta.isIllustrationOnly && !resolvedMeta.isContinuation) {
      lastMajorTitle = resolvedMeta.title;
    }
    const chapterTitle = resolvedMeta.title;
    const bodyContent = formatTextToXhtml(chapter.translatedText || chapter.originalText);

    // Bundle extracted illustrations from this chapter
    if (Array.isArray(chapter.extractedImages)) {
      for (const img of chapter.extractedImages) {
        const safeImgBuf = toSafeBuffer(img.buffer);
        if (safeImgBuf && safeImgBuf.length > 0 && !bundledImageFilenames.has(img.filename)) {
          bundledImageFilenames.add(img.filename);
          zip.file(`OEBPS/images/${img.filename}`, safeImgBuf, { compression: 'STORE' });
          manifestItems.push(`<item id="${img.id}" href="images/${img.filename}" media-type="${img.mediaType || 'image/jpeg'}"/>`);
        }
      }
    }

    // Legacy or storybook generated cover/chapter illustration
    let illustrationHtml = '';
    const safeChImgBuf = toSafeBuffer(chapter.imageBuffer);
    if (safeChImgBuf && safeChImgBuf.length > 0) {
      const imgFilename = `ch_${index + 1}_legacy.jpg`;
      if (!bundledImageFilenames.has(imgFilename)) {
        bundledImageFilenames.add(imgFilename);
        zip.file(`OEBPS/images/${imgFilename}`, safeChImgBuf, { compression: 'STORE' });
        manifestItems.push(`<item id="img_ch_${index + 1}" href="images/${imgFilename}" media-type="image/jpeg"/>`);
      }
      illustrationHtml = `
      <div class="illustration-box">
        <img src="images/${imgFilename}" alt="${escapeXml(chapterTitle)} - ilustracja"/>
      </div>`;
    }

    // Only inject <h1> if the chapter does NOT already have an internal heading
    // (Prevents duplicate headers like "CHAPTER 1 \n ROZDZIAŁ 1 \n OCEAN")
    const headingHtml =
      !resolvedMeta.hasInternalHeading && !resolvedMeta.isIllustrationOnly
        ? `<h1>${escapeXml(chapterTitle)}</h1>`
        : '';

    const chapterXhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(language)}" lang="${escapeXml(language)}">
  <head>
    <meta charset="utf-8"/>
    <title>${escapeXml(chapterTitle)}</title>
    <link rel="stylesheet" type="text/css" href="style.css"/>
  </head>
  <body>
    ${headingHtml}
    ${illustrationHtml}
    <div class="chapter-content">
      ${bodyContent}
    </div>
  </body>
</html>`;

    zip.file(`OEBPS/${filename}`, chapterXhtml);
    manifestItems.push(`<item id="${chapterId}" href="${filename}" media-type="application/xhtml+xml"/>`);
    spineItems.push(`<itemref idref="${chapterId}" linear="yes"/>`);

    const playOrderNum = hasCover ? index + 3 : index + 2;
    navPoints.push(`
    <navPoint id="np_${index + 1}" playOrder="${playOrderNum}">
      <navLabel><text>${escapeXml(chapterTitle)}</text></navLabel>
      <content src="${filename}"/>
    </navPoint>`);

    // Only include meaningful chapters or named sections in the visual TOC list
    // (Omits standalone mid-chapter illustration pages so the TOC isn't polluted with 30 "Ilustracja" entries)
    if (!resolvedMeta.isIllustrationOnly && !resolvedMeta.isContinuation) {
      navListItems.push(`<li><a href="${filename}">${escapeXml(chapterTitle)}</a></li>`);
    }
  });

  // 5. OEBPS/nav.xhtml (EPUB 3 Navigation Document + EPUB 2 fallback)
  const navXhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(language)}" lang="${escapeXml(language)}">
  <head>
    <meta charset="utf-8"/>
    <title>Spis treści</title>
    <link rel="stylesheet" type="text/css" href="style.css"/>
  </head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>Spis treści</h1>
      <ol>
        ${navListItems.join('\n        ')}
      </ol>
    </nav>
  </body>
</html>`;
  zip.file('OEBPS/nav.xhtml', navXhtml);

  // 6. OEBPS/toc.ncx (EPUB 2 Navigation File - for Kindle / older KOReader)
  const tocNcx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="${escapeXml(language)}">
  <head>
    <meta name="dtb:uid" content="${bookUuid}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle>
    <text>${escapeXml(title)}</text>
  </docTitle>
  <docAuthor>
    <text>${escapeXml(author)}</text>
  </docAuthor>
  <navMap>
    ${navPoints.join('\n')}
  </navMap>
</ncx>`;
  zip.file('OEBPS/toc.ncx', tocNcx);

  // 7. OEBPS/content.opf (Full EPUB 3 + EPUB 2 Package Manifest)
  const contentOpf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="BookId" xml:lang="${escapeXml(language)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier id="BookId">${bookUuid}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:language>${escapeXml(language)}</dc:language>
    <dc:creator id="creator">${escapeXml(author)}</dc:creator>
    <meta refines="#creator" property="role" scheme="marc:relators">aut</meta>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
    ${hasCover ? '<meta name="cover" content="cover-image"/>' : ''}
  </metadata>
  <manifest>
    ${manifestItems.join('\n    ')}
  </manifest>
  <spine toc="ncx">
    ${spineItems.join('\n    ')}
  </spine>
  <guide>
    ${hasCover ? '<reference type="cover" title="Okładka" href="cover.xhtml"/>' : ''}
    <reference type="toc" title="Spis treści" href="nav.xhtml"/>
  </guide>
</package>`;
  zip.file('OEBPS/content.opf', contentOpf);

  // 8. Generate Buffer
  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    mimeType: 'application/epub+zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });

  return buffer;
}
