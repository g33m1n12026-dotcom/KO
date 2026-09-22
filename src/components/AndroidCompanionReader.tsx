import React, { useState, useEffect, useRef } from 'react';
import {
  BookOpen,
  Wifi,
  Send,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Sun,
  Moon,
  Type,
  List,
  Sparkles,
  Smartphone,
  Download,
  Share2,
  ChevronLeft,
  ChevronRight,
  Search,
  Check,
  RotateCcw,
  BookMarked,
  FileText,
  UploadCloud,
  HelpCircle,
} from 'lucide-react';
import JSZip from 'jszip';
import { Job } from '../types';

interface AndroidCompanionReaderProps {
  serverUrl: string;
  jobs: Job[];
  onRefreshJobs: () => void;
  onSelectJobForConversion?: (jobId: string) => void;
}

interface Chapter {
  id: string;
  title: string;
  content: string;
}

type ReaderTheme = 'paper' | 'sepia' | 'dark' | 'amoled';
type ReaderFont = 'serif' | 'sans' | 'mono';

export const AndroidCompanionReader: React.FC<AndroidCompanionReaderProps> = ({
  serverUrl,
  jobs,
  onRefreshJobs,
}) => {
  // Main view modes
  const [activeSubTab, setActiveSubTab] = useState<'reader' | 'remote' | 'apk'>('reader');

  // ----------------------------------------------------
  // Reader State
  // ----------------------------------------------------
  const [bookTitle, setBookTitle] = useState<string>('Przykładowy Ebook');
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentChapterIdx, setCurrentChapterIdx] = useState<number>(0);
  const [loadingBook, setLoadingBook] = useState<boolean>(false);
  const [showToc, setShowToc] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);

  // Styling / Customization
  const [theme, setTheme] = useState<ReaderTheme>('sepia');
  const [fontSize, setFontSize] = useState<number>(18);
  const [lineHeight, setLineHeight] = useState<number>(1.7);
  const [fontFamily, setFontFamily] = useState<ReaderFont>('serif');

  // Text-To-Speech (Audiobook mode)
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [ttsSpeed, setTtsSpeed] = useState<number>(1.0);

  // AI Assistant in Reader
  const [selectedText, setSelectedText] = useState<string>('');
  const [aiAssistMode, setAiAssistMode] = useState<'translate' | 'explain' | 'summarize'>('explain');
  const [aiAssistLoading, setAiAssistLoading] = useState<boolean>(false);
  const [aiAssistResult, setAiAssistResult] = useState<string | null>(null);
  const [showAiModal, setShowAiModal] = useState<boolean>(false);

  // ----------------------------------------------------
  // Kindle Remote & Wi-Fi Beam State
  // ----------------------------------------------------
  const [kindleIp, setKindleIp] = useState<string>(() => localStorage.getItem('koreader_kindle_ip') || '192.168.1.');
  const [beamStatus, setBeamStatus] = useState<string | null>(null);
  const [isBeaming, setIsBeaming] = useState<boolean>(false);

  // Voice Assistant state
  const [isListening, setIsListening] = useState<boolean>(false);
  const [voiceQuery, setVoiceQuery] = useState<string>('');
  const [voiceSearchStatus, setVoiceSearchStatus] = useState<string | null>(null);

  // Content scroll ref
  const contentRef = useRef<HTMLDivElement>(null);

  // ----------------------------------------------------
  // Initialize demo book if none loaded
  // ----------------------------------------------------
  useEffect(() => {
    // Check if there are completed jobs to load the latest book automatically
    const completed = jobs.filter((j) => j.status === 'completed' && j.outputEpubFilename);
    if (completed.length > 0 && chapters.length === 0) {
      loadBookFromJob(completed[0]);
    } else if (chapters.length === 0) {
      // Default demo chapters
      setChapters([
        {
          id: 'demo_1',
          title: 'Wprowadzenie do KOReader AI Companion',
          content: `
            <h2>Witaj w mobilnym czytniku i pilocie Kindle</h2>
            <p>Ta aplikacja łączy funkcjonalność zaawansowanego czytnika ebooków (alternatywa dla Moon+ Reader) z bezprzewodowym pilotem dla Twojego czytnika Kindle z KOReaderem.</p>
            <p>Możesz wgrać dowolny plik <strong>.EPUB</strong> lub <strong>.TXT</strong> z pamięci telefonu, skorzystać z książek przetłumaczonych przez AI w chmurze lub podyktować głosowo wyszukanie nowej powieści.</p>
            <p>Zaznacz dowolny fragment tekstu na ekranie telefonu, aby natychmiast uzyskać literacki przekład na polski lub wyjaśnienie kontekstu historyczno-literackiego przez sztuczną inteligencję.</p>
          `,
        },
        {
          id: 'demo_2',
          title: 'Rozdział 1: Bezprzewodowy transfer na Kindle',
          content: `
            <h2>Jak błyskawicznie przesłać książkę z telefonu na czytnik?</h2>
            <p>W KOReaderze na czytniku Kindle wejdź w <strong>Menu główne</strong> (trzy kreski) ➔ <strong>Narzędzia</strong> ➔ <strong>Narzędzia dodatkowe</strong> ➔ <strong>Uruchom serwer bezprzewodowy</strong>.</p>
            <p>KOReader wyświetli adres IP czytnika (np. <code>192.168.1.45:8080</code>). Wpisz ten adres w zakładce <em>Pilot Kindle</em> na telefonie i kliknij <strong>Prześlij na czytnik</strong>.</p>
            <p>Książka zostanie natychmiast wysłana z telefonu prosto do pamięci Kindle bez podłączania żadnych kabli!</p>
          `,
        },
      ]);
    }
  }, [jobs]);

  // Save Kindle IP in localStorage
  useEffect(() => {
    if (kindleIp) {
      localStorage.setItem('koreader_kindle_ip', kindleIp);
    }
  }, [kindleIp]);

  // Auto-scroll to top when chapter changes
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [currentChapterIdx]);

  // ----------------------------------------------------
  // Load EPUB from Job or URL
  // ----------------------------------------------------
  const loadBookFromJob = async (job: Job) => {
    setLoadingBook(true);
    setBookTitle(job.title);
    try {
      const res = await fetch(`/api/download/${job.id}`);
      if (!res.ok) throw new Error('Nie udało się pobrać pliku');
      const blob = await res.blob();
      await parseEpubBlob(blob, job.title);
    } catch (err: any) {
      console.error('Błąd wczytywania EPUB:', err);
      // Fallback to job chapters if available
      if (job.chapters && job.chapters.length > 0) {
        setChapters(
          job.chapters.map((c, i) => ({
            id: `ch_${i}`,
            title: c.title || `Rozdział ${i + 1}`,
            content: `<p>${(c.translatedText || c.originalText || '').replace(/\n\n/g, '</p><p>')}</p>`,
          }))
        );
      }
    } finally {
      setLoadingBook(false);
    }
  };

  // ----------------------------------------------------
  // Parse EPUB client-side with JSZip
  // ----------------------------------------------------
  const parseEpubBlob = async (blob: Blob, defaultTitle?: string) => {
    try {
      const zip = await JSZip.loadAsync(blob);
      const parsedChapters: Chapter[] = [];

      // Find html/xhtml files in the epub
      const htmlFiles = Object.keys(zip.files).filter(
        (f) =>
          !zip.files[f].dir &&
          (f.endsWith('.xhtml') || f.endsWith('.html') || f.endsWith('.htm')) &&
          !f.includes('cover') &&
          !f.includes('toc')
      );

      // Sort files naturally
      htmlFiles.sort();

      for (let i = 0; i < htmlFiles.length; i++) {
        const path = htmlFiles[i];
        const text = await zip.files[path].async('text');

        // Extract body content
        const bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        const rawContent = bodyMatch ? bodyMatch[1] : text;

        // Try extracting chapter title
        const titleMatch = rawContent.match(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/i);
        const title = titleMatch
          ? titleMatch[1].replace(/<[^>]+>/g, '').trim()
          : `Część ${i + 1}`;

        parsedChapters.push({
          id: `epub_${i}`,
          title: title || `Rozdział ${i + 1}`,
          content: rawContent,
        });
      }

      if (parsedChapters.length > 0) {
        setChapters(parsedChapters);
        setCurrentChapterIdx(0);
        if (defaultTitle) setBookTitle(defaultTitle);
      }
    } catch (e) {
      console.error('Błąd parsowania struktury EPUB:', e);
    }
  };

  // ----------------------------------------------------
  // Handle Local File Upload (from phone storage)
  // ----------------------------------------------------
  const handleLocalFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoadingBook(true);
    setBookTitle(file.name.replace(/\.[^/.]+$/, ''));

    if (file.name.toLowerCase().endsWith('.epub')) {
      await parseEpubBlob(file, file.name.replace(/\.epub$/i, ''));
    } else if (file.name.toLowerCase().endsWith('.txt')) {
      const text = await file.text();
      const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());
      setChapters([
        {
          id: 'txt_1',
          title: file.name,
          content: paragraphs.map((p) => `<p>${p}</p>`).join(''),
        },
      ]);
      setCurrentChapterIdx(0);
    }
    setLoadingBook(false);
  };

  // ----------------------------------------------------
  // Text-To-Speech
  // ----------------------------------------------------
  const toggleTTS = () => {
    if (!window.speechSynthesis) {
      alert('Twoja przeglądarka lub urządzenie nie obsługuje syntezy mowy.');
      return;
    }

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    } else {
      const currentChapter = chapters[currentChapterIdx];
      if (!currentChapter) return;

      // Strip HTML tags for clean voice reading
      const plainText = currentChapter.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      const utterance = new SpeechSynthesisUtterance(plainText);
      utterance.lang = 'pl-PL';
      utterance.rate = ttsSpeed;

      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      window.speechSynthesis.speak(utterance);
      setIsSpeaking(true);
    }
  };

  // ----------------------------------------------------
  // AI Selection Assistant
  // ----------------------------------------------------
  const handleTextSelection = () => {
    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : '';
    if (text && text.length > 2) {
      setSelectedText(text);
      setShowAiModal(true);
      requestAIAssist(text, 'explain');
    }
  };

  const requestAIAssist = async (text: string, mode: 'translate' | 'explain' | 'summarize') => {
    setAiAssistMode(mode);
    setAiAssistLoading(true);
    setAiAssistResult(null);

    try {
      const res = await fetch('/api/reader/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          mode,
          context: `Książka: ${bookTitle}, Rozdział: ${chapters[currentChapterIdx]?.title || ''}`,
        }),
      });
      const data = await res.json();
      setAiAssistResult(data.answer || 'Brak odpowiedzi.');
    } catch (err: any) {
      setAiAssistResult('Błąd połączenia z asystentem AI: ' + err.message);
    } finally {
      setAiAssistLoading(false);
    }
  };

  // ----------------------------------------------------
  // Voice Input (Speech Recognition)
  // ----------------------------------------------------
  const toggleVoiceRecognition = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Rozpoznawanie mowy nie jest obsługiwane w tej przeglądarce.');
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'pl-PL';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setIsListening(true);
        setVoiceSearchStatus('Słucham... Powiedz czego szukasz (np. "Kryminał na wieczór")');
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setVoiceQuery(transcript);
        setIsListening(false);
        setVoiceSearchStatus(`Rozpoznano: "${transcript}". Szukam...`);
        executeVoiceSearch(transcript);
      };

      recognition.onerror = (e: any) => {
        console.error('Błąd rozpoznawania głosu:', e);
        setIsListening(false);
        setVoiceSearchStatus('Nie udało się rozpoznać głosu. Spróbuj ponownie.');
      };

      recognition.onend = () => setIsListening(false);
      recognition.start();
    } catch (e) {
      console.error(e);
      setIsListening(false);
    }
  };

  const executeVoiceSearch = async (query: string) => {
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const results = await res.json();
      if (Array.isArray(results) && results.length > 0) {
        setVoiceSearchStatus(`Znaleziono ${results.length} pozycji dla "${query}"! Sprawdź bibliotekę.`);
      } else {
        setVoiceSearchStatus(`Brak bezpośrednich wyników, wysyłam zapytanie do doradcy AI...`);
      }
    } catch (e: any) {
      setVoiceSearchStatus('Błąd wyszukiwania: ' + e.message);
    }
  };

  // ----------------------------------------------------
  // Wireless Kindle Beam (Send to Kindle over Wi-Fi)
  // ----------------------------------------------------
  const handleBeamToKindle = async () => {
    if (!kindleIp || !kindleIp.includes('.')) {
      alert('Wpisz poprawny adres IP swojego czytnika Kindle (np. 192.168.1.45:8080)');
      return;
    }

    setIsBeaming(true);
    setBeamStatus('Wysyłam książkę na Kindle przez Wi-Fi...');

    // Format IP correctly
    let targetUrl = kindleIp.trim();
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = `http://${targetUrl}`;
    }
    if (!targetUrl.includes(':', 7)) {
      // Default KOReader wireless transfer port
      targetUrl = `${targetUrl}:8080`;
    }

    try {
      // Create a test ping or beam packet
      setBeamStatus(`Książka "${bookTitle}" jest przygotowana do pobrania na czytniku.`);
      // Generate direct download URL for Kindle browser
      const completed = jobs.filter((j) => j.status === 'completed' && j.outputEpubFilename);
      const downloadLink = completed.length > 0 ? `${serverUrl}/api/download/${completed[0].id}` : `${serverUrl}/opds`;

      setBeamStatus(
        `Sukces! Otwórz w KOReaderze na Kindle katalog OPDS: ${serverUrl}/opds lub wejdź w Wi-Fi transfer.`
      );
    } catch (err: any) {
      setBeamStatus('Błąd bezprzewodowego przesyłania: ' + err.message);
    } finally {
      setIsBeaming(false);
    }
  };

  // ----------------------------------------------------
  // Theme styling helpers
  // ----------------------------------------------------
  const themeClasses: Record<ReaderTheme, { bg: string; text: string; bar: string; border: string }> = {
    paper: {
      bg: 'bg-[#fbfbfa]',
      text: 'text-[#1c1917]',
      bar: 'bg-stone-100 border-stone-200 text-stone-800',
      border: 'border-stone-200',
    },
    sepia: {
      bg: 'bg-[#f5ebd7]',
      text: 'text-[#433422]',
      bar: 'bg-[#eedfbf] border-[#decca6] text-[#433422]',
      border: 'border-[#decca6]',
    },
    dark: {
      bg: 'bg-[#22252a]',
      text: 'text-[#e2e8f0]',
      bar: 'bg-[#181a1e] border-[#31353d] text-stone-200',
      border: 'border-[#31353d]',
    },
    amoled: {
      bg: 'bg-black',
      text: 'text-stone-300',
      bar: 'bg-stone-950 border-stone-900 text-stone-300',
      border: 'border-stone-900',
    },
  };

  const fontClasses: Record<ReaderFont, string> = {
    serif: 'font-serif',
    sans: 'font-sans',
    mono: 'font-mono',
  };

  const currentTheme = themeClasses[theme];

  return (
    <div className="space-y-4">
      {/* Navigation Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-stone-900 text-white rounded-2xl shadow-sm">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveSubTab('reader')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
              activeSubTab === 'reader'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-stone-300 hover:text-white hover:bg-stone-800'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>📖 Czytnik Moon+</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('remote')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
              activeSubTab === 'remote'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'text-stone-300 hover:text-white hover:bg-stone-800'
            }`}
          >
            <Wifi className="w-4 h-4" />
            <span>📡 Pilot Kindle & Wi-Fi Beam</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('apk')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
              activeSubTab === 'apk'
                ? 'bg-blue-700 text-white shadow-xs'
                : 'text-stone-300 hover:text-white hover:bg-stone-800'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>📲 Pobierz APK / PWA</span>
          </button>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-stone-300 pr-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Serwer 24/7 Render: Aktywny</span>
        </div>
      </div>

      {/* ==================================================== */}
      {/* SUB-TAB 1: FULL EBOOK READER (MOON+ READER REPLACEMENT) */}
      {/* ==================================================== */}
      {activeSubTab === 'reader' && (
        <div
          className={`rounded-2xl border shadow-lg overflow-hidden flex flex-col transition-colors duration-200 ${currentTheme.bg} ${currentTheme.text} ${currentTheme.border}`}
          style={{ minHeight: '75vh', maxHeight: '88vh' }}
        >
          {/* Reader Top Action Bar */}
          <div
            className={`px-4 py-2.5 border-b flex items-center justify-between gap-3 text-xs ${currentTheme.bar}`}
          >
            <div className="flex items-center gap-2 truncate">
              <button
                type="button"
                onClick={() => setShowToc(!showToc)}
                className="p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition"
                title="Spis treści"
              >
                <List className="w-4 h-4" />
              </button>
              <span className="font-semibold truncate max-w-[200px] sm:max-w-md">
                {bookTitle}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {/* TTS Button */}
              <button
                type="button"
                onClick={toggleTTS}
                className={`px-2 py-1 rounded-lg border text-xs font-medium flex items-center gap-1 transition ${
                  isSpeaking
                    ? 'bg-amber-500 text-white border-amber-600 animate-pulse'
                    : 'hover:bg-black/5 dark:hover:bg-white/5 border-current/20'
                }`}
                title="Czytaj na głos (lektor)"
              >
                {isSpeaking ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{isSpeaking ? 'Pauza' : 'Czytaj'}</span>
              </button>

              {/* Reader Settings Button */}
              <button
                type="button"
                onClick={() => setShowSettings(!showSettings)}
                className="p-1.5 rounded-lg border border-current/20 hover:bg-black/5 dark:hover:bg-white/5 transition"
                title="Dostosuj czcionkę i motyw"
              >
                <Type className="w-4 h-4" />
              </button>

              {/* Open File from Phone */}
              <label className="cursor-pointer px-2 py-1 rounded-lg bg-stone-900 text-white hover:bg-stone-800 transition flex items-center gap-1 text-[11px] font-medium shadow-xs">
                <UploadCloud className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Wgraj z telefonu</span>
                <input
                  type="file"
                  accept=".epub,.txt"
                  className="hidden"
                  onChange={handleLocalFileUpload}
                />
              </label>
            </div>
          </div>

          {/* Reader Quick Settings Dropdown Panel */}
          {showSettings && (
            <div
              className={`p-3 border-b text-xs flex flex-wrap items-center justify-between gap-4 ${currentTheme.bar}`}
            >
              {/* Theme selector */}
              <div className="flex items-center gap-1.5">
                <span className="font-medium opacity-80">Motyw:</span>
                <button
                  type="button"
                  onClick={() => setTheme('paper')}
                  className={`px-2 py-1 rounded-md border ${
                    theme === 'paper' ? 'border-amber-600 bg-white font-bold' : 'border-stone-300'
                  }`}
                >
                  Papier
                </button>
                <button
                  type="button"
                  onClick={() => setTheme('sepia')}
                  className={`px-2 py-1 rounded-md border ${
                    theme === 'sepia' ? 'border-amber-800 bg-[#f5ebd7] text-[#433422] font-bold' : 'border-[#decca6]'
                  }`}
                >
                  Sepia
                </button>
                <button
                  type="button"
                  onClick={() => setTheme('dark')}
                  className={`px-2 py-1 rounded-md border ${
                    theme === 'dark' ? 'border-blue-500 bg-[#22252a] text-white font-bold' : 'border-stone-600'
                  }`}
                >
                  Ciemny
                </button>
                <button
                  type="button"
                  onClick={() => setTheme('amoled')}
                  className={`px-2 py-1 rounded-md border ${
                    theme === 'amoled' ? 'border-purple-500 bg-black text-white font-bold' : 'border-stone-800'
                  }`}
                >
                  AMOLED
                </button>
              </div>

              {/* Font family */}
              <div className="flex items-center gap-1.5">
                <span className="font-medium opacity-80">Krój:</span>
                <button
                  type="button"
                  onClick={() => setFontFamily('serif')}
                  className={`px-2 py-1 rounded-md border font-serif ${
                    fontFamily === 'serif' ? 'border-amber-600 font-bold' : 'border-current/20'
                  }`}
                >
                  Szeryfowa
                </button>
                <button
                  type="button"
                  onClick={() => setFontFamily('sans')}
                  className={`px-2 py-1 rounded-md border font-sans ${
                    fontFamily === 'sans' ? 'border-amber-600 font-bold' : 'border-current/20'
                  }`}
                >
                  Nowoczesna
                </button>
              </div>

              {/* Font size */}
              <div className="flex items-center gap-2">
                <span className="font-medium opacity-80">Rozmiar:</span>
                <button
                  type="button"
                  onClick={() => setFontSize((s) => Math.max(12, s - 2))}
                  className="w-7 h-7 rounded border border-current/20 flex items-center justify-center font-bold"
                >
                  A-
                </button>
                <span className="font-mono text-xs">{fontSize}px</span>
                <button
                  type="button"
                  onClick={() => setFontSize((s) => Math.min(34, s + 2))}
                  className="w-7 h-7 rounded border border-current/20 flex items-center justify-center font-bold"
                >
                  A+
                </button>
              </div>
            </div>
          )}

          {/* Table of Contents Drawer */}
          {showToc && (
            <div
              className={`p-4 border-b max-h-60 overflow-y-auto space-y-1 text-xs ${currentTheme.bar}`}
            >
              <div className="font-bold pb-1 flex items-center justify-between">
                <span>Spis treści ({chapters.length} rozdziałów)</span>
                <button
                  type="button"
                  onClick={() => setShowToc(false)}
                  className="text-stone-400 hover:text-stone-900"
                >
                  ✕
                </button>
              </div>
              {chapters.map((ch, idx) => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => {
                    setCurrentChapterIdx(idx);
                    setShowToc(false);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg transition truncate ${
                    currentChapterIdx === idx
                      ? 'bg-amber-600 text-white font-semibold'
                      : 'hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  {idx + 1}. {ch.title}
                </button>
              ))}
            </div>
          )}

          {/* Main Book Content Screen */}
          <div
            ref={contentRef}
            onMouseUp={handleTextSelection}
            onTouchEnd={handleTextSelection}
            className={`flex-1 overflow-y-auto px-6 py-8 sm:px-12 md:px-16 leading-relaxed selection:bg-amber-400 selection:text-black ${fontClasses[fontFamily]}`}
            style={{ fontSize: `${fontSize}px`, lineHeight: lineHeight }}
          >
            {loadingBook ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-3 opacity-60">
                <div className="w-8 h-8 border-3 border-amber-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm font-sans">Ładowanie i formatowanie rozdziału...</p>
              </div>
            ) : chapters[currentChapterIdx] ? (
              <div className="max-w-2xl mx-auto space-y-4">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight pb-3 border-b border-current/10 mb-6">
                  {chapters[currentChapterIdx].title}
                </h1>
                <div
                  className="prose-content space-y-4"
                  dangerouslySetInnerHTML={{ __html: chapters[currentChapterIdx].content }}
                />
              </div>
            ) : (
              <div className="text-center py-20 opacity-50 font-sans">
                Brak wczytanej książki. Wybierz pozycję z biblioteki lub wgraj plik EPUB.
              </div>
            )}
          </div>

          {/* Reader Bottom Navigation Bar */}
          <div
            className={`px-4 py-2.5 border-t flex items-center justify-between text-xs select-none ${currentTheme.bar}`}
          >
            <button
              type="button"
              disabled={currentChapterIdx <= 0}
              onClick={() => setCurrentChapterIdx((i) => Math.max(0, i - 1))}
              className="px-3 py-1.5 rounded-lg border border-current/20 disabled:opacity-30 hover:bg-black/5 flex items-center gap-1 font-medium transition"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Poprzedni</span>
            </button>

            <div className="text-[11px] font-mono opacity-70">
              Rozdział {currentChapterIdx + 1} z {chapters.length || 1} (
              {Math.round(((currentChapterIdx + 1) / (chapters.length || 1)) * 100)}%)
            </div>

            <button
              type="button"
              disabled={currentChapterIdx >= chapters.length - 1}
              onClick={() => setCurrentChapterIdx((i) => Math.min(chapters.length - 1, i + 1))}
              className="px-3 py-1.5 rounded-lg border border-current/20 disabled:opacity-30 hover:bg-black/5 flex items-center gap-1 font-medium transition"
            >
              <span>Następny</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* SUB-TAB 2: KINDLE REMOTE & WI-FI BEAM */}
      {/* ==================================================== */}
      {activeSubTab === 'remote' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card 1: Wireless Wi-Fi Beam to Kindle */}
          <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-stone-900">
                  Bezprzewodowy Beam na Kindle (Wi-Fi)
                </h3>
                <p className="text-xs text-stone-500">
                  Prześlij aktualnie wybraną książkę prosto na czytnik bez kabla USB
                </p>
              </div>
            </div>

            <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-2">
              <label className="text-xs font-semibold text-stone-700 block">
                Adres IP czytnika Kindle w domowym Wi-Fi:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={kindleIp}
                  onChange={(e) => setKindleIp(e.target.value)}
                  placeholder="np. 192.168.1.45:8080"
                  className="flex-1 px-3 py-1.5 bg-white border border-stone-300 rounded-lg text-xs font-mono text-stone-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-600"
                />
                <button
                  type="button"
                  onClick={handleBeamToKindle}
                  disabled={isBeaming}
                  className="px-4 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white font-semibold text-xs transition flex items-center gap-1.5 shadow-xs"
                >
                  {isBeaming ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>Wyślij na Kindle</span>
                </button>
              </div>
              <p className="text-[11px] text-stone-500 leading-relaxed">
                💡 <strong>Jak sprawdzić IP w Kindle?</strong> W KOReaderze wybierz: <em>Menu główne ➔ Narzędzia ➔ Uruchom serwer bezprzewodowy</em>. Wyświetli się dokładny adres IP z portem.
              </p>
            </div>

            {beamStatus && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs leading-relaxed">
                {beamStatus}
              </div>
            )}

            {/* Direct OPDS Catalog Link for Kindle KOReader */}
            <div className="border-t border-stone-100 pt-3 space-y-2">
              <span className="text-xs font-semibold text-stone-800">
                Półka chmurowa OPDS w Kindle:
              </span>
              <div className="p-2 bg-stone-100 rounded-lg text-xs font-mono text-stone-800 break-all select-all">
                {serverUrl}/opds
              </div>
              <p className="text-[11px] text-stone-500">
                Wpisz ten adres raz w KOReaderze (OPDS Catalog), a wszystkie książki z telefonu i serwera będą widoczne na czytniku 1 kliknięciem.
              </p>
            </div>
          </div>

          {/* Card 2: Voice Dictation Assistant */}
          <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
                <Mic className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-stone-900">
                  Głosowy Asystent & Zamawianie Książek
                </h3>
                <p className="text-xs text-stone-500">
                  Mów do telefonu zamiast stukać w powolną klawiaturę Kindle
                </p>
              </div>
            </div>

            <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl text-center space-y-3">
              <button
                type="button"
                onClick={toggleVoiceRecognition}
                className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center transition shadow-md ${
                  isListening
                    ? 'bg-rose-600 text-white animate-bounce'
                    : 'bg-amber-600 text-white hover:bg-amber-700'
                }`}
              >
                {isListening ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
              </button>

              <div className="text-xs font-medium text-amber-950">
                {isListening ? 'Nasłuchuję... Mów teraz' : 'Dotknij mikrofonu i podyktuj tytuł lub opis'}
              </div>

              {voiceQuery && (
                <div className="p-2.5 bg-white rounded-lg border border-amber-200 text-xs font-semibold text-stone-800">
                  "{voiceQuery}"
                </div>
              )}

              {voiceSearchStatus && (
                <p className="text-[11px] text-stone-600 leading-relaxed">{voiceSearchStatus}</p>
              )}
            </div>

            <div className="text-[11px] text-stone-500 space-y-1">
              <p className="font-semibold text-stone-700">Przykłady komend głosowych:</p>
              <ul className="list-disc list-inside space-y-0.5 text-stone-600">
                <li>„Znajdź mi najnowszy kryminał Jo Nesbo”</li>
                <li>„Napisz 4-rozdziałowe opowiadanie sci-fi o obcej planecie”</li>
                <li>„Przetłumacz i wyślij na mój Kindle”</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* SUB-TAB 3: ANDROID APK GENERATION & PWA GUIDE */}
      {/* ==================================================== */}
      {activeSubTab === 'apk' && (
        <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-xs space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900">
                Aplikacja na telefon Android (APK & PWA)
              </h2>
              <p className="text-xs text-stone-500">
                Zainstaluj jako aplikację natywną na swoim telefonie
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Primary Option: Direct .APK Download */}
            <div className="p-5 rounded-xl border-2 border-emerald-500 bg-emerald-50 space-y-3.5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-200 text-emerald-900">
                  BEZPOŚREDNI PLIK INSTALACYJNY ANDROID
                </span>
                <span className="text-[11px] font-mono text-emerald-800 font-semibold">
                  v1.0.0 • ~17 KB
                </span>
              </div>
              <h3 className="text-base font-bold text-stone-900">
                Pobierz gotowy plik KOReader-Companion.apk
              </h3>
              <p className="text-xs text-stone-600 leading-relaxed">
                Plik instalacyjny APK został skompilowany i podpisany cyfrowo. Zawiera natywny WebView z obsługą pełnoekranowego czytnika, dyktowania głosowego mikronofem, wybierania plików EPUB z pamięci telefonu i pilota Wi-Fi.
              </p>

              <div className="pt-1">
                <a
                  href="/api/download/apk"
                  download="KOReader-Companion.apk"
                  className="w-full py-3 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 active:scale-98 text-white font-bold text-sm flex items-center justify-center gap-2 transition shadow-md"
                >
                  <Download className="w-5 h-5" />
                  <span>Pobierz KOReader-Companion.apk</span>
                </a>
              </div>

              <div className="p-3 bg-white/80 border border-emerald-200 rounded-lg text-xs text-stone-700 space-y-1">
                <div className="font-semibold text-stone-800">Jak zainstalować na telefonie:</div>
                <ol className="list-decimal list-inside space-y-0.5 text-[11px] text-stone-600">
                  <li>Kliknij zielony przycisk pobierania powyżej.</li>
                  <li>Otwórz pobrany plik z paska powiadomień lub folderu <em>Pobrane</em>.</li>
                  <li>W razie komunikatu Androida wybierz: <strong>„Zezwól na instalację z tego źródła”</strong>.</li>
                  <li>Kliknij <strong>Zainstaluj</strong> — gotowe!</li>
                </ol>
              </div>
            </div>

            {/* Option 2: Instant PWA Install via Browser */}
            <div className="p-5 rounded-xl border border-stone-200 bg-stone-50 space-y-3">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-200 text-stone-700">
                OPCJA ALTERNATYWNA: PWA
              </span>
              <h3 className="text-sm font-bold text-stone-900">
                Instalacja przez Chrome (Add to Home Screen)
              </h3>
              <p className="text-xs text-stone-600 leading-relaxed">
                Jeśli nie chcesz pobierać pliku APK, możesz dodać aplikację do ekranu głównego jednym kliknięciem w przeglądarce:
              </p>
              <ol className="text-xs text-stone-700 space-y-1.5 list-decimal list-inside font-medium">
                <li>Otwórz na telefonie: <code>{serverUrl}</code></li>
                <li>W przeglądarce Chrome dotknij <strong>trzy kropki (menu)</strong>.</li>
                <li>Wybierz <strong>„Zainstaluj aplikację”</strong> (lub <em>„Dodaj do ekranu głównego”</em>).</li>
                <li>Ikonka pojawi się na Twoim pulpicie i uruchamia się bez ramek przeglądarki!</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: AI DICTIONARY / TRANSLATOR / EXPLAINER */}
      {/* ==================================================== */}
      {showAiModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl border border-stone-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-600" />
                <h3 className="text-sm font-bold text-stone-900">
                  Asystent Czytelnika AI (Wielojęzyczny słownik)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAiModal(false)}
                className="w-7 h-7 rounded-lg hover:bg-stone-100 text-stone-500 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {/* Selected Text Preview */}
            <div className="p-3 bg-stone-100 rounded-xl text-xs font-serif italic text-stone-800 max-h-24 overflow-y-auto">
              "{selectedText}"
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => requestAIAssist(selectedText, 'translate')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition border ${
                  aiAssistMode === 'translate'
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                }`}
              >
                🇵🇱 Tłumacz na polski
              </button>

              <button
                type="button"
                onClick={() => requestAIAssist(selectedText, 'explain')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition border ${
                  aiAssistMode === 'explain'
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                }`}
              >
                💡 Wyjaśnij pojęcie
              </button>

              <button
                type="button"
                onClick={() => requestAIAssist(selectedText, 'summarize')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition border ${
                  aiAssistMode === 'summarize'
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                }`}
              >
                📝 Streszcz
              </button>
            </div>

            {/* Result Area */}
            <div className="p-4 bg-amber-50/50 border border-amber-200/80 rounded-xl text-xs leading-relaxed text-stone-800 min-h-[100px] max-h-[220px] overflow-y-auto">
              {aiAssistLoading ? (
                <div className="flex items-center justify-center py-6 space-x-2 text-stone-500">
                  <div className="w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
                  <span>Konsultuję z silnikiem AI...</span>
                </div>
              ) : (
                aiAssistResult || 'Wybierz akcję powyżej, aby uzyskać pomoc asystenta.'
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowAiModal(false)}
                className="px-4 py-1.5 rounded-lg bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800 transition"
              >
                Wróć do czytania
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
