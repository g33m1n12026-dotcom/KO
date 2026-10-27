export interface Job {
  id: string;
  title: string;
  sourceLang: string;
  targetLang: string;
  engine: 'auto' | 'claude' | 'openai' | 'openrouter' | 'gemini' | 'cohere' | 'river' | 'groq' | 'mistral';
  conversionMode?: 'translate' | 'epub_clean' | 'comic_cbz' | 'original';
  outputFormat?: 'epub' | 'cbz' | 'pdf' | 'mobi' | 'txt';
  detailedFormat?: string; // e.g. "EPUB 3", "EPUB 2", "PDF", "MOBI", "CBZ (Komiks)"
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
  author?: string;
  expectedLang?: string;
  storybookConfig?: StorybookRequest;
  series?: {
    name: string;
    tome: number;
    total?: number;
  };
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
  engine?: 'auto' | 'claude' | 'openai' | 'openrouter' | 'gemini' | 'cohere' | 'river' | 'groq' | 'mistral';
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
  verifiedStatus?: 'verified' | 'suspicious' | 'unknown';
  verificationDetails?: string;
  rating?: number;
  downloadsCount?: number;
  qualityBadge?: string;
  score?: number;
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
    verifiedStatus?: 'verified' | 'suspicious' | 'unknown';
    verificationDetails?: string;
    rating?: number;
    downloadsCount?: number;
    qualityBadge?: string;
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
  downloadLanguage?: string;
  mirrorLinks: { name: string; url: string }[];
}

export interface ShadowLibraryMirror {
  id: string;
  name: string;
  category:
    | 'annas'
    | 'zlib'
    | 'libgen'
    | 'scihub'
    | 'decentralized'
    | 'open'
    | 'chomikuj'
    | 'polish_docs'
    | 'polish_free'
    | 'polish_stores'
    | 'global_free'
    | 'file_search'
    | 'comics'
    | 'polish_comics';
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

export interface SearchDidYouMean {
  canonicalTitle: string;
  canonicalAuthor: string;
  originalTitle?: string;
  fullPhrase: string;
  searchQuery: string;
  isComic?: boolean;
  category?: string;
  synopsis?: string;
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
  docer?: {
    isConnected?: boolean;
    emailMasked?: string;
    hasPassword?: boolean;
  };
  fourShared?: {
    isConnected?: boolean;
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

export interface ReadingProgress {
  bookId: string;
  title: string;
  progressPercent: number;
  chapterIndex: number;
  currentPosition?: number;
  totalChapters?: number;
  timestamp: number;
  device: 'Kindle' | 'Web Reader' | 'Android' | 'KOReader';
  timeAgo?: string;
}

export interface DramaticScriptLine {
  id: string;
  role: 'narrator' | 'male' | 'female';
  characterName: string;
  text: string;
  emotion?: string;
  voiceId?: string;
}

export interface ChapterDramaticScript {
  jobId: string;
  chapterIndex: number;
  chapterTitle: string;
  lines: DramaticScriptLine[];
  characters: { name: string; role: 'narrator' | 'male' | 'female'; linesCount: number }[];
}

export interface BookCharacter {
  name: string;
  role: string;
  description: string;
  faction?: string;
  relations?: string[];
  importance?: 'main' | 'supporting' | 'minor';
}

export interface BookSeriesInfo {
  name: string;
  tome: number;
  total?: number;
}

export type AIModelTier = 'smart_auto' | 'free_opencode' | 'premium';

export interface AdvisorChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  recommendations?: BookRecommendation[];
  followUpQuestions?: string[];
  usedEngine?: string;
}

export interface AdvisorChatRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  engine?: string;
  modelTier?: AIModelTier;
  premiumProvider?: 'openrouter' | 'openai';
}

export interface AdvisorChatResponse {
  reply: string;
  followUpQuestions?: string[];
  recommendations: BookRecommendation[];
  usedEngine: string;
  analysis?: string;
}

export interface BookSummaryRequest {
  title: string;
  author?: string;
  modelTier?: AIModelTier;
  premiumProvider?: 'openrouter' | 'openai';
  language?: string;
}

export interface BookSummaryCharacter {
  name: string;
  role: string;
  description: string;
}

export interface BookSummaryAndMetadata {
  title: string;
  originalTitle?: string;
  polishTitle?: string;
  author: string;
  year?: string;
  genre: string;
  subgenres?: string[];
  originalLanguage?: string;
  estimatedPages?: number;
  estimatedReadingTime?: string;
  targetAudience?: string;
  synopsis: string;
  detailedSummary: string;
  keyThemes: string[];
  keyCharacters: BookSummaryCharacter[];
  literaryStyle: string;
  historicalContext?: string;
  notableQuote?: string;
  whyReadThis: string;
  modelTier: AIModelTier;
  modelName: string;
  provider: string;
  fetchedAt: string;
}

