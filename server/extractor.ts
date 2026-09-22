import { ChapterData } from '../src/types';

/**
 * Clean text extracted from PDF:
 * - Fix hyphenation across line breaks (np. "prze- \n czytać" -> "przeczytać")
 * - Remove repetitive running headers / footers / page numbers (e.g. "Page 123 of 450", "--- 45 ---")
 * - Normalize paragraph breaks
 */
export function cleanExtractedText(raw: string): string {
  let text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Fix words broken by hyphenation at line breaks
  text = text.replace(/([a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])-\s*\n\s*([a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/g, '$1$2');

  // Remove standalone page numbers or headers
  text = text.replace(/\n\s*(?:Page\s+\d+|\d+\s*\/\s*\d+|\-\s*\d+\s*\-|\d+)\s*\n/gi, '\n');

  // Collapse 3+ newlines to 2
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

/**
 * Split text into logical chapters or sections.
 * Detects common chapter headings (Chapter, Rozdział, Kapitel, Part, Roman numerals),
 * or falls back to ~1500-2500 word readable semantic chunks.
 */
export function splitIntoChapters(fullText: string, fallbackTitle: string = 'Książka'): ChapterData[] {
  const cleaned = cleanExtractedText(fullText);

  // Regex looking for chapter headers:
  // "Chapter 1", "Rozdział I", "ROZDZIAŁ 1", "CHAPTER ONE", "PART I", "Book 1", etc.
  const chapterRegex = /(?:^|\n\n+)(?:(?:Chapter|Rozdział|Kapitel|Part|Część|Book|Księga)\s+(?:\d+|[IVXLCDM]+|[A-Za-z]+)(?::[^\n]+)?|(?=[IVXLCDM]{1,6}\.\s+[A-Z]))/i;

  const rawSplits = cleaned.split(chapterRegex);

  // If chapter regex didn't split well (e.g. less than 2 parts or 1 huge part), split by word count chunks (~2000 words each)
  if (rawSplits.length <= 1 || rawSplits.some(chunk => chunk.length > 30000)) {
    const paragraphs = cleaned.split(/\n\n+/);
    const chapters: ChapterData[] = [];
    let currentChunk: string[] = [];
    let currentWordCount = 0;
    let chunkIndex = 1;

    for (const para of paragraphs) {
      const words = para.trim().split(/\s+/).length;
      if (currentWordCount + words > 2000 && currentChunk.length > 0) {
        chapters.push({
          title: `Część ${chunkIndex}`,
          originalText: currentChunk.join('\n\n'),
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
        originalText: currentChunk.join('\n\n'),
        status: 'pending',
      });
    }

    return chapters.length > 0 ? chapters : [{
      title: fallbackTitle,
      originalText: cleaned,
      status: 'pending',
    }];
  }

  // If regex matched chapters, match chapter titles
  const matches = cleaned.match(new RegExp(chapterRegex, 'gi')) || [];
  const chapters: ChapterData[] = [];

  for (let i = 0; i < rawSplits.length; i++) {
    const textChunk = rawSplits[i]?.trim();
    if (!textChunk) continue;

    let title = i === 0 && !matches[i - 1]
      ? 'Wstęp / Przedmowa'
      : (matches[i - 1]?.trim() || `Rozdział ${i}`);

    // If chunk is huge (>25000 chars), further sub-split
    if (textChunk.length > 25000) {
      const subParas = textChunk.split(/\n\n+/);
      let subChunk: string[] = [];
      let subCount = 0;
      let partIdx = 1;
      for (const p of subParas) {
        const words = p.split(/\s+/).length;
        if (subCount + words > 2000 && subChunk.length > 0) {
          chapters.push({
            title: `${title} (cz. ${partIdx})`,
            originalText: subChunk.join('\n\n'),
            status: 'pending',
          });
          partIdx++;
          subChunk = [p];
          subCount = words;
        } else {
          subChunk.push(p);
          subCount += words;
        }
      }
      if (subChunk.length > 0) {
        chapters.push({
          title: `${title} (cz. ${partIdx})`,
          originalText: subChunk.join('\n\n'),
          status: 'pending',
        });
      }
    } else {
      chapters.push({
        title,
        originalText: textChunk,
        status: 'pending',
      });
    }
  }

  return chapters;
}

/**
 * Parse uploaded buffer (PDF, TXT, EPUB, etc.) into cleaned chapters
 */
export async function parseDocumentBuffer(
  buffer: Buffer,
  filename: string
): Promise<{ title: string; chapters: ChapterData[] }> {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const baseTitle = filename.replace(/\.[^/.]+$/, '').replace(/[_.-]+/g, ' ').trim();

  if (ext === 'txt' || ext === 'md') {
    const raw = buffer.toString('utf-8');
    const chapters = splitIntoChapters(raw, baseTitle);
    return { title: baseTitle, chapters };
  }

  if (ext === 'pdf') {
    try {
      // Dynamic import of pdf-parse to be safe with CJS/ESM
      const pdfModule = await import('pdf-parse');
      const pdfParse = (pdfModule as any).default || pdfModule;
      const pdfData = await pdfParse(buffer);
      const text = pdfData.text || '';
      const docTitle = pdfData.info?.Title ? String(pdfData.info.Title).trim() : baseTitle;
      const chapters = splitIntoChapters(text, docTitle || baseTitle);
      return { title: docTitle || baseTitle, chapters };
    } catch (err: any) {
      console.error('Błąd parsowania PDF za pomocą pdf-parse:', err);
      // Fallback: try raw string extraction if possible
      const rawText = buffer.toString('latin1').replace(/[^\x20-\x7E\n\r\t]/g, ' ');
      const clean = cleanExtractedText(rawText);
      const chapters = splitIntoChapters(clean, baseTitle);
      return { title: baseTitle, chapters };
    }
  }

  // Fallback for other formats
  const raw = buffer.toString('utf-8');
  const chapters = splitIntoChapters(raw, baseTitle);
  return { title: baseTitle, chapters };
}
