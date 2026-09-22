import JSZip from 'jszip';

export interface ComicBuildResult {
  filename: string;
  buffer: Buffer;
  pageCount: number;
}

/**
 * Searches for embedded JPEG images in a raw PDF buffer.
 * In 99% of scanned PDFs and comic/manga PDFs, each page is stored as a DCTDecode (JPEG) stream.
 */
export function extractJpegsFromBuffer(buffer: Buffer): Buffer[] {
  const images: Buffer[] = [];
  let i = 0;
  const len = buffer.length;

  while (i < len - 4) {
    // Check for JPEG Start of Image (SOI): 0xFF 0xD8 0xFF
    if (buffer[i] === 0xff && buffer[i + 1] === 0xd8 && buffer[i + 2] === 0xff) {
      let j = i + 2;
      while (j < len - 1) {
        // Check for JPEG End of Image (EOI): 0xFF 0xD9
        if (buffer[j] === 0xff && buffer[j + 1] === 0xd9) {
          const img = buffer.subarray(i, j + 2);
          // Only keep images > 15KB to avoid logos, thumbnails, and small icons
          if (img.length > 15000) {
            images.push(img);
          }
          i = j + 2;
          break;
        }
        j++;
      }
      if (j >= len - 1) {
        i++;
      }
    } else {
      i++;
    }
  }

  return images;
}

/**
 * Generates a ComicInfo.xml metadata file used by KOReader and Comic Readers
 */
function buildComicInfoXml(title: string, pageCount: number): string {
  const safeTitle = title.replace(/[<>&"']/g, '');
  return `<?xml version="1.0" encoding="utf-8"?>
<ComicInfo xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Title>${safeTitle}</Title>
  <Series>${safeTitle}</Series>
  <PageCount>${pageCount}</PageCount>
  <Manga>Unknown</Manga>
  <Genre>Comic / Manga / Scan</Genre>
  <Notes>Zoptymalizowano dla czytnika Kindle KOReader (niski narzut RAM, natywne przewracanie stron).</Notes>
</ComicInfo>`;
}

/**
 * Converts a PDF or image container buffer into an optimized CBZ comic file.
 */
export async function convertToCbz(
  inputBuffer: Buffer,
  title: string
): Promise<ComicBuildResult> {
  let images: Buffer[] = [];

  // Try extracting images from zip/cbz if uploaded as archive
  try {
    const zip = await JSZip.loadAsync(inputBuffer);
    const files = Object.keys(zip.files).filter((name) =>
      /\.(jpe?g|png|webp|gif|bmp)$/i.test(name)
    );
    if (files.length > 0) {
      // Natural sort by filename
      files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
      for (const f of files) {
        const data = await zip.files[f].async('nodebuffer');
        if (data.length > 5000) images.push(data);
      }
    }
  } catch {
    // Not a zip file, will proceed to PDF extraction
  }

  // If no images from zip, scan PDF buffer for JPEG streams
  if (images.length === 0) {
    images = extractJpegsFromBuffer(inputBuffer);
  }

  if (images.length === 0) {
    throw new Error(
      'W przesłanym dokumencie nie znaleziono stron graficznych ani skanów w formacie JPEG. Jeśli to książka tekstowa, wybierz opcję "Lekki EPUB".'
    );
  }

  const outZip = new JSZip();

  // Add pages formatted as 001.jpg, 002.jpg, ...
  const padLength = Math.max(3, String(images.length).length);
  for (let idx = 0; idx < images.length; idx++) {
    const pageNum = String(idx + 1).padStart(padLength, '0');
    outZip.file(`page_${pageNum}.jpg`, images[idx]);
  }

  // Add ComicInfo.xml for KOReader comic browser
  outZip.file('ComicInfo.xml', buildComicInfoXml(title, images.length));

  const cbzBuffer = await outZip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const safeTitle = title.replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ _-]/g, '').trim() || 'Komiks';
  const filename = `${safeTitle.replace(/\s+/g, '_')}_CBZ.cbz`;

  return {
    filename,
    buffer: cbzBuffer,
    pageCount: images.length,
  };
}
