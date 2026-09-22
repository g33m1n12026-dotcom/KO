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
  Layers,
  Link2,
  Copy,
} from 'lucide-react';
import { BookSearchResult, BookRecommendation, ShadowLibraryMirror, Job } from '../types';

interface BookSearcherProps {
  onOrderCreated: (job: Job) => void;
}

export const BookSearcher: React.FC<BookSearcherProps> = ({ onOrderCreated }) => {
  // Subtab navigation (removed unused directUrl tab)
  const [subTab, setSubTab] = useState<'advisor' | 'search' | 'mirrors'>('advisor');

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

  // 3. Mirrors Catalog State
  const [mirrors, setMirrors] = useState<ShadowLibraryMirror[]>([]);
  const [selectedMirrorCategory, setSelectedMirrorCategory] = useState<string>('all');
  const [mirrorSearchQuery, setMirrorSearchQuery] = useState('');

  // Ordering in progress tracking
  const [orderingId, setOrderingId] = useState<string | null>(null);

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
    try {
      const resp = await fetch(`/api/search?q=${encodeURIComponent(searchQuery.trim())}`);
      if (!resp.ok) throw new Error('Błąd wyszukiwarki');
      const data: BookSearchResult[] = await resp.json();
      setResults(data);
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
    targetLang: string = 'Polish',
    conversionMode: 'translate' | 'epub_clean' = 'translate'
  ) => {
    setOrderingId(item.id);
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
          const searchData: BookSearchResult[] = await searchResp.json();
          const matchWithDl = searchData.find((b) => !!b.downloadUrl);
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
          conversionMode === 'translate'
            ? `Pobrano plik z repozytorium! Rozpoczęto tłumaczenie książki "${item.title}". Postęp sprawdzisz w zakładce Kolejka.`
            : `Pobrano plik z repozytorium! Przygotowywanie lekkiego EPUB dla "${item.title}". Postęp sprawdzisz w zakładce Kolejka.`,
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
              onClick={() => setSubTab('advisor')}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition ${
                subTab === 'advisor'
                  ? 'bg-white text-stone-900 shadow-2xs font-semibold'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Lightbulb className="w-4 h-4 text-amber-500" />
              <span>Doradca AI: "Opisz na co masz ochotę"</span>
            </button>

            <button
              onClick={() => setSubTab('search')}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition ${
                subTab === 'search'
                  ? 'bg-white text-stone-900 shadow-2xs font-semibold'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Search className="w-4 h-4 text-stone-700" />
              <span>Wyszukiwarka książek</span>
            </button>

            <button
              onClick={() => setSubTab('mirrors')}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition ${
                subTab === 'mirrors'
                  ? 'bg-white text-stone-900 shadow-2xs font-semibold'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Globe className="w-4 h-4 text-sky-600" />
              <span>Baza Mirrorów (Anna's, Z-Lib, LibGen)</span>
            </button>
          </div>

          {/* Model selector */}
          <div className="shrink-0 flex items-center gap-2">
            <span className="text-xs text-stone-500 font-medium">Model:</span>
            <select
              value={selectedEngine}
              onChange={(e) => setSelectedEngine(e.target.value as any)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-stone-200 bg-stone-50 text-stone-800 focus:outline-none"
            >
              <option value="auto">✨ Smart Auto (Gemini + DeepSeek / Claude)</option>
              <option value="gemini">⚡ Google Gemini</option>
              <option value="openrouter">🌐 DeepSeek / OpenRouter</option>
              <option value="claude">🏛️ Claude 3.5 Sonnet</option>
              <option value="openai">🤖 OpenAI GPT-4o-mini</option>
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
                      {/* Title & Language */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-bold text-stone-900 text-sm leading-snug">
                            {rec.polishTitle ? `${rec.polishTitle}` : rec.title}
                          </h3>
                          {rec.polishTitle && rec.polishTitle !== rec.title && (
                            <span className="text-xs text-stone-500 italic block">
                              (Oryg. {rec.title})
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 uppercase shrink-0">
                          {rec.originalLang || 'EN'}
                        </span>
                      </div>

                      {/* Author & Year & Genre */}
                      <div className="flex flex-wrap items-center gap-2 text-xs text-stone-600">
                        <span className="font-medium">Autor: {rec.author}</span>
                        {rec.year && <span>• {rec.year}</span>}
                        {rec.genre && (
                          <span className="px-2 py-0.5 bg-stone-100 rounded text-[11px] text-stone-600">
                            {rec.genre}
                          </span>
                        )}
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
                      <div className="pt-2">
                        <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider block mb-1.5">
                          Szukaj w repozytoriach i bazach:
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
                          onClick={() => {
                            navigator.clipboard.writeText(rec.searchQuery || `${rec.author} ${rec.title}`);
                            setMessage({ text: `Skopiowano: "${rec.searchQuery}"`, type: 'success' });
                          }}
                          className="text-xs text-stone-500 hover:text-stone-800 flex items-center gap-1"
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

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleOrder(rec)}
                          disabled={orderingId === rec.id}
                          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 shadow-2xs ${
                            orderingId === rec.id
                              ? 'bg-amber-100 text-amber-800 cursor-wait'
                              : 'bg-emerald-700 hover:bg-emerald-800 text-white'
                          }`}
                        >
                          {orderingId === rec.id ? (
                            <>
                              <div className="w-3 h-3 border-2 border-amber-800/30 border-t-amber-800 rounded-full animate-spin" />
                              <span>Pobieram z mirrora...</span>
                            </>
                          ) : (
                            <>
                              <DownloadCloud className="w-3.5 h-3.5" />
                              <span>Pobierz z mirrora i przetłumacz</span>
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => searchForRecommendation(rec)}
                          className="px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-xs font-medium flex items-center gap-1 transition"
                          title="Przeglądaj wszystkie dostępne wydania w wyszukiwarce"
                        >
                          <Search className="w-3.5 h-3.5 text-stone-500" />
                          <span>Wydania</span>
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
        <div className="space-y-6">
          <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-2xs">
            <div className="mb-4">
              <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
                <Globe className="w-5 h-5 text-stone-700" />
                Wyszukiwarka książek z natychmiastowym pobieraniem
              </h2>
              <p className="text-xs text-stone-500 mt-1">
                Wyszukuje pozycje z bezpośrednim dostępem do pełnych tekstów (Project Gutenberg, OpenLibrary). Jednym kliknięciem chmura pobiera plik, wykonuje literacki przekład na polski i pakuje EPUB dla Twojego Kindle.
              </p>
            </div>

            {/* Search bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSearch();
              }}
              className="flex gap-2"
            >
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Wpisz tytuł lub autora (np. Franz Kafka, The Great Gatsby, Stanislaw Lem)..."
                  className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-stone-800 bg-stone-50/50"
                />
              </div>
              <button
                type="submit"
                disabled={isSearching || !query.trim()}
                className="px-5 py-2.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-sm font-medium transition disabled:bg-stone-300 flex items-center gap-2 shrink-0 shadow-xs"
              >
                {isSearching ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                <span>Szukaj</span>
              </button>
            </form>
          </div>

          {/* Search Results List */}
          {hasSearched && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-stone-600 px-1">
                <span>Znalezione pozycje ({results.length})</span>
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {results.map((item) => (
                    <div
                      key={item.id}
                      className="bg-white border border-stone-200 rounded-2xl p-5 flex flex-col justify-between hover:border-stone-300 transition shadow-2xs"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold text-stone-900 text-sm leading-snug">
                            {item.title}
                          </h3>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 uppercase shrink-0">
                            {item.language}
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

                        <div className="flex items-center gap-2 text-[11px] text-stone-400">
                          <span>Źródło: {item.source}</span>
                          <span>•</span>
                          <span>Format: {item.format}</span>
                        </div>

                        {/* Mirror deep links */}
                        {item.mirrorLinks && item.mirrorLinks.length > 0 && (
                          <div className="pt-2 flex flex-wrap gap-1">
                            <span className="text-[10px] text-stone-400 block w-full">
                              Szukaj alternatywnych wydań:
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

                      {/* Action button */}
                      <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between">
                        <span className="text-[11px] text-stone-500">
                          {item.downloadUrl ? 'Pełny tekst dostępny' : 'Tylko metadane'}
                        </span>

                        <button
                          onClick={() => handleOrder(item)}
                          disabled={!item.downloadUrl || orderingId === item.id}
                          className={`px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${
                            !item.downloadUrl
                              ? 'bg-stone-100 text-stone-400 cursor-not-allowed'
                              : orderingId === item.id
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-stone-900 text-white hover:bg-stone-800 active:scale-95'
                          }`}
                        >
                          {orderingId === item.id ? (
                            <>
                              <div className="w-3 h-3 border-2 border-amber-800/30 border-t-amber-800 rounded-full animate-spin" />
                              <span>Pobieranie w chmurze...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                              <span>Przetłumacz na polski EPUB</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
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
                  { id: 'all', label: 'Wszystkie' },
                  { id: 'annas', label: "Anna's Archive" },
                  { id: 'zlib', label: 'Z-Library' },
                  { id: 'libgen', label: 'LibGen' },
                  { id: 'scihub', label: 'Sci-Hub' },
                  { id: 'decentralized', label: 'IPFS / Web3' },
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
