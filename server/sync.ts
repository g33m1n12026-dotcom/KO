import fs from 'fs';
import path from 'path';

export interface ReadingProgress {
  bookId: string;
  title: string;
  progressPercent: number; // 0 - 100
  chapterIndex: number;
  currentPosition?: number;
  totalChapters?: number;
  timestamp: number;
  device: 'Kindle' | 'Web Reader' | 'Android' | 'KOReader';
  timeAgo?: string;
}

const DATA_DIR = process.env.VERCEL
  ? path.join('/tmp', 'data')
  : path.join(process.cwd(), 'data');

const PROGRESS_FILE = path.join(DATA_DIR, 'progress.json');

const progressMap = new Map<string, ReadingProgress>();

function loadProgressFromDisk(): void {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const raw = fs.readFileSync(PROGRESS_FILE, 'utf8');
      const data: ReadingProgress[] = JSON.parse(raw);
      for (const item of data) {
        if (item.bookId) {
          progressMap.set(item.bookId, item);
        }
      }
    }
  } catch (err) {
    console.warn('Nie udało się załadować postępów czytania z dysku:', err);
  }
}

function saveProgressToDisk(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const list = Array.from(progressMap.values());
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.warn('Błąd zapisu postępów czytania:', err);
  }
}

// Initial load
loadProgressFromDisk();

function formatTimeAgo(timestamp: number): string {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return 'przed chwilą';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min temu`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} godz. temu`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} dni temu`;
}

export function updateReadingProgress(update: Omit<ReadingProgress, 'timestamp'> & { timestamp?: number }): ReadingProgress {
  const existing = progressMap.get(update.bookId);
  const now = update.timestamp || Date.now();

  const merged: ReadingProgress = {
    ...existing,
    ...update,
    timestamp: now,
  };

  progressMap.set(update.bookId, merged);
  saveProgressToDisk();
  return {
    ...merged,
    timeAgo: formatTimeAgo(merged.timestamp),
  };
}

export function getReadingProgress(bookId: string): ReadingProgress | null {
  const item = progressMap.get(bookId);
  if (!item) return null;
  return {
    ...item,
    timeAgo: formatTimeAgo(item.timestamp),
  };
}

export function getAllReadingProgress(): Record<string, ReadingProgress> {
  const result: Record<string, ReadingProgress> = {};
  for (const [id, item] of progressMap.entries()) {
    result[id] = {
      ...item,
      timeAgo: formatTimeAgo(item.timestamp),
    };
  }
  return result;
}
