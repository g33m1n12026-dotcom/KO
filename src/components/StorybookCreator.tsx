import React, { useState } from 'react';
import {
  Sparkles,
  BookOpen,
  FileText,
  HelpCircle,
  Users,
  Layers,
  Palette,
  CheckCircle,
  AlertCircle,
  Cpu,
  Feather,
  Wand2,
  Compass,
  ArrowRight,
} from 'lucide-react';
import { StorybookRequest, StorybookType, Job } from '../types';

interface StorybookCreatorProps {
  onJobCreated: (job: Job) => void;
}

export const StorybookCreator: React.FC<StorybookCreatorProps> = ({ onJobCreated }) => {
  const [bookType, setBookType] = useState<StorybookType>('story');

  // Form Fields
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [characters, setCharacters] = useState('');
  const [genre, setGenre] = useState('Sci-Fi');
  const [chapterCount, setChapterCount] = useState<number>(4);
  const [targetAudience, setTargetAudience] = useState<'all' | 'adults' | 'young_adults' | 'children'>('all');
  const [includeIllustrations, setIncludeIllustrations] = useState(true);
  const [engine, setEngine] = useState<'auto' | 'claude' | 'openai' | 'openrouter' | 'gemini'>('auto');

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Quick Preset Templates
  const presets: {
    label: string;
    type: StorybookType;
    title: string;
    prompt: string;
    genre: string;
    characters: string;
    chapters: number;
  }[] = [
    {
      label: '🚀 Cyberpunk Noir',
      type: 'story',
      title: 'Neonowy Świt',
      prompt: 'Detektyw bada sprawę zaginionego androida o ludzkiej duszy w deszczowej Warszawie roku 2089.',
      genre: 'Cyberpunk / Kryminał',
      characters: 'Wiktor (cyniczny były gliniarz), Nova (tajemniczy model syntetyka)',
      chapters: 4,
    },
    {
      label: '🦊 Bajka dla dzieci',
      type: 'story',
      title: 'Lisek, który policzył gwiazdy',
      prompt: 'Ciepła i mądra opowieść na dobranoc o małym lisku, który chciał dowiedzieć się, skąd bierze się światło na nocnym niebie.',
      genre: 'Baśń dla dzieci',
      characters: 'Rudy (ciekawy świata lisek), Sowa Barnaba (mądry astronom)',
      chapters: 3,
    },
    {
      label: '📚 Streszczenie: Atomowe Nawyki',
      type: 'summary',
      title: 'Przewodnik: Atomowe Nawyki (James Clear)',
      prompt: 'Wyczerpujące streszczenie i podręcznik wdrażania książki "Atomic Habits" Jamesa Cleara. Omówienie pętli nawyku, 4 praw zmiany zachowania i praktyczne ćwiczenia.',
      genre: 'Rozwój osobisty / Psychologia',
      characters: '',
      chapters: 5,
    },
    {
      label: '🛠️ Poradnik: KOReader na Kindle',
      type: 'guide',
      title: 'Sekrety KOReadera na Kindle 10',
      prompt: 'Kompletny, praktyczny poradnik instalacji, konfiguracji i najlepszych funkcji KOReadera na Kindle: synchronizacja, czytanie nocne, formaty EPUB i skróty gestów.',
      genre: 'Technologia / Poradnik E-Book',
      characters: '',
      chapters: 4,
    },
  ];

  const applyPreset = (p: typeof presets[0]) => {
    setBookType(p.type);
    setTitle(p.title);
    setPrompt(p.prompt);
    setGenre(p.genre);
    setCharacters(p.characters);
    setChapterCount(p.chapters);
    setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) {
      setErrorMsg('Proszę opisać treść, temat lub fabułę książki.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const payload: StorybookRequest = {
      type: bookType,
      title: title.trim() || undefined,
      prompt: prompt.trim(),
      characters: characters.trim() || undefined,
      genre: genre.trim() || undefined,
      chapterCount,
      targetAudience,
      includeIllustrations,
      engine,
    };

    try {
      const resp = await fetch('/api/storybook/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Błąd serwera' }));
        throw new Error(err.error || 'Nie udało się zainicjować tworzenia książki');
      }

      const job: Job = await resp.json();
      onJobCreated(job);
    } catch (err: any) {
      setErrorMsg(err.message || 'Wystąpił błąd podczas zlecania pisania książki');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Intro Hero Box */}
      <div className="bg-white border border-stone-200 rounded-2xl p-5 sm:p-6 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-amber-500 text-stone-900 flex items-center justify-center shrink-0 shadow-xs">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-stone-900">
                  Książka na życzenie (AI Storybook)
                </h2>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
                  Gotowy EPUB dla Kindle
                </span>
              </div>
              <p className="text-xs text-stone-600 mt-0.5 max-w-2xl">
                Opisz, o czym chcesz przeczytać. AI stworzy pełną fabułę z dialogami lub wyczerpujący poradnik,
                wygeneruje klimatyczne ryciny e-ink i spakuje wszystko w lekki plik EPUB z okładką!
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <label className="text-xs font-medium text-stone-600">Silnik:</label>
            <select
              value={engine}
              onChange={(e) => setEngine(e.target.value as any)}
              className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-stone-300 bg-stone-50 text-stone-800 focus:outline-none focus:ring-1 focus:ring-stone-800"
            >
              <option value="auto">⚡ Auto (Gemini / DeepSeek)</option>
              <option value="gemini">Google Gemini 3.8 Flash</option>
              <option value="openrouter">OpenRouter (DeepSeek Chat)</option>
              <option value="openai">OpenAI (GPT-4o Mini)</option>
              <option value="claude">Anthropic Claude 3.5</option>
            </select>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="mt-4 pt-4 border-t border-stone-100 flex flex-wrap items-center gap-2">
          <span className="text-xs text-stone-400 font-medium">Szybkie inspiracje:</span>
          {presets.map((p, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => applyPreset(p)}
              className="text-xs px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 transition cursor-pointer font-medium"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Creation Form */}
      <form onSubmit={handleSubmit} className="bg-white border border-stone-200 rounded-2xl p-5 sm:p-7 shadow-2xs space-y-6">
        {/* Step 1: Choose Type */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-stone-500">
            1. Wybierz rodzaj publikacji
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setBookType('story')}
              className={`p-3.5 rounded-xl border text-left transition flex items-start gap-3 cursor-pointer ${
                bookType === 'story'
                  ? 'border-amber-500 bg-amber-50/60 ring-2 ring-amber-500/20'
                  : 'border-stone-200 hover:border-stone-300 bg-stone-50/40'
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 mt-0.5">
                <Feather className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-stone-900">Powieść / Opowiadanie</div>
                <div className="text-[11px] text-stone-500 mt-0.5">
                  Fabuła, dialogi z myślnikami, zwroty akcji, bohaterowie.
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setBookType('summary')}
              className={`p-3.5 rounded-xl border text-left transition flex items-start gap-3 cursor-pointer ${
                bookType === 'summary'
                  ? 'border-indigo-500 bg-indigo-50/60 ring-2 ring-indigo-500/20'
                  : 'border-stone-200 hover:border-stone-300 bg-stone-50/40'
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-800 flex items-center justify-center shrink-0 mt-0.5">
                <BookOpen className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-stone-900">Streszczenie & Analiza</div>
                <div className="text-[11px] text-stone-500 mt-0.5">
                  Podsumowanie istniejącej książki rozdział po rozdziale.
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setBookType('guide')}
              className={`p-3.5 rounded-xl border text-left transition flex items-start gap-3 cursor-pointer ${
                bookType === 'guide'
                  ? 'border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-500/20'
                  : 'border-stone-200 hover:border-stone-300 bg-stone-50/40'
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 mt-0.5">
                <Compass className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-stone-900">Praktyczny Poradnik</div>
                <div className="text-[11px] text-stone-500 mt-0.5">
                  Krok po kroku, checklisty, wskazówki, instrukcje.
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Step 2: Content Details */}
        <div className="space-y-4 pt-2 border-t border-stone-100">
          <label className="text-xs font-bold uppercase tracking-wider text-stone-500 block">
            2. Opis i szczegóły publikacji
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Tytuł książki (opcjonalnie):
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  bookType === 'story'
                    ? 'np. Ostatni pociąg z Marsa (lub zostaw puste – AI wymyśli)'
                    : bookType === 'summary'
                    ? 'np. Diuna - Frank Herbert'
                    : 'np. Podręcznik przetrwania w erze AI'
                }
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-stone-300 bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-800"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                {bookType === 'story' ? 'Gatunek / Klimat:' : 'Kategoria / Temat:'}
              </label>
              <input
                type="text"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                placeholder="np. Cyberpunk, Fantasy, Kryminał, Bajka, Psychologia..."
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-stone-300 bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-800"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1">
              {bookType === 'story'
                ? 'Opisz fabułę, świat i pomysł na historię:'
                : bookType === 'summary'
                ? 'Jaką książkę podsumować i na co położyć nacisk?'
                : 'Czego ma uczyć ten poradnik i dla kogo jest przeznaczony?'}
              <span className="text-red-500 ml-1">*</span>
            </label>
            <textarea
              required
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                bookType === 'story'
                  ? 'Opisz, co ma się wydarzyć. Np. "Załoga statku badawczego odkrywa starożytną kapsułę na orbicie Saturna. W środku znajduje się wiadomość nadana w języku polskim z przyszłości..."'
                  : bookType === 'summary'
                  ? 'Wpisz tytuł i autora książki oraz wytyczne, np. "Szczegółowe streszczenie książki Myślenie szybkie i wolne Daniela Kahnemana z naciskiem na błędy poznawcze i przykłady z życia."'
                  : 'Opisz temat poradnika, np. "Kompletny podręcznik parzenia kawy metodami przelewowymi (V60, Chemex, Aeropress) dla początkujących z podaniem proporcji, temperatur i mielenia."'
              }
              className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-stone-300 bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-800"
            />
          </div>

          {bookType === 'story' && (
            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-stone-500" />
                <span>Główni bohaterowie (imiona, role, charaktery):</span>
              </label>
              <input
                type="text"
                value={characters}
                onChange={(e) => setCharacters(e.target.value)}
                placeholder="np. Marek (kapitan z poczuciem humoru), dr Anna (astrobiolog), robot T-9"
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-stone-300 bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-800"
              />
            </div>
          )}
        </div>

        {/* Step 3: Formatting & Length Options */}
        <div className="space-y-4 pt-2 border-t border-stone-100">
          <label className="text-xs font-bold uppercase tracking-wider text-stone-500 block">
            3. Długość i opcje formatowania
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-stone-700 mb-2">
                Długość książki:
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { count: 3, label: 'Krótka', desc: '~10-15 str.' },
                  { count: 5, label: 'Średnia', desc: '~25-35 str.' },
                  { count: 8, label: 'Długa', desc: '~50-70 str.' },
                ].map((item) => (
                  <button
                    key={item.count}
                    type="button"
                    onClick={() => setChapterCount(item.count)}
                    className={`py-2 px-2.5 rounded-xl border text-center transition cursor-pointer ${
                      chapterCount === item.count
                        ? 'border-stone-900 bg-stone-900 text-white font-semibold'
                        : 'border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    <div className="text-xs">{item.label}</div>
                    <div className="text-[10px] opacity-75">{item.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-2">
                Odbiorcy:
              </label>
              <select
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value as any)}
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-stone-300 bg-stone-50 text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-800"
              >
                <option value="all">Wszyscy czytelnicy</option>
                <option value="adults">Dorośli (dojrzały język)</option>
                <option value="young_adults">Młodzież (Young Adult)</option>
                <option value="children">Dzieci (prosty, ciepły język)</option>
              </select>
            </div>
          </div>

          {/* Illustrations Toggle */}
          <div className="bg-stone-50 border border-stone-200 rounded-xl p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                <Palette className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-stone-900">
                  Klimatyczne ilustracje E-Ink
                </div>
                <div className="text-[11px] text-stone-500">
                  Generuje okładkę książki oraz ryciny w stylu czarno-białego drzeworytu na początku rozdziałów.
                </div>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={includeIllustrations}
                onChange={(e) => setIncludeIllustrations(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-stone-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-stone-900"></div>
            </label>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Submit Button */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full sm:w-auto px-7 py-3 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-semibold transition disabled:bg-stone-300 flex items-center justify-center gap-2 shadow-xs cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Inicjowanie pisania książki w chmurze...</span>
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4 text-amber-400" />
                <span>Napisz i stwórz e-book EPUB</span>
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </>
            )}
          </button>
          <p className="text-[11px] text-stone-400 mt-2">
            Zadanie zostanie przeniesione do zakładki <b>Kolejka i Biblioteka</b>, gdzie zobaczysz postęp pisania rozdział po rozdziale. Gotowy plik pobierzesz bezpośrednio na Kindle!
          </p>
        </div>
      </form>
    </div>
  );
};
