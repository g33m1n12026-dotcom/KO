import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, ArrowRight, Sparkles, CheckCircle2, ShieldAlert, Cpu } from 'lucide-react';
import { Job } from '../types';

interface UploadConverterProps {
  onJobCreated: (job: Job) => void;
  serverUrl: string;
}

export const UploadConverter: React.FC<UploadConverterProps> = ({ onJobCreated, serverUrl }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [conversionMode, setConversionMode] = useState<'translate' | 'epub_clean' | 'comic_cbz'>('translate');
  const [engine, setEngine] = useState<'auto' | 'claude' | 'openai' | 'openrouter' | 'gemini'>('auto');
  const [targetLang, setTargetLang] = useState<string>('Polish');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMsg('Wybierz plik przed rozpoczęciem konwersji.');
      return;
    }

    setIsUploading(true);
    setErrorMsg(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('conversionMode', conversionMode);
      formData.append('engine', engine);
      formData.append('targetLang', conversionMode === 'translate' ? targetLang : 'none');

      const resp = await fetch('/api/convert', {
        method: 'POST',
        body: formData,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Błąd serwera' }));
        throw new Error(err.error || 'Nie udało się przesłać pliku.');
      }

      const createdJob: Job = await resp.json();
      onJobCreated(createdJob);
    } catch (err: any) {
      setErrorMsg(err.message || 'Wystąpił błąd podczas wysyłania pliku');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Informative banner about Kindle 10 architecture */}
      <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200/80 text-amber-900 text-sm">
        <div className="flex items-start gap-3">
          <div className="p-1.5 bg-amber-100 rounded-lg text-amber-800 shrink-0">
            <Cpu className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h4 className="font-semibold text-stone-900">
              Jak to działa z Twoim Kindle 10 (512 MB RAM)?
            </h4>
            <p className="text-stone-600 leading-relaxed text-xs sm:text-sm">
              Czytnik <strong>nigdy nie tłumaczy ani nie mieli PDF-a lokalnie</strong> — jego procesor 1 GHz i 512 MB RAM-u by tego nie przetrwały. Całą ciężką pracę (ekstrakcję tekstu z PDF, formatowanie akapitów, korektę literacką w AI i pakowanie do standardu EPUB 3) wykonuje ten serwer w chmurze.
              Plik możesz wysłać <strong>bezpośrednio z czytnika</strong> (klikając w KOReaderze na dowolny plik PDF) lub <strong>wygodnie z telefonu/komputera poniżej</strong>.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main Upload Box */}
        <div className="lg:col-span-8 bg-white border border-stone-200 rounded-2xl p-6 shadow-2xs">
          <h2 className="text-base font-bold text-stone-900 mb-1 flex items-center gap-2">
            <FileText className="w-5 h-5 text-stone-700" />
            Konwertuj i przetłumacz plik (PDF, TXT, EPUB)
          </h2>
          <p className="text-xs text-stone-500 mb-5">
            Prześlij plik w obcym języku (angielski, niemiecki, francuski, itp.). Serwer wyczyści tekst, przetłumaczy go z zachowaniem stylu powieści i zbuduje gotowy plik EPUB.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Drop Zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition flex flex-col items-center justify-center min-h-[170px] ${
                isDragOver
                  ? 'border-stone-900 bg-stone-100'
                  : selectedFile
                  ? 'border-emerald-500 bg-emerald-50/30'
                  : 'border-stone-300 hover:border-stone-400 bg-stone-50/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.epub,.md"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setSelectedFile(e.target.files[0]);
                  }
                }}
              />

              {selectedFile ? (
                <div className="space-y-2">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div className="font-medium text-stone-900 text-sm">
                    {selectedFile.name}
                  </div>
                  <div className="text-xs text-stone-500">
                    Rozmiar: {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Kliknij, aby zmienić
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="w-12 h-12 rounded-full bg-stone-200 text-stone-700 flex items-center justify-center mx-auto">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <div className="font-medium text-stone-800 text-sm">
                    Przeciągnij i upuść plik lub kliknij, aby wybrać
                  </div>
                  <div className="text-xs text-stone-500">
                    Obsługiwane formaty: <strong>PDF, EPUB, TXT</strong> (do 100 MB)
                  </div>
                </div>
              )}
            </div>

            {/* Conversion Mode Selector */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-stone-700">
                Wybierz cel i format wynikowy
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => setConversionMode('translate')}
                  className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                    conversionMode === 'translate'
                      ? 'border-stone-900 bg-stone-900 text-white shadow-xs'
                      : 'border-stone-200 bg-white text-stone-800 hover:border-stone-300'
                  }`}
                >
                  <div>
                    <div className="font-semibold text-xs sm:text-sm flex items-center gap-1.5 mb-1">
                      🌐 Tłumacz na polski + EPUB
                    </div>
                    <div className={`text-[11px] leading-relaxed ${conversionMode === 'translate' ? 'text-stone-300' : 'text-stone-500'}`}>
                      Literacki przekład AI na polski ze spisem treści i podziałem na rozdziały.
                    </div>
                  </div>
                  <div className={`mt-2 text-[10px] font-mono ${conversionMode === 'translate' ? 'text-stone-300' : 'text-stone-400'}`}>
                    Wyjście: .epub
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setConversionMode('epub_clean')}
                  className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                    conversionMode === 'epub_clean'
                      ? 'border-stone-900 bg-stone-900 text-white shadow-xs'
                      : 'border-stone-200 bg-white text-stone-800 hover:border-stone-300'
                  }`}
                >
                  <div>
                    <div className="font-semibold text-xs sm:text-sm flex items-center gap-1.5 mb-1">
                      📖 Lekki EPUB (bez tłumaczenia)
                    </div>
                    <div className={`text-[11px] leading-relaxed ${conversionMode === 'epub_clean' ? 'text-stone-300' : 'text-stone-500'}`}>
                      Idealne na ciężkie skany książek. Usuwa zacięcia, dodaje skalowanie czcionki.
                    </div>
                  </div>
                  <div className={`mt-2 text-[10px] font-mono ${conversionMode === 'epub_clean' ? 'text-stone-300' : 'text-stone-400'}`}>
                    Wyjście: .epub (oryginał)
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setConversionMode('comic_cbz')}
                  className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                    conversionMode === 'comic_cbz'
                      ? 'border-stone-900 bg-stone-900 text-white shadow-xs'
                      : 'border-stone-200 bg-white text-stone-800 hover:border-stone-300'
                  }`}
                >
                  <div>
                    <div className="font-semibold text-xs sm:text-sm flex items-center gap-1.5 mb-1">
                      🎨 Format komiksowy (CBZ)
                    </div>
                    <div className={`text-[11px] leading-relaxed ${conversionMode === 'comic_cbz' ? 'text-stone-300' : 'text-stone-500'}`}>
                      Dla komiksów i mangi. Wyciąga strony, kompresuje pod e-ink, zero lagów na Kindle.
                    </div>
                  </div>
                  <div className={`mt-2 text-[10px] font-mono ${conversionMode === 'comic_cbz' ? 'text-stone-300' : 'text-stone-400'}`}>
                    Wyjście: .cbz (e-ink mode)
                  </div>
                </button>
              </div>
            </div>

            {/* Options Grid */}
            {conversionMode === 'translate' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              {/* AI Engine Selection */}
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                  Wybór modelu AI do tłumaczenia
                </label>
                <select
                  value={engine}
                  onChange={(e) => setEngine(e.target.value as any)}
                  className="w-full text-xs sm:text-sm px-3 py-2 rounded-lg border border-stone-200 bg-white text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-800"
                >
                  <option value="auto">
                    ✨ Smart Auto (Gemini + DeepSeek / OpenRouter z automatycznym fallbackiem)
                  </option>
                  <option value="gemini">
                    ⚡ Google Gemini (Błyskawiczny, świetny kontekst i tłumaczenie)
                  </option>
                  <option value="openrouter">
                    🧠 OpenRouter / DeepSeek (Wysoka precyzja logiczna i literacka)
                  </option>
                  <option value="claude">
                    🏛️ Anthropic Claude 3.5 Sonnet (Do przekładu literackiego)
                  </option>
                  <option value="openai">
                    🤖 OpenAI GPT-4o-mini (Struktury i tłumaczenie)
                  </option>
                </select>
                <p className="text-[11px] text-stone-500 mt-1">
                  System automatycznie korzysta ze sprawdzonych, aktywnych modeli z inteligentnym fallbackiem.
                </p>
              </div>

              {/* Target Language */}
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                  Język docelowy
                </label>
                <select
                  value={targetLang}
                  onChange={(e) => setTargetLang(e.target.value)}
                  className="w-full text-xs sm:text-sm px-3 py-2 rounded-lg border border-stone-200 bg-white text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-800"
                >
                  <option value="Polish">Polski (Domyślny)</option>
                  <option value="English">Angielski</option>
                  <option value="German">Niemiecki</option>
                  <option value="French">Francuski</option>
                  <option value="Spanish">Hiszpański</option>
                </select>
                <p className="text-[11px] text-stone-500 mt-1">
                  Format wyjściowy: Czysty plik EPUB 3 ze spisem treści i podziałem na rozdziały.
                </p>
              </div>
            </div>
            )}

            {conversionMode === 'epub_clean' && (
              <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-600 space-y-1">
                <div className="font-semibold text-stone-800 flex items-center gap-1.5">
                  📖 Tryb: Lekki, reflowable EPUB z ciężkiego skanu PDF
                </div>
                <p>
                  Serwer wyczyści tekst, usunie artefakty skanowania, scali poszarpane akapity i wygeneruje lekki plik EPUB. Na czytniku Kindle będziesz mógł dowolnie powiększać czcionkę, zmieniać marginesy i czytać bez zawieszania urządzenia.
                </p>
              </div>
            )}

            {conversionMode === 'comic_cbz' && (
              <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-600 space-y-1">
                <div className="font-semibold text-stone-800 flex items-center gap-1.5">
                  🎨 Tryb: Archiwum komiksowe CBZ zoptymalizowane pod e-ink
                </div>
                <p>
                  Serwer wyodrębni wszystkie strony/kadry ze skanu PDF, uporządkuje je i spakuje do standardu CBZ z plikiem ComicInfo. KOReader otwiera pliki CBZ natychmiastowo, dając dostęp do trybu mangi, kadrowania marginesów i filtrów kontrastu e-ink.
                </p>
              </div>
            )}

            {errorMsg && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={!selectedFile || isUploading}
              className={`w-full py-3 px-4 rounded-xl font-medium text-sm text-white flex items-center justify-center gap-2 transition ${
                !selectedFile || isUploading
                  ? 'bg-stone-300 cursor-not-allowed'
                  : 'bg-stone-900 hover:bg-stone-800 active:scale-[0.99] shadow-sm'
              }`}
            >
              {isUploading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Wysyłanie i uruchamianie zadania...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>
                    {conversionMode === 'comic_cbz'
                      ? 'Konwertuj na komiks CBZ'
                      : conversionMode === 'epub_clean'
                      ? 'Konwertuj na lekki EPUB'
                      : 'Rozpocznij tłumaczenie i budowę EPUB'}
                  </span>
                  <ArrowRight className="w-4 h-4 ml-1" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Side Card: Direct Kindle Usage Tips */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-stone-100/70 border border-stone-200 rounded-2xl p-5">
            <h3 className="text-sm font-bold text-stone-900 mb-2">
              Sposób 1: Bezpośrednio z Kindle 10
            </h3>
            <ol className="text-xs text-stone-600 space-y-2 list-decimal list-inside leading-relaxed">
              <li>
                Pobierasz książkę (np. PDF z Z-Library) na czytnik.
              </li>
              <li>
                W KOReaderze <strong>przytrzymujesz palec</strong> na pliku.
              </li>
              <li>
                Wybierasz z menu: <span className="font-semibold text-stone-800">„AI: Przetłumacz na polski”</span>.
              </li>
              <li>
                Wtyczka wysyła plik do tej chmury przez Wi-Fi i od razu zwalnia pamięć RAM czytnika.
              </li>
              <li>
                Gdy wrócisz za chwilę, klikasz <span className="font-semibold text-stone-800">„Pobierz gotowy EPUB”</span>.
              </li>
            </ol>
          </div>

          <div className="bg-white border border-stone-200 rounded-2xl p-5">
            <h3 className="text-sm font-bold text-stone-900 mb-2">
              Sposób 2: Z telefonu lub komputera
            </h3>
            <p className="text-xs text-stone-600 leading-relaxed">
              Możesz też upuścić plik w formularzu obok. Po ukończeniu zadania, Kindle z wtyczką sam pobierze gotowy plik, lub możesz zeskanować kod QR na ekranie.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
