import React, { useState, useEffect } from 'react';
import {
  X,
  BookOpen,
  Sparkles,
  Copy,
  Check,
  Download,
  Search,
  ExternalLink,
  Users,
  Feather,
  Quote,
  Clock,
  Calendar,
  Layers,
  RefreshCw,
  Zap,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { BookSummaryAndMetadata, AIModelTier } from '../types';
import { fetchBookSummary } from '../services/opencode';

interface BookSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  book: {
    title: string;
    author?: string;
    coverUrl?: string;
    downloadUrl?: string;
    format?: string;
    language?: string;
  } | null;
  activeModelTier: AIModelTier;
  onModelTierChange: (tier: AIModelTier) => void;
  premiumProvider: 'openrouter' | 'openai';
  onPremiumProviderChange: (provider: 'openrouter' | 'openai') => void;
  onOrderBook?: (mode: 'original' | 'translate' | 'epub_clean') => void;
  onSearchRepositories?: (query: string) => void;
}

export const BookSummaryModal: React.FC<BookSummaryModalProps> = ({
  isOpen,
  onClose,
  book,
  activeModelTier,
  onModelTierChange,
  premiumProvider,
  onPremiumProviderChange,
  onOrderBook,
  onSearchRepositories,
}) => {
  const [data, setData] = useState<BookSummaryAndMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'summary' | 'characters' | 'style' | 'meta'>('summary');

  useEffect(() => {
    if (!isOpen || !book) {
      setData(null);
      setError(null);
      return;
    }
    loadSummary(activeModelTier, premiumProvider);
  }, [isOpen, book?.title, book?.author]);

  const loadSummary = async (tier: AIModelTier, provider: 'openrouter' | 'openai') => {
    if (!book?.title) return;
    setIsLoading(true);
    setError(null);

    try {
      const result = await fetchBookSummary({
        title: book.title,
        author: book.author,
        modelTier: tier,
        premiumProvider: provider,
        language: 'Polish',
      });
      setData(result);
    } catch (err: any) {
      console.error('Błąd pobierania streszczenia:', err);
      setError(err?.message || 'Nie udało się pobrać streszczenia książki.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTierSwitch = (newTier: AIModelTier) => {
    onModelTierChange(newTier);
    loadSummary(newTier, premiumProvider);
  };

  const handleProviderSwitch = (newProvider: 'openrouter' | 'openai') => {
    onPremiumProviderChange(newProvider);
    if (activeModelTier === 'premium') {
      loadSummary('premium', newProvider);
    }
  };

  const handleCopy = () => {
    if (!data) return;
    const text = `# ${data.title}${data.polishTitle ? ` (${data.polishTitle})` : ''} - ${data.author}
Rok: ${data.year || 'b.d.'} | Gatunek: ${data.genre} | Model: ${data.provider} (${data.modelName})

## Krótki zarys
${data.synopsis}

## Pełne streszczenie fabuły
${data.detailedSummary}

## Główne motywy
${data.keyThemes.map((t) => `- ${t}`).join('\n')}

## Bohaterowie
${data.keyCharacters.map((c) => `- **${c.name}** (${c.role}): ${c.description}`).join('\n')}

## Styl literacki i nastrój
${data.literaryStyle}

${data.notableQuote ? `> "${data.notableQuote}"\n` : ''}
## Dlaczego warto przeczytać
${data.whyReadThis}`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  if (!isOpen || !book) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white border border-stone-200 rounded-3xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden text-stone-900"
        role="dialog"
        aria-modal="true"
      >
        {/* Header Bar */}
        <div className="p-4 sm:p-6 border-b border-stone-200 bg-stone-50/70 flex flex-col gap-3 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              {book.coverUrl ? (
                <img
                  src={book.coverUrl}
                  alt={book.title}
                  className="w-14 h-20 sm:w-16 sm:h-24 object-cover rounded-xl border border-stone-200 shadow-sm shrink-0 bg-stone-100"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-14 h-20 sm:w-16 sm:h-24 rounded-xl border border-stone-200 shadow-sm shrink-0 bg-stone-100 flex flex-col items-center justify-center text-stone-400">
                  <BookOpen className="w-6 h-6 text-stone-500" />
                  <span className="text-[10px] font-bold mt-1 text-stone-500">AI INFO</span>
                </div>
              )}

              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base sm:text-lg font-bold text-stone-900 leading-snug truncate" title={book.title}>
                    {data?.polishTitle || book.title}
                  </h3>
                  {data?.polishTitle && data.polishTitle !== data.originalTitle && (
                    <span className="text-xs text-stone-400 italic">({data.originalTitle || book.title})</span>
                  )}
                </div>

                <p className="text-xs sm:text-sm text-stone-600 font-medium">
                  Autor: <strong className="text-stone-900">{data?.author || book.author || 'Nieznany autor'}</strong>
                </p>

                {/* Quick Info Badges */}
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  {data?.year && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-stone-200/70 text-stone-700 flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-stone-500" />
                      <span>{data.year}</span>
                    </span>
                  )}
                  {data?.genre && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-200">
                      {data.genre}
                    </span>
                  )}
                  {data?.estimatedReadingTime && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-emerald-600" />
                      <span>{data.estimatedReadingTime}</span>
                    </span>
                  )}
                  {data?.originalLanguage && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 border border-stone-200">
                      Język oryginału: {data.originalLanguage}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-stone-400 hover:text-stone-700 rounded-xl hover:bg-stone-200/60 transition cursor-pointer"
              title="Zamknij"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Model Tier Selector Strip */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-stone-200/80">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-stone-600 flex items-center gap-1">
                <span>Silnik AI:</span>
              </span>

              {/* Segmented Switcher: Free OpenCode vs Premium */}
              <div className="inline-flex p-0.5 bg-stone-200/80 rounded-xl">
                <button
                  type="button"
                  onClick={() => handleTierSwitch('free_opencode')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                    activeModelTier === 'free_opencode'
                      ? 'bg-white text-emerald-900 shadow-2xs font-bold'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                  title="Darmowe modele open-source przez OpenCode.ai (brak opłat i limitów)"
                >
                  <Zap className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Darmowy (OpenCode.ai)</span>
                  <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-100 text-emerald-800 font-bold uppercase tracking-wider">
                    Free
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleTierSwitch('premium')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                    activeModelTier === 'premium'
                      ? 'bg-white text-indigo-900 shadow-2xs font-bold'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                  title="Modele Premium (OpenRouter / OpenAI) – DeepSeek, Claude 3.5, GPT-4o"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Premium (OpenRouter/OpenAI)</span>
                  <span className="text-[9px] px-1 py-0.2 rounded bg-indigo-100 text-indigo-800 font-bold uppercase tracking-wider">
                    Pro
                  </span>
                </button>
              </div>

              {/* If Premium tier, allow picking provider */}
              {activeModelTier === 'premium' && (
                <div className="flex items-center gap-1 bg-white border border-stone-300 rounded-lg p-0.5">
                  <button
                    type="button"
                    onClick={() => handleProviderSwitch('openrouter')}
                    className={`px-2 py-0.5 text-[11px] font-medium rounded transition cursor-pointer ${
                      premiumProvider === 'openrouter'
                        ? 'bg-stone-900 text-white font-bold'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    OpenRouter
                  </button>
                  <button
                    type="button"
                    onClick={() => handleProviderSwitch('openai')}
                    className={`px-2 py-0.5 text-[11px] font-medium rounded transition cursor-pointer ${
                      premiumProvider === 'openai'
                        ? 'bg-stone-900 text-white font-bold'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    OpenAI
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {data && (
                <span className="text-[11px] text-stone-500 font-mono flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-stone-400" />
                  <span>{data.provider}</span>
                </span>
              )}

              <button
                type="button"
                onClick={() => loadSummary(activeModelTier, premiumProvider)}
                disabled={isLoading}
                className="p-1.5 text-stone-500 hover:text-stone-900 rounded-lg hover:bg-stone-200/60 transition cursor-pointer disabled:opacity-40"
                title="Odśwież streszczenie"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-stone-800' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Content Navigation Tabs */}
        <div className="px-4 sm:px-6 pt-3 bg-white border-b border-stone-200 flex gap-2 shrink-0">
          <button
            onClick={() => setActiveTab('summary')}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition cursor-pointer ${
              activeTab === 'summary'
                ? 'border-stone-900 text-stone-900'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Fabuła i streszczenie</span>
          </button>
          <button
            onClick={() => setActiveTab('characters')}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition cursor-pointer ${
              activeTab === 'characters'
                ? 'border-stone-900 text-stone-900'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Bohaterowie i motywy</span>
            {data?.keyCharacters && data.keyCharacters.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-stone-100 text-stone-600">
                {data.keyCharacters.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('style')}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition cursor-pointer ${
              activeTab === 'style'
                ? 'border-stone-900 text-stone-900'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <Feather className="w-3.5 h-3.5" />
            <span>Styl i kontekst</span>
          </button>
          <button
            onClick={() => setActiveTab('meta')}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition cursor-pointer ${
              activeTab === 'meta'
                ? 'border-stone-900 text-stone-900'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Metadane</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center text-stone-500 space-y-3">
              <div className="w-8 h-8 border-3 border-stone-200 border-t-stone-800 rounded-full animate-spin" />
              <div className="text-center space-y-1">
                <p className="text-sm font-semibold text-stone-800">
                  {activeModelTier === 'free_opencode'
                    ? 'Łączenie z OpenCode.ai...'
                    : `Odpytywanie modelu Premium (${premiumProvider === 'openai' ? 'OpenAI GPT-4o' : 'OpenRouter'})...`}
                </p>
                <p className="text-xs text-stone-400">
                  Przygotowywanie zarysu fabuły, analizy bohaterów i metadanych literackich
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-900 space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>Błąd pobierania analizy</span>
              </div>
              <p className="text-xs text-red-800 leading-relaxed">{error}</p>
              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleTierSwitch('free_opencode')}
                  className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition cursor-pointer"
                >
                  Przełącz na darmowy OpenCode.ai
                </button>
                <button
                  type="button"
                  onClick={() => loadSummary(activeModelTier, premiumProvider)}
                  className="px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold transition cursor-pointer"
                >
                  Spróbuj ponownie
                </button>
              </div>
            </div>
          ) : data ? (
            <div className="space-y-4">
              {/* TAB 1: SUMMARY & SYNOPSIS */}
              {activeTab === 'summary' && (
                <div className="space-y-4">
                  {/* Synopsis Box */}
                  <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 text-stone-800 space-y-1.5">
                    <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wider block">
                      ⚡ Szybki zarys (Teaser)
                    </span>
                    <p className="text-xs sm:text-sm text-stone-800 leading-relaxed italic">
                      "{data.synopsis}"
                    </p>
                  </div>

                  {/* Detailed Summary */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                      Szczegółowe streszczenie fabuły
                    </h4>
                    <div className="text-xs sm:text-sm text-stone-700 leading-relaxed space-y-3 bg-stone-50/60 p-4 rounded-2xl border border-stone-200/80">
                      {data.detailedSummary.split('\n\n').map((paragraph, idx) => (
                        <p key={idx}>{paragraph}</p>
                      ))}
                    </div>
                  </div>

                  {/* Why Read This */}
                  {data.whyReadThis && (
                    <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200 text-emerald-950 space-y-1">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-900">
                        🎯 Dlaczego warto przeczytać
                      </h4>
                      <p className="text-xs sm:text-sm leading-relaxed text-emerald-900">
                        {data.whyReadThis}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: CHARACTERS & THEMES */}
              {activeTab === 'characters' && (
                <div className="space-y-5">
                  {/* Key Themes Badges */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                      Główne motywy i problematyka utworu
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {data.keyThemes.map((theme, idx) => (
                        <div
                          key={idx}
                          className="px-3 py-1.5 rounded-xl bg-stone-100 border border-stone-200 text-xs text-stone-800 font-medium flex items-center gap-1.5"
                        >
                          <span className="text-amber-600">✦</span>
                          <span>{theme}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Key Characters Grid */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                      Bohaterowie i postacie ({data.keyCharacters.length})
                    </h4>
                    {data.keyCharacters.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {data.keyCharacters.map((char, idx) => (
                          <div
                            key={idx}
                            className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200 space-y-1 hover:border-stone-300 transition"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <h5 className="font-bold text-stone-900 text-xs sm:text-sm">{char.name}</h5>
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-stone-200/80 text-stone-700">
                                {char.role}
                              </span>
                            </div>
                            <p className="text-xs text-stone-600 leading-relaxed">{char.description}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-stone-400">Brak zdefiniowanych postaci.</p>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: LITERARY STYLE & CONTEXT */}
              {activeTab === 'style' && (
                <div className="space-y-4">
                  {/* Notable Quote */}
                  {data.notableQuote && (
                    <div className="p-4 rounded-2xl bg-stone-100 border-l-4 border-stone-900 text-stone-800 space-y-1">
                      <div className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-stone-500">
                        <Quote className="w-3.5 h-3.5 text-stone-700" />
                        <span>Słynny cytat</span>
                      </div>
                      <p className="text-xs sm:text-sm italic leading-relaxed font-serif">
                        „{data.notableQuote}”
                      </p>
                    </div>
                  )}

                  {/* Literary Style */}
                  <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-1.5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                      Styl narracji i klimat
                    </h4>
                    <p className="text-xs sm:text-sm text-stone-700 leading-relaxed">
                      {data.literaryStyle}
                    </p>
                  </div>

                  {/* Historical Context */}
                  {data.historicalContext && (
                    <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-1.5">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                        Tło historyczne i kontekst kulturowy
                      </h4>
                      <p className="text-xs sm:text-sm text-stone-700 leading-relaxed">
                        {data.historicalContext}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: METADATA DETAILS */}
              {activeTab === 'meta' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200 space-y-1">
                      <span className="text-[10px] text-stone-400 uppercase font-semibold">Tytuł oryginału</span>
                      <p className="text-xs sm:text-sm font-semibold text-stone-900">{data.originalTitle || data.title}</p>
                    </div>
                    {data.polishTitle && (
                      <div className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200 space-y-1">
                        <span className="text-[10px] text-stone-400 uppercase font-semibold">Oficjalny polski tytuł</span>
                        <p className="text-xs sm:text-sm font-semibold text-stone-900">{data.polishTitle}</p>
                      </div>
                    )}
                    <div className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200 space-y-1">
                      <span className="text-[10px] text-stone-400 uppercase font-semibold">Autor</span>
                      <p className="text-xs sm:text-sm font-semibold text-stone-900">{data.author}</p>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200 space-y-1">
                      <span className="text-[10px] text-stone-400 uppercase font-semibold">Gatunek i podgatunki</span>
                      <p className="text-xs sm:text-sm font-semibold text-stone-900">
                        {data.genre}
                        {data.subgenres && data.subgenres.length > 0 && ` (${data.subgenres.join(', ')})`}
                      </p>
                    </div>
                    {data.estimatedPages && (
                      <div className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200 space-y-1">
                        <span className="text-[10px] text-stone-400 uppercase font-semibold">Szacowana objętość</span>
                        <p className="text-xs sm:text-sm font-semibold text-stone-900">{data.estimatedPages} stron</p>
                      </div>
                    )}
                    {data.targetAudience && (
                      <div className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200 space-y-1">
                        <span className="text-[10px] text-stone-400 uppercase font-semibold">Docelowa grupa czytelników</span>
                        <p className="text-xs sm:text-sm font-semibold text-stone-900">{data.targetAudience}</p>
                      </div>
                    )}
                  </div>

                  <div className="p-3 rounded-xl bg-stone-100/70 text-[11px] text-stone-500 flex items-center justify-between">
                    <span>Model: {data.modelName} ({data.provider})</span>
                    <span>Pobrano: {new Date(data.fetchedAt).toLocaleTimeString()}</span>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Modal Footer Bar with Quick Actions */}
        <div className="p-3.5 sm:p-5 border-t border-stone-200 bg-stone-50 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              disabled={!data}
              className="px-3 py-1.5 rounded-xl border border-stone-300 hover:border-stone-400 bg-white text-stone-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40"
              title="Kopiuj notatkę o książce do schowka"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700">Skopiowano!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-stone-500" />
                  <span>Kopiuj streszczenie</span>
                </>
              )}
            </button>

            {onSearchRepositories && (
              <button
                type="button"
                onClick={() => {
                  onSearchRepositories(data?.polishTitle || book.title);
                  onClose();
                }}
                className="px-3 py-1.5 rounded-xl border border-stone-300 hover:border-stone-400 bg-white text-stone-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                title="Wyszukaj ten tytuł w repozytoriach"
              >
                <Search className="w-3.5 h-3.5 text-stone-500" />
                <span className="hidden sm:inline">Szukaj w repozytoriach</span>
                <span className="sm:hidden">Szukaj</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {onOrderBook && book.downloadUrl && (
              <button
                type="button"
                onClick={() => {
                  onOrderBook('original');
                  onClose();
                }}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Pobierz plik</span>
              </button>
            )}

            {onOrderBook && (
              <button
                type="button"
                onClick={() => {
                  onOrderBook('translate');
                  onClose();
                }}
                className="px-3.5 py-1.5 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Przetłumacz na polski</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl bg-stone-200 hover:bg-stone-300 text-stone-700 text-xs font-semibold transition cursor-pointer"
            >
              Zamknij
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
