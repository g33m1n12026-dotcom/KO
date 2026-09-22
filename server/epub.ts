import JSZip from 'jszip';
import { ChapterData } from '../src/types';

interface EpubChapter extends ChapterData {
  imageBuffer?: Buffer;
}

interface EpubOptions {
  title: string;
  author?: string;
  language?: string;
  chapters: EpubChapter[];
  coverImageBuffer?: Buffer;
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatTextToXhtml(text: string): string {
  const paragraphs = text
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(Boolean);

  return paragraphs
    .map(p => {
      // Check if it's dialogue starting with em-dash
      const cleanP = escapeXml(p);
      return `<p>${cleanP}</p>`;
    })
    .join('\n      ');
}

/**
 * Generates an EPUB 3 buffer compatible with KOReader and Kindle devices
 */
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

  // 3. OEBPS/style.css - Kindle & E-Ink optimized styles
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

h1, h2, h3 {
  text-align: center;
  font-weight: bold;
  margin-top: 1.5em;
  margin-bottom: 1em;
  page-break-after: avoid;
}

h1 {
  font-size: 1.6em;
  border-bottom: 1px solid #777777;
  padding-bottom: 0.3em;
}

p {
  margin: 0;
  text-indent: 1.5em;
}

p:first-of-type, h1 + p, h2 + p {
  text-indent: 0;
}

.translator-note {
  font-size: 0.85em;
  font-style: italic;
  text-align: center;
  margin: 2em 0;
  color: #555555;
}

.illustration-box {
  text-align: center;
  margin: 1.5em auto;
  page-break-inside: avoid;
}

.illustration-box img {
  max-width: 90%;
  max-height: 520px;
  height: auto;
  border-radius: 6px;
  display: inline-block;
  filter: grayscale(100%) contrast(108%);
}

.cover-container {
  text-align: center;
  padding: 2em 0;
}

.cover-container img {
  max-width: 92%;
  max-height: 90vh;
  height: auto;
  filter: grayscale(100%) contrast(108%);
}
`;
  zip.file('OEBPS/style.css', css);

  // 4. Generate chapter XHTML files and bundle images
  const bookUuid = `urn:uuid:${Math.random().toString(36).substring(2)}-${Date.now()}`;
  const manifestItems: string[] = [];
  const spineItems: string[] = [];
  const navPoints: string[] = [];
  const navListItems: string[] = [];

  manifestItems.push(`<item id="css" href="style.css" media-type="text/css"/>`);
  manifestItems.push(`<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`);
  manifestItems.push(`<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`);

  // Handle Cover Image if present
  if (options.coverImageBuffer && options.coverImageBuffer.length > 0) {
    zip.file('OEBPS/images/cover.jpg', options.coverImageBuffer);
    manifestItems.push(`<item id="cover-image" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>`);

    const coverXhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${escapeXml(language)}" lang="${escapeXml(language)}">
  <head>
    <title>Okładka</title>
    <link rel="stylesheet" type="text/css" href="style.css"/>
  </head>
  <body>
    <div class="cover-container">
      <img src="images/cover.jpg" alt="${escapeXml(title)}"/>
      <h1 style="border:none;margin-top:0.8em;">${escapeXml(title)}</h1>
      <p style="text-align:center;font-style:italic;">${escapeXml(author)}</p>
    </div>
  </body>
</html>`;
    zip.file('OEBPS/cover.xhtml', coverXhtml);
    manifestItems.push(`<item id="cover_page" href="cover.xhtml" media-type="application/xhtml+xml"/>`);
    spineItems.push(`<itemref idref="cover_page"/>`);
  }

  chapters.forEach((chapter, index) => {
    const chapterId = `chapter_${index + 1}`;
    const filename = `${chapterId}.xhtml`;
    const chapterTitle = chapter.title || `Rozdział ${index + 1}`;
    const bodyContent = formatTextToXhtml(chapter.translatedText || chapter.originalText);

    // Chapter image injection if available
    let illustrationHtml = '';
    if (chapter.imageBuffer && chapter.imageBuffer.length > 0) {
      const imgFilename = `images/ch_${index + 1}.jpg`;
      zip.file(`OEBPS/${imgFilename}`, chapter.imageBuffer);
      manifestItems.push(`<item id="img_${index + 1}" href="${imgFilename}" media-type="image/jpeg"/>`);
      illustrationHtml = `
      <div class="illustration-box">
        <img src="${imgFilename}" alt="${escapeXml(chapterTitle)} - ilustracja"/>
      </div>`;
    }

    const chapterXhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(language)}" lang="${escapeXml(language)}">
  <head>
    <title>${escapeXml(chapterTitle)}</title>
    <link rel="stylesheet" type="text/css" href="style.css"/>
  </head>
  <body>
    <h1>${escapeXml(chapterTitle)}</h1>
    ${illustrationHtml}
    <div class="chapter-content">
      ${bodyContent}
    </div>
  </body>
</html>`;

    zip.file(`OEBPS/${filename}`, chapterXhtml);
    manifestItems.push(`<item id="${chapterId}" href="${filename}" media-type="application/xhtml+xml"/>`);
    spineItems.push(`<itemref idref="${chapterId}"/>`);

    navPoints.push(`
    <navPoint id="np_${index + 1}" playOrder="${index + 1}">
      <navLabel><text>${escapeXml(chapterTitle)}</text></navLabel>
      <content src="${filename}"/>
    </navPoint>`);

    navListItems.push(`<li><a href="${filename}">${escapeXml(chapterTitle)}</a></li>`);
  });

  // 5. OEBPS/nav.xhtml (EPUB 3 Navigation)
  const navXhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(language)}" lang="${escapeXml(language)}">
  <head>
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

  // 6. OEBPS/toc.ncx (EPUB 2 / Kindle compatibility)
  const tocNcx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
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

  // 7. OEBPS/content.opf
  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="BookID">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookID">${bookUuid}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:creator>${escapeXml(author)}</dc:creator>
    <dc:language>${escapeXml(language)}</dc:language>
    <dc:publisher>KOReader AI Cloud Bridge</dc:publisher>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.[0-9]+Z$/, 'Z')}</meta>
  </metadata>
  <manifest>
    ${manifestItems.join('\n    ')}
  </manifest>
  <spine toc="ncx">
    ${spineItems.join('\n    ')}
  </spine>
</package>`;
  zip.file('OEBPS/content.opf', contentOpf);

  // Generate output buffer
  const uint8Array = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return Buffer.from(uint8Array);
}
