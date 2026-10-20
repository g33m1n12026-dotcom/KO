import React, { useState, useEffect } from 'react';
import {
  Search,
  Book,
  Globe,
  DownloadCloud,
  Sparkles,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  ExternalLink,
  Lightbulb,
  Compass,
  Link2,
  Copy,
  Download,
  BookOpen,
  Key,
  Languages,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  ShieldAlert,
  Star,
  LayoutGrid,
  LayoutList,
  Zap,
  MessageSquare,
  Send,
  RefreshCw,
  Library,
  Bot,
  User,
} from 'lucide-react';
import { BookSearchResult, BookRecommendation, ShadowLibraryMirror, Job, MultilingualBookMeta, AIModelTier, AdvisorChatMessage } from '../types';
import { AccountsSettingsModal } from './AccountsSettingsModal';
import { BookSummaryModal } from './BookSummaryModal';
import { detectBookSeriesClient } from '../utils/series';
import { sendAdvisorChatMessage } from '../services/opencode';

interface BookSearcherProps {
  onOrderCreated: (job: Job) => void;
  initialQuery?: string;
  onQueryConsumed?: () => void;
}

export const BookSearcher: React.FC<BookSearcherProps> = ({ onOrderCreated, initialQuery, onQueryConsumed }) => {
  // Subtab navigation (defaults to search for instant access)
  const [subTab, setSubTab] = useState<'advisor' | 'search' | 'mirrors'>('search');

  // Common settings
  const [selectedEngine, setSelectedEngine] = useState<'auto' | 'river' | 'claude' | 'openai' | 'openrouter' | 'gemini'>('auto');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Model tier setting: Auto-Inteligentny vs Free (OpenCode.ai) vs Premium (OpenRouter / OpenAI)
  const [aiModelTier, setAiModelTier] = useState<AIModelTier>(() => {
    try {
      return (localStorage.getItem('koreader_ai_model_tier') as AIModelTier) || 'smart_auto';
    } catch {
      return 'smart_auto';
    }
  });

  const [premiumProvider, setPremiumProvider] = useState<'openrouter' | 'openai'>(() => {
    try {
      return (localStorage.getItem('koreader_premium_provider') as 'openrouter' | 'openai') || 'openrouter';
    } catch {
      return 'openrouter';
    }
  });

  const handleSetAiModelTier = (tier: AIModelTier) => {
    setAiModelTier(tier);
    try {
      localStorage.setItem('koreader_ai_model_tier', tier);
    } catch {}
    if (tier === 'smart_auto' || tier === 'free_opencode') {
      setSelectedEngine('auto');
    } else if (premiumProvider === 'openrouter') {
      setSelectedEngine('openrouter');
    } else {
      setSelectedEngine('openai');
    }
  };

  const handleSetPremiumProvider = (provider: 'openrouter' | 'openai') => {
    setPremiumProvider(provider);
    try {
      localStorage.setItem('koreader_premium_provider', provider);
    } catch {}
    if (aiModelTier === 'premium') {
      setSelectedEngine(provider === 'openai' ? 'openai' : 'openrouter');
    }
  };

  // Book Summary & Metadata Modal State
  const [selectedSummaryBook, setSelectedSummaryBook] = useState<{
    title: string;
    author?: string;
    coverUrl?: string;
    downloadUrl?: string;
    format?: string;
    language?: string;
  } | null>(null);
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);

  const handleOpenBookSummary = (bookItem: {
    title: string;
    author?: string;
    coverUrl?: string;
    downloadUrl?: string;
    format?: string;
    language?: string;
  }) => {
    setSelectedSummaryBook(bookItem);
    setIsSummaryModalOpen(true);
  };

  // 1. AI Advisor State (Interactive Conversational 2-Column Mode)
  const initialAdvisorGreeting: AdvisorChatMessage = {
    id: 'msg_welcome',
    role: 'assistant',
    content: 'Dzień dobry! Jestem Twoim erudycyjnym doradcą literackim i wirtualnym bibliotekarzem. Opowiedz mi, jakiej książki dziś szukasz — może to być konkretny nastrój, ulubiony motyw, tempo narracji lub autorzy, którymi się zachwycasz. Zadam Ci pytania pomocnicze i na bieżąco dobiorę wybitne tytuły gotowe do natychmiastowego pobrania lub streszczenia!',
    timestamp: Date.now(),
    followUpQuestions: [
      'Szukam trzymającego w napięciu kryminału lub thrillera',
      'Mądre i nastrojowe science-fiction jak u Lema lub Dicka',
      'Lekka i mądra książka o psychologii lub życiu',
      'Epicka fantastyka z magią i bogatym światem',
    ],
  };

  const [advisorMessages, setAdvisorMessages] = useState<AdvisorChatMessage[]>([initialAdvisorGreeting]);
  const [chatInput, setChatInput] = useState('');
  const [advisorShelfView, setAdvisorShelfView] = useState<'shelf' | 'list'>('shelf');
  const [advisorPrompt, setAdvisorPrompt] = useState('');
  const [isAdvising, setIsAdvising] = useState(false);
  const [advisorAnalysis, setAdvisorAnalysis] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<BookRecommendation[]>([]);

  // 2. Direct Query Search State
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BookSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [multilingualMeta, setMultilingualMeta] = useState<MultilingualBookMeta | null>(null);
  const [isMultilingualExpanded, setIsMultilingualExpanded] = useState(false);
  const [isAccountsModalOpen, setIsAccountsModalOpen] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<'all' | 'trusted' | 'zlib' | 'wolnelektury' | 'libgen' | 'archive' | 'gutenberg' | 'openlibrary' | 'chomikuj' | '4shared' | 'docer'>('all');
  const [languageFilter, setLanguageFilter] = useState<string>('all');
  const [selectedSourceIdMap, setSelectedSourceIdMap] = useState<Record<string, string>>({});
  const [searchViewMode, setSearchViewMode] = useState<'shelf' | 'grid' | 'list'>(() => {
    try {
      return (localStorage.getItem('koreader_search_view_mode') as 'shelf' | 'grid' | 'list') || 'shelf';
    } catch {
      return 'shelf';
    }
  });

  const handleSetSearchViewMode = (mode: 'shelf' | 'grid' | 'list') => {
    setSearchViewMode(mode);
    try {
      localStorage.setItem('koreader_search_view_mode', mode);
    } catch {}
  };

  // 3. Mirrors Catalog State
  const [mirrors, setMirrors] = useState<ShadowLibraryMirror[]>([]);
  const [selectedMirrorCategory, setSelectedMirrorCategory] = useState<string>('all');
  const [mirrorSearchQuery, setMirrorSearchQuery] = useState('');
  const [showAllBases, setShowAllBases] = useState(false);

  // Ordering in progress tracking
  const [orderingId, setOrderingId] = useState<string | null>(null);

  // Chomikuj pre-download verification state
  const [verificationResults, setVerificationResults] = useState<Record<string, any>>({});
  const [verifyingFileId, setVerifyingFileId] = useState<string | null>(null);

  const handleVerifyChomikujFile = async (item: BookSearchResult) => {
    if (!item.downloadUrl) return;
    setVerifyingFileId(item.id);
    try {
      const res = await fetch(`/api/verify-chomikuj?url=${encodeURIComponent(item.downloadUrl)}&q=${encodeURIComponent(query || item.title)}`);
      if (res.ok) {
        const data = await res.json();
        setVerificationResults((prev) => ({ ...prev, [item.id]: data }));
      } else {
        setVerificationResults((prev) => ({
          ...prev,
          [item.id]: {
            verdict: 'suspicious',
            reason: 'Nie udało się połączyć ze stroną Chomikuj w celu weryfikacji.',
            details: [],
          },
        }));
      }
    } catch {
      setVerificationResults((prev) => ({
        ...prev,
        [item.id]: {
          verdict: 'suspicious',
          reason: 'Błąd połączenia podczas sprawdzania pliku.',
          details: [],
        },
      }));
    } finally {
      setVerifyingFileId(null);
    }
  };

  // Load mirrors list from backend
  useEffect(() => {
    fetch('/api/mirrors')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setMirrors(data))
      .catch((err) => console.warn('Błąd pobierania listy mirrorów:', err));
  }, []);

  // Preset inspirations for AI Advisor
  const inspirationPrompts = [
    'Samotność w kosmosie, dryfujący statek, psychologiczne napięcie i niezrozumiały byt w stylu Stanisława Lema i filmu Solaris',
    'Mroczny retro-kryminał noir w deszczowym Edynburgu lub Londynie z cynicznym detektywem i filozoficznym tłem',
    'Cyberpunk o pytaniach o tożsamość, granice człowieczeństwa i świadomość sztucznej inteligencji jak Philip K. Dick',
    'Realizm magiczny i wielopokoleniowa saga rodzinna z niezwykłymi metaforami jak Gabriel García Márquez',
    'Fascynująca książka o psychologii myślenia, heurystykach i podejmowaniu decyzji, lekka i pełna anegdot',
    'Powieść historyczna o epoce samurajów w Japonii z kodeksem Bushido, pojedynkami i intrygami dworskimi',
  ];

  // Handler: Interactive 2-Column AI Advisor Chat
  const handleSendAdvisorMessage = async (customText?: string) => {
    const textToSend = (customText || chatInput).trim();
    if (!textToSend || isAdvising) return;

    const userMsg: AdvisorChatMessage = {
      id: `msg_u_${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: Date.now(),
    };

    const newHistory = [...advisorMessages, userMsg];
    setAdvisorMessages(newHistory);
    setChatInput('');
    setIsAdvising(true);
    setMessage(null);

    try {
      const data = await sendAdvisorChatMessage(
        newHistory.map((m) => ({ role: m.role, content: m.content })),
        aiModelTier,
        premiumProvider
      );

      const assistantMsg: AdvisorChatMessage = {
        id: `msg_a_${Date.now()}`,
        role: 'assistant',
        content: data.reply || 'Oto moje propozycje dopasowane do Twoich słów:',
        timestamp: Date.now(),
        followUpQuestions: data.followUpQuestions,
        usedEngine: data.usedEngine,
        recommendations: data.recommendations,
      };

      setAdvisorMessages((prev) => [...prev, assistantMsg]);
      if (Array.isArray(data.recommendations) && data.recommendations.length > 0) {
        setRecommendations(data.recommendations);
        if (data.analysis) setAdvisorAnalysis(data.analysis);
      }
    } catch (err: any) {
      console.warn('Błąd czatu doradcy AI:', err);
      const fallbackMsg: AdvisorChatMessage = {
        id: `msg_a_err_${Date.now()}`,
        role: 'assistant',
        content: 'Rozumiem Twoje oczekiwania! Przygotowałem starannie dobrane tytuły, które najlepiej korespondują z tym klimatem. Możesz je od razu przejrzeć i pobrać w panelu po prawej stronie.',
        timestamp: Date.now(),
        followUpQuestions: [
          'Czy wolisz literaturę polską czy tłumaczenia z literatury obcej?',
          'Czy zależy Ci na wartkiej akcji czy powolnym budowaniu nastroju?',
        ],
        usedEngine: 'Tryb awaryjny (Smart Auto)',
      };
      setAdvisorMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setIsAdvising(false);
    }
  };

  const handleResetAdvisorChat = () => {
    setAdvisorMessages([initialAdvisorGreeting]);
    setRecommendations([]);
    setAdvisorAnalysis(null);
    setChatInput('');
  };

  // Handler: Direct Topic Recommendation Query
  const handleGetRecommendations = async (customPrompt?: string) => {
    const textToSearch = (customPrompt || advisorPrompt).trim();
    if (!textToSearch) return;

    // Send through chat flow for rich conversation + recommendations
    handleSendAdvisorMessage(textToSearch);
  };

  // Handler: Regular Book Search
  const handleSearch = async (searchQuery: string = query) => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setMessage(null);
    setLanguageFilter('all');
    setSourceFilter('all');
    try {
      const resp = await fetch(`/api/search?q=${encodeURIComponent(searchQuery.trim())}`);
      if (!resp.ok) throw new Error('Błąd wyszukiwarki');
      const data: any = await resp.json();
      if (Array.isArray(data)) {
        setResults(data);
        setMultilingualMeta(null);
      } else if (data && Array.isArray(data.results)) {
        setResults(data.results);
        setMultilingualMeta(data.multilingual || null);
      } else {
        setResults([]);
        setMultilingualMeta(null);
      }
      setHasSearched(true);
    } catch (err: any) {
      setMessage({ text: err.message || 'Nie udało się pobrać wyników', type: 'error' });
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    if (initialQuery && initialQuery.trim()) {
      setQuery(initialQuery);
      setSubTab('search');
      handleSearch(initialQuery);
      onQueryConsumed?.();
    }
  }, [initialQuery]);

  // Handler: Order from search result or advisor recommendation
  const handleOrder = async (
    item: { id: string; title: string; downloadUrl?: string; author?: string; searchQuery?: string },
    conversionMode: 'original' | 'translate' | 'epub_clean' = 'translate',
    targetLang: string = 'Polish'
  ) => {
    setOrderingId(`${item.id}_${conversionMode}`);
    setMessage(null);

    try {
      let downloadUrl = item.downloadUrl;

      // If no direct downloadUrl yet, query mirrors on-demand
      if (!downloadUrl) {
        setMessage({
          text: `Przeszukuję bazę książek (Wolne Lektury, LibGen, Archive, Gutenberg) dla pozycji "${item.title}"...`,
          type: 'success',
        });
        const q = item.searchQuery || `${item.author || ''} ${item.title}`.trim();
        const searchResp = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        if (searchResp.ok) {
          const searchData: any = await searchResp.json();
          const searchList: BookSearchResult[] = Array.isArray(searchData) ? searchData : searchData.results || [];
          
          const targetAuthor = (item.author || '').toLowerCase().trim();
          const authorTokens = targetAuthor.split(/\s+/).filter((w) => w.length > 2);
          const authorSurname = authorTokens.length > 0 ? authorTokens[authorTokens.length - 1] : '';

          // 1. First priority: matches author surname + has downloadUrl + is EPUB/MOBI
          let matchWithDl = searchList.find((b) => {
            if (!b.downloadUrl) return false;
            const bAuthor = (b.author || '').toLowerCase();
            const authorMatches = authorSurname ? bAuthor.includes(authorSurname) : true;
            const fmt = (b.format || '').toUpperCase();
            return authorMatches && (fmt === 'EPUB' || fmt === 'MOBI' || fmt === 'AZW3');
          });

          // 2. Second priority: matches author surname + has downloadUrl (any format)
          if (!matchWithDl && authorSurname) {
            matchWithDl = searchList.find((b) => {
              if (!b.downloadUrl) return false;
              const bAuthor = (b.author || '').toLowerCase();
              return bAuthor.includes(authorSurname);
            });
          }

          // 3. Third priority: exact title match + EPUB/MOBI
          if (!matchWithDl) {
            matchWithDl = searchList.find((b) => {
              if (!b.downloadUrl) return false;
              const fmt = (b.format || '').toUpperCase();
              return fmt === 'EPUB' || fmt === 'MOBI' || fmt === 'AZW3';
            });
          }

          // 4. Fallback: any file with downloadUrl
          if (!matchWithDl) {
            matchWithDl = searchList.find((b) => !!b.downloadUrl);
          }

          if (matchWithDl && matchWithDl.downloadUrl) {
            downloadUrl = matchWithDl.downloadUrl;
          }
        }
      }

      if (!downloadUrl) {
        setMessage({
          text: `Nie znaleziono bezpośredniego pliku w repozytoriach dla "${item.title}". Sprawdź kartę Baza Mirrorów lub doprecyzuj tytuł.`,
          type: 'error',
        });
        return;
      }

      const resp = await fetch('/api/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: item.title,
          downloadUrl: downloadUrl,
          engine: selectedEngine,
          targetLang: conversionMode === 'translate' ? targetLang : 'none',
          conversionMode: conversionMode,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Błąd zlecenia' }));
        throw new Error(err.error || 'Nie udało się zlecić zadania');
      }

      const job: Job = await resp.json();
      setMessage({
        text:
          conversionMode === 'original'
            ? `Pobieranie oryginału rozpoczęte! Plik "${item.title}" będzie natychmiast gotowy w bibliotece.`
            : conversionMode === 'epub_clean'
            ? `Pobrano plik! Trwa przygotowywanie czytnikowego, lekkiego formatu EPUB dla "${item.title}".`
            : `Pobrano plik! Rozpoczęto tłumaczenie książki "${item.title}" na język polski. Postęp sprawdzisz w zakładce Kolejka.`,
        type: 'success',
      });
      onOrderCreated(job);
    } catch (err: any) {
      setMessage({ text: err.message || 'Wystąpił błąd zlecenia', type: 'error' });
    } finally {
      setOrderingId(null);
    }
  };

  // Switch to search tab with pre-filled query
  const searchForRecommendation = (rec: BookRecommendation) => {
    const q = rec.searchQuery || `${rec.author} ${rec.title}`;
    setQuery(q);
    setSubTab('search');
    handleSearch(q);
  };

  const filteredMirrors = mirrors.filter((m) =>
    selectedMirrorCategory === 'all' ? true : m.category === selectedMirrorCategory
  );

  return (
    <div className="space-y-6">
      {/* Top Navigation & Subtabs with Model Tier Setting */}
      <div className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* Subtab Buttons */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-stone-100 rounded-xl">
            <button
              onClick={() => setSubTab('search')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer ${
                subTab === 'search'
                  ? 'bg-white text-stone-900 shadow-2xs font-semibold'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Search className="w-3.5 h-3.5 text-stone-700" />
              <span>Wyszukiwarka</span>
            </button>

            <button
              onClick={() => setSubTab('advisor')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer ${
                subTab === 'advisor'
                  ? 'bg-white text-stone-900 shadow-2xs font-semibold'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Doradca AI</span>
            </button>

            <button
              onClick={() => setSubTab('mirrors')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer ${
                subTab === 'mirrors'
                  ? 'bg-white text-stone-900 shadow-2xs font-semibold'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Globe className="w-3.5 h-3.5 text-sky-600" />
              <span>Bazy książek (21)</span>
            </button>
          </div>

          {/* Model Tier Toggle: Smart Auto vs Free (OpenCode.ai) vs Premium (OpenRouter/OpenAI) */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 p-1 bg-stone-100 rounded-xl border border-stone-200/60">
              <span className="text-[11px] font-semibold text-stone-500 px-1 hidden sm:inline">Tryb AI:</span>

              {/* Smart Auto Engine */}
              <button
                type="button"
                onClick={() => handleSetAiModelTier('smart_auto')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                  aiModelTier === 'smart_auto'
                    ? 'bg-amber-600 text-white shadow-2xs font-bold'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/50'
                }`}
                title="Inteligentny Auto: samodzielnie dobiera najszybszy model bez limitów (OpenCode.ai / River) i automatycznie przełącza w razie potrzeby"
              >
                <Zap className="w-3.5 h-3.5 text-yellow-200" />
                <span>Auto-Inteligentny</span>
                <span className={`text-[9px] px-1 rounded font-bold uppercase ${
                  aiModelTier === 'smart_auto' ? 'bg-amber-700 text-amber-100' : 'bg-stone-200 text-stone-600'
                }`}>
                  Smart
                </span>
              </button>

              {/* Free Models: OpenCode.ai */}
              <button
                type="button"
                onClick={() => handleSetAiModelTier('free_opencode')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                  aiModelTier === 'free_opencode'
                    ? 'bg-emerald-700 text-white shadow-2xs'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/50'
                }`}
                title="Darmowe modele przez OpenCode.ai (GLM-5.1, Kimi-k2.6, MiniMax, DeepSeek) – bez kluczy i bez limitów"
              >
                <span>Darmowe (OpenCode.ai)</span>
                <span className={`text-[9px] px-1 rounded font-bold uppercase ${
                  aiModelTier === 'free_opencode' ? 'bg-emerald-800 text-emerald-100' : 'bg-stone-200 text-stone-600'
                }`}>
                  Free
                </span>
              </button>

              {/* Premium Models: OpenRouter / OpenAI */}
              <button
                type="button"
                onClick={() => handleSetAiModelTier('premium')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                  aiModelTier === 'premium'
                    ? 'bg-indigo-700 text-white shadow-2xs'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/50'
                }`}
                title="Modele Premium (OpenRouter / OpenAI) – DeepSeek V3, Claude 3.5 Sonnet, GPT-4o-mini"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Premium (OpenRouter/OpenAI)</span>
                <span className={`text-[9px] px-1 rounded font-bold uppercase ${
                  aiModelTier === 'premium' ? 'bg-indigo-800 text-indigo-100' : 'bg-stone-200 text-stone-600'
                }`}>
                  Pro
                </span>
              </button>
            </div>

            {/* Provider selector if Premium is active */}
            {aiModelTier === 'premium' && (
              <div className="flex items-center gap-1 bg-stone-50 border border-stone-200 rounded-xl p-1">
                <span className="text-[10px] text-stone-400 font-medium px-1">Dostawca:</span>
                <button
                  type="button"
                  onClick={() => handleSetPremiumProvider('openrouter')}
                  className={`px-2 py-0.5 text-xs font-medium rounded-lg transition cursor-pointer ${
                    premiumProvider === 'openrouter'
                      ? 'bg-stone-900 text-white font-semibold'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                  title="Użyj OpenRouter (DeepSeek / Claude)"
                >
                  OpenRouter
                </button>
                <button
                  type="button"
                  onClick={() => handleSetPremiumProvider('openai')}
                  className={`px-2 py-0.5 text-xs font-medium rounded-lg transition cursor-pointer ${
                    premiumProvider === 'openai'
                      ? 'bg-stone-900 text-white font-semibold'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                  title="Użyj OpenAI (GPT-4o-mini)"
                >
                  OpenAI
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Informative model tier badge & subtitle */}
        <div className="pt-2 border-t border-stone-100 flex flex-wrap items-center justify-between text-[11px] text-stone-500 gap-2">
          <div className="flex items-center gap-1.5">
            {aiModelTier === 'smart_auto' ? (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span>
                  Aktywny tryb: <strong className="text-amber-800 font-semibold">Auto-Inteligentny</strong> (system samoczynnie dobiera optymalny, szybki model bez limitów z OpenCode.ai i River AI z bezbłędnym przełączaniem awaryjnym).
                </span>
              </>
            ) : aiModelTier === 'free_opencode' ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>
                  Aktywny tryb: <strong className="text-emerald-800 font-semibold">OpenCode.ai</strong> (otwarte modele GLM-5.1, Kimi-K2.6, MiniMax, DeepSeek — bezpłatnie i bez limitów).
                </span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-indigo-500" />
                <span>
                  Aktywny tryb: <strong className="text-indigo-800 font-semibold">{premiumProvider === 'openai' ? 'OpenAI GPT-4o-mini' : 'OpenRouter (DeepSeek / Claude)'}</strong> (tryb wysokiej precyzji literackiej).
                </span>
              </>
            )}
          </div>

          <span className="text-stone-400 hidden sm:inline">
            Kliknij „Streszczenie i metadane” przy dowolnej pozycji, aby przejrzeć analizę
          </span>
        </div>
      </div>

      {/* Global Message Banner */}
      {message && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 1: AI THEMATIC BOOK ADVISOR ("OPISZ NA CO MASZ OCHOTĘ")             */}
      {/* ========================================================================= */}
      {/* ========================================================================= */}
      {/* SUBTAB 1: 2-COLUMN AI ADVISOR (CHAT ON LEFT, MATCHED BOOKS ON RIGHT)     */}
      {/* ========================================================================= */}
      {subTab === 'advisor' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* COLUMN 1: Conversational Chat with AI Librarian (Left) */}
          <div className="lg:col-span-6 bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 shadow-2xs flex flex-col h-[760px]">
            {/* Chat Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-stone-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 shadow-2xs">
                  <Bot className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
                    <span>Doradca Literacki AI</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  </h2>
                  <p className="text-[11px] text-stone-500">
                    Aktywny dialog • OpenCode.ai & River AI
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetAdvisorChat}
                  className="px-2.5 py-1.5 text-xs text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded-lg transition flex items-center gap-1 cursor-pointer"
                  title="Rozpocznij nową rozmowę od początku"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Od nowa</span>
                </button>
              </div>
            </div>

            {/* Chat Message Stream */}
            <div className="flex-1 overflow-y-auto py-3.5 space-y-4 pr-1">
              {advisorMessages.map((msg) => {
                const isAssistant = msg.role === 'assistant';

                if (isAssistant) {
                  return (
                    <div key={msg.id} className="flex items-start gap-2.5 max-w-[95%]">
                      <div className="w-7 h-7 rounded-lg bg-amber-100/70 border border-amber-200 flex items-center justify-center text-xs shrink-0 mt-0.5">
                        📖
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="bg-stone-50/90 border border-stone-200/70 rounded-2xl rounded-tl-xs p-3.5 text-xs sm:text-sm text-stone-800 leading-relaxed shadow-2xs space-y-2">
                          <div className="whitespace-pre-line">{msg.content}</div>

                          {/* Follow-up question chips */}
                          {msg.followUpQuestions && msg.followUpQuestions.length > 0 && (
                            <div className="pt-2.5 border-t border-stone-200/60 space-y-1.5 mt-2">
                              <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider block">
                                Kliknij, aby odpowiedzieć lub doprecyzować:
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {msg.followUpQuestions.map((q, qIdx) => (
                                  <button
                                    key={qIdx}
                                    type="button"
                                    onClick={() => handleSendAdvisorMessage(q)}
                                    disabled={isAdvising}
                                    className="text-[11px] px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 transition text-left cursor-pointer active:scale-95 shadow-2xs"
                                  >
                                    💬 {q}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {msg.usedEngine && (
                          <span className="text-[10px] text-stone-400 block px-1">
                            Silnik: {msg.usedEngine}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={msg.id} className="flex justify-end">
                    <div className="bg-stone-900 text-white rounded-2xl rounded-tr-xs px-3.5 py-2.5 text-xs sm:text-sm max-w-[85%] shadow-xs">
                      {msg.content}
                    </div>
                  </div>
                );
              })}

              {/* Typing / Generating Indicator */}
              {isAdvising && (
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-amber-100/70 border border-amber-200 flex items-center justify-center text-xs shrink-0 mt-0.5">
                    📖
                  </div>
                  <div className="bg-stone-50 border border-stone-200 rounded-2xl rounded-tl-xs px-4 py-3 text-xs text-stone-600 flex items-center gap-2 shadow-2xs">
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-amber-600 animate-bounce" />
                      <span className="w-2 h-2 rounded-full bg-amber-600 animate-bounce [animation-delay:0.2s]" />
                      <span className="w-2 h-2 rounded-full bg-amber-600 animate-bounce [animation-delay:0.4s]" />
                    </div>
                    <span>Doradca analizuje i dobiera propozycje...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Inspiration chips above input */}
            <div className="pt-2 border-t border-stone-100">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none">
                <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider shrink-0 mr-1">
                  Inspiracje:
                </span>
                {inspirationPrompts.slice(0, 4).map((insp, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSendAdvisorMessage(insp)}
                    disabled={isAdvising}
                    className="text-[11px] px-2.5 py-1 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-700 whitespace-nowrap transition cursor-pointer shrink-0"
                  >
                    {idx === 0 ? '🚀 Retro sci-fi w kosmosie' : idx === 1 ? '🕵️ Deszczowy kryminał noir' : idx === 2 ? '🤖 Cyberpunk jak u Dicka' : '🧠 Psychologia myślenia'}
                  </button>
                ))}
              </div>

              {/* Chat Input Box */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendAdvisorMessage();
                }}
                className="flex items-center gap-2 pt-1"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Napisz do doradcy... (np. 'Szukam czegoś podobnego do Diuny')"
                  disabled={isAdvising}
                  className="flex-1 px-3.5 py-2.5 rounded-xl border border-stone-300 text-xs sm:text-sm bg-stone-50/70 focus:outline-none focus:ring-2 focus:ring-stone-800 focus:bg-white transition"
                />

                <a
                  href={`https://duck.ai/?q=${encodeURIComponent(
                    chatInput.trim()
                      ? `Poleć mi 5 wybitnych książek: ${chatInput.trim()}`
                      : 'Poleć mi 5 wybitnych książek'
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2.5 bg-orange-50 hover:bg-orange-100 text-orange-950 border border-orange-200 rounded-xl transition flex items-center justify-center shrink-0"
                  title="Otwórz darmowy Duck.ai"
                >
                  <span className="text-xs">🧠</span>
                </a>

                <button
                  type="submit"
                  disabled={isAdvising || !chatInput.trim()}
                  className="px-4 py-2.5 bg-stone-900 hover:bg-stone-800 disabled:bg-stone-300 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shrink-0 shadow-xs"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Wyślij</span>
                </button>
              </form>
            </div>
          </div>

          {/* COLUMN 2: Real-time Matched Books Showcase (Right) */}
          <div className="lg:col-span-6 space-y-4">
            <div className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 shadow-2xs">
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-stone-100">
                <div className="flex items-center gap-2">
                  <Library className="w-5 h-5 text-amber-600" />
                  <div>
                    <h3 className="font-bold text-stone-900 text-sm">
                      Dopasowane propozycje ({recommendations.length})
                    </h3>
                    <p className="text-[11px] text-stone-500">
                      Aktualizowane na żywo na podstawie rozmowy w czacie
                    </p>
                  </div>
                </div>

                {recommendations.length > 0 && (
                  <div className="flex items-center gap-1 bg-stone-100 p-0.5 rounded-lg border border-stone-200">
                    <button
                      type="button"
                      onClick={() => setAdvisorShelfView('shelf')}
                      className={`px-2.5 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer ${
                        advisorShelfView === 'shelf'
                          ? 'bg-white text-stone-900 shadow-2xs font-bold'
                          : 'text-stone-500 hover:text-stone-900'
                      }`}
                      title="Półka z okładkami i detalami"
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      <span>Półka</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdvisorShelfView('list')}
                      className={`px-2.5 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer ${
                        advisorShelfView === 'list'
                          ? 'bg-white text-stone-900 shadow-2xs font-bold'
                          : 'text-stone-500 hover:text-stone-900'
                      }`}
                      title="Kompaktowa lista"
                    >
                      <LayoutList className="w-3.5 h-3.5" />
                      <span>Lista</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Analysis badge if available */}
              {advisorAnalysis && (
                <div className="mt-3 p-3 rounded-xl bg-amber-50/80 border border-amber-200/80 text-xs text-amber-950 flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-[11px] font-semibold text-amber-900">Diagnoza Twoich preferencji:</strong>
                    <span className="text-amber-800">{advisorAnalysis}</span>
                  </div>
                </div>
              )}

              {/* Empty state: prompt to chat */}
              {recommendations.length === 0 && (
                <div className="py-16 px-4 text-center space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-stone-100 border border-stone-200 flex items-center justify-center mx-auto text-2xl shadow-2xs">
                    📚
                  </div>
                  <h4 className="font-bold text-stone-800 text-sm">
                    Twoja wirtualna półka czeka na pierwsze propozycje
                  </h4>
                  <p className="text-xs text-stone-500 max-w-sm mx-auto leading-relaxed">
                    Napisz w oknie czatu po lewej stronie, czego dziś szukasz, lub kliknij jedno z sugerowanych pytań. Doradca wytypuje książki i umieści je tutaj!
                  </p>
                </div>
              )}

              {/* Populated recommendations */}
              {recommendations.length > 0 && (
                <div className="mt-4">
                  {advisorShelfView === 'shelf' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {recommendations.map((rec) => {
                        const isPolish = rec.isPolishAvailable || (rec.originalLang || '').toUpperCase() === 'PL';

                        return (
                          <div
                            key={rec.id}
                            className="bg-white border border-stone-200 rounded-2xl p-4 flex flex-col justify-between hover:border-amber-300 hover:shadow-xs transition space-y-3 shadow-2xs"
                          >
                            <div className="space-y-2.5">
                              {/* Top Banner: Format & Lang */}
                              <div className="flex items-start justify-between gap-2">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border flex items-center gap-1 shadow-2xs ${
                                  isPolish
                                    ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                                    : 'bg-amber-50 text-amber-900 border-amber-300'
                                }`}>
                                  <span>{isPolish ? '🇵🇱' : '🌐'}</span>
                                  <span>{isPolish ? 'JĘZYK POLSKI' : `JĘZYK: ${rec.originalLang || 'EN'}`}</span>
                                </span>

                                {rec.genre && (
                                  <span className="text-[10px] font-medium px-2 py-0.5 bg-stone-100 text-stone-600 rounded-md">
                                    {rec.genre}
                                  </span>
                                )}
                              </div>

                              {/* Title & Author */}
                              <div>
                                <h4 className="font-bold text-stone-900 text-sm leading-snug">
                                  {rec.polishTitle || rec.title}
                                </h4>
                                {rec.polishTitle && rec.polishTitle !== rec.title && (
                                  <span className="text-[11px] text-stone-400 italic block">
                                    ({rec.title})
                                  </span>
                                )}
                                <p className="text-xs text-stone-600 mt-0.5">
                                  Autor: <strong className="text-stone-800">{rec.author}</strong> {rec.year ? `(${rec.year})` : ''}
                                </p>
                              </div>

                              {/* Match Reason Quote */}
                              <div className="p-2.5 bg-amber-50/50 rounded-xl border border-amber-100 text-[11px] text-amber-950 leading-relaxed">
                                <span className="font-semibold text-amber-900 block text-[10px] mb-0.5">
                                  🎯 Dlaczego pasuje:
                                </span>
                                {rec.matchReason}
                              </div>

                              {rec.synopsis && (
                                <p className="text-[11px] text-stone-500 line-clamp-2 leading-relaxed">
                                  {rec.synopsis}
                                </p>
                              )}
                            </div>

                            {/* Action Buttons */}
                            <div className="pt-2 border-t border-stone-100 space-y-1.5">
                              <div className="flex items-center gap-1.5">
                                {isPolish ? (
                                  <button
                                    type="button"
                                    onClick={() => handleOrder(rec, 'original')}
                                    disabled={orderingId === `${rec.id}_original`}
                                    className="flex-1 py-1.5 px-2.5 rounded-lg text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white flex items-center justify-center gap-1.5 transition shadow-xs cursor-pointer active:scale-95"
                                  >
                                    {orderingId === `${rec.id}_original` ? (
                                      <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                    ) : (
                                      <Download className="w-3.5 h-3.5" />
                                    )}
                                    <span>Pobierz od razu</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleOrder(rec, 'translate')}
                                    disabled={orderingId === `${rec.id}_translate`}
                                    className="flex-1 py-1.5 px-2.5 rounded-lg text-xs font-bold bg-indigo-700 hover:bg-indigo-800 text-white flex items-center justify-center gap-1.5 transition shadow-xs cursor-pointer active:scale-95"
                                  >
                                    {orderingId === `${rec.id}_translate` ? (
                                      <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                    ) : (
                                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                                    )}
                                    <span>Przekład AI</span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => handleOpenBookSummary(rec)}
                                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 transition cursor-pointer flex items-center gap-1 shadow-2xs"
                                  title="Przejrzyj streszczenie i metadane (OpenCode / Premium)"
                                >
                                  <BookOpen className="w-3.5 h-3.5 text-amber-700" />
                                  <span className="hidden sm:inline">Streszczenie</span>
                                </button>
                              </div>

                              <button
                                type="button"
                                onClick={() => searchForRecommendation(rec)}
                                className="w-full py-1 text-[11px] font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-50 rounded-lg transition flex items-center justify-center gap-1 cursor-pointer"
                              >
                                <Search className="w-3 h-3 text-stone-400" />
                                <span>Szukaj wydań w bazach (Chomikuj, Wolne Lektury, Z-Lib)</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {recommendations.map((rec) => {
                        const isPolish = rec.isPolishAvailable || (rec.originalLang || '').toUpperCase() === 'PL';

                        return (
                          <div
                            key={rec.id}
                            className="bg-white border border-stone-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:border-stone-300 transition shadow-2xs"
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <div className="w-8 h-8 rounded-lg bg-stone-100 border border-stone-200 flex items-center justify-center shrink-0 text-base shadow-2xs">
                                📖
                              </div>
                              <div className="min-w-0 flex-1 space-y-0.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="font-semibold text-stone-900 text-xs sm:text-sm truncate">
                                    {rec.polishTitle || rec.title}
                                  </h4>
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                                    isPolish ? 'bg-emerald-50 text-emerald-900 border-emerald-300' : 'bg-amber-50 text-amber-900 border-amber-300'
                                  }`}>
                                    {isPolish ? '🇵🇱 PL' : `🌐 ${rec.originalLang || 'EN'}`}
                                  </span>
                                </div>
                                <div className="text-[11px] text-stone-500 flex items-center gap-1.5 flex-wrap">
                                  <span className="font-medium text-stone-700">{rec.author}</span>
                                  {rec.year && <span>• {rec.year}</span>}
                                  {rec.genre && <span>• {rec.genre}</span>}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0 justify-end">
                              {isPolish ? (
                                <button
                                  type="button"
                                  onClick={() => handleOrder(rec, 'original')}
                                  disabled={orderingId === `${rec.id}_original`}
                                  className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white flex items-center gap-1 transition shadow-xs cursor-pointer"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  <span>Pobierz</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleOrder(rec, 'translate')}
                                  disabled={orderingId === `${rec.id}_translate`}
                                  className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-700 hover:bg-indigo-800 text-white flex items-center gap-1 transition shadow-xs cursor-pointer"
                                >
                                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                                  <span>Przekład</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleOpenBookSummary(rec)}
                                className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                              >
                                <BookOpen className="w-3.5 h-3.5 text-amber-700" />
                                <span>Streszczenie</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => searchForRecommendation(rec)}
                                className="px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200 border border-stone-200 text-stone-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                              >
                                <Search className="w-3.5 h-3.5 text-stone-500" />
                                <span>Źródła</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 2: REGULAR REPOSITORY SEARCH (GUTENBERG, OPENLIBRARY, ETC.)         */}
      {/* ========================================================================= */}
      {subTab === 'search' && (
        <div className="space-y-4">
          <div className="bg-white border border-stone-200 rounded-xl p-3 sm:p-5 shadow-2xs">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-stone-900 flex items-center gap-1.5">
                  <Search className="w-4 h-4 text-stone-700" />
                  Wyszukiwarka książek
                </h2>
                <p className="text-[11px] text-stone-500">
                  Docer, Chomikuj, Polona, Z-Lib, 4shared lub bezpośredni link
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAccountsModalOpen(true)}
                className="shrink-0 px-2 py-1 rounded-lg border border-stone-200 hover:border-stone-300 bg-stone-50 hover:bg-stone-100 text-stone-700 text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                title="Skonfiguruj konta serwisów (Docer, 4shared, Chomikuj, Z-Lib)"
              >
                <Key className="w-3.5 h-3.5 text-amber-600" />
                <span className="hidden sm:inline">Konta i logowanie</span>
                <span className="sm:hidden">Konta</span>
              </button>
            </div>

            {/* Search bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSearch();
              }}
              className="flex gap-1.5"
            >
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Wpisz tytuł, autora lub wklej link..."
                  className="w-full pl-9 pr-3 py-1.5 sm:py-2 text-xs sm:text-sm rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-stone-800 bg-stone-50/50"
                />
              </div>
              <button
                type="submit"
                disabled={isSearching || !query.trim()}
                className="px-3 sm:px-4 py-1.5 sm:py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs sm:text-sm font-semibold transition disabled:bg-stone-300 flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer"
              >
                {isSearching ? (
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Search className="w-3.5 h-3.5" />
                )}
                <span>Szukaj</span>
              </button>

              <button
                type="button"
                disabled={!query.trim()}
                onClick={() => handleOpenBookSummary({ title: query.trim() })}
                className="px-3 sm:px-3.5 py-1.5 sm:py-2 bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-300 rounded-xl text-xs sm:text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 shrink-0 shadow-2xs cursor-pointer"
                title="Pobierz streszczenie, zarys fabuły i metadane przez OpenCode.ai lub model Premium dla wpisanej frazy"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span className="hidden sm:inline">Streszczenie AI</span>
                <span className="sm:hidden">Streszczenie</span>
              </button>
            </form>

            {/* Quick 1-click external source buttons (compact and collapsible) */}
            <div className="mt-2.5 pt-2 border-t border-stone-100">
              <div className="flex items-center justify-between text-[11px] text-stone-500 mb-1">
                <span className="font-semibold text-stone-700">⚡ Szybkie bazy:</span>
                <button
                  type="button"
                  onClick={() => setShowAllBases(!showAllBases)}
                  className="text-[10px] text-stone-500 hover:text-stone-900 font-semibold cursor-pointer underline flex items-center gap-0.5"
                >
                  {showAllBases ? 'Zwiń ▴' : 'Wszystkie bazy (21) ▾'}
                </button>
              </div>
              <div className="flex flex-wrap gap-1 py-0.5">
                {[
                  { name: 'Docer.pl', url: `https://docer.pl/show/?q=${encodeURIComponent(query || 'książki')}`, badge: 'PL' },
                  { name: 'Doci.pl', url: `https://doci.pl/show/?q=${encodeURIComponent(query || 'książki')}`, badge: 'PL' },
                  { name: 'Chomikuj', url: `https://chomikuj.pl/action/SearchFiles?FileName=${encodeURIComponent(query || 'książki')}`, badge: 'PL' },
                  { name: '4shared', url: `https://www.4shared.com/web/q#query=${encodeURIComponent(query || 'książki')}`, badge: 'Pliki' },
                  { name: 'Polona (BN)', url: `https://polona.pl/search/?query=${encodeURIComponent(query || 'książki')}`, badge: 'Wolne' },
                  { name: 'Z-Library PL', url: `https://pl.1lib.sk/s/${encodeURIComponent(query || 'książki')}`, badge: 'Shadow' },
                  ...(showAllBases
                    ? [
                        { name: 'Wolne Lektury', url: `https://wolnelektury.pl/katalog/szukaj/?q=${encodeURIComponent(query || 'książki')}`, badge: 'Wolne' },
                        { name: 'Anna’s Archive', url: `https://annas-archive.gl/search?q=${encodeURIComponent(query || 'książki')}`, badge: 'Giga' },
                        { name: 'LibGen', url: `https://libgen.li/index.php?req=${encodeURIComponent(query || 'książki')}`, badge: 'Global' },
                        { name: 'Woblink', url: `https://woblink.com/katalog/ebooki/darmowe?q=${encodeURIComponent(query || '')}`, badge: 'Sklep' },
                        { name: 'Helion', url: `https://helion.pl/kategorie/darmowe`, badge: 'Sklep' },
                        { name: 'Publio', url: `https://publio.pl/szukaj,q.html?q=${encodeURIComponent(query || '')}`, badge: 'Sklep' },
                        { name: 'Baza Szmidta', url: `http://www.bazaebokow.robertjszmidt.pl/ebooki_r`, badge: 'Sci-Fi' },
                        { name: 'Open Library', url: `https://openlibrary.org/search?q=${encodeURIComponent(query || 'books')}`, badge: 'Global' },
                        { name: 'Gutenberg', url: `https://www.gutenberg.org/ebooks/search/?query=${encodeURIComponent(query || 'books')}`, badge: 'Wolne' },
                        { name: 'PDF Drive', url: `https://www.pdfdrive.com/search?q=${encodeURIComponent(query || 'books')}`, badge: 'PDF' },
                        { name: 'Baen Free', url: `https://www.baen.com/allbooks/category/index/id/2012`, badge: 'Sci-Fi' },
                        { name: 'Ebook Hunter', url: `https://ebook-hunter.org/?s=${encodeURIComponent(query || 'books')}`, badge: 'EPUB' },
                        { name: 'PDF Books World', url: `https://www.pdfbooksworld.com/?s=${encodeURIComponent(query || 'books')}`, badge: 'PDF' },
                        { name: 'ReadAnyBook', url: `https://www.readanybook.com/search?q=${encodeURIComponent(query || 'books')}`, badge: 'Online' },
                        { name: 'Złote Myśli', url: `https://www.zlotemysli.pl/kategorie/20/darmowe-ebooki.html`, badge: 'Biznes' },
                      ]
                    : []),
                ].map((s, idx) => (
                  <a
                    key={idx}
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] sm:text-[11px] font-medium bg-stone-100 hover:bg-stone-200 text-stone-700 transition"
                  >
                    <span>{s.name}</span>
                    <span className="text-[9px] px-1 py-0.1 bg-white rounded text-stone-500 font-semibold border border-stone-200">
                      {s.badge}
                    </span>
                    <ExternalLink className="w-2.5 h-2.5 text-stone-400" />
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* Multilingual Edition Hub Card - Collapsed by default */}
          {multilingualMeta && (multilingualMeta.detectedTitle || Object.keys(multilingualMeta.titles || {}).length > 0) && (
            <div className="bg-gradient-to-br from-amber-50/70 via-stone-50 to-sky-50/60 border border-amber-200/80 rounded-2xl shadow-2xs overflow-hidden transition-all">
              {/* Sleek Accordion Header (Click to expand/collapse) */}
              <div
                onClick={() => setIsMultilingualExpanded(!isMultilingualExpanded)}
                className="p-3 sm:px-4 flex items-center justify-between gap-2 cursor-pointer hover:bg-amber-100/40 transition select-none"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-800 flex items-center justify-center shrink-0">
                    <Languages className="w-4 h-4 text-amber-700" />
                  </div>
                  <div className="truncate">
                    <div className="flex items-center gap-2">
                      <span className="text-xs sm:text-sm font-bold text-stone-900 truncate">
                        Tytuły w innych językach: <span className="text-amber-900">{multilingualMeta.detectedTitle || multilingualMeta.originalQuery}</span>
                      </span>
                      <span className="text-[10px] sm:text-[11px] font-medium text-amber-900/80 bg-amber-100/80 border border-amber-200/90 px-2 py-0.5 rounded-full shrink-0">
                        {Object.keys(multilingualMeta.titles || {}).length} wydań
                      </span>
                      {languageFilter !== 'all' && (
                        <span className="text-[10px] font-semibold text-white bg-amber-900 px-2 py-0.5 rounded-md shrink-0">
                          Filtr: {languageFilter}
                        </span>
                      )}
                    </div>
                    {multilingualMeta.canonicalAuthor && (
                      <p className="text-[11px] text-stone-500 truncate">
                        Autor: <strong className="text-stone-700">{multilingualMeta.canonicalAuthor}</strong>
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs text-amber-900 font-medium hidden sm:inline">
                    {isMultilingualExpanded ? 'Zwiń listę' : 'Rozwiń tytuły'}
                  </span>
                  <div
                    className="w-7 h-7 rounded-lg hover:bg-amber-200/60 flex items-center justify-center text-amber-800 transition"
                    title={isMultilingualExpanded ? 'Zwiń listę wydań' : 'Rozwiń listę wydań'}
                  >
                    {isMultilingualExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </div>
              </div>

              {/* Badges for each recognized official translation (Visible when expanded) */}
              {isMultilingualExpanded && (
                <div className="p-4 sm:p-5 pt-2 border-t border-amber-200/60 space-y-3 bg-white/50">
                  <p className="text-[11px] text-stone-600">
                    Książki za granicą rzadko wychodzą pod dosłownym tłumaczeniem. Kliknij poniższy język, aby przefiltrować wyniki pod oficjalnym tytułem wydawniczym:
                  </p>

                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {Object.entries({
                      pl: { flag: '🇵🇱', label: 'Polski' },
                      en: { flag: '🇬🇧', label: 'Angielski' },
                      de: { flag: '🇩🇪', label: 'Niemiecki' },
                      ru: { flag: '🇷🇺', label: 'Rosyjski' },
                      zh: { flag: '🇨🇳', label: 'Chiński' },
                      fr: { flag: '🇫🇷', label: 'Francuski' },
                      es: { flag: '🇪🇸', label: 'Hiszpański' },
                      it: { flag: '🇮🇹', label: 'Włoski' },
                      uk: { flag: '🇺🇦', label: 'Ukraiński' },
                    }).map(([code, meta]) => {
                      const titleInLang = (multilingualMeta.titles || {})[code];
                      if (!titleInLang) return null;
                      const isCurrentLang = languageFilter.toLowerCase() === code;

                      return (
                        <button
                          key={code}
                          type="button"
                          onClick={() => setLanguageFilter(isCurrentLang ? 'all' : code.toUpperCase())}
                          className={`text-xs px-2.5 py-1.5 rounded-xl border transition flex items-center gap-1.5 cursor-pointer ${
                            isCurrentLang
                              ? 'bg-amber-900 text-white border-amber-900 shadow-2xs font-semibold'
                              : 'bg-white hover:bg-amber-50/60 text-stone-800 border-amber-200/70'
                          }`}
                          title={`Kliknij, aby przefiltrować wyniki do języka: ${meta.label} (${titleInLang})`}
                        >
                          <span className="text-sm">{meta.flag}</span>
                          <span className="font-medium text-stone-600 text-[11px]">{meta.label}:</span>
                          <span className="font-semibold text-stone-900 italic">"{titleInLang}"</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="text-[11px] text-stone-500 pt-1 flex items-center justify-between border-t border-amber-200/50">
                    <span>
                      💡 Odnaleziono oficjalne tytuły dzieła w międzynarodowych rejestrach.
                    </span>
                    {languageFilter !== 'all' && (
                      <button
                        type="button"
                        onClick={() => setLanguageFilter('all')}
                        className="text-[11px] font-semibold text-amber-800 hover:underline shrink-0 ml-2 cursor-pointer"
                      >
                        Pokaż wszystkie języki
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Search Results List */}
          {hasSearched && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-stone-600 px-1">
                <span>
                  Znalezione pozycje ({results.length})
                  {languageFilter !== 'all' && <span className="text-amber-800 ml-1.5">• Filtr języka: {languageFilter}</span>}
                </span>
                <span>Język oryginału → Przekład na Polski</span>
              </div>

              {results.length === 0 ? (
                <div className="text-center py-12 bg-white border border-stone-200 rounded-2xl p-6 text-stone-500 text-sm space-y-3">
                  <p>Nie znaleziono bezpośrednich plików dla zapytania: "{query}".</p>
                  <p className="text-xs text-stone-400">
                    Sprawdź tę książkę w bazie mirrorów (Anna's Archive, Z-Library, LibGen):
                  </p>
                  <div className="flex justify-center gap-2">
                    <a
                      href={`https://annas-archive.gl/search?q=${encodeURIComponent(query)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-lg flex items-center gap-1"
                    >
                      <span>Szukaj na Anna's Archive</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <a
                      href={`https://z-library.sk/s/${encodeURIComponent(query)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-lg flex items-center gap-1"
                    >
                      <span>Szukaj na Z-Library</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <a
                      href={`https://libgen.li/index.php?req=${encodeURIComponent(query)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-lg flex items-center gap-1"
                    >
                      <span>Szukaj na LibGen</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Filters Bar: Sources and Languages */}
                  <div className="bg-white border border-stone-200 rounded-2xl p-3.5 space-y-2.5 shadow-2xs">
                    {/* Sources Tabs */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-semibold text-stone-600 mr-1 flex items-center gap-1">
                        <span>Źródła:</span>
                      </span>
                      {[
                        { id: 'all', label: 'Wszystkie źródła', count: results.length },
                        {
                          id: 'trusted',
                          label: '⭐ Zaufane (Z-Lib & Wolne Lektury)',
                          count: results.filter((r) => {
                            const s = r.source.toLowerCase();
                            return s.includes('z-library') || s.includes('zlib') || s.includes('wolne');
                          }).length,
                        },
                        {
                          id: 'zlib',
                          label: '📖 Z-Library (Konto)',
                          count: results.filter((r) => r.source.toLowerCase().includes('z-library') || r.source.toLowerCase().includes('zlib')).length,
                        },
                        {
                          id: 'wolnelektury',
                          label: '🇵🇱 Wolne Lektury',
                          count: results.filter((r) => r.source.toLowerCase().includes('wolne')).length,
                        },
                        {
                          id: 'libgen',
                          label: '⚡ LibGen & Mirrory',
                          count: results.filter((r) => r.source.toLowerCase().includes('libgen') || r.source.toLowerCase().includes('shadow')).length,
                        },
                        {
                          id: 'archive',
                          label: '🏛️ Internet Archive',
                          count: results.filter((r) => r.source.toLowerCase().includes('archive')).length,
                        },
                        {
                          id: 'gutenberg',
                          label: '📚 Gutenberg',
                          count: results.filter((r) => r.source.toLowerCase().includes('gutenberg')).length,
                        },
                        {
                          id: 'openlibrary',
                          label: '🌐 Open Library',
                          count: results.filter((r) => r.source.toLowerCase().includes('open library')).length,
                        },
                        {
                          id: 'chomikuj',
                          label: '🐹 Chomikuj.pl',
                          count: results.filter((r) => r.source.toLowerCase().includes('chomik')).length,
                        },
                      ]
                        .filter((tab) => tab.id === 'all' || tab.count > 0)
                        .map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setSourceFilter(tab.id as any)}
                            className={`text-xs px-2.5 py-1 rounded-lg border transition font-medium flex items-center gap-1.5 cursor-pointer ${
                              sourceFilter === tab.id
                                ? 'bg-stone-900 text-white border-stone-900 shadow-2xs'
                                : 'bg-white text-stone-600 hover:bg-stone-50 border-stone-200'
                            }`}
                          >
                            <span>{tab.label}</span>
                            <span
                              className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                                sourceFilter === tab.id ? 'bg-stone-700 text-stone-200' : 'bg-stone-100 text-stone-500'
                              }`}
                            >
                              {tab.count}
                            </span>
                          </button>
                        ))}
                    </div>

                    {/* Language Tabs */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-stone-100">
                      <span className="text-xs font-semibold text-stone-600 mr-1 flex items-center gap-1">
                        <span>Języki wydań:</span>
                      </span>
                      {[
                        { id: 'all', label: 'Wszystkie języki', flag: '🌐', count: results.length },
                        { id: 'PL', label: 'Polski', flag: '🇵🇱', count: results.filter((r) => r.language.toUpperCase() === 'PL').length },
                        { id: 'EN', label: 'Angielski', flag: '🇬🇧', count: results.filter((r) => r.language.toUpperCase() === 'EN').length },
                        { id: 'DE', label: 'Niemiecki', flag: '🇩🇪', count: results.filter((r) => r.language.toUpperCase() === 'DE').length },
                        { id: 'RU', label: 'Rosyjski', flag: '🇷🇺', count: results.filter((r) => r.language.toUpperCase() === 'RU').length },
                        { id: 'ZH', label: 'Chiński', flag: '🇨🇳', count: results.filter((r) => r.language.toUpperCase() === 'ZH').length },
                        { id: 'FR', label: 'Francuski', flag: '🇫🇷', count: results.filter((r) => r.language.toUpperCase() === 'FR').length },
                        { id: 'ES', label: 'Hiszpański', flag: '🇪🇸', count: results.filter((r) => r.language.toUpperCase() === 'ES').length },
                        { id: 'IT', label: 'Włoski', flag: '🇮🇹', count: results.filter((r) => r.language.toUpperCase() === 'IT').length },
                      ]
                        .filter((tab) => tab.id === 'all' || tab.count > 0)
                        .map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setLanguageFilter(tab.id)}
                            className={`text-xs px-2.5 py-1 rounded-lg border transition font-medium flex items-center gap-1.5 cursor-pointer ${
                              languageFilter === tab.id
                                ? 'bg-amber-800 text-white border-amber-800 shadow-2xs font-semibold'
                                : 'bg-white text-stone-600 hover:bg-stone-50 border-stone-200'
                            }`}
                          >
                            <span>{tab.flag}</span>
                            <span>{tab.label}</span>
                            <span
                              className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                                languageFilter === tab.id ? 'bg-amber-950 text-amber-100' : 'bg-stone-100 text-stone-500'
                              }`}
                            >
                              {tab.count}
                            </span>
                          </button>
                        ))}
                    </div>

                    {/* View Switcher bar */}
                    <div className="flex items-center justify-between pt-1 border-t border-stone-100">
                      <span className="text-[11px] text-stone-500 font-medium">
                        Układ wyników:
                      </span>
                      <div className="flex items-center gap-1 bg-stone-100 p-0.5 rounded-lg border border-stone-200">
                        <button
                          type="button"
                          onClick={() => handleSetSearchViewMode('shelf')}
                          className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                            searchViewMode === 'shelf'
                              ? 'bg-white text-stone-900 shadow-2xs font-bold'
                              : 'text-stone-500 hover:text-stone-900'
                          }`}
                          title="Wirtualna półka z okładkami książek (Biblioteka)"
                        >
                          <Library className="w-3.5 h-3.5 text-amber-600" />
                          <span>Półka biblioteczna</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetSearchViewMode('grid')}
                          className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                            searchViewMode === 'grid'
                              ? 'bg-white text-stone-900 shadow-2xs font-bold'
                              : 'text-stone-500 hover:text-stone-900'
                          }`}
                          title="Szczegółowe kafelki z mirrorami i rozmiarami"
                        >
                          <LayoutGrid className="w-3.5 h-3.5 text-stone-600" />
                          <span>Kafelki ze szczegółami</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetSearchViewMode('list')}
                          className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                            searchViewMode === 'list'
                              ? 'bg-white text-stone-900 shadow-2xs font-bold'
                              : 'text-stone-500 hover:text-stone-900'
                          }`}
                          title="Zwięzła, kompaktowa lista"
                        >
                          <LayoutList className="w-3.5 h-3.5 text-stone-600" />
                          <span>Kompaktowa lista</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div
                    className={
                      searchViewMode === 'shelf'
                        ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5 sm:gap-4'
                        : searchViewMode === 'grid'
                        ? 'grid grid-cols-1 md:grid-cols-2 gap-4'
                        : 'space-y-2.5'
                    }
                  >
                    {results
                      .filter((item) => {
                        if (sourceFilter !== 'all') {
                          const s = item.source.toLowerCase();
                          if (sourceFilter === 'trusted' && !(s.includes('z-library') || s.includes('zlib') || s.includes('wolne'))) return false;
                          if (sourceFilter === 'chomikuj' && !s.includes('chomik')) return false;
                          if (sourceFilter === 'zlib' && !(s.includes('z-library') || s.includes('zlib'))) return false;
                          if (sourceFilter === 'libgen' && !(s.includes('libgen') || s.includes('shadow'))) return false;
                          if (sourceFilter === 'archive' && !s.includes('archive')) return false;
                          if (sourceFilter === 'wolnelektury' && !s.includes('wolne')) return false;
                          if (sourceFilter === 'gutenberg' && !s.includes('gutenberg')) return false;
                          if (sourceFilter === 'openlibrary' && !s.includes('open library')) return false;
                        }
                        // Discard any Chomikuj file over 50 MB (exceeds free download transfer)
                        if (item.source.toLowerCase().includes('chomik')) {
                          const m = (item.size || '').match(/([\d.,]+)\s*(MB|GB)/i);
                          if (m) {
                            const val = parseFloat(m[1].replace(',', '.'));
                            if (m[2].toUpperCase() === 'GB' || (m[2].toUpperCase() === 'MB' && val > 50)) {
                              return false;
                            }
                          }
                        }
                        if (languageFilter !== 'all') {
                          if (item.language.toUpperCase() !== languageFilter.toUpperCase()) return false;
                        }
                        return true;
                      })
                      .map((rawItem) => {
                        const activeSourceId = selectedSourceIdMap[rawItem.id] || rawItem.id;
                        const activeSource = (rawItem.availableSources || []).find((s) => s.id === activeSourceId);
                        const item: BookSearchResult = activeSource
                          ? {
                              ...rawItem,
                              id: activeSource.id,
                              title: activeSource.title || rawItem.title,
                              author: activeSource.author || rawItem.author,
                              source: activeSource.source,
                              format: activeSource.format,
                              downloadUrl: activeSource.downloadUrl,
                              size: activeSource.size || rawItem.size,
                              isLendingDRM: activeSource.isLendingDRM,
                              rating: activeSource.rating ?? rawItem.rating,
                              downloadsCount: activeSource.downloadsCount ?? rawItem.downloadsCount,
                              qualityBadge: activeSource.qualityBadge ?? rawItem.qualityBadge,
                            }
                          : rawItem;

                        const sLower = item.source.toLowerCase();
                        const sourceBadgeClass = sLower.includes('chomik')
                          ? 'bg-amber-50 text-amber-900 border-amber-300'
                          : sLower.includes('z-library') || sLower.includes('zlib')
                          ? 'bg-teal-50 text-teal-800 border-teal-200'
                          : sLower.includes('libgen') || sLower.includes('shadow')
                          ? 'bg-purple-50 text-purple-800 border-purple-200'
                          : sLower.includes('archive')
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : sLower.includes('wolne')
                          ? 'bg-rose-50 text-rose-800 border-rose-200'
                          : sLower.includes('gutenberg')
                          ? 'bg-blue-50 text-blue-800 border-blue-200'
                          : 'bg-stone-50 text-stone-700 border-stone-200';

                        const sourceIcon = sLower.includes('chomik')
                          ? '🐹'
                          : sLower.includes('z-library') || sLower.includes('zlib')
                          ? '📖'
                          : sLower.includes('libgen') || sLower.includes('shadow')
                          ? '⚡'
                          : sLower.includes('archive')
                          ? '🏛️'
                          : sLower.includes('wolne')
                          ? '🇵🇱'
                          : sLower.includes('gutenberg')
                          ? '📚'
                          : '🌐';

                        const isPl = (item.language || '').toLowerCase().includes('pl');
                        const isPdf = (item.format || '').toLowerCase().includes('pdf');
                        const isEpub = (item.format || '').toLowerCase().includes('epub');

                        if (searchViewMode === 'shelf') {
                          const sInfo = detectBookSeriesClient(item.title);
                          // Determine palette based on title hash for books without covers
                          const colorPalettes = [
                            'from-amber-900 via-amber-800 to-amber-950 text-amber-50',
                            'from-emerald-900 via-emerald-800 to-emerald-950 text-emerald-50',
                            'from-indigo-900 via-indigo-800 to-indigo-950 text-indigo-50',
                            'from-rose-900 via-rose-800 to-rose-950 text-rose-50',
                            'from-slate-900 via-slate-800 to-slate-950 text-slate-50',
                            'from-stone-800 via-stone-700 to-stone-900 text-stone-50',
                          ];
                          const hash = item.title.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
                          const palette = colorPalettes[hash % colorPalettes.length];

                          return (
                            <div
                              key={rawItem.id}
                              className="group relative bg-white border border-stone-200/90 rounded-2xl p-2.5 sm:p-3 flex flex-col justify-between hover:border-amber-400 hover:shadow-md transition-all duration-200 shadow-2xs"
                            >
                              <div className="space-y-2">
                                {/* 3D Book Cover / Spine simulation */}
                                <div className="relative aspect-[2/3] w-full rounded-xl overflow-hidden shadow-sm group-hover:shadow-md transition-all border border-stone-200/80 bg-stone-100 flex flex-col">
                                  {item.coverUrl ? (
                                    <>
                                      <img
                                        src={item.coverUrl}
                                        alt={item.title}
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                          (e.target as HTMLElement).style.display = 'none';
                                        }}
                                      />
                                      {/* Book spine highlight gradient overlay */}
                                      <div className="absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-black/40 via-black/10 to-transparent pointer-events-none" />
                                      <div className="absolute inset-y-0 left-2.5 w-0.5 bg-white/20 pointer-events-none" />
                                    </>
                                  ) : (
                                    <div className={`w-full h-full bg-gradient-to-br ${palette} p-3 flex flex-col justify-between relative select-none`}>
                                      {/* Spine shadow simulation */}
                                      <div className="absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-black/50 via-black/20 to-transparent pointer-events-none" />
                                      <div className="absolute inset-y-0 left-2.5 w-0.5 bg-white/10 pointer-events-none" />

                                      {/* Ribbon bookmark decoration */}
                                      <div className="absolute top-0 right-3 w-3 h-6 bg-amber-400/90 rounded-b-sm shadow-xs" />

                                      <div className="relative z-10 space-y-1 pt-1 pl-1.5">
                                        <span className="text-[9px] uppercase tracking-wider font-semibold opacity-75 block truncate">
                                          {item.author || 'Nieznany autor'}
                                        </span>
                                        <h4 className="text-xs sm:text-sm font-bold font-serif leading-snug line-clamp-4">
                                          {item.title}
                                        </h4>
                                      </div>

                                      <div className="relative z-10 pl-1.5 pt-2 flex items-center justify-between opacity-80 text-[10px]">
                                        <span className="font-mono font-bold uppercase">{item.format}</span>
                                        <span>{isPl ? '🇵🇱' : '🌐'}</span>
                                      </div>
                                    </div>
                                  )}

                                  {/* Floating badges on top of cover */}
                                  <div className="absolute top-1.5 left-1.5 right-1.5 flex items-center justify-between gap-1 pointer-events-none">
                                    <span
                                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded shadow-2xs backdrop-blur-xs flex items-center gap-0.5 ${
                                        isPl
                                          ? 'bg-emerald-950/80 text-emerald-200 border border-emerald-500/30'
                                          : 'bg-stone-900/80 text-amber-200 border border-amber-500/30'
                                      }`}
                                    >
                                      <span>{isPl ? '🇵🇱' : '🌐'}</span>
                                      <span>{item.language.toUpperCase()}</span>
                                    </span>

                                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded shadow-2xs bg-stone-900/80 text-stone-100 border border-white/20 backdrop-blur-xs">
                                      {item.format}
                                    </span>
                                  </div>

                                  {/* Source badge at bottom of cover */}
                                  <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between pointer-events-none">
                                    <span className="text-[9px] font-medium px-1.5 py-0.5 rounded shadow-2xs bg-black/70 text-white backdrop-blur-xs truncate max-w-[85%] flex items-center gap-1">
                                      <span>{sourceIcon}</span>
                                      <span className="truncate">{item.source.split('(')[0].trim()}</span>
                                    </span>
                                    {item.size && (
                                      <span className="text-[8px] font-mono px-1 py-0.5 rounded bg-black/60 text-stone-200 backdrop-blur-xs">
                                        {item.size}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Title & Author under cover */}
                                <div className="space-y-0.5 px-0.5">
                                  <h4 className="font-semibold text-stone-900 text-xs sm:text-sm line-clamp-2 leading-snug" title={item.title}>
                                    {item.title}
                                  </h4>
                                  <p className="text-[11px] text-stone-500 truncate" title={item.author}>
                                    {item.author || 'Autor nieznany'}
                                  </p>
                                  {sInfo && (
                                    <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-purple-700 bg-purple-50 px-1 py-0.2 rounded border border-purple-200 truncate max-w-full">
                                      📚 {sInfo.name} T.{sInfo.tome}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Shelf Action Buttons */}
                              <div className="mt-2.5 pt-2 border-t border-stone-100 space-y-1">
                                {isPl ? (
                                  <button
                                    type="button"
                                    onClick={() => handleOrder(item, 'original')}
                                    disabled={!item.downloadUrl || orderingId === `${item.id}_original`}
                                    className={`w-full py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95 ${
                                      !item.downloadUrl
                                        ? 'bg-stone-100 text-stone-400 cursor-not-allowed'
                                        : 'bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs cursor-pointer'
                                    }`}
                                  >
                                    {orderingId === `${item.id}_original` ? (
                                      <div className="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                                    ) : (
                                      <Download className="w-3.5 h-3.5" />
                                    )}
                                    <span>Pobierz</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleOrder(item, 'translate')}
                                    disabled={!item.downloadUrl || orderingId === `${item.id}_translate`}
                                    className={`w-full py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95 ${
                                      !item.downloadUrl
                                        ? 'bg-stone-100 text-stone-400 cursor-not-allowed'
                                        : 'bg-stone-900 hover:bg-stone-800 text-white shadow-xs cursor-pointer'
                                    }`}
                                  >
                                    {orderingId === `${item.id}_translate` ? (
                                      <div className="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                                    ) : (
                                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                                    )}
                                    <span>Tłumacz PL</span>
                                  </button>
                                )}

                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenBookSummary(item)}
                                    className="flex-1 py-1 rounded-md text-[10px] font-semibold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 transition flex items-center justify-center gap-1 cursor-pointer"
                                    title="Streszczenie i motywy AI"
                                  >
                                    <BookOpen className="w-3 h-3 text-amber-700" />
                                    <span>Streszczenie</span>
                                  </button>

                                  {isPdf && (
                                    <button
                                      type="button"
                                      onClick={() => handleOrder(item, 'epub_clean')}
                                      disabled={!item.downloadUrl || orderingId === `${item.id}_epub_clean`}
                                      className="py-1 px-1.5 rounded-md text-[10px] font-semibold bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 transition flex items-center justify-center gap-0.5 cursor-pointer"
                                      title="Konwertuj PDF na czytnikowy EPUB"
                                    >
                                      <span>EPUB</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        }

                        if (searchViewMode === 'list') {
                          return (
                            <div
                              key={rawItem.id}
                              className="bg-white border border-stone-200 rounded-xl p-3 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:border-stone-300 hover:shadow-2xs transition"
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                {item.coverUrl ? (
                                  <img
                                    src={item.coverUrl}
                                    alt={item.title}
                                    className="w-11 h-16 object-cover rounded-md border border-stone-200 shrink-0 shadow-2xs bg-stone-100"
                                    onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                  />
                                ) : (
                                  <div className="w-11 h-16 rounded-md border border-stone-200 shrink-0 shadow-2xs bg-stone-50 flex items-center justify-center text-lg text-stone-400">
                                    <span>{item.format === 'PDF' ? '📄' : item.format === 'CBZ' ? '🎨' : '📖'}</span>
                                  </div>
                                )}
                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h3 className="font-semibold text-stone-900 text-xs sm:text-sm truncate" title={item.title}>
                                      {item.title}
                                    </h3>
                                    {(() => {
                                      const sInfo = detectBookSeriesClient(item.title);
                                      if (!sInfo) return null;
                                      return (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-200 text-[10px] font-semibold">
                                          <span>📚</span> {sInfo.name} (T.{sInfo.tome})
                                        </span>
                                      );
                                    })()}
                                  </div>
                                  <div className="flex items-center gap-1.5 text-xs text-stone-600 flex-wrap">
                                    <span className="font-medium text-stone-700">Autor: {item.author}</span>
                                    <span>•</span>
                                    <span className="font-bold text-[10px] px-1.5 py-0.5 rounded border bg-stone-100 text-stone-800">
                                      {item.language.toUpperCase() === 'PL' ? '🇵🇱 PL' : item.language.toUpperCase()}
                                    </span>
                                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border bg-stone-50 text-stone-700">
                                      {item.format} {item.size ? `(${item.size})` : ''}
                                    </span>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded border flex items-center gap-0.5 ${sourceBadgeClass}`}>
                                      <span>{sourceIcon}</span>
                                      <span>{item.source}</span>
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                                {isPl ? (
                                  <button
                                    type="button"
                                    onClick={() => handleOrder(item, 'original')}
                                    disabled={!item.downloadUrl || orderingId === `${item.id}_original`}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 ${
                                      !item.downloadUrl
                                        ? 'bg-stone-100 text-stone-400 cursor-not-allowed'
                                        : 'bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs cursor-pointer'
                                    }`}
                                  >
                                    {orderingId === `${item.id}_original` ? (
                                      <div className="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                                    ) : (
                                      <Download className="w-3.5 h-3.5" />
                                    )}
                                    <span>{isEpub ? 'Pobierz EPUB' : 'Pobierz'}</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleOrder(item, 'translate')}
                                    disabled={!item.downloadUrl || orderingId === `${item.id}_translate`}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 ${
                                      !item.downloadUrl
                                        ? 'bg-stone-100 text-stone-400 cursor-not-allowed'
                                        : 'bg-stone-900 hover:bg-stone-800 text-white shadow-xs cursor-pointer'
                                    }`}
                                  >
                                    {orderingId === `${item.id}_translate` ? (
                                      <div className="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                                    ) : (
                                      <Languages className="w-3.5 h-3.5" />
                                    )}
                                    <span>Tłumacz na PL</span>
                                  </button>
                                )}

                                {isPdf && (
                                  <button
                                    type="button"
                                    onClick={() => handleOrder(item, 'epub_clean')}
                                    disabled={!item.downloadUrl || orderingId === `${item.id}_epub_clean`}
                                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-sky-50 text-sky-900 hover:bg-sky-100 border border-sky-200 flex items-center gap-1 transition cursor-pointer"
                                    title="Konwertuje PDF na lekki czytnikowy EPUB"
                                  >
                                    <BookOpen className="w-3.5 h-3.5 text-sky-700" />
                                    <span className="hidden sm:inline">Lekki EPUB</span>
                                  </button>
                                )}

                                {rawItem.availableSources && rawItem.availableSources.length > 1 && (
                                  <select
                                    value={activeSourceId}
                                    onChange={(e) => setSelectedSourceIdMap(prev => ({ ...prev, [rawItem.id]: e.target.value }))}
                                    className="text-[11px] px-2 py-1 rounded-md border border-stone-200 bg-stone-50 text-stone-700"
                                    title="Wybierz inne źródło"
                                  >
                                    {rawItem.availableSources.map(s => (
                                      <option key={s.id} value={s.id}>
                                        {s.source} ({s.format})
                                      </option>
                                    ))}
                                  </select>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleOpenBookSummary(item)}
                                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1 transition cursor-pointer shadow-2xs"
                                  title="Wyświetl streszczenie fabuły, motywy i metadane AI"
                                >
                                  <BookOpen className="w-3.5 h-3.5 text-amber-700" />
                                  <span>Streszczenie</span>
                                </button>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={rawItem.id}
                            className="bg-white border border-stone-200 rounded-2xl p-5 flex flex-col justify-between hover:border-stone-300 transition shadow-2xs"
                          >
                            <div className="space-y-2.5">
                              {/* Top Banner: Prominent Format & Language */}
                              <div className="flex items-center justify-between gap-2 pb-1 border-b border-stone-100">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className={`text-xs font-bold px-2.5 py-0.5 rounded-md border flex items-center gap-1 shadow-2xs ${
                                    item.language.toUpperCase() === 'PL'
                                      ? 'bg-rose-100 text-rose-950 border-rose-300'
                                      : item.language.toUpperCase() === 'EN'
                                      ? 'bg-sky-100 text-sky-950 border-sky-300'
                                      : item.language.toUpperCase() === 'DE'
                                      ? 'bg-amber-100 text-amber-950 border-amber-300'
                                      : 'bg-stone-100 text-stone-900 border-stone-300'
                                  }`}>
                                    <span>
                                      {item.language.toUpperCase() === 'PL'
                                        ? '🇵🇱'
                                        : item.language.toUpperCase() === 'EN'
                                        ? '🇬🇧'
                                        : item.language.toUpperCase() === 'DE'
                                        ? '🇩🇪'
                                        : item.language.toUpperCase() === 'RU'
                                        ? '🇷🇺'
                                        : item.language.toUpperCase() === 'FR'
                                        ? '🇫🇷'
                                        : '🌐'}
                                    </span>
                                    <span>JĘZYK: {item.language.toUpperCase()}</span>
                                  </span>

                                  <span className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded-md border shadow-2xs ${
                                    item.format === 'EPUB'
                                      ? 'bg-emerald-100 text-emerald-950 border-emerald-300'
                                      : item.format === 'PDF'
                                      ? 'bg-stone-200 text-stone-900 border-stone-400'
                                      : item.format === 'CBZ' || item.format === 'CBR'
                                      ? 'bg-indigo-100 text-indigo-950 border-indigo-300'
                                      : item.format === 'MOBI' || item.format === 'AZW3'
                                      ? 'bg-teal-100 text-teal-950 border-teal-300'
                                      : 'bg-stone-100 text-stone-800 border-stone-300'
                                  }`}>
                                    FORMAT: {item.format}
                                  </span>
                                </div>

                                {item.size && (
                                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-stone-50 text-stone-600 border border-stone-200 shrink-0">
                                    {item.size}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-start justify-between gap-3 pt-1">
                                <div className="flex items-start gap-3 flex-1 min-w-0">
                                  {item.coverUrl ? (
                                    <img
                                      src={item.coverUrl}
                                      alt={item.title}
                                      className={searchViewMode === 'grid'
                                        ? "w-16 h-24 object-cover rounded-lg border border-stone-200 shrink-0 shadow-xs bg-stone-100"
                                        : "w-11 h-16 object-cover rounded-md border border-stone-200 shrink-0 shadow-2xs bg-stone-100"
                                      }
                                      onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                    />
                                  ) : (
                                    <div className={searchViewMode === 'grid'
                                      ? "w-16 h-24 rounded-lg border border-stone-200 shrink-0 shadow-xs bg-stone-50 flex flex-col items-center justify-center text-xl text-stone-400"
                                      : "w-11 h-16 rounded-md border border-stone-200 shrink-0 shadow-2xs bg-stone-50 flex items-center justify-center text-base text-stone-400"
                                    }>
                                      <span>{item.format === 'PDF' ? '📄' : item.format === 'CBZ' ? '🎨' : '📖'}</span>
                                      {searchViewMode === 'grid' && <span className="text-[9px] font-mono font-bold text-stone-500 mt-1">{item.format}</span>}
                                    </div>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <h3 className="font-semibold text-stone-900 text-sm leading-snug">
                                      {item.title}
                                    </h3>
                                    <div className="text-xs text-stone-600 font-medium mt-0.5">
                                      Autor: {item.author}
                                    </div>
                                    {(() => {
                                      const sInfo = detectBookSeriesClient(item.title);
                                      if (!sInfo) return null;
                                      return (
                                        <div className="mt-1 flex items-center gap-1.5">
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 text-purple-800 border border-purple-200 text-[10px] font-semibold shadow-2xs">
                                            <span>📚</span> Cykl: <strong>{sInfo.name}</strong> (Tom {sInfo.tome}{sInfo.total ? ` z ${sInfo.total}` : ''})
                                          </span>
                                        </div>
                                      );
                                    })()}
                                  </div>
                                </div>
                              </div>

                              {item.description && (
                                <p className="text-xs text-stone-500 line-clamp-2">
                                  {item.description}
                                </p>
                              )}

                              {/* Format & Content Type Badges */}
                              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                {(() => {
                                  const textSample = `${item.title} ${item.description || ''} ${item.source}`.toLowerCase();
                                  const isComic = item.format === 'CBZ' || item.format === 'CBR' || /\b(komiks|comic|manga|cbr|cbz|graficzn|zeszyt|tomik)\b/i.test(textSample);
                                  const isZipPack = item.format === 'ZIP' || item.format === 'RAR' || /\b(paczka|archive|wielopak|kolekcja|luzem|zbiór|pakiet|epub\+mobi)\b/i.test(textSample);
                                  const isTextEpub = (item.format === 'EPUB' || item.format === 'MOBI' || item.format === 'AZW3' || item.format === 'FB2') && !isComic;
                                  const isPdfDoc = item.format === 'PDF' && !isComic;

                                  if (isComic) {
                                    return (
                                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-900 border border-indigo-200 flex items-center gap-1 shadow-2xs">
                                        <span>🎨</span>
                                        <span>Komiks / Manga (CBZ)</span>
                                      </span>
                                    );
                                  }
                                  if (isZipPack) {
                                    return (
                                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-300 flex items-center gap-1 shadow-2xs">
                                        <span>📦</span>
                                        <span>Paczka wydań (ZIP)</span>
                                      </span>
                                    );
                                  }
                                  if (item.format === 'EPUB') {
                                    return (
                                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-900 border border-emerald-300 flex items-center gap-1 shadow-2xs">
                                        <span>📖</span>
                                        <span>E-book tekstowy (EPUB)</span>
                                      </span>
                                    );
                                  }
                                  if (item.format === 'MOBI' || item.format === 'AZW3') {
                                    return (
                                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-teal-50 text-teal-900 border border-teal-300 flex items-center gap-1 shadow-2xs">
                                        <span>📱</span>
                                        <span>Format Kindle ({item.format})</span>
                                      </span>
                                    );
                                  }
                                  if (isPdfDoc) {
                                    return (
                                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-stone-100 text-stone-800 border border-stone-300 flex items-center gap-1 shadow-2xs">
                                        <span>📄</span>
                                        <span>Dokument PDF (stały układ)</span>
                                      </span>
                                    );
                                  }
                                  return (
                                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 border border-stone-200 flex items-center gap-1 shadow-2xs">
                                      <span>📑</span>
                                      <span>Format {item.format || 'Tekst'}</span>
                                    </span>
                                  );
                                })()}

                                {item.qualityBadge && (
                                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-300 flex items-center gap-1 shadow-2xs">
                                    <Sparkles className="w-3 h-3 text-amber-600 shrink-0" />
                                    <span>{item.qualityBadge}</span>
                                  </span>
                                )}

                                {item.rating !== undefined && (
                                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-stone-50 text-stone-800 border border-stone-200 flex items-center gap-1" title="Ocena wiarygodności i jakości wydania">
                                    <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
                                    <span>{item.rating.toFixed(1)}/5.0</span>
                                  </span>
                                )}

                                {item.downloadsCount !== undefined && (
                                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-stone-50 text-stone-600 border border-stone-200 flex items-center gap-1" title="Liczba pobrań / popularność">
                                    <Download className="w-3 h-3 text-stone-400 shrink-0" />
                                    <span>{item.downloadsCount > 999 ? `${(item.downloadsCount / 1000).toFixed(1)}k` : item.downloadsCount} pobrań</span>
                                  </span>
                                )}

                                <span
                                  className={`text-[11px] font-medium px-2 py-0.5 rounded-md border flex items-center gap-1 ${sourceBadgeClass}`}
                                >
                                  <span>{sourceIcon}</span>
                                  <span>{item.source}</span>
                                </span>
                                <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 border border-stone-200">
                                  {item.format}
                                </span>
                                {item.size && (
                                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-stone-50 text-stone-600 border border-stone-200">
                                    {item.size}
                                  </span>
                                )}
                                {item.isLendingDRM && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 font-medium">
                                    🔒 Wypożyczenie DRM
                                  </span>
                                )}

                                {item.source.toLowerCase().includes('chomik') && (
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {item.verifiedStatus === 'verified' ? (
                                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                                        <ShieldCheck className="w-3 h-3 text-emerald-600 shrink-0" />
                                        <span>Zweryfikowany (≤ 50 MB, darmowy transfer)</span>
                                      </span>
                                    ) : item.verifiedStatus === 'suspicious' ? (
                                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-300 flex items-center gap-1">
                                        <ShieldAlert className="w-3 h-3 text-amber-600 shrink-0" />
                                        <span>Mały plik • Sprawdź wiarygodność</span>
                                      </span>
                                    ) : null}

                                    <button
                                      type="button"
                                      onClick={() => handleVerifyChomikujFile(item)}
                                      disabled={verifyingFileId === item.id}
                                      className="text-[10px] font-medium text-stone-600 hover:text-stone-900 hover:underline flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-stone-100 transition cursor-pointer"
                                      title="Weryfikuj przed pobraniem: sprawdź czy plik na Chomikuj zawiera treść książki czy tylko linki reklamowe"
                                    >
                                      {verifyingFileId === item.id ? (
                                        <span className="inline-block w-2.5 h-2.5 border-2 border-stone-400 border-t-stone-800 rounded-full animate-spin" />
                                      ) : (
                                        <ShieldCheck className="w-3 h-3 text-stone-500" />
                                      )}
                                      <span>{verificationResults[item.id] ? 'Sprawdź ponownie' : 'Sprawdź treść'}</span>
                                    </button>
                                  </div>
                                )}
                              </div>

                              {/* Live Chomikuj Verification Results Card */}
                              {verificationResults[item.id] && (
                                <div
                                  className={`mt-2 p-2.5 rounded-xl border text-xs space-y-1 transition-all ${
                                    verificationResults[item.id].verdict === 'verified'
                                      ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                                      : verificationResults[item.id].verdict === 'rejected'
                                      ? 'bg-rose-50 border-rose-200 text-rose-950'
                                      : 'bg-amber-50 border-amber-200 text-amber-950'
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5 font-bold">
                                    {verificationResults[item.id].verdict === 'verified' ? (
                                      <>
                                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                        <span>✓ Zweryfikowano: pełna treść książki ({verificationResults[item.id].confidenceScore}% pewności)</span>
                                      </>
                                    ) : verificationResults[item.id].verdict === 'rejected' ? (
                                      <>
                                        <ShieldAlert className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                        <span>❌ Odrzucono: plik reklamowy lub brak treści</span>
                                      </>
                                    ) : (
                                      <>
                                        <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                        <span>⚠️ Wymaga ostrożności (mały rozmiar)</span>
                                      </>
                                    )}
                                  </div>
                                  <p className="text-[11px] leading-relaxed opacity-90">
                                    {verificationResults[item.id].reason}
                                  </p>
                                  {verificationResults[item.id].details && verificationResults[item.id].details.length > 0 && (
                                    <ul className="text-[10px] opacity-80 list-disc list-inside space-y-0.5 pt-0.5">
                                      {verificationResults[item.id].details.map((d: string, dIdx: number) => (
                                        <li key={dIdx}>{d}</li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              )}

                              {/* Multi-source selector if found across multiple repositories */}
                              {rawItem.availableSources && rawItem.availableSources.length > 1 && (
                                <div className="mt-2 p-2 bg-stone-50 border border-stone-200 rounded-xl space-y-1.5">
                                  <div className="text-[10px] font-bold text-stone-700 flex items-center justify-between">
                                    <span>Znaleziono w {rawItem.availableSources.length} źródłach (wybierz źródło):</span>
                                    <span className="text-[9px] text-stone-400 font-normal">Kliknij, aby przełączyć</span>
                                  </div>
                                  <div className="flex flex-wrap gap-1">
                                    {rawItem.availableSources.map((src) => {
                                      const isSelected = (selectedSourceIdMap[rawItem.id] || rawItem.id) === src.id;
                                      const srcIcon = src.source.toLowerCase().includes('libgen') || src.source.toLowerCase().includes('shadow')
                                        ? '⚡'
                                        : src.source.toLowerCase().includes('archive')
                                        ? '🏛️'
                                        : src.source.toLowerCase().includes('wolne')
                                        ? '🇵🇱'
                                        : src.source.toLowerCase().includes('gutenberg')
                                        ? '📚'
                                        : '🌐';

                                      return (
                                        <button
                                          key={src.id}
                                          type="button"
                                          onClick={() => setSelectedSourceIdMap((prev) => ({ ...prev, [rawItem.id]: src.id }))}
                                          className={`text-[10px] px-2 py-1 rounded-lg border font-medium flex items-center gap-1 transition cursor-pointer ${
                                            isSelected
                                              ? 'bg-stone-900 text-white border-stone-900 shadow-2xs font-semibold'
                                              : 'bg-white hover:bg-stone-100 text-stone-700 border-stone-200'
                                          }`}
                                          title={`Pobierz ze źródła: ${src.source} (${src.format}${src.size ? `, ${src.size}` : ''})`}
                                        >
                                          <span>{srcIcon}</span>
                                          <span>{src.source.split('(')[0].trim()}</span>
                                          <span className="opacity-80 text-[9px]">[{src.format}]</span>
                                          {src.size && <span className="opacity-70 text-[9px]">{src.size}</span>}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Mirror deep links */}
                              {item.mirrorLinks && item.mirrorLinks.length > 0 && (
                                <div className="pt-2 flex flex-wrap gap-1">
                                  <span className="text-[10px] text-stone-400 block w-full">
                                    Szukaj alternatywnych wydań w mirrorach:
                                  </span>
                                  {item.mirrorLinks.slice(0, 3).map((ml, idx) => (
                                    <a
                                      key={idx}
                                      href={ml.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-[10px] px-1.5 py-0.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded flex items-center gap-1"
                                    >
                                      <span>{ml.name}</span>
                                      <ExternalLink className="w-2.5 h-2.5 text-stone-400" />
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Smart Recommendation & Action buttons */}
                            {(() => {
                              const isPl = (item.language || '').toLowerCase().includes('pl');
                              const isPdf = (item.format || '').toLowerCase().includes('pdf');
                              const isEpub = (item.format || '').toLowerCase().includes('epub');

                              let suggestion = '⭐ Sugestia: Przetłumacz na polski lub Pobierz oryginał';
                              let bestMode: 'original' | 'translate' | 'epub_clean' = 'translate';

                              if (isPl && isEpub) {
                                suggestion = '⭐ Sugestia: Pobierz oryginał (książka jest już po polsku w EPUB – bez zbędnego przetwarzania)';
                                bestMode = 'original';
                              } else if (isPl && isPdf) {
                                suggestion = '⭐ Sugestia: Lekki EPUB (konwertuje PDF na czytelny format e-ink bez tłumaczenia)';
                                bestMode = 'epub_clean';
                              } else if (isPdf) {
                                suggestion = '⭐ Sugestia: Lekki EPUB (dla czytnika) lub Przetłumacz na polski';
                                bestMode = 'epub_clean';
                              } else if (isPl) {
                                suggestion = '⭐ Sugestia: Pobierz oryginał (język polski)';
                                bestMode = 'original';
                              }

                              return (
                                <div className="mt-3 pt-2.5 border-t border-stone-100 flex flex-wrap items-center justify-between gap-1.5">
                                  {/* Action Buttons */}
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {/* Option 1: Pobierz (jeśli PL lub bezpośredni) */}
                                    {isPl ? (
                                      <button
                                        type="button"
                                        onClick={() => handleOrder(item, 'original')}
                                        disabled={!item.downloadUrl || orderingId === `${item.id}_original`}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 ${
                                          !item.downloadUrl
                                            ? 'bg-stone-100 text-stone-400 cursor-not-allowed'
                                            : 'bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs cursor-pointer'
                                        }`}
                                        title="Pobierz plik ze źródła"
                                      >
                                        {orderingId === `${item.id}_original` ? (
                                          <div className="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                                        ) : (
                                          <Download className="w-3.5 h-3.5" />
                                        )}
                                        <span>{isEpub ? 'Pobierz EPUB' : 'Pobierz plik'}</span>
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleOrder(item, 'translate')}
                                        disabled={!item.downloadUrl || orderingId === `${item.id}_translate`}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 ${
                                          !item.downloadUrl
                                            ? 'bg-stone-100 text-stone-400 cursor-not-allowed'
                                            : 'bg-stone-900 hover:bg-stone-800 text-white shadow-xs cursor-pointer'
                                        }`}
                                        title="Literacki przekład AI na język polski"
                                      >
                                        {orderingId === `${item.id}_translate` ? (
                                          <div className="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                                        ) : (
                                          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                                        )}
                                        <span>Przetłumacz na PL</span>
                                      </button>
                                    )}

                                    {/* Option 2: Lekki EPUB z PDF */}
                                    {isPdf && (
                                      <button
                                        type="button"
                                        onClick={() => handleOrder(item, 'epub_clean')}
                                        disabled={!item.downloadUrl || orderingId === `${item.id}_epub_clean`}
                                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-sky-50 text-sky-900 hover:bg-sky-100 border border-sky-200 flex items-center gap-1 transition active:scale-95 cursor-pointer"
                                        title="Konwertuje PDF na lekki format czytnikowy EPUB"
                                      >
                                        {orderingId === `${item.id}_epub_clean` ? (
                                          <div className="w-3 h-3 border-2 border-sky-400 border-t-sky-800 rounded-full animate-spin" />
                                        ) : (
                                          <BookOpen className="w-3.5 h-3.5 text-sky-700" />
                                        )}
                                        <span>EPUB z PDF</span>
                                      </button>
                                    )}

                                    {/* Option 3: Pobierz oryginał jeśli język obcy */}
                                    {!isPl && (
                                      <button
                                        type="button"
                                        onClick={() => handleOrder(item, 'original')}
                                        disabled={!item.downloadUrl || orderingId === `${item.id}_original`}
                                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 flex items-center gap-1 transition active:scale-95 cursor-pointer"
                                        title="Pobierz plik w języku oryginalnym bez tłumaczenia"
                                      >
                                        <Download className="w-3 h-3 text-stone-500" />
                                        <span>Oryginał {item.language}</span>
                                      </button>
                                    )}

                                    {/* AI Book Summary & Metadata */}
                                    <button
                                      type="button"
                                      onClick={() => handleOpenBookSummary(item)}
                                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-300 cursor-pointer shadow-2xs"
                                      title="Pokaż streszczenie, motywy i metadane AI (OpenCode.ai / Premium)"
                                    >
                                      <BookOpen className="w-3.5 h-3.5 text-amber-700" />
                                      <span>Streszczenie i metadane</span>
                                    </button>

                                    {/* Duck.ai Free Assistant */}
                                    <a
                                      href={`https://duck.ai/?q=${encodeURIComponent(
                                        `Przeanalizuj książkę "${item.title}" (autor: ${item.author || 'nieznany'}). O czym jest ta książka, jakie są główne motywy i zarys fabuły? Odpowiedz po polsku.`
                                      )}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="px-2 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition active:scale-95 bg-orange-50/80 hover:bg-orange-100 text-orange-950 border border-orange-200"
                                      title="O czym jest ta książka? Otwórz szybką analizę"
                                    >
                                      <span>🧠</span>
                                      <span className="hidden sm:inline">O czym jest?</span>
                                      <ExternalLink className="w-2.5 h-2.5 text-orange-600" />
                                    </a>
                                  </div>

                                  <div className="text-[10px] text-stone-400">
                                    {item.downloadUrl ? '✅ Plik dostępny' : 'ℹ️ Tylko link'}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 3: SHADOW LIBRARIES & MIRRORS HUB (USER LIST)                       */}
      {/* ========================================================================= */}
      {subTab === 'mirrors' && (
        <div className="space-y-6">
          <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
                  <Globe className="w-5 h-5 text-sky-600" />
                  Katalog Mirrorów i Otwartych Bibliotek Cienia
                </h2>
                <p className="text-xs text-stone-500 mt-1">
                  Skonfigurowana baza mirrorów z Twojej listy: Anna’s Archive, Z-Library, LibGen, Sci-Hub, Liber3 oraz Memory of the World. Możesz wpisać zapytanie poniżej i otworzyć dowolny mirror z gotowymi wynikami!
                </p>
              </div>

              {/* Mirror Category Filter */}
              <div className="flex flex-wrap gap-1 p-1 bg-stone-100 rounded-xl">
                {[
                  { id: 'all', label: 'Wszystkie (21 baz)' },
                  { id: 'polish_docs', label: '🇵🇱 Docer, Doci & Chomikuj' },
                  { id: 'polish_free', label: '📚 Polona & Wolne Lektury' },
                  { id: 'polish_stores', label: '🛒 Woblink, Helion & Publio' },
                  { id: 'zlib', label: '📖 Z-Library & 1lib' },
                  { id: 'annas', label: "Anna's Archive" },
                  { id: 'libgen', label: 'LibGen' },
                  { id: 'global_free', label: '🌍 Gutenberg & OpenLibrary' },
                  { id: 'file_search', label: '🔍 4shared & PDF Drive' },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedMirrorCategory(cat.id)}
                    className={`px-2.5 py-1 text-xs rounded-lg transition ${
                      selectedMirrorCategory === cat.id
                        ? 'bg-white text-stone-900 font-semibold shadow-2xs'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick multi-search bar */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  type="text"
                  value={mirrorSearchQuery}
                  onChange={(e) => setMirrorSearchQuery(e.target.value)}
                  placeholder="Wpisz frazę, aby szybko otworzyć wyszukiwanie w mirrorach (np. George Orwell 1984)..."
                  className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-stone-800 bg-stone-50/50"
                />
              </div>
            </div>
          </div>

          {/* Mirrors Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredMirrors.map((m) => {
              const effectiveSearchUrl = mirrorSearchQuery.trim()
                ? m.searchUrlTemplate.replace('{query}', encodeURIComponent(mirrorSearchQuery.trim()))
                : `https://${m.domain}`;

              return (
                <div
                  key={m.id}
                  className="bg-white border border-stone-200 rounded-xl p-4 flex flex-col justify-between hover:border-stone-300 transition shadow-2xs"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-semibold text-stone-900 text-sm">{m.name}</h4>
                      {m.isPrimary && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded font-medium">
                          Główny
                        </span>
                      )}
                    </div>

                    <div className="text-xs font-mono text-stone-500">{m.domain}</div>

                    <p className="text-xs text-stone-600 line-clamp-2">{m.description}</p>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-stone-100 flex items-center justify-between">
                    <span className="text-[11px] text-stone-400 capitalize">{m.category}</span>

                    <a
                      href={effectiveSearchUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs px-2.5 py-1 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-lg flex items-center gap-1 transition"
                    >
                      <span>{mirrorSearchQuery.trim() ? 'Szukaj w mirrorze' : 'Otwórz stronę'}</span>
                      <ExternalLink className="w-3 h-3 text-stone-500" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Book Summary & Metadata Modal (OpenCode.ai & Premium) */}
      <BookSummaryModal
        isOpen={isSummaryModalOpen}
        onClose={() => setIsSummaryModalOpen(false)}
        book={selectedSummaryBook}
        activeModelTier={aiModelTier}
        onModelTierChange={handleSetAiModelTier}
        premiumProvider={premiumProvider}
        onPremiumProviderChange={handleSetPremiumProvider}
        onOrderBook={(mode) => {
          if (selectedSummaryBook) {
            handleOrder(
              {
                id: `summary_${Date.now()}`,
                title: selectedSummaryBook.title,
                author: selectedSummaryBook.author,
                downloadUrl: selectedSummaryBook.downloadUrl,
              },
              mode
            );
          }
        }}
        onSearchRepositories={(searchTitle) => {
          setQuery(searchTitle);
          setSubTab('search');
          handleSearch(searchTitle);
        }}
      />

      {/* Accounts & Storage Settings Modal */}
      <AccountsSettingsModal
        isOpen={isAccountsModalOpen}
        onClose={() => setIsAccountsModalOpen(false)}
      />
    </div>
  );
};
