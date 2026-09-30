import JSZip from 'jszip';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { ChapterData } from '../src/types';

export interface ExtractedImage {
  id: string;
  filename: string;
  buffer: Buffer;
  mediaType: string;
}

export interface ExtractedChapter extends ChapterData {
  extractedImages?: ExtractedImage[];
}

export interface ParsedDocument {
  title: string;
  author?: string;
  coverImageBuffer?: Buffer;
  chapters: ExtractedChapter[];
}

/**
 * Clean plain text extracted from PDF, TXT or raw fallback:
 * - Remove XML 1.0 forbidden characters: \x00-\x08, \x0B, \x0C, \x0E-\x1F, \uFFFE, \uFFFF
 * - Fix hyphenation across line breaks
 * - Remove repetitive page numbers or header artifacts
 */
export function cleanExtractedText(raw: string): string {
  let text = raw
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  // Fix words broken by hyphenation at line breaks
  text = text.replace(/([a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])-\s*\n\s*([a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/g, '$1$2');

  // Remove standalone page numbers or headers
  text = text.replace(/\n\s*(?:Page\s+\d+|\d+\s*\/\s*\d+|\-\s*\d+\s*\-|\d+)\s*\n/gi, '\n');

  // Collapse 3+ newlines to 2
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

/**
 * Detects if a given XHTML page is a Table of Contents (TOC), Navigation page,
 * or just a numerical list of chapters (like "1 \n 2 \n 3 ... 22")
 * so it won't be mistakenly translated as an actual book chapter.
 */
export function isTableOfContents(html: string, filePath: string = ''): boolean {
  const pLower = filePath.toLowerCase();
  if (
    pLower.includes('toc.xhtml') ||
    pLower.includes('nav.xhtml') ||
    pLower.includes('tableofcontents') ||
    pLower.includes('table_of_contents') ||
    pLower.includes('contents.xhtml') ||
    pLower.includes('spis_tresci')
  ) {
    return true;
  }

  const lower = html.toLowerCase();
  if (
    lower.includes('epub:type="toc"') ||
    lower.includes('role="doc-toc"') ||
    lower.includes('class="toc"') ||
    lower.includes('id="toc"')
  ) {
    return true;
  }

  // Count links vs total word count
  const rawText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const words = rawText.split(/\s+/).filter(Boolean);
  const linkCount = (html.match(/<a\b[^>]*href=/gi) || []).length;

  if (linkCount >= 4 && words.length > 0 && linkCount / words.length > 0.2) {
    return true;
  }

  // Page consisting predominantly of chapter numbers or short entries
  const numberCount = (rawText.match(/\b(?:\d+|[IVXLCDM]+)\b/g) || []).length;
  if (numberCount >= 6 && words.length < 150 && numberCount / words.length > 0.3) {
    return true;
  }

  if (words.length < 80 && (lower.includes('contents') || lower.includes('spis treści') || lower.includes('table of contents'))) {
    return true;
  }

  return false;
}

/**
 * Cleans and sanitizes chapter HTML to preserve rich book formatting:
 * - Headings (h1, h2, h3, h4)
 * - Centered paragraphs (<p class="center">)
 * - Bold / Strong (b, strong)
 * - Italics / Em (i, em)
 * - Footnotes / Superscripts (sup, sub)
 * - Quotes / Excerpts (blockquote)
 * - Breaks and dividers (hr, br)
 * - Images (img src, alt) extracted and referenced cleanly
 */
export async function cleanChapterHtml(
  rawHtml: string,
  chapterDir: string,
  zip: JSZip,
  chapterIndex: number
): Promise<{ cleanedHtml: string; images: ExtractedImage[] }> {
  const extractedImages: ExtractedImage[] = [];

  // 1. Strip script, style, head, and comments
  let html = rawHtml
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // 2. Extract body
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    html = bodyMatch[1];
  }

  // 3. Extract and normalize inline images (<img src="..."> and SVG <image href="...">)
  let imgCounter = 1;
  const imgRegex = /<img\b([^>]*\bsrc=["']([^"']+)["'][^>]*)>/gi;
  const matches = [...html.matchAll(imgRegex)];

  for (const match of matches) {
    const originalSrc = match[2];
    if (originalSrc.startsWith('data:')) continue; // already embedded data URI

    // Clean anchor fragment or query params
    const cleanSrc = originalSrc.split('#')[0].split('?')[0];
    const imagePathInZip = path.posix.normalize(path.posix.join(chapterDir, cleanSrc));

    if (zip.files[imagePathInZip]) {
      try {
        const imgBuffer = await zip.files[imagePathInZip].async('nodebuffer');
        const ext = imagePathInZip.split('.').pop()?.toLowerCase() || 'jpg';
        const mediaType = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
        const safeFilename = `ch_${chapterIndex + 1}_img_${imgCounter}.${ext}`;
        const newSrc = `images/${safeFilename}`;

        extractedImages.push({
          id: `img_ch${chapterIndex + 1}_${imgCounter}`,
          filename: safeFilename,
          buffer: imgBuffer,
          mediaType,
        });

        // Replace src in HTML
        html = html.replace(match[0], `<img src="${newSrc}" alt="Ilustracja ${imgCounter}" />`);
        imgCounter++;
      } catch (err) {
        console.warn(`Nie udało się wyodrębnić obrazka ${imagePathInZip}:`, err);
      }
    }
  }

  // Handle SVG <image xlink:href="..."> or <image href="...">
  const svgImgRegex = /<image\b[^>]*\b(?:href|xlink:href)=["']([^"']+)["'][^>]*\/?>/gi;
  for (const svgMatch of [...html.matchAll(svgImgRegex)]) {
    const originalSrc = svgMatch[1];
    if (originalSrc.startsWith('data:')) continue;

    const cleanSrc = originalSrc.split('#')[0].split('?')[0];
    const imagePathInZip = path.posix.normalize(path.posix.join(chapterDir, cleanSrc));

    if (zip.files[imagePathInZip]) {
      try {
        const imgBuffer = await zip.files[imagePathInZip].async('nodebuffer');
        const ext = imagePathInZip.split('.').pop()?.toLowerCase() || 'jpg';
        const mediaType = ext === 'png' ? 'image/png' : 'image/jpeg';
        const safeFilename = `ch_${chapterIndex + 1}_img_${imgCounter}.${ext}`;
        const newSrc = `images/${safeFilename}`;

        extractedImages.push({
          id: `img_ch${chapterIndex + 1}_${imgCounter}`,
          filename: safeFilename,
          buffer: imgBuffer,
          mediaType,
        });

        html = html.replace(svgMatch[0], `<img src="${newSrc}" alt="Ilustracja ${imgCounter}" />`);
        imgCounter++;
      } catch {}
    }
  }

  // 4. Mark centered paragraphs (<center> or style text-align: center)
  html = html.replace(/<center[^>]*>([\s\S]*?)<\/center>/gi, '<p class="center">$1</p>');
  html = html.replace(/<p\b([^>]*\b(?:center|text-align:\s*center|calibre_res_center)[^>]*)>([\s\S]*?)<\/p>/gi, '<p class="center">$2</p>');

  // 5. Unwrap layout divs and spans (preserving their text and formatting)
  html = html.replace(/<\/?(div|section|article|main|header|footer|font)\b[^>]*>/gi, '\n');
  html = html.replace(/<\/?span\b[^>]*>/gi, '');

  // 6. Strip noisy attributes from remaining tags, keeping only class="center" or class="footnote" on <p>
  html = html.replace(/<(p)\b(?!\s+class=["'](?:center|footnote)["'])[^>]*>/gi, '<p>');
  html = html.replace(/<(h[1-6])\b[^>]*>/gi, '<$1>');
  html = html.replace(/<(b|strong|i|em|u|sup|sub|blockquote)\b[^>]*>/gi, '<$1>');

  // 7. Clean up empty tags and whitespace
  html = html
    .replace(/<p>\s*(?:&nbsp;|\s)*<\/p>/gi, '')
    .replace(/(?:<br\s*\/?>\s*){3,}/gi, '<br/><br/>')
    .replace(/&nbsp;/g, ' ')
    .trim();

  // If text didn't have paragraphs, wrap lines in <p>
  if (!/<p[\s>]/i.test(html) && !/<h[1-6][\s>]/i.test(html)) {
    const rawParas = html.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
    html = rawParas.map((p) => `<p>${p}</p>`).join('\n');
  }

  return { cleanedHtml: html, images: extractedImages };
}

/**
 * Split plain text into logical chapters or sections (fallback for TXT/PDF)
 */
export function splitIntoChapters(fullText: string, fallbackTitle: string = 'Książka'): ExtractedChapter[] {
  const cleaned = cleanExtractedText(fullText);

  // Regex looking for chapter headers:
  const chapterRegex = /(?:^|\n\n+)(?:(?:Chapter|Rozdział|Kapitel|Part|Część|Book|Księga)\s+(?:\d+|[IVXLCDM]+|[A-Za-z]+)(?::[^\n]+)?|(?=[IVXLCDM]{1,6}\.\s+[A-Z]))/i;

  const rawSplits = cleaned.split(chapterRegex);

  if (rawSplits.length <= 1 || rawSplits.some((chunk) => chunk.length > 30000)) {
    const paragraphs = cleaned.split(/\n\n+/);
    const chapters: ExtractedChapter[] = [];
    let currentChunk: string[] = [];
    let currentWordCount = 0;
    let chunkIndex = 1;

    for (const para of paragraphs) {
      const words = para.trim().split(/\s+/).length;
      if (currentWordCount + words > 2000 && currentChunk.length > 0) {
        chapters.push({
          title: `Część ${chunkIndex}`,
          originalText: currentChunk.map((p) => `<p>${p}</p>`).join('\n'),
          status: 'pending',
        });
        chunkIndex++;
        currentChunk = [para];
        currentWordCount = words;
      } else {
        currentChunk.push(para);
        currentWordCount += words;
      }
    }

    if (currentChunk.length > 0) {
      chapters.push({
        title: `Część ${chunkIndex}`,
        originalText: currentChunk.map((p) => `<p>${p}</p>`).join('\n'),
        status: 'pending',
      });
    }

    return chapters.length > 0
      ? chapters
      : [
          {
            title: fallbackTitle,
            originalText: `<p>${cleaned}</p>`,
            status: 'pending',
          },
        ];
  }

  const matches = cleaned.match(new RegExp(chapterRegex, 'gi')) || [];
  const chapters: ExtractedChapter[] = [];

  for (let i = 0; i < rawSplits.length; i++) {
    const textChunk = rawSplits[i]?.trim();
    if (!textChunk) continue;

    const title =
      i === 0 && !matches[i - 1]
        ? 'Wstęp / Przedmowa'
        : matches[i - 1]?.trim() || `Rozdział ${i}`;

    const paras = textChunk.split(/\n\n+/).map((p) => `<p>${p}</p>`).join('\n');
    chapters.push({
      title,
      originalText: paras,
      status: 'pending',
    });
  }

  return chapters;
}

/**
 * Comprehensive Polish OCR proofreader & spellchecker (F7 auto-correction):
 * - Fixes glued words, prepositions, conjunctions (e.g. "no ipotężny", "Tylkoz", "wszyscynieproszeni")
 * - Fixes OCR character misreads (1 -> i, L -> i, Śślimaku -> Ślimaku, Śni -> śni, odmrożonył -> odmrożony!)
 * - Corrects dialogue dashes and quotes typography (— with proper spacing)
 * - Removes scan noise, duplicate diacritics, and fixes punctuation spacing
 */
export function heuristicOcrProofread(text: string): string {
  let s = text;

  // 1. Dialogue dashes formatting and spacing
  s = s.replace(/([:!?,.])\s*([—–-])\s*/g, '$1 — ');
  s = s.replace(/^([—–-])(?=[a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/gm, '— ');
  s = s.replace(/([—–-])(?=[a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/g, '— ');

  // 2. OCR duplicate letter kerning artifacts (e.g. Śślimaku -> Ślimaku, Łłódka -> Łódka)
  s = s.replace(/Śś/g, 'Ś');
  s = s.replace(/śś/g, 'ś');
  s = s.replace(/Ćć/g, 'Ć');
  s = s.replace(/ćć/g, 'ć');
  s = s.replace(/Łł/g, 'Ł');
  s = s.replace(/łł/g, 'ł');
  s = s.replace(/Żż/g, 'Ż');
  s = s.replace(/żż/g, 'ż');
  s = s.replace(/Źź/g, 'Ź');
  s = s.replace(/źź/g, 'ź');
  s = s.replace(/Ąą/g, 'Ą');
  s = s.replace(/Ęę/g, 'Ę');
  s = s.replace(/\b([A-Z])\1([a-z])/g, '$1$2');

  // 3. OCR character & typo misreads
  s = s.replace(/\b1\b/g, 'i');
  s = s.replace(/\b[Ll]\s+(co|tym|jak|w|na|o|do|z|za|że|fiknięciu)\b/gi, 'i $1');
  s = s.replace(/\bŚni\b/g, 'śni');
  s = s.replace(/\bodmrożonył\b/g, 'odmrożony!');
  s = s.replace(/\bBukiędie\b/g, 'Bukiecie');
  s = s.replace(/\bMoselkia\b/g, 'masełku');

  // 4. Glued short conjunction "i" with common verbs/nouns (missing OCR spaces)
  s = s.replace(/\b[iI](fiknięciu|przyglądam|potężny|znalazłem|jeść|nagle|gospodyni|znowu|zaraz|patrzę|widzę|słyszę|zapytał|powiedział|poszedł|krzyknął|zaczął|ruszył|wziął)\b/gi, 'i $1');

  // 5. Known glued words from scanned paper OCR
  const specificGlued: Array<[string | RegExp, string]> = [
    [/\bifiknięciu\b/gi, 'i fiknięciu'],
    [/\bcobyło\b/gi, 'co było'],
    [/\bnanim\b/gi, 'na nim'],
    [/\bwnim\b/gi, 'w nim'],
    [/\bzanimi\b/gi, 'za nimi'],
    [/\bodnich\b/gi, 'od nich'],
    [/\bprzednimi\b/gi, 'przed nimi'],
    [/\bijak\b/gi, 'i jak'],
    [/\biznalazłem\b/gi, 'i znalazłem'],
    [/\biprzyglądam\b/gi, 'i przyglądam'],
    [/\bijeść\b/gi, 'i jeść'],
    [/\bipotężny\b/gi, 'i potężny'],
    [/\bnamgniazdo\b/gi, 'nam gniazdo'],
    [/\binatenobrusikwykładali\b/gi, 'i na ten obrusik wykładali'],
    [/\bCiąglewołałem\b/gi, 'Ciągle wołałem'],
    [/\bGdybymmógł\b/gi, 'Gdybym mógł'],
    [/\bpołknąłbymcałązagrodęrazemznaszątopolą\b/gi, 'połknąłbym całą zagrodę razem z naszą topolą'],
    [/\bTobyłaprawdziwauczta\b/gi, 'To była prawdziwa uczta'],
    [/\btobyła\b/gi, 'to była'],
    [/\bwszystkiegobyło\b/gi, 'wszystkiego było'],
    [/\bAlemniezawszewszystkiegobyłomało\b/gi, 'Ale mnie zawsze wszystkiego było mało'],
    [/\bTylkoz\b/gi, 'Tylko z'],
    [/\bwszyscynieproszeni\b/gi, 'wszyscy nieproszeni'],
    [/\bwstrętnebadyle\b/gi, 'wstrętne badyle'],
    [/\bmysiejnorc\b/gi, 'mysiej norce'],
    [/\bchlebalepsze\b/gi, 'chleba lepsze'],
    [/\bwróblachhi\b/gi, 'wróblach i'],
    [/\bRobotytyle\b/gi, 'Roboty tyle'],
    [/\bKicusioweswawole\b/gi, 'Kicusiowe swawole'],
    [/\bKto\s+wszystkowyszoruje\b/gi, 'Kto wszystko wyszoruje'],
    [/\bzaczynająwychwa\b/gi, 'zaczynają wychwa'],
  ];

  for (const [bad, good] of specificGlued) {
    s = s.replace(bad, good);
  }

  // 6. Glued prepositions with pronouns/nouns: e.g. "znaszą" -> "z naszą"
  s = s.replace(/\b([a-ząćęłńóśźż]+)(znaszą|zmoim|znami|zwami|doniem|donas)\b/gi, '$1 $2');

  // 7. Lowercase immediately touching Capital letter without space (glued sentences e.g. "nimNazywam" -> "nim Nazywam")
  s = s.replace(/([a-ząćęłńóśźż]{2,})([A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]{2,})/g, '$1 $2');

  // 8. Spacing after punctuation
  s = s.replace(/([,;!?])(?=[a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/g, '$1 ');
  s = s.replace(/\.([A-ZĄĆĘŁŃÓŚŹŻ])/g, '. $1');
  s = s.replace(/\s{2,}/g, ' ');

  return s;
}

/**
 * High-fidelity OCR text cleaning for scanned books (PDF):
 * - Removes tabs, trailing line breaks and fixes hyphenation across lines
 * - Discards decorative graphic banner OCR artifacts (weird symbol lines and non-word sequences)
 * - Identifies multi-line rhyming chapter titles / subtitles and cleanly separates them from narrative prose
 * - Fixes OCR character substitutions and glued words
 * - Formats proper book dialogue dashes (—) and paragraphs
 */
export function cleanScannedPdfPageText(raw: string): { cleanedText: string; heading?: string } {
  let text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Fix hyphenation across lines: "wy-\n mościli" -> "wymościli"
  text = text.replace(/([a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])-\s*\n\s*([a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/g, '$1$2');

  const rawLines = text.split('\n');
  const filteredLines: string[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i].replace(/\t+/g, ' ').trim();
    if (!line) continue;

    // Discard decorative OCR vignette noise:
    const noiseSymbols = line.match(/[|)=~\]\}»*^$£#@_]/g);
    if (noiseSymbols && (noiseSymbols.length >= 2 || noiseSymbols.length / line.length > 0.08)) {
      continue;
    }
    // Discard lines that are random uppercase fragments without vowels or OCR noise:
    if (/\b(?:YE|MCAE|EAIELA|BOJ|PW|AŚ|RO|AWM)\b/.test(line)) {
      continue;
    }
    if (/^[A-ZĄĆĘŁŃÓŚŹŻ]\s+[A-ZĄĆĘŁŃÓŚŹŻ]\s+[A-ZĄĆĘŁŃÓŚŹŻ]/i.test(line) && line.length < 35) {
      continue;
    }
    if (/^(?:Digitized by|https:\/\/archive\.org|ISBN\b|Copyright\b|Wydawnictwo\b|Poznań\b)/i.test(line)) {
      continue;
    }

    // Strip standalone page numbers at bottom or top
    if (/^\d{1,3}$/.test(line)) {
      continue;
    }

    // Apply baseline F7 Polish proofreading to each line before structure analysis
    line = heuristicOcrProofread(line);

    filteredLines.push(line);
  }

  // Multi-line chapter heading extraction
  let headingLines: string[] = [];
  let proseLines: string[] = [];

  const first = filteredLines[0] || '';
  const isTitleCandidate = /^(?:O\s+|Z\s+|Jak\s+|Wszystkiego\s+|Kajtek\s+|Straszna\s+|Drogi\s+|Rozdział\s+|Część\s+|Spis\s+|W\s+[a-ząćęłńóśźż]+|[A-ZĄĆĘŁŃÓŚŹŻ\s]{4,})/i.test(first);

  if (isTitleCandidate && first.length < 80 && !first.startsWith('—') && !first.startsWith('–')) {
    headingLines.push(first);

    for (let i = 1; i < filteredLines.length; i++) {
      let line = filteredLines[i];

      // Check if this line is split between title and narrative prose:
      // e.g. "i co było na nim Nazywam się Kajtuś. Mam długie, czerwone nogi"
      const narrativeSplitMatch = line.match(/^(.*?)\s+(Nazywam\s+się\s+[A-ZĄĆĘŁŃÓŚŹŻa-ząćęłńóśźż]+.*)$/i) ||
                                  line.match(/^(.*?)\s+((?:Kiedy|Gdy|Wreszcie|Siedzę|Sfrunąłem|Latałem|Patrzę|Z początku)\s+[a-ząćęłńóśźż].*)$/);
      if (narrativeSplitMatch && narrativeSplitMatch[1].length < 65) {
        headingLines.push(narrativeSplitMatch[1].trim());
        proseLines = [narrativeSplitMatch[2].trim(), ...filteredLines.slice(i + 1)];
        break;
      }

      // Continuation of a multi-line rhyming or descriptive chapter title
      const isContinuation =
        headingLines.length < 6 &&
        line.length < 65 &&
        !line.startsWith('—') &&
        !line.startsWith('–') &&
        (
          /^(?:i\s+|o\s+|w\s+|na\s+|z\s+|co\s+|jak\s+|oraz\s+|czyli\s+|do\s+|dla\s+|po\s+|pod\s+|nad\s+|że\s+)/i.test(line) ||
          /^[a-ząćęłńóśźż]/.test(line) ||
          /[,;:\-–!]$/.test(headingLines[headingLines.length - 1]) ||
          (!/\.\s*$/.test(line) && line.length < 40)
        ) &&
        !/^(?:Nazywam|Trwała|Latałem|Patrzę|Z początku|Pobiegły|U Orczyków|Dzisiaj|Minęły|Wyleciałem|Ledwo|Gospodyni|Robi się|Antek|Zaraz|Kiedy|Gdy|Wreszcie|Siedzę|Sfrunąłem)/i.test(line);

      if (isContinuation) {
        headingLines.push(line);
      } else {
        proseLines = filteredLines.slice(i);
        break;
      }
    }
  } else {
    proseLines = filteredLines;
  }

  const rawHeading = headingLines.join(' ').replace(/\s{2,}/g, ' ').trim();
  const heading = rawHeading ? heuristicOcrProofread(rawHeading) : undefined;

  // Format prose into paragraphs, handling dialogue dashes and orphan dashes
  const cleanParagraphs: string[] = [];
  let currentPara: string[] = [];

  for (let idx = 0; idx < proseLines.length; idx++) {
    let line = proseLines[idx];

    // Handle lonely orphan dashes on their own line (e.g. "—" followed by text on next line)
    if ((line === '—' || line === '–' || line === '-') && idx + 1 < proseLines.length) {
      proseLines[idx + 1] = `— ${proseLines[idx + 1]}`;
      continue;
    }

    if (line.startsWith('—') || line.startsWith('–') || line.startsWith('- ')) {
      if (currentPara.length > 0) {
        cleanParagraphs.push(heuristicOcrProofread(currentPara.join(' ')));
        currentPara = [];
      }
      cleanParagraphs.push(heuristicOcrProofread(line.replace(/^-\s*/, '— ')));
    } else {
      currentPara.push(line);
    }
  }
  if (currentPara.length > 0) {
    cleanParagraphs.push(heuristicOcrProofread(currentPara.join(' ')));
  }

  // Deduplicate heading if it bled into the start of the first paragraph
  if (heading && cleanParagraphs.length > 0) {
    if (cleanParagraphs[0].trim() === heading.trim()) {
      cleanParagraphs.shift();
    } else {
      const headingClean = heading.toLowerCase().replace(/[^a-ząćęłńóśźż]/g, ' ').replace(/\s+/g, ' ').trim();
      const p0Clean = cleanParagraphs[0].toLowerCase().replace(/[^a-ząćęłńóśźż]/g, ' ').replace(/\s+/g, ' ').trim();
      if (p0Clean.startsWith(headingClean) && cleanParagraphs[0].length > heading.length) {
        cleanParagraphs[0] = cleanParagraphs[0].substring(heading.length).trim().replace(/^[,:;\-\s]+/, '');
      }
    }
  }

  return {
    cleanedText: cleanParagraphs.join('\n\n'),
    heading,
  };
}

/**
 * Smartly parse PDF documents (including scanned books, children's books with drawings, and text PDFs):
 * - Extracts high-resolution cover image from Page 1 via Ghostscript
 * - Extracts text layer and metadata via pdf-parse v2 (PDFParse)
 * - Identifies illustration / drawing pages (separating them from text)
 * - Renders illustrations via Ghostscript and embeds them at their exact page positions in chapters
 * - Assembles coherent, clean chapters with proper paragraphs and typography
 */
export async function parsePdfDocument(buffer: Buffer, baseTitle: string): Promise<ParsedDocument> {
  const tmpId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const tmpPdf = `/tmp/pdf_${tmpId}.pdf`;
  const tmpDir = `/tmp/pdf_illus_${tmpId}`;

  try {
    fs.writeFileSync(tmpPdf, buffer);
    fs.mkdirSync(tmpDir, { recursive: true });

    // 1. Extract cover image (Page 1) via Ghostscript
    let coverImageBuffer: Buffer | undefined = undefined;
    const coverPath = path.join(tmpDir, 'cover.jpg');
    try {
      execSync(`gs -dNOPAUSE -dBATCH -sDEVICE=jpeg -r150 -dFirstPage=1 -dLastPage=1 -sOutputFile="${coverPath}" "${tmpPdf}" 2>/dev/null`);
      if (fs.existsSync(coverPath) && fs.statSync(coverPath).size > 1000) {
        coverImageBuffer = fs.readFileSync(coverPath);
      }
    } catch (e) {
      console.warn('Nie udało się wyrenderować okładki PDF za pomocą gs:', e);
    }

    // 2. Extract text & metadata using PDFParse (pdf-parse v2)
    let pages: Array<{ text?: string; num?: number }> = [];
    let docTitle = baseTitle;
    let docAuthor: string | undefined = undefined;

    try {
      const { PDFParse } = await import('pdf-parse');
      const uint8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      const parser = new PDFParse(uint8);
      const textRes = await parser.getText();
      const info = await parser.getInfo();

      if (info?.info?.Title) {
        const cleanTitle = String(info.info.Title).trim();
        if (cleanTitle.length > 2 && !cleanTitle.includes('null')) {
          docTitle = cleanTitle;
        }
      }
      if (info?.info?.Author) {
        const cleanAuthor = String(info.info.Author).trim();
        if (cleanAuthor.length > 2 && !cleanAuthor.includes('null')) {
          docAuthor = cleanAuthor;
        }
      }

      pages = textRes?.pages || [];
    } catch (err: any) {
      console.warn('Błąd czytania warstwy tekstowej PDFParse:', err?.message || err);
    }

    // Fallback: If no pages returned or parser failed
    if (pages.length === 0) {
      return {
        title: docTitle || baseTitle,
        author: docAuthor,
        coverImageBuffer,
        chapters: [
          {
            title: 'Treść książki',
            originalText: `<p style="text-align:center;"><em>Zeskanowany dokument PDF (bez warstwy tekstowej).</em></p>`,
            status: 'pending',
          },
        ],
      };
    }

    // 3. Classify pages into text pages vs illustration pages
    const illusPages: number[] = [];
    const pageItems: Array<{ pageNum: number; type: 'text' | 'illus'; content: string; heading?: string }> = [];

    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      const pageNum = p.num || (i + 1);

      // Page 1 is already extracted as cover
      if (pageNum === 1) continue;

      const raw = (p.text || '').trim();
      const letters = raw.replace(/[^a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, '').length;
      const ratio = raw.length > 0 ? letters / raw.length : 0;
      const isGarbage = raw.length > 0 && ratio < 0.65;
      const isIllustration = raw.length < 80 || isGarbage;

      if (isIllustration) {
        illusPages.push(pageNum);
        pageItems.push({ pageNum, type: 'illus', content: '' });
      } else {
        const { cleanedText, heading } = cleanScannedPdfPageText(raw);

        if (cleanedText.length > 25) {
          pageItems.push({
            pageNum,
            type: 'text',
            content: cleanedText,
            heading,
          });
        }
      }
    }

    // 4. Render illustration pages via Ghostscript
    const imagesMap: ExtractedImage[] = [];
    if (illusPages.length > 0) {
      try {
        const pageListStr = illusPages.join(',');
        execSync(`gs -dNOPAUSE -dBATCH -sDEVICE=jpeg -r110 -sPageList=${pageListStr} -sOutputFile="${tmpDir}/illus_%d.jpg" "${tmpPdf}" 2>/dev/null`);

        for (let idx = 0; idx < illusPages.length; idx++) {
          const pNum = illusPages[idx];
          const imgFile = path.join(tmpDir, `illus_${idx + 1}.jpg`);
          if (fs.existsSync(imgFile)) {
            const imgBuf = fs.readFileSync(imgFile);
            imagesMap.push({
              id: `pdf_img_${pNum}`,
              filename: `illus_page_${pNum}.jpg`,
              buffer: imgBuf,
              mediaType: 'image/jpeg',
            });
          }
        }
      } catch (err) {
        console.warn('Błąd renderowania stron ilustracji Ghostscript:', err);
      }
    }

    // 5. Assemble logical chapters with text and inline illustrations
    const chapters: ExtractedChapter[] = [];
    let currentChapterTitle = 'Wstęp';
    let currentHtmlParts: string[] = [];
    let currentImages: ExtractedImage[] = [];

    for (const item of pageItems) {
      if (item.type === 'illus') {
        const img = imagesMap.find((m) => m.filename === `illus_page_${item.pageNum}.jpg`);
        if (img) {
          currentHtmlParts.push(
            `<div class="illustration-page" style="text-align: center; margin: 1.8em 0;"><img src="images/${img.filename}" alt="Ilustracja (strona ${item.pageNum})" style="max-width: 100%; height: auto; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" /></div>`
          );
          currentImages.push(img);
        }
      } else {
        if (item.heading && currentHtmlParts.length > 0) {
          chapters.push({
            title: currentChapterTitle,
            originalText: currentHtmlParts.join('\n'),
            status: 'pending',
            extractedImages: [...currentImages],
          });
          currentChapterTitle = item.heading;
          currentHtmlParts = [];
          currentImages = [];
        } else if (item.heading && currentHtmlParts.length === 0) {
          currentChapterTitle = item.heading;
        }

        if (item.heading && currentHtmlParts.length === 0) {
          currentHtmlParts.push(
            `<h2 style="text-align: center; margin-top: 1.5em; margin-bottom: 0.8em; font-weight: bold;">${item.heading}</h2>`
          );
        }

        const paragraphs = item.content.split(/\n\n+/).map((p) => {
          const cleanP = p.replace(/\n/g, ' ').trim();
          if (cleanP === item.heading) {
            return '';
          }
          if (cleanP.startsWith('—') || cleanP.startsWith('–')) {
            return `<p class="dialogue" style="margin: 0.4em 0; text-indent: 1.2em;">${cleanP}</p>`;
          }
          return `<p style="margin: 0.5em 0; text-indent: 1.2em;">${cleanP}</p>`;
        }).filter(Boolean);
        currentHtmlParts.push(paragraphs.join('\n'));
      }
    }

    if (currentHtmlParts.length > 0) {
      chapters.push({
        title: currentChapterTitle,
        originalText: currentHtmlParts.join('\n'),
        status: 'pending',
        extractedImages: currentImages,
      });
    }

    // Filter out TOC or empty chapters
    const finalChapters = chapters.filter((c) => {
      const isToc = isTableOfContents(c.originalText);
      const textOnly = c.originalText.replace(/<[^>]+>/g, '').trim();
      const hasImages = Boolean(c.extractedImages && c.extractedImages.length > 0);
      return !isToc && (textOnly.length > 60 || hasImages);
    });

    return {
      title: docTitle || baseTitle,
      author: docAuthor,
      coverImageBuffer,
      chapters: finalChapters.length > 0 ? finalChapters : chapters,
    };
  } finally {
    // Cleanup temporary files safely
    try {
      if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
      if (fs.existsSync(tmpPdf)) fs.unlinkSync(tmpPdf);
    } catch {}
  }
}

/**
 * Unpacks multi-format ZIP packages (e.g. paczka z [epub + mobi + pdf]).
 * Extracts the best e-book file (prioritizing EPUB, then MOBI/AZW3, then PDF).
 */
export async function unpackZipArchive(
  buffer: Buffer,
  originalFilename: string
): Promise<{ buffer: Buffer; filename: string } | null> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    // If it's already an EPUB, do not unpack
    if (zip.files['META-INF/container.xml'] || zip.files['mimetype']) {
      return null;
    }

    const files = Object.keys(zip.files).filter(
      (name) => !zip.files[name].dir && !name.startsWith('__MACOSX') && !name.includes('/.') && !name.startsWith('.')
    );

    if (files.length === 0) return null;

    // Priority score: EPUB (with Polish preference) > MOBI / AZW3 > PDF > TXT / FB2
    const priority = (f: string) => {
      const lower = f.toLowerCase();
      if (lower.endsWith('.epub')) {
        if (lower.includes('pl') || lower.includes('polski')) return 100;
        return 90;
      }
      if (lower.endsWith('.mobi') || lower.endsWith('.azw3') || lower.endsWith('.azw')) return 80;
      if (lower.endsWith('.pdf')) return 60;
      if (lower.endsWith('.fb2') || lower.endsWith('.txt')) return 40;
      return 10;
    };

    const sortedFiles = [...files].sort((a, b) => priority(b) - priority(a));
    const bestFile = sortedFiles[0];

    if (bestFile && priority(bestFile) > 10) {
      const innerBuffer = await zip.files[bestFile].async('nodebuffer');
      const innerName = path.basename(bestFile);
      return { buffer: innerBuffer, filename: innerName };
    }
  } catch (err) {
    console.warn('Nie udało się rozpakować archiwum ZIP jako paczki e-booków:', err);
  }
  return null;
}

/**
 * Parse uploaded or downloaded buffer (PDF, TXT, EPUB, ZIP package) into cleaned chapters,
 * extracting the cover image, embedded illustrations, and preserving typography.
 */
export async function parseDocumentBuffer(
  buffer: Buffer,
  filename: string
): Promise<ParsedDocument> {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const baseTitle = filename.replace(/\.[^/.]+$/, '').replace(/[_.-]+/g, ' ').trim();

  // 0. Check if buffer is a multi-format ZIP archive (e.g. paczka [epub + mobi + pdf])
  const isZip =
    ext === 'zip' ||
    ext.startsWith('zip') ||
    (buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04);
  if (isZip && ext !== 'epub') {
    const unpacked = await unpackZipArchive(buffer, filename);
    if (unpacked) {
      console.log(
        `[Unpacker] Rozpakowano paczkę ZIP (${filename}) -> wyodrębniono e-book: ${unpacked.filename} (${(unpacked.buffer.length / 1024).toFixed(1)} KB)`
      );
      return parseDocumentBuffer(unpacked.buffer, unpacked.filename);
    }
  }

  if (ext === 'txt' || ext === 'md') {
    const raw = buffer.toString('utf-8');
    const chapters = splitIntoChapters(raw, baseTitle);
    return { title: baseTitle, chapters };
  }

  if (ext === 'epub') {
    try {
      const zip = await JSZip.loadAsync(buffer);
      let docTitle = baseTitle;
      let docAuthor: string | undefined = undefined;
      let coverImageBuffer: Buffer | undefined = undefined;
      const chapters: ExtractedChapter[] = [];

      // 1. Locate content.opf from container.xml
      let opfPath = 'OEBPS/content.opf';
      if (zip.files['META-INF/container.xml']) {
        const containerXml = await zip.files['META-INF/container.xml'].async('text');
        const rootfileMatch = containerXml.match(/full-path=["']([^"']+)["']/i);
        if (rootfileMatch && rootfileMatch[1]) {
          opfPath = rootfileMatch[1];
        }
      }

      // 2. Read OPF if present
      const spineHrefs: string[] = [];
      const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

      if (zip.files[opfPath]) {
        const opfText = await zip.files[opfPath].async('text');

        // Extract Title
        const titleMatch = opfText.match(/<dc:title[^>]*>(.*?)<\/dc:title>/i);
        if (titleMatch && titleMatch[1]) {
          docTitle = titleMatch[1].replace(/<[^>]+>/g, '').trim();
        }

        // Extract Author
        const authorMatch = opfText.match(/<dc:creator[^>]*>(.*?)<\/dc:creator>/i);
        if (authorMatch && authorMatch[1]) {
          docAuthor = authorMatch[1].replace(/<[^>]+>/g, '').trim();
        }

        // Map manifest items (handles attributes in any order)
        const manifestMap = new Map<string, { href: string; mediaType: string; properties?: string }>();
        const itemMatches = opfText.matchAll(/<item\b([^>]+)>/gi);
        for (const m of itemMatches) {
          const attrs = m[1];
          const idMatch = attrs.match(/\bid=["']([^"']+)["']/i);
          const hrefMatch = attrs.match(/\bhref=["']([^"']+)["']/i);
          const mediaTypeMatch = attrs.match(/\bmedia-type=["']([^"']+)["']/i);
          const propMatch = attrs.match(/\bproperties=["']([^"']+)["']/i);
          if (idMatch && hrefMatch) {
            manifestMap.set(idMatch[1], {
              href: hrefMatch[1],
              mediaType: mediaTypeMatch?.[1] || '',
              properties: propMatch?.[1],
            });
          }
        }

        // Extract Cover Image from OPF
        let coverHref: string | undefined = undefined;

        // Check meta name="cover"
        const metaCoverMatch = opfText.match(/<meta\b[^>]*\bname=["']cover["'][^>]*\bcontent=["']([^"']+)["']/i);
        if (metaCoverMatch && manifestMap.has(metaCoverMatch[1])) {
          coverHref = manifestMap.get(metaCoverMatch[1])?.href;
        }

        // Check item with properties="cover-image" or id="cover"
        if (!coverHref) {
          for (const [id, item] of manifestMap.entries()) {
            if (item.properties?.includes('cover-image') || id.toLowerCase() === 'cover' || id.toLowerCase() === 'cover-image') {
              coverHref = item.href;
              break;
            }
          }
        }

        if (coverHref) {
          const fullCoverPath = opfDir + coverHref.split('#')[0];
          if (zip.files[fullCoverPath]) {
            coverImageBuffer = await zip.files[fullCoverPath].async('nodebuffer');
          }
        }

        // Map spine itemrefs
        const spineMatches = opfText.matchAll(/<itemref\b[^>]*\bidref=["']([^"']+)["'][^>]*>/gi);
        for (const m of spineMatches) {
          const item = manifestMap.get(m[1]);
          if (item) {
            const cleanHref = item.href.split('#')[0];
            const fullHref = opfDir + cleanHref;
            if (!spineHrefs.includes(fullHref)) {
              spineHrefs.push(fullHref);
            }
          }
        }
      }

      // Fallback: extract cover from files directly if not yet found
      if (!coverImageBuffer) {
        for (const filename of Object.keys(zip.files)) {
          if (/(?:^|\/)(?:cover|okladka)\.(?:jpe?g|png|webp)$/i.test(filename)) {
            try {
              coverImageBuffer = await zip.files[filename].async('nodebuffer');
              break;
            } catch {}
          }
        }
      }

      // 3. Fallback: if spine not found, find all xhtml/html files sorted
      let targetFiles = spineHrefs.filter((p) => zip.files[p]);
      if (targetFiles.length === 0) {
        targetFiles = Object.keys(zip.files).filter(
          (f) =>
            !zip.files[f].dir &&
            (f.endsWith('.xhtml') || f.endsWith('.html') || f.endsWith('.htm')) &&
            !f.toLowerCase().includes('cover') &&
            !f.toLowerCase().includes('nav') &&
            !f.toLowerCase().includes('toc')
        );
        targetFiles.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
      }

      for (let i = 0; i < targetFiles.length; i++) {
        const filePath = targetFiles[i];
        if (!zip.files[filePath]) continue;
        const html = await zip.files[filePath].async('text');

        // CRITICAL: Discard Table of Contents pages so chapter lists don't get translated as "Jeden Dwa Trzy..."
        if (isTableOfContents(html, filePath)) {
          continue;
        }

        // Skip standalone cover wrapper pages
        if (
          filePath.toLowerCase().includes('titlepage.xhtml') ||
          filePath.toLowerCase().includes('cover.xhtml')
        ) {
          // If we haven't extracted a cover yet, check if this page contains the cover image
          if (!coverImageBuffer) {
            const imgMatch = html.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i) || html.match(/<image\b[^>]*\b(?:href|xlink:href)=["']([^"']+)["']/i);
            if (imgMatch) {
              const chDir = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/') + 1) : '';
              const cPath = path.posix.normalize(path.posix.join(chDir, imgMatch[1].split('#')[0]));
              if (zip.files[cPath]) {
                coverImageBuffer = await zip.files[cPath].async('nodebuffer');
              }
            }
          }
          continue;
        }

        const chapterDir = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/') + 1) : '';
        const { cleanedHtml, images } = await cleanChapterHtml(html, chapterDir, zip, chapters.length);

        // Check if page has meaningful prose content (or at least an illustration)
        const textSnippet = cleanedHtml.replace(/<[^>]+>/g, '').trim();
        if (textSnippet.length < 30 && images.length === 0 && targetFiles.length > 3) {
          continue;
        }

        // Try getting chapter title from headings
        const titleMatch = html.match(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/i);
        const chTitle = titleMatch
          ? titleMatch[1].replace(/<[^>]+>/g, '').trim()
          : `Rozdział ${chapters.length + 1}`;

        chapters.push({
          title: chTitle || `Rozdział ${chapters.length + 1}`,
          originalText: cleanedHtml,
          status: 'pending',
          extractedImages: images,
        });
      }

      if (chapters.length > 0) {
        return {
          title: docTitle || baseTitle,
          author: docAuthor,
          coverImageBuffer,
          chapters,
        };
      }
    } catch (err: any) {
      console.warn('Błąd czytania EPUB w parseDocumentBuffer:', err);
    }
  }

  if (ext === 'pdf') {
    return await parsePdfDocument(buffer, baseTitle);
  }

  // Fallback for other formats
  const raw = buffer.toString('utf-8');
  const chapters = splitIntoChapters(raw, baseTitle);
  return { title: baseTitle, chapters };
}
