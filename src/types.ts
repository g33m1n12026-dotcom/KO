export interface Job {
  id: string;
  title: string;
  sourceLang: string;
  targetLang: string;
  engine: 'auto' | 'claude' | 'openai' | 'openrouter' | 'gemini';
  conversionMode?: 'translate' | 'epub_clean' | 'comic_cbz';
  outputFormat?: 'epub' | 'cbz';
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
  mirrorLinks?: { name: string; url: string }[];
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
  searchQuery: string;
  downloadUrl?: string;
  downloadFormat?: string;
  mirrorLinks: { name: string; url: string }[];
}

export interface ShadowLibraryMirror {
  id: string;
  name: string;
  category: 'annas' | 'zlib' | 'libgen' | 'scihub' | 'decentralized' | 'open';
  domain: string;
  searchUrlTemplate: string;
  description: string;
  isPrimary?: boolean;
}

export interface AIProviderConfig {
  openRouterKey?: string;
  openAIKey?: string;
  claudeKey?: string;
  geminiKey?: string;
  selectedProvider: 'auto' | 'claude' | 'openai' | 'openrouter' | 'gemini';
}
