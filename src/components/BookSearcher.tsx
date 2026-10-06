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
} from 'lucide-react';
import { BookSearchResult, BookRecommendation, ShadowLibraryMirror, Job, MultilingualBookMeta } from '../types';
import { AccountsSettingsModal } from './AccountsSettingsModal';

interface BookSearcherProps {
  onOrderCreated: (job: Job) => void;
}

export const BookSearcher: React.FC<BookSearcherProps> = ({ onOrderCreated }) => {
  // Subtab navigation (defaults to search for instant access)
  const [subTab, setSubTab] = useState<'advisor' | 'search' | 'mirrors'>('search');

  // Common settings
  const [selectedEngine, setSelectedEngine] = useState<'auto' | 'claude' | 'openai' | 'openrouter' | 'gemini'>('auto');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // 1. AI Advisor State
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

  // Handler: AI Advisor Recommendation
  const handleGetRecommendations = async (customPrompt?: string) => {
    const textToSearch = (customPrompt || advisorPrompt).trim();
    if (!textToSearch) return;

    setIsAdvising(true);
    setMessage(null);
    setAdvisorAnalysis(null);

    try {
      const resp = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: textToSearch,
          engine: selectedEngine,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Błąd doradcy' }));
        throw new Error(err.error || 'Nie udało się uzyskać rekomendacji od AI');
      }

      const data = await resp.json();
      setRecommendations(data.recommendations || []);
      setAdvisorAnalysis(data.analysis || null);
    } catch (err: any) {
      setMessage({ text: err.message || 'Wystąpił błąd podczas generowania propozycji', type: 'error' });
    } finally {
      setIsAdvising(false);
    }
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
          const matchWithDl = searchList.find((b) => !!b.downloadUrl);
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
      {/* Top Navigation & Subtabs */}
      <div className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* Subtab Buttons */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-stone-100 rounded-xl">
            <button
              onClick={() => setSubTab('search')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${
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
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${
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
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${
                subTab === 'mirrors'
                  ? 'bg-white text-stone-900 shadow-2xs font-semibold'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Globe className="w-3.5 h-3.5 text-sky-600" />
              <span>Bazy książek (21)</span>
            </button>
          </div>

          {/* Model selector */}
          <div className="shrink-0 flex items-center gap-2">
            <span className="text-xs text-stone-500 font-medium">Model:</span>
            <select
              value={selectedEngine}
              onChange={(e) => setSelectedEngine(e.target.value as any)}
              className="text-xs px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg border border-stone-200 bg-stone-50 text-stone-800 focus:outline-none"
            >
              <option value="auto">✨ Smart Auto</option>
              <option value="gemini">⚡ Gemini</option>
              <option value="openrouter">🌐 DeepSeek</option>
              <option value="claude">🏛️ Claude 3.5</option>
              <option value="openai">🤖 GPT-4o-mini</option>
            </select>
          </div>
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
      {subTab === 'advisor' && (
        <div className="space-y-6">
          <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-2xs">
            <div className="mb-4">
              <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" />
                Doradca Literacki AI — Odkryj książki według nastroju i motywów
              </h2>
              <p className="text-xs text-stone-500 mt-1">
                Nie pamiętasz tytułu albo masz ochotę na coś specyficznego? Opisz własnymi słowami klimat, bohaterów, tematykę lub emocje. AI wytypuje od 4 do 6 idealnie pasujących książek wraz z uzasadnieniem i bezpośrednimi linkami do pobrania.
              </p>
            </div>

            {/* Prompt textarea */}
            <div className="space-y-3">
              <div className="relative">
                <textarea
                  rows={3}
                  value={advisorPrompt}
                  onChange={(e) => setAdvisorPrompt(e.target.value)}
                  placeholder="Opisz czego szukasz... (np. 'Chcę przeczytać coś mrocznego, retro science-fiction z motywem samotności w kosmosie i obcej inteligencji, w powolnym tempie jak u Lema czy w Arrival')"
                  className="w-full p-3.5 text-sm rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-stone-800 bg-stone-50/50 resize-none"
                />
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <span className="text-[11px] text-stone-400">
                  Wskazówka: Możesz mieszać gatunki, podawać filmy jako referencje lub opisać po prostu swój dzisiejszy nastrój.
                </span>

                <div className="flex items-center gap-2">
                  <a
                    href={`https://duck.ai/?q=${encodeURIComponent(
                      advisorPrompt.trim()
                        ? `Poleć mi 5 wybitnych książek spełniających ten opis: "${advisorPrompt.trim()}". Podaj dla każdej autora, rok, polski tytuł i uzasadnienie wyboru.`
                        : 'Poleć mi 5 wybitnych, nastrojowych książek science-fiction lub literatury pięknej.'
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3.5 py-2.5 bg-orange-50/90 hover:bg-orange-100 text-orange-950 border border-orange-200 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5 shrink-0"
                    title="Otwórz darmowy czat Duck.ai (bez rejestracji, bez limitów)"
                  >
                    <span>🧠</span>
                    <span>Duck.ai</span>
                    <ExternalLink className="w-3 h-3 text-orange-600" />
                  </a>

                  <button
                    type="button"
                    onClick={() => handleGetRecommendations()}
                    disabled={isAdvising || !advisorPrompt.trim()}
                    className="px-5 py-2.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-semibold transition disabled:bg-stone-300 flex items-center justify-center gap-2 shrink-0 shadow-xs"
                  >
                    {isAdvising ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>AI dobiera książki...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-amber-300" />
                        <span>Znajdź propozycje dla mnie</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Inspiration Chips */}
              <div className="pt-3 border-t border-stone-100">
                <span className="text-[11px] text-stone-400 font-medium block mb-1.5">
                  Przykładowe inspiracje (kliknij, aby wypróbować):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {inspirationPrompts.map((insp, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setAdvisorPrompt(insp);
                        handleGetRecommendations(insp);
                      }}
                      className="text-[11px] px-2.5 py-1 rounded-lg bg-stone-100 text-stone-700 hover:bg-stone-200 transition text-left line-clamp-1 max-w-md"
                    >
                      {insp}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* AI Analysis Message */}
          {advisorAnalysis && (
            <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 flex items-start gap-3">
              <Lightbulb className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block mb-0.5">Analiza Twojego zapytania:</span>
                <p className="text-amber-800 leading-relaxed">{advisorAnalysis}</p>
              </div>
            </div>
          )}

          {/* Recommendations Grid */}
          {recommendations.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-stone-600 px-1">
                <span>Rekomendowane tytuły ({recommendations.length})</span>
                <span className="text-stone-400">Wyselekcjonowane przez silnik Claude / GPT</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {recommendations.map((rec) => (
                  <div
                    key={rec.id}
                    className="bg-white border border-stone-200 rounded-2xl p-5 flex flex-col justify-between hover:border-stone-300 transition shadow-2xs"
                  >
                    <div className="space-y-2.5">
                      {/* Title & Language Badge */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-stone-900 text-sm leading-snug">
                            {rec.polishTitle ? `${rec.polishTitle}` : rec.title}
                          </h3>
                          {rec.polishTitle && rec.polishTitle !== rec.title && (
                            <span className="text-xs text-stone-500 italic block">
                              (Tytuł oryginału: {rec.title})
                            </span>
                          )}
                        </div>
                        {rec.isPolishAvailable || (rec.originalLang || '').toUpperCase() === 'PL' ? (
                          <div className="shrink-0 flex flex-col items-end">
                            <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center gap-1.5 shadow-2xs">
                              <span>🇵🇱</span>
                              <span>JĘZYK POLSKI</span>
                            </span>
                            <span className="text-[10px] text-emerald-700 font-medium mt-0.5">
                              ✓ Gotowe do czytania
                            </span>
                          </div>
                        ) : (
                          <div className="shrink-0 flex flex-col items-end">
                            <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1.5 shadow-2xs">
                              <span>🌐</span>
                              <span>JĘZYK OBCY ({rec.originalLang || 'EN'})</span>
                            </span>
                            <span className="text-[10px] text-amber-800 font-medium mt-0.5">
                              ⚡ Zalecany przekład AI
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Author & Year & Genre */}
                      <div className="flex flex-wrap items-center gap-2 text-xs text-stone-600">
                        <span className="font-medium text-stone-900">Autor: {rec.author}</span>
                        {rec.year && <span>• Wydanie: {rec.year}</span>}
                        {rec.genre && (
                          <span className="px-2 py-0.5 bg-stone-100 rounded text-[11px] text-stone-600">
                            {rec.genre}
                          </span>
                        )}
                      </div>

                      {/* Guidance banner for user: Download vs Translate */}
                      <div className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                        rec.isPolishAvailable
                          ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                          : 'bg-indigo-50/70 border-indigo-200 text-indigo-900'
                      }`}>
                        <span className="font-medium">
                          {rec.isPolishAvailable
                            ? '💡 Książka dostępna po polsku: Wybierz zielony przycisk „Pobierz od razu”.'
                            : `💡 Książka w języku obcym (${rec.originalLang || 'angielskim'}): Wybierz fioletowy przycisk „Przetłumacz na polski”.`}
                        </span>
                      </div>

                      {/* Why it matches */}
                      <div className="p-3 bg-stone-50 rounded-xl border border-stone-200/60 text-xs text-stone-700">
                        <span className="font-semibold text-stone-900 block text-[11px] mb-1">
                          🎯 Dlaczego idealnie pasuje do Twojego opisu:
                        </span>
                        <p className="italic text-stone-600 leading-relaxed">{rec.matchReason}</p>
                      </div>

                      {/* Synopsis */}
                      {rec.synopsis && (
                        <p className="text-xs text-stone-500 leading-relaxed line-clamp-3">
                          {rec.synopsis}
                        </p>
                      )}

                      {/* Direct mirror deep links from user list */}
                      <div className="pt-1">
                        <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider block mb-1.5">
                          Sprawdź bezpośrednio w repozytoriach:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {rec.mirrorLinks?.map((ml, idx) => (
                            <a
                              key={idx}
                              href={ml.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] px-2 py-1 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-md transition flex items-center gap-1"
                            >
                              <span>{ml.name}</span>
                              <ExternalLink className="w-2.5 h-2.5 text-stone-400" />
                            </a>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Action Bar */}
                    <div className="mt-4 pt-3 border-t border-stone-100 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(rec.searchQuery || `${rec.author} ${rec.title}`);
                            setMessage({ text: `Skopiowano: "${rec.searchQuery}"`, type: 'success' });
                          }}
                          className="text-xs text-stone-500 hover:text-stone-800 flex items-center gap-1 cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>Kopiuj</span>
                        </button>
                        {rec.downloadUrl && (
                          <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            Plik gotowy w mirrorze
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {/* 1. Primary Action: Download directly (if Polish) OR Translate (if foreign) */}
                        {rec.isPolishAvailable ? (
                          <button
                            type="button"
                            onClick={() => handleOrder(rec, 'original')}
                            disabled={orderingId === `${rec.id}_original`}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-700 hover:bg-emerald-800 active:scale-95 text-white flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                            title="Pobierz polskie wydanie natychmiast bez czekania na tłumaczenie"
                          >
                            {orderingId === `${rec.id}_original` ? (
                              <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            ) : (
                              <Download className="w-3.5 h-3.5" />
                            )}
                            <span>📥 Pobierz od razu</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOrder(rec, 'translate')}
                            disabled={orderingId === `${rec.id}_translate`}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-700 hover:bg-indigo-800 active:scale-95 text-white flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                            title="Rozpocznij literacki przekład AI całej książki na język polski"
                          >
                            {orderingId === `${rec.id}_translate` ? (
                              <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            ) : (
                              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                            )}
                            <span>🌐 Przetłumacz na polski</span>
                          </button>
                        )}

                        {/* 2. PDF Conversion Option */}
                        <button
                          type="button"
                          onClick={() => handleOrder(rec, 'epub_clean')}
                          disabled={orderingId === `${rec.id}_epub_clean`}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-200 flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
                          title="Gdy plik źródłowy to PDF: konwertuje na lekki format EPUB z powiększaniem czcionki dla czytnika e-ink"
                        >
                          {orderingId === `${rec.id}_epub_clean` ? (
                            <div className="w-3 h-3 border-2 border-stone-600/40 border-t-stone-800 rounded-full animate-spin" />
                          ) : (
                            <BookOpen className="w-3.5 h-3.5 text-stone-600" />
                          )}
                          <span>Konwertuj PDF</span>
                        </button>

                        {/* 3. Secondary: if foreign, allow downloading original anyway */}
                        {!rec.isPolishAvailable && (
                          <button
                            type="button"
                            onClick={() => handleOrder(rec, 'original')}
                            disabled={orderingId === `${rec.id}_original`}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-100 border border-stone-200 flex items-center gap-1 transition cursor-pointer"
                            title="Pobierz plik w języku oryginalnym (bez tłumaczenia)"
                          >
                            <span>Oryginał {rec.originalLang}</span>
                          </button>
                        )}

                        {/* 4. Switch to search tab to explore all available mirrors/editions */}
                        <button
                          type="button"
                          onClick={() => searchForRecommendation(rec)}
                          className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-2xs"
                          title="Przejdź do wyszukiwarki, aby przejrzeć inne źródła (Chomikuj, Wolne Lektury, Z-Lib)"
                        >
                          <Search className="w-3.5 h-3.5 text-amber-700" />
                          <span>Inne źródła (Szukaj)</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

                        return (
                          <div
                            key={rawItem.id}
                            className="bg-white border border-stone-200 rounded-2xl p-5 flex flex-col justify-between hover:border-stone-300 transition shadow-2xs"
                          >
                            <div className="space-y-2">
                              <div className="flex items-start justify-between gap-2.5">
                                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                                  {item.coverUrl && (
                                    <img
                                      src={item.coverUrl}
                                      alt={item.title}
                                      className="w-10 h-14 object-cover rounded-md border border-stone-200 shrink-0 shadow-2xs"
                                      onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                    />
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <h3 className="font-semibold text-stone-900 text-sm leading-snug">
                                      {item.title}
                                    </h3>
                                  </div>
                                </div>
                                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md border flex items-center gap-1 shrink-0 ${
                                  item.language.toUpperCase() === 'PL'
                                    ? 'bg-rose-50 text-rose-800 border-rose-200'
                                    : item.language.toUpperCase() === 'EN'
                                    ? 'bg-sky-50 text-sky-800 border-sky-200'
                                    : item.language.toUpperCase() === 'DE'
                                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                                    : item.language.toUpperCase() === 'RU'
                                    ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                    : item.language.toUpperCase() === 'ZH'
                                    ? 'bg-red-50 text-red-800 border-red-200'
                                    : 'bg-stone-100 text-stone-700 border-stone-200'
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
                                      : item.language.toUpperCase() === 'ZH'
                                      ? '🇨🇳'
                                      : item.language.toUpperCase() === 'FR'
                                      ? '🇫🇷'
                                      : item.language.toUpperCase() === 'ES'
                                      ? '🇪🇸'
                                      : item.language.toUpperCase() === 'IT'
                                      ? '🇮🇹'
                                      : '🌐'}
                                  </span>
                                  <span>{item.language.toUpperCase()}</span>
                                </span>
                              </div>

                              <div className="text-xs text-stone-600 font-medium">
                                Autor: {item.author}
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
                                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-800 border border-indigo-200 flex items-center gap-1 shadow-2xs">
                                        <span>🎨</span>
                                        <span>Komiks / Manga (Graficzny)</span>
                                      </span>
                                    );
                                  }
                                  if (isZipPack) {
                                    return (
                                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-300 flex items-center gap-1 shadow-2xs">
                                        <span>📦</span>
                                        <span>Paczka ZIP (Wielopak wydań)</span>
                                      </span>
                                    );
                                  }
                                  if (isTextEpub) {
                                    return (
                                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1 shadow-2xs">
                                        <span>📚</span>
                                        <span>Książka tekstowa (EPUB/MOBI)</span>
                                      </span>
                                    );
                                  }
                                  if (isPdfDoc) {
                                    return (
                                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 border border-stone-300 flex items-center gap-1 shadow-2xs">
                                        <span>📄</span>
                                        <span>Dokument PDF / Skan</span>
                                      </span>
                                    );
                                  }
                                  return null;
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
    </div>
  );
};
