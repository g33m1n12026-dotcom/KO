export interface Job {
  id: string;
  title: string;
  sourceLang: string;
  targetLang: string;
  engine: 'auto' | 'claude' | 'openai' | 'openrouter' | 'gemini';
  conversionMode?: 'translate' | 'epub_clean' | 'comic_cbz' | 'original';
  outputFormat?: 'epub' | 'cbz' | 'pdf' | 'mobi' | 'txt';
  status: 'queued' | 'extracting' | 'translating' | 'packaging' | 'completed' | 'failed';
  progress: number; // 0 - 100
  totalChapters: number;
  currentChapter: number;
  chapters: ChapterData[];
  createdAt: number;
  updatedAt: number;
  error?: string;
  outputEpubFilename?: string;
  originalSize?: number;
  sourceType: 'upload' | 'search' | 'storybook';
  storybookConfig?: StorybookRequest;
  logs: string[];
}

export interface ChapterData {
  title: string;
  originalText: string;
  translatedText?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  imageUrl?: string;
  imagePrompt?: string;
}

export type StorybookType = 'story' | 'summary' | 'guide';

export interface StorybookRequest {
  type: StorybookType;
  title?: string;
  prompt: string;
  characters?: string;
  genre?: string;
  chapterCount: number;
  targetAudience?: 'all' | 'adults' | 'young_adults' | 'children';
  includeIllustrations: boolean;
  engine?: 'auto' | 'claude' | 'openai' | 'openrouter' | 'gemini';
  author?: string;
}

export interface BookSearchResult {
  id: string;
  title: string;
  author: string;
  language: string;
  year?: string;
  description?: string;
  downloadUrl?: string;
  format: string;
  source: string;
  size?: string;
  coverUrl?: string;
  isLendingDRM?: boolean;
  mirrorLinks?: { name: string; url: string }[];
  availableSources?: Array<{
    id: string;
    title?: string;
    author?: string;
    source: string;
    format: string;
    language?: string;
    size?: string;
    downloadUrl?: string;
    isLendingDRM?: boolean;
  }>;
}

export interface BookRecommendation {
  id: string;
  title: string;
  polishTitle?: string;
  author: string;
  year?: string;
  genre?: string;
  matchReason: string;
  synopsis: string;
  originalLang: string;
  language?: string;
  isPolishAvailable?: boolean;
  recommendedAction?: string;
  searchQuery: string;
  downloadUrl?: string;
  downloadFormat?: string;
  mirrorLinks: { name: string; url: string }[];
}

export interface ShadowLibraryMirror {
  id: string;
  name: string;
  category: 'annas' | 'zlib' | 'libgen' | 'scihub' | 'decentralized' | 'open' | 'chomikuj';
  domain: string;
  searchUrlTemplate: string;
  description: string;
  isPrimary?: boolean;
}

export interface MultilingualBookMeta {
  originalQuery: string;
  detectedTitle?: string;
  canonicalAuthor?: string;
  titles: Record<string, string>;
  searchVariants: string[];
}

export interface AccountSettings {
  internetArchive: {
    accessKey?: string;
    secretKey?: string;
    sessionCookie?: string;
    hasKeys?: boolean;
    accessKeyMasked?: string;
  };
  zlibrary?: {
    isConnected?: boolean;
    emailMasked?: string;
    userName?: string;
    downloadsToday?: number;
    downloadsLimit?: number;
  };
  annasArchive: {
    fastDownloadKey?: string;
    hasKey?: boolean;
    fastDownloadKeyMasked?: string;
  };
  chomikuj?: {
    isConnected?: boolean;
    accountName?: string;
    emailMasked?: string;
    hasPassword?: boolean;
  };
}

export interface AIProviderConfig {
  openRouterKey?: string;
  openAIKey?: string;
  claudeKey?: string;
  geminiKey?: string;
  selectedProvider: 'auto' | 'claude' | 'openai' | 'openrouter' | 'gemini';
}
