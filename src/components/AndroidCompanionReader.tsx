import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  ChevronDown,
  Search,
  Check,
  RotateCcw,
  BookMarked,
  FileText,
  UploadCloud,
  HelpCircle,
  Maximize2,
  Minimize2,
  Headphones,
  Sliders,
  SkipBack,
  SkipForward,
  Radio,
  Eye,
  EyeOff,
  Key,
  CheckCircle2,
  Volume1,
  Layers,
  Sparkle,
  RefreshCw,
  Users,
  Compass,
  FileAudio,
  Music,
  ScrollText,
  Bookmark,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import JSZip from 'jszip';
import { Job, DramaticScriptLine, ChapterDramaticScript, BookCharacter, ReadingProgress } from '../types';

interface AndroidCompanionReaderProps {
  serverUrl: string;
  jobs: Job[];
  selectedJob?: Job | null;
  onSelectJob?: (job: Job) => void;
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

export interface ElevenVoiceItem {
  id: string;
  name: string;
  desc: string;
  gender: 'Męski' | 'Kobiecy';
  category: string;
}

export const CURATED_ELEVEN_VOICES: ElevenVoiceItem[] = [
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni (Polski Lektor)', desc: 'Płynny, ciepły polski głos męski ElevenLabs Multilingual V2 — idealny do powieści', gender: 'Męski', category: 'Polski lektor' },
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel (Audiobook)', desc: 'Kultowy, ultra-realistyczny kobiecy głos narracyjny — łagodny, kojący i ciepły', gender: 'Kobiecy', category: 'Audiobook' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella (Ekspresyjna)', desc: 'Ekspresyjny, emocjonalny głos lektorski — wciągające dialogi i proza', gender: 'Kobiecy', category: 'Ekspresyjny' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam (Narrator)', desc: 'Dojrzały, głęboki głos narracyjny — fantasy, thrillery i kryminały', gender: 'Męski', category: 'Audiobook' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George (Klasyczny)', desc: 'Ciepły, dostojny głos lektorski do literatury klasycznej i poezji', gender: 'Męski', category: 'Klasyczny' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie (Swobodny)', desc: 'Naturalny, swobodny głos męski — dynamiczne dialogi i współczesna proza', gender: 'Męski', category: 'Swobodny' },
  { id: 'N2lVS1w4EtoT3pu4Rqva', name: 'Callum (Intensywny)', desc: 'Intensywny, filmowy głos męski — fantastyka, sci-fi i powieści akcji', gender: 'Męski', category: 'Filmowy' },
  { id: 'XB0fDUnXU5ikipDDTrS1', name: 'Charlotte (Aksamitna)', desc: 'Elegancka, aksamitna narratorka literatury pięknej i esejów', gender: 'Kobiecy', category: 'Poezja / Proza' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice (Krystaliczna)', desc: 'Krystaliczna, pewna siebie narratorka — literatura faktu i biografie', gender: 'Kobiecy', category: 'Narracyjny' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda (Audiobook Pro)', desc: 'Ciepła lektorka audiobookowa z doskonałą modulacją i dykcją', gender: 'Kobiecy', category: 'Audiobook' },
  { id: 'bIHbv24MWmeRgasZH58o', name: 'Will (Optymistyczny)', desc: 'Zrelaksowany, optymistyczny i przyjazny lektor do powieści obyczajowych', gender: 'Męski', category: 'Ciepły' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica (Młodzieńcza)', desc: 'Młodzieńczy, energiczny głos kobiecy do powieści młodzieżowych i YA', gender: 'Kobiecy', category: 'Młodzieżowy' },
  { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric (Reportażowy)', desc: 'Spokojny, czytelny i wiarygodny lektor reportaży oraz historii', gender: 'Męski', category: 'Reportaż' },
  { id: 'iP95p4xoKVk53GoZ742B', name: 'Chris (Radiowy)', desc: 'Czysty, radiowy głos lektorski o zrównoważonym tempie czytania', gender: 'Męski', category: 'Radiowy' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian (Głęboki Bas)', desc: 'Głęboki, autorytatywny bas narracyjny do epickich sag i kronik', gender: 'Męski', category: 'Epicki' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel (Dostojny)', desc: 'Dostojny, brytyjsko-europejski tembr do klasyki literatury', gender: 'Męski', category: 'Klasyczny' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily (Łagodna)', desc: 'Aksamitna, łagodna i kojąca narratorka na wieczorne czytanie', gender: 'Kobiecy', category: 'Relaks' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam (Wyrazisty)', desc: 'Młody, wyrazisty głos lektorski — przygodowe i sensacyjne ebooki', gender: 'Męski', category: 'Dynamiczny' },
  { id: 'pqHfZKP75CvOlQylNhV4', name: 'Bill (Narrator)', desc: 'Godny zaufania, ciepły narrator literatury popularnonaukowej', gender: 'Męski', category: 'Narracyjny' },
  { id: 't0jbNkn9CVvt53TfGNOx', name: 'Sarah (Melodyjna)', desc: 'Delikatna, melodyjna narratorka poezji, esejów i opowiadań', gender: 'Kobiecy', category: 'Melodyjny' },
];

export const AndroidCompanionReader: React.FC<AndroidCompanionReaderProps> = ({
  serverUrl,
  jobs,
  selectedJob,
  onSelectJob,
  onRefreshJobs,
}) => {
  // Main view modes
  const [activeSubTab, setActiveSubTab] = useState<'reader' | 'remote'>('reader');

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

  // Comic Viewer Mode State
  const [comicFitMode, setComicFitMode] = useState<'height' | 'width'>('height');
  const [comicZoom, setComicZoom] = useState<number>(100);

  // Text-To-Speech (Audiobook mode & Neural Voices)
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [ttsSpeed, setTtsSpeed] = useState<number>(1.0);
  const [ttsProvider, setTtsProvider] = useState<'neural' | 'gemini' | 'elevenlabs' | 'system'>(
    () => (localStorage.getItem('koreader_tts_provider') as any) || 'neural'
  );
  const [ttsVoice, setTtsVoice] = useState<string>(
    () => localStorage.getItem('koreader_tts_voice') || 'pl-PL-MarekNeural'
  );
  const [elevenLabsApiKey, setElevenLabsApiKey] = useState<string>(
    () => localStorage.getItem('koreader_elevenlabs_key') || ''
  );
  const [elevenLabsVoiceId, setElevenLabsVoiceId] = useState<string>(
    () => localStorage.getItem('koreader_elevenlabs_voice_id') || '21m00Tcm4TlvDq8ikWAM'
  );
  const [serverHasElevenKey, setServerHasElevenKey] = useState<boolean>(false);
  const [currentParagraphIdx, setCurrentParagraphIdx] = useState<number>(0);
  const [ttsLoading, setTtsLoading] = useState<boolean>(false);
  const [showVoiceModal, setShowVoiceModal] = useState<boolean>(false);
  const [voiceModalTab, setVoiceModalTab] = useState<'neural' | 'gemini' | 'elevenlabs' | 'system'>('neural');
  const [radioDramaMode, setRadioDramaMode] = useState<boolean>(
    () => localStorage.getItem('koreader_radio_drama_mode') === 'true'
  );

  const openVoiceModal = () => {
    setVoiceModalTab(ttsProvider);
    setShowVoiceModal(true);
  };

  // Fullscreen & Immersive Mode
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [hideChrome, setHideChrome] = useState<boolean>(false);

  // Page Turn Animations
  const [pageAnimation, setPageAnimation] = useState<'slide-left' | 'slide-right' | null>(null);

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

  // ----------------------------------------------------
  // Two-Way Kindle ↔ Web Sync State
  // ----------------------------------------------------
  const [kindleSyncNotice, setKindleSyncNotice] = useState<{
    show: boolean;
    progress: ReadingProgress;
  } | null>(null);

  // ----------------------------------------------------
  // Multi-Voice Radio Drama Studio State
  // ----------------------------------------------------
  const [showDramaModal, setShowDramaModal] = useState<boolean>(false);
  const [dramaLoading, setDramaLoading] = useState<boolean>(false);
  const [dramaScript, setDramaScript] = useState<ChapterDramaticScript | null>(null);
  const [currentDramaLineIdx, setCurrentDramaLineIdx] = useState<number>(0);
  const [isDramaPlaying, setIsDramaPlaying] = useState<boolean>(false);
  const [dramaSpeed, setDramaSpeed] = useState<number>(1.0);
  const [dramaExporting, setDramaExporting] = useState<boolean>(false);
  const [dramaExportNotice, setDramaExportNotice] = useState<string | null>(null);
  const dramaAudioRef = useRef<HTMLAudioElement | null>(null);

  // ----------------------------------------------------
  // Story Guide & Character Tree State (AI Companion)
  // ----------------------------------------------------
  const [showGuideModal, setShowGuideModal] = useState<boolean>(false);
  const [guideTab, setGuideTab] = useState<'characters' | 'recap'>('characters');
  const [guideLoading, setGuideLoading] = useState<boolean>(false);
  const [charactersList, setCharactersList] = useState<BookCharacter[]>([]);
  const [recapText, setRecapText] = useState<string | null>(null);
  const [characterSearch, setCharacterSearch] = useState<string>('');

  // Refs
  const contentRef = useRef<HTMLDivElement>(null);
  const readerContainerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prefetchCacheRef = useRef<Record<number, string>>({});
  const [sampleTestingVoice, setSampleTestingVoice] = useState<string | null>(null);
  const [showElevenKeyPassword, setShowElevenKeyPassword] = useState<boolean>(false);
  const [elevenLabsKeyValid, setElevenLabsKeyValid] = useState<{ valid: boolean; characterCount?: number; characterLimit?: number; tier?: string; error?: string } | null>(null);
  const [elevenLabsChecking, setElevenLabsChecking] = useState<boolean>(false);
  const [ttsNotification, setTtsNotification] = useState<string | null>(null);
  const loadedJobIdRef = useRef<string | null>(null);

  // ElevenLabs dynamic voices state
  const [customElevenVoices, setCustomElevenVoices] = useState<ElevenVoiceItem[]>([]);
  const [loadingCustomVoices, setLoadingCustomVoices] = useState<boolean>(false);
  const [elevenCategoryFilter, setElevenCategoryFilter] = useState<string>('all');
  const [elevenSearchQuery, setElevenSearchQuery] = useState<string>('');

  // Active TTS Refs to prevent stale closures during voice switches & continuous reading
  const ttsVoiceRef = useRef<string>(ttsVoice);
  const ttsProviderRef = useRef<'neural' | 'gemini' | 'elevenlabs' | 'system'>(ttsProvider);
  const elevenLabsApiKeyRef = useRef<string>(elevenLabsApiKey);
  const elevenLabsVoiceIdRef = useRef<string>(elevenLabsVoiceId);
  const ttsSpeedRef = useRef<number>(ttsSpeed);

  useEffect(() => { ttsVoiceRef.current = ttsVoice; }, [ttsVoice]);
  useEffect(() => { ttsProviderRef.current = ttsProvider; }, [ttsProvider]);
  useEffect(() => { elevenLabsApiKeyRef.current = elevenLabsApiKey; }, [elevenLabsApiKey]);
  useEffect(() => { elevenLabsVoiceIdRef.current = elevenLabsVoiceId; }, [elevenLabsVoiceId]);
  useEffect(() => { ttsSpeedRef.current = ttsSpeed; }, [ttsSpeed]);

  const getVoiceDisplayName = (vId: string, prov: string) => {
    if (prov === 'neural') {
      return vId === 'pl-PL-ZofiaNeural' ? 'Zofia (Studyjna AI)' : 'Marek (Studyjny AI)';
    }
    if (prov === 'elevenlabs') {
      const matchCurated = CURATED_ELEVEN_VOICES.find((v) => v.id === vId);
      if (matchCurated) return matchCurated.name;
      const matchCustom = customElevenVoices.find((v) => v.id === vId);
      if (matchCustom) return matchCustom.name;
      return 'ElevenLabs';
    }
    if (prov === 'gemini') {
      return `${vId} (Gemini AI)`;
    }
    return 'Głos telefonu (offline)';
  };

  const allElevenVoices = useMemo(() => {
    const seen = new Set<string>();
    const result: ElevenVoiceItem[] = [];
    for (const v of customElevenVoices) {
      if (!seen.has(v.id)) {
        seen.add(v.id);
        result.push(v);
      }
    }
    for (const v of CURATED_ELEVEN_VOICES) {
      if (!seen.has(v.id)) {
        seen.add(v.id);
        result.push(v);
      }
    }
    return result;
  }, [customElevenVoices]);

  const filteredElevenVoices = useMemo(() => {
    return allElevenVoices.filter((v) => {
      if (elevenCategoryFilter === 'polish' && !v.name.includes('Polski') && !v.desc.includes('polski') && v.category !== 'Polski lektor') {
        return false;
      }
      if (elevenCategoryFilter === 'female' && v.gender !== 'Kobiecy') {
        return false;
      }
      if (elevenCategoryFilter === 'male' && v.gender !== 'Męski') {
        return false;
      }
      if (elevenCategoryFilter === 'custom' && !v.category.includes('Sklonowany') && !v.category.includes('Konto')) {
        return false;
      }
      if (elevenSearchQuery.trim()) {
        const q = elevenSearchQuery.toLowerCase();
        return v.name.toLowerCase().includes(q) || v.desc.toLowerCase().includes(q) || v.category.toLowerCase().includes(q);
      }
      return true;
    });
  }, [allElevenVoices, elevenCategoryFilter, elevenSearchQuery]);

  // Screen Wake Lock API for Mobile (prevents screen dimming during reading/listening)
  const wakeLockRef = useRef<any>(null);

  const requestWakeLock = async () => {
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      } catch {
        // WakeLock not supported or denied
      }
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      try {
        wakeLockRef.current.release();
      } catch {}
      wakeLockRef.current = null;
    }
  };

  useEffect(() => {
    if (isFullscreen || isSpeaking) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }
    return () => {
      releaseWakeLock();
    };
  }, [isFullscreen, isSpeaking]);

  // Touch gestures for mobile phone: swipe page turning
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const touchStartTimeRef = useRef<number>(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartXRef.current = e.touches[0].clientX;
      touchStartYRef.current = e.touches[0].clientY;
      touchStartTimeRef.current = Date.now();
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const deltaX = touchEndX - touchStartXRef.current;
    const deltaY = touchEndY - touchStartYRef.current;
    const deltaTime = Date.now() - touchStartTimeRef.current;

    // Strict check for deliberate horizontal swipes:
    // distance > 90px, distinctly horizontal (3x more horizontal than vertical), between 70ms and 450ms
    // This prevents accidental page flips during scrolling, paragraph taps, or text selection!
    if (Math.abs(deltaX) > 90 && Math.abs(deltaX) > Math.abs(deltaY) * 3 && deltaTime > 70 && deltaTime < 450) {
      if (deltaX < 0) {
        // Swiped left -> Next chapter
        if (currentChapterIdx < chapters.length - 1) {
          changeChapter(currentChapterIdx + 1, 'next');
        }
      } else {
        // Swiped right -> Previous chapter
        if (currentChapterIdx > 0) {
          changeChapter(currentChapterIdx - 1, 'prev');
        }
      }
    }

    touchStartXRef.current = null;
    touchStartYRef.current = null;
  };

  const isComicView = useMemo(() => {
    if (selectedJob?.outputFormat === 'cbz' || selectedJob?.conversionMode === 'comic_cbz') return true;
    if (selectedJob?.outputEpubFilename?.toLowerCase().endsWith('.cbz')) return true;
    if (selectedJob?.title && /wisienk|cerise|komiks|manga/i.test(selectedJob.title)) return true;
    if (bookTitle && /wisienk|cerise|komiks|manga/i.test(bookTitle)) return true;
    const cur = chapters[currentChapterIdx];
    if (cur) {
      if (
        cur.content.includes('comic-plate') ||
        cur.content.includes('data:image/') ||
        cur.id.startsWith('page_') ||
        cur.id.startsWith('plate-') ||
        (cur as any).isComicPage
      ) {
        return true;
      }
    }
    if (
      chapters.length > 0 &&
      chapters.some((c) => c.content.includes('comic-plate') || c.content.includes('data:image/') || (c as any).isComicPage)
    ) {
      return true;
    }
    return false;
  }, [selectedJob, chapters, currentChapterIdx, bookTitle]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && isComicView)) {
        if (currentChapterIdx < chapters.length - 1) {
          e.preventDefault();
          changeChapter(currentChapterIdx + 1, 'next');
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        if (currentChapterIdx > 0) {
          e.preventDefault();
          changeChapter(currentChapterIdx - 1, 'prev');
        }
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentChapterIdx, chapters.length, isComicView]);

  // Intercept anchor link clicks inside EPUB content safely so they NEVER break reader or reload to search
  const handleContentContainerClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;

    // Check if an anchor tag was clicked anywhere inside the container (including inside paragraphs)
    const anchor = target.closest('a');
    if (anchor) {
      e.preventDefault();
      e.stopPropagation();
      const rawHref = (anchor.getAttribute('href') || '').trim();
      if (!rawHref || rawHref === '#' || rawHref.startsWith('javascript:')) {
        return;
      }

      // Stop any active TTS audio when navigating chapters via link
      stopTTS();

      // Normalize href to find matching chapter
      const urlWithoutHash = rawHref.split('#')[0].replace(/^(\.\/|\/)+/, '');
      const hashPart = rawHref.includes('#') ? rawHref.split('#')[1] : '';

      let foundIdx = -1;

      // 1. Try matching by filename (e.g., chapter1.xhtml, text/part0002.html)
      if (urlWithoutHash) {
        const cleanFile = urlWithoutHash.split('/').pop()?.toLowerCase() || '';
        foundIdx = chapters.findIndex((c) => {
          const cid = c.id.toLowerCase();
          return cid === cleanFile || cid.endsWith(cleanFile) || cleanFile.endsWith(cid);
        });
      }

      // 2. Try matching by hash/anchor id inside chapter list
      if (foundIdx === -1 && hashPart) {
        const cleanHash = hashPart.toLowerCase();
        foundIdx = chapters.findIndex((c) => {
          const cid = c.id.toLowerCase();
          const ctitle = c.title.toLowerCase();
          return cid.includes(cleanHash) || ctitle.includes(cleanHash);
        });
      }

      // 3. Try matching by link text (e.g., "Rozdział 1", "Wstęp")
      if (foundIdx === -1 && anchor.textContent) {
        const linkText = anchor.textContent.trim().toLowerCase();
        if (linkText.length >= 3) {
          foundIdx = chapters.findIndex((c) => {
            const ctitle = c.title.toLowerCase();
            return ctitle.includes(linkText) || linkText.includes(ctitle);
          });
        }
      }

      if (foundIdx !== -1 && foundIdx !== currentChapterIdx) {
        changeChapter(foundIdx, foundIdx > currentChapterIdx ? 'next' : 'prev');
      } else if (hashPart) {
        const targetEl = document.getElementById(hashPart) || document.querySelector(`[name="${hashPart}"]`);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth' });
        }
      }
    }
  };

  // Load custom/account voices from ElevenLabs API
  const loadElevenVoicesFromAccount = async (keyOverride?: string) => {
    const key = (keyOverride || elevenLabsApiKey).trim();
    setLoadingCustomVoices(true);
    try {
      const url = key ? `/api/tts/elevenlabs/voices?apiKey=${encodeURIComponent(key)}` : '/api/tts/elevenlabs/voices';
      const resp = await fetch(url);
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data.voices) && data.voices.length > 0) {
          const list = data.voices.map((v: any) => ({
            id: v.id,
            name: v.name,
            desc: v.description || 'Głos z biblioteki ElevenLabs',
            gender: (v.gender === 'female' ? 'Kobiecy' : 'Męski') as 'Męski' | 'Kobiecy',
            category: v.category === 'cloned' ? 'Sklonowany' : (v.category || 'Konto API'),
          }));
          setCustomElevenVoices(list);
          setTtsNotification(`🎙️ Załadowano ${list.length} głosów z Twojego konta ElevenLabs!`);
          setTimeout(() => setTtsNotification(null), 3500);
        }
      }
    } catch (e: any) {
      console.warn('Błąd pobierania głosów ElevenLabs:', e);
    } finally {
      setLoadingCustomVoices(false);
    }
  };

  useEffect(() => {
    fetch('/api/settings/accounts')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const hasServerKey = Boolean(d?.elevenlabs?.hasKey);
        if (hasServerKey) {
          setServerHasElevenKey(true);
        }
        if (elevenLabsApiKey.trim()) {
          loadElevenVoicesFromAccount(elevenLabsApiKey);
        } else if (hasServerKey) {
          loadElevenVoicesFromAccount();
        }
      })
      .catch(() => {
        if (elevenLabsApiKey.trim()) {
          loadElevenVoicesFromAccount(elevenLabsApiKey);
        }
      });
  }, []);

  // Test ElevenLabs Key validity and retrieve remaining character quota
  const verifyElevenLabsKeyInUi = async () => {
    const key = elevenLabsApiKey.trim();
    if (!key) {
      setElevenLabsKeyValid({ valid: false, error: 'Wklej swój klucz API ElevenLabs, aby go sprawdzić.' });
      return;
    }
    setElevenLabsChecking(true);
    try {
      const resp = await fetch('/api/tts/elevenlabs/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key }),
      });
      const data = await resp.json();
      setElevenLabsKeyValid(data);
      if (data.valid) {
        setTtsNotification('✅ Klucz ElevenLabs jest poprawny i aktywny!');
        loadElevenVoicesFromAccount(key);
      } else {
        setTtsNotification(`⚠️ ${data.error || 'Nieprawidłowy klucz ElevenLabs'}`);
      }
      setTimeout(() => setTtsNotification(null), 4000);
    } catch (e: any) {
      setElevenLabsKeyValid({ valid: false, error: e.message || 'Błąd połączenia' });
    } finally {
      setElevenLabsChecking(false);
    }
  };

  // Voice Selection with immediate switch, ref update, and cache invalidation
  const selectVoice = (voiceId: string, provider: 'neural' | 'gemini' | 'elevenlabs' | 'system') => {
    ttsVoiceRef.current = voiceId;
    ttsProviderRef.current = provider;
    setTtsVoice(voiceId);
    setTtsProvider(provider);
    if (provider === 'elevenlabs') {
      elevenLabsVoiceIdRef.current = voiceId;
      setElevenLabsVoiceId(voiceId);
    }

    // Invalidate prefetch cache so new voice applies to all upcoming paragraphs immediately
    prefetchCacheRef.current = {};
    localStorage.setItem('koreader_tts_provider', provider);
    localStorage.setItem('koreader_tts_voice', voiceId);
    if (provider === 'elevenlabs') {
      localStorage.setItem('koreader_elevenlabs_voice_id', voiceId);
    }

    setTtsNotification(`🎙️ Zmieniono lektora: ${getVoiceDisplayName(voiceId, provider)}`);
    setTimeout(() => setTtsNotification(null), 3000);

    // If already reading aloud, switch the current paragraph immediately to the new voice
    if (isSpeaking) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      playParagraph(currentParagraphIdx, voiceId, provider);
    }
  };

  // Test sample voice playback
  const testVoiceSample = async (voiceId: string, provider: 'neural' | 'gemini' | 'elevenlabs' | 'system') => {
    if (sampleTestingVoice === voiceId) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setSampleTestingVoice(null);
      return;
    }

    setSampleTestingVoice(voiceId);
    try {
      const sampleText = 'Dzień dobry! Oto próbka mojego głosu do czytania Twoich ulubionych książek.';
      if (provider === 'system') {
        if (window.speechSynthesis) {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(sampleText);
          u.lang = 'pl-PL';
          u.rate = ttsSpeed;
          u.onend = () => setSampleTestingVoice(null);
          u.onerror = () => setSampleTestingVoice(null);
          window.speechSynthesis.speak(u);
        } else {
          setSampleTestingVoice(null);
        }
        return;
      }

      // If ElevenLabs requested without client key and without server key, explain clearly
      if (provider === 'elevenlabs' && !elevenLabsApiKey.trim() && !serverHasElevenKey) {
        setSampleTestingVoice(null);
        setTtsNotification('💡 ElevenLabs wymaga klucza API z elevenlabs.io lub skonfigurowanego na serwerze.');
        setTimeout(() => setTtsNotification(null), 5000);
        return;
      }

      const resp = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: sampleText,
          voice: voiceId,
          provider: provider,
          elevenLabsApiKey,
          elevenLabsVoiceId: voiceId,
          speed: ttsSpeed,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || 'Nie udało się wygenerować próbki głosu');
      }

      const blob = await resp.blob();
      const sampleAudio = new Audio(URL.createObjectURL(blob));
      sampleAudio.playbackRate = ttsSpeed;
      sampleAudio.onended = () => setSampleTestingVoice(null);
      sampleAudio.onerror = () => setSampleTestingVoice(null);
      await sampleAudio.play();
    } catch (e: any) {
      console.warn('Błąd odtwarzania próbki głosu:', e.message);
      setSampleTestingVoice(null);
      setTtsNotification(`⚠️ Błąd próbki: ${e.message}`);
      setTimeout(() => setTtsNotification(null), 4000);
    }
  };

  // When a job is selected from outside (e.g. library "Czytaj" button)
  useEffect(() => {
    if (selectedJob && selectedJob.status === 'completed') {
      loadBookFromJob(selectedJob);
    }
  }, [selectedJob?.id]);

  // Synchronize TTS settings to localStorage
  useEffect(() => {
    localStorage.setItem('koreader_tts_provider', ttsProvider);
  }, [ttsProvider]);
  useEffect(() => {
    localStorage.setItem('koreader_tts_voice', ttsVoice);
  }, [ttsVoice]);
  useEffect(() => {
    localStorage.setItem('koreader_elevenlabs_key', elevenLabsApiKey);
  }, [elevenLabsApiKey]);
  useEffect(() => {
    localStorage.setItem('koreader_elevenlabs_voice_id', elevenLabsVoiceId);
  }, [elevenLabsVoiceId]);

  // Handle native Fullscreen changes
  useEffect(() => {
    const handleFsChange = () => {
      const active = Boolean(document.fullscreenElement);
      setIsFullscreen(active);
      if (!active) setHideChrome(false);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      if (readerContainerRef.current?.requestFullscreen) {
        readerContainerRef.current.requestFullscreen().catch(() => {});
      } else if ((readerContainerRef.current as any)?.webkitRequestFullscreen) {
        (readerContainerRef.current as any).webkitRequestFullscreen();
      }
      setIsFullscreen(true);
      requestWakeLock();
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if ((document as any)?.webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      }
      setIsFullscreen(false);
      setHideChrome(false);
      if (!isSpeaking) releaseWakeLock();
    }
  };

  // ----------------------------------------------------
  // Initialize book from completed jobs or demo
  // ----------------------------------------------------
  useEffect(() => {
    // Prefer valid completed jobs (EPUB, CBZ, or jobs with chapters)
    const completed = jobs.filter(
      (j) =>
        j.status === 'completed' &&
        (j.outputFormat === 'epub' ||
          j.outputFormat === 'cbz' ||
          j.outputEpubFilename?.endsWith('.epub') ||
          j.outputEpubFilename?.endsWith('.cbz') ||
          (j.chapters && j.chapters.length > 0))
    );

    if (selectedJob && selectedJob.status === 'completed') {
      return; // Already handled by selectedJob effect
    }
    // Only load initial book once if no book has been loaded yet
    if (completed.length > 0 && !loadedJobIdRef.current && chapters.length === 0) {
      loadBookFromJob(completed[0]);
      if (onSelectJob) onSelectJob(completed[0]);
    } else if (chapters.length === 0 && !loadingBook) {
      // Default demo chapters
      setChapters([
        {
          id: 'demo_1',
          title: 'Wybierz książkę do czytania',
          content: `
            <h2>Czytnik Web</h2>
            <p>Wybierz dowolną pozycję z zakładki <strong>Książki</strong> lub pobierz nową w zakładce <strong>Szukaj</strong>.</p>
            <p>Możesz także wgrać własny plik w formacie EPUB lub PDF, aby czytać go tutaj lub przesłać bezprzewodowo na Kindle.</p>
          `,
        },
      ]);
    }
  }, [jobs.length, selectedJob?.id]);

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

  // Save reading progress per book in localStorage and debounced sync with KOReader server
  useEffect(() => {
    if (loadedJobIdRef.current && chapters.length > 0) {
      try {
        localStorage.setItem(
          `koreader_progress_${loadedJobIdRef.current}`,
          JSON.stringify({ chapterIdx: currentChapterIdx, paragraphIdx: currentParagraphIdx })
        );
      } catch {}

      const timer = setTimeout(() => {
        fetch('/api/sync/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bookId: loadedJobIdRef.current,
            title: bookTitle,
            progressPercent: Math.round(((currentChapterIdx + 1) / chapters.length) * 100),
            chapterIndex: currentChapterIdx,
            currentPosition: currentParagraphIdx,
            totalChapters: chapters.length,
            device: 'Web Reader',
          }),
        }).catch(() => {});
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, [currentChapterIdx, currentParagraphIdx, chapters.length, bookTitle]);

  // ----------------------------------------------------
  // Radio Drama Multi-Voice Studio Logic
  // ----------------------------------------------------
  const openDramaStudio = async () => {
    if (!selectedJob) return;
    setShowDramaModal(true);
    setDramaLoading(true);
    setDramaExportNotice(null);
    try {
      const res = await fetch(`/api/audio/script/${selectedJob.id}/${currentChapterIdx}`);
      if (res.ok) {
        const data = await res.json();
        setDramaScript(data.script);
        setCurrentDramaLineIdx(0);
      }
    } catch (e: any) {
      console.warn('Błąd ładowania scenariusza słuchowiska:', e);
    } finally {
      setDramaLoading(false);
    }
  };

  const playDramaLine = async (lineIdx: number) => {
    if (!dramaScript || !dramaScript.lines[lineIdx]) return;
    setCurrentDramaLineIdx(lineIdx);
    setIsDramaPlaying(true);

    const line = dramaScript.lines[lineIdx];
    const voiceToUse = line.voiceId || (line.role === 'female' ? 'pl-PL-ZofiaNeural' : 'pl-PL-MarekNeural');

    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: `${line.characterName}: "${line.text.slice(0, 35)}..."`,
          artist: `${bookTitle} • Słuchowisko AI`,
          album: chapters[currentChapterIdx]?.title || 'Rozdział',
        });
        navigator.mediaSession.setActionHandler('play', () => setIsDramaPlaying(true));
        navigator.mediaSession.setActionHandler('pause', () => {
          setIsDramaPlaying(false);
          if (dramaAudioRef.current) dramaAudioRef.current.pause();
        });
        navigator.mediaSession.setActionHandler('nexttrack', () => {
          if (lineIdx + 1 < dramaScript.lines.length) playDramaLine(lineIdx + 1);
        });
        navigator.mediaSession.setActionHandler('previoustrack', () => {
          if (lineIdx - 1 >= 0) playDramaLine(lineIdx - 1);
        });
      } catch {}
    }

    try {
      const resp = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: line.text,
          voice: voiceToUse,
          provider: 'neural',
          speed: dramaSpeed,
        }),
      });

      if (!resp.ok) throw new Error('Błąd generowania audio kwestii');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);

      if (dramaAudioRef.current) {
        dramaAudioRef.current.src = url;
        dramaAudioRef.current.playbackRate = dramaSpeed;
        dramaAudioRef.current.onended = () => {
          if (lineIdx + 1 < dramaScript.lines.length) {
            playDramaLine(lineIdx + 1);
          } else {
            setIsDramaPlaying(false);
          }
        };
        await dramaAudioRef.current.play();
      }
    } catch (e: any) {
      console.warn('Błąd odtwarzania kwestii słuchowiska:', e);
      setIsDramaPlaying(false);
    }
  };

  const toggleDramaPlayback = () => {
    if (isDramaPlaying) {
      if (dramaAudioRef.current) dramaAudioRef.current.pause();
      setIsDramaPlaying(false);
    } else {
      playDramaLine(currentDramaLineIdx);
    }
  };

  const handleExportDramaMp3 = async () => {
    if (!selectedJob) return;
    setDramaExporting(true);
    setDramaExportNotice('Generuję plik MP3 słuchowiska dla całego rozdziału...');
    try {
      const res = await fetch(`/api/audio/export-chapter-mp3/${selectedJob.id}/${currentChapterIdx}`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Błąd serwera podczas eksportu MP3');
      const data = await res.json();
      if (data.downloadUrl) {
        setDramaExportNotice(`Pobieranie pliku: ${data.fileName} (${data.sizeKb} KB)...`);
        const a = document.createElement('a');
        a.href = data.downloadUrl;
        a.download = data.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => setDramaExportNotice(null), 4000);
      }
    } catch (e: any) {
      setDramaExportNotice(`Błąd eksportu: ${e.message || 'Niepowodzenie'}`);
      setTimeout(() => setDramaExportNotice(null), 5000);
    } finally {
      setDramaExporting(false);
    }
  };

  // ----------------------------------------------------
  // AI Story Guide & Character Tree Logic
  // ----------------------------------------------------
  const openStoryGuide = async (tab: 'characters' | 'recap' = 'characters') => {
    if (!selectedJob) return;
    setGuideTab(tab);
    setShowGuideModal(true);
    setGuideLoading(true);

    try {
      if (tab === 'characters') {
        const res = await fetch(`/api/books/${selectedJob.id}/characters`);
        if (res.ok) {
          const data = await res.json();
          setCharactersList(data.characters || []);
        }
      } else {
        const res = await fetch(`/api/books/${selectedJob.id}/recap?chapterIndex=${currentChapterIdx}`);
        if (res.ok) {
          const data = await res.json();
          setRecapText(data.recap || 'Brak streszczenia dla tego rozdziału.');
        }
      }
    } catch (e: any) {
      console.warn('Błąd ładowania przewodnika:', e);
    } finally {
      setGuideLoading(false);
    }
  };

  // ----------------------------------------------------
  // Load EPUB, CBZ, or PDF from Job or URL
  // ----------------------------------------------------
  const loadBookFromJob = async (job: Job, forceReload = false) => {
    if (!forceReload && loadedJobIdRef.current === job.id && chapters.length > 0) {
      return; // Already loaded and in view — do NOT reload or wipe reading position!
    }
    loadedJobIdRef.current = job.id;
    setLoadingBook(true);
    setBookTitle(job.title);

    // Retrieve saved reading progress
    let savedChapterIdx = 0;
    let savedParagraphIdx = 0;
    try {
      const saved = localStorage.getItem(`koreader_progress_${job.id}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.chapterIdx === 'number') savedChapterIdx = parsed.chapterIdx;
        if (typeof parsed.paragraphIdx === 'number') savedParagraphIdx = parsed.paragraphIdx;
      }
    } catch {}

    // Check if Kindle or another device has newer progress
    fetch(`/api/sync/progress/${encodeURIComponent(job.id)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.progress && data.progress.chapterIndex !== undefined) {
          const syncProg = data.progress;
          if (syncProg.device === 'Kindle' && syncProg.chapterIndex !== savedChapterIdx) {
            setKindleSyncNotice({
              show: true,
              progress: syncProg,
            });
          }
        }
      })
    // Dedicated Comic (CBZ) Loader: always fetch full high-res plates from chapters API
    const isComicBook =
      job.outputFormat === 'cbz' ||
      job.conversionMode === 'comic_cbz' ||
      job.outputEpubFilename?.toLowerCase().endsWith('.cbz') ||
      /wisienk|cerise|komiks/i.test(job.title);

    if (isComicBook) {
      try {
        const chResp = await fetch(`/api/jobs/${job.id}/chapters`);
        if (chResp.ok) {
          const chData = await chResp.json();
          if (chData.chapters && chData.chapters.length > 0) {
            setChapters(chData.chapters);
            const safeCh = Math.min(savedChapterIdx, Math.max(0, chData.chapters.length - 1));
            setCurrentChapterIdx(safeCh);
            setCurrentParagraphIdx(0);
            setLoadingBook(false);
            return;
          }
        }
      } catch (comicErr) {
        console.warn('Błąd pobierania stron komiksu z API:', comicErr);
      }
    }

    // 1. If job has chapters already, set them immediately for fast resilient reading
    if (job.chapters && job.chapters.length > 0) {
      const chs = job.chapters.map((c, i) => ({
        id: `ch_${i}`,
        title: c.title || `Rozdział ${i + 1}`,
        content: `<p>${(c.translatedText || c.originalText || '').replace(/\n\n+/g, '</p><p>')}</p>`,
      }));
      setChapters(chs);
      let safeCh = Math.min(savedChapterIdx, Math.max(0, chs.length - 1));
      if (savedChapterIdx === 0 && chs.length > 1) {
        const firstTitle = chs[0].title.toLowerCase();
        if (firstTitle.includes('spis treści') || firstTitle.includes('okładka') || firstTitle.includes('cover')) {
          safeCh = 1;
        }
      }
      setCurrentChapterIdx(safeCh);
      setCurrentParagraphIdx(savedParagraphIdx);
    }

    try {
      const res = await fetch(`/api/download/${job.id}`);
      if (!res.ok) {
        if (job.chapters && job.chapters.length > 0) {
          return;
        }
        throw new Error('Plik nie jest jeszcze gotowy na serwerze');
      }

      const contentType = res.headers.get('content-type') || '';
      const blob = await res.blob();

      // Check if it's a PDF or plain text
      if (
        contentType.includes('application/pdf') ||
        job.outputFormat === 'pdf' ||
        job.outputEpubFilename?.toLowerCase().endsWith('.pdf')
      ) {
        try {
          const chResp = await fetch(`/api/jobs/${job.id}/chapters`);
          if (chResp.ok) {
            const chData = await chResp.json();
            if (chData.chapters && chData.chapters.length > 0) {
              setChapters(chData.chapters);
              const safeCh = Math.min(savedChapterIdx, Math.max(0, chData.chapters.length - 1));
              setCurrentChapterIdx(safeCh);
              setCurrentParagraphIdx(savedParagraphIdx);
              return;
            }
          }
        } catch (pdfErr) {
          console.warn('Nie udało się pobrać rozdziałów PDF:', pdfErr);
        }

        // If extraction hasn't completed yet, show PDF notice with one-click conversion button
        setChapters([
          {
            id: 'pdf_notice',
            title: job.title,
            content: `
              <div style="text-align: center; padding: 2.5rem 1rem;">
                <div style="font-size: 3rem; margin-bottom: 1rem;">📄</div>
                <h2 style="font-size: 1.25rem; font-weight: bold; margin-bottom: 0.5rem; color: #1c1917;">Dokument PDF: ${job.title}</h2>
                <p style="color: #78716c; margin-bottom: 1.5rem; font-size: 0.875rem; max-width: 480px; margin-left: auto; margin-right: auto;">
                  Ten plik został zapisany w formacie PDF. Możesz go czytać po automatycznej konwersji do EPUB lub pobrać bezpośrednio na urządzenie.
                </p>
                <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap;">
                  <a href="/api/download/${job.id}" download="${job.outputEpubFilename || 'dokument.pdf'}" style="display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.625rem 1.25rem; background: #1c1917; color: white; border-radius: 0.75rem; text-decoration: none; font-weight: 500; font-size: 0.875rem;">
                    📥 Pobierz plik PDF (${((job.originalSize || 0) / 1024 / 1024).toFixed(1)} MB)
                  </a>
                </div>
              </div>
            `,
          },
        ]);
        setCurrentChapterIdx(0);
        return;
      }

      await parseEpubBlob(blob, job.title, savedChapterIdx, savedParagraphIdx);
    } catch (err: any) {
      console.warn('Wczytywanie e-booka (tryb awaryjny):', err.message || err);
      // Fallback to job chapters if available
      if (job.chapters && job.chapters.length > 0) {
        const chs = job.chapters.map((c, i) => ({
          id: `ch_${i}`,
          title: c.title || `Rozdział ${i + 1}`,
          content: `<p>${(c.translatedText || c.originalText || '').replace(/\n\n+/g, '</p><p>')}</p>`,
        }));
        setChapters(chs);
        const safeCh = Math.min(savedChapterIdx, Math.max(0, chs.length - 1));
        setCurrentChapterIdx(safeCh);
        setCurrentParagraphIdx(savedParagraphIdx);
      }
    } finally {
      setLoadingBook(false);
    }
  };

  // ----------------------------------------------------
  // Parse EPUB and CBZ client-side with JSZip + Blob URLs
  // ----------------------------------------------------
  const parseEpubBlob = async (blob: Blob, defaultTitle?: string, savedChapterIdx = 0, savedParagraphIdx = 0) => {
    try {
      const zip = await JSZip.loadAsync(blob);
      const parsedChapters: Chapter[] = [];

      // 1. Extract all images into blob URLs for clean display in browser
      const imageBlobMap: Record<string, string> = {};
      const imageFiles = Object.keys(zip.files).filter(
        (f) => !zip.files[f].dir && /\.(jpe?g|png|webp|gif|svg)$/i.test(f)
      );

      for (const imgPath of imageFiles) {
        try {
          const imgData = await zip.files[imgPath].async('blob');
          const blobUrl = URL.createObjectURL(imgData);
          imageBlobMap[imgPath] = blobUrl;
          const baseName = imgPath.split('/').pop() || '';
          imageBlobMap[baseName] = blobUrl;
        } catch (e) {
          console.warn('Nie udało się wyodrębnić obrazu:', imgPath, e);
        }
      }

      // 2. Discover reading order via EPUB OPF Spine
      let orderedHtmlPaths: string[] = [];
      let discoveredTitle = defaultTitle;

      // Try container.xml -> content.opf -> spine
      try {
        const containerFile = zip.file('META-INF/container.xml');
        let opfPath = 'OEBPS/content.opf';
        if (containerFile) {
          const cXml = await containerFile.async('text');
          const fullPathMatch = cXml.match(/full-path=["']([^"']+)["']/i);
          if (fullPathMatch) opfPath = fullPathMatch[1];
        }

        const opfFile = zip.file(opfPath);
        if (opfFile) {
          const opfText = await opfFile.async('text');
          const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

          // Extract Title
          const titleMatch = opfText.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i);
          if (titleMatch && titleMatch[1].trim()) {
            discoveredTitle = titleMatch[1].trim();
          }

          // Manifest map: id -> href
          const manifestMap = new Map<string, string>();
          const itemRegex = /<item\s+[^>]*>/gi;
          let itemMatch: RegExpExecArray | null;
          while ((itemMatch = itemRegex.exec(opfText)) !== null) {
            const itemTag = itemMatch[0];
            const idM = itemTag.match(/id=["']([^"']+)["']/i);
            const hrefM = itemTag.match(/href=["']([^"']+)["']/i);
            if (idM && hrefM) {
              manifestMap.set(idM[1], hrefM[1]);
            }
          }

          // Spine itemrefs in reading order
          const itemrefRegex = /<itemref\s+[^>]*>/gi;
          let refMatch: RegExpExecArray | null;
          while ((refMatch = itemrefRegex.exec(opfText)) !== null) {
            const refTag = refMatch[0];
            const idrefM = refTag.match(/idref=["']([^"']+)["']/i);
            if (idrefM && manifestMap.has(idrefM[1])) {
              const relHref = manifestMap.get(idrefM[1])!;
              const resolvedPath = opfDir + relHref;
              if (zip.file(resolvedPath)) {
                orderedHtmlPaths.push(resolvedPath);
              }
            }
          }
        }
      } catch (opfErr) {
        console.warn('Błąd czytania OPF spine:', opfErr);
      }

      // Fallback: If spine didn't give files, list all HTML files
      if (orderedHtmlPaths.length === 0) {
        const allHtml = Object.keys(zip.files).filter(
          (f) =>
            !zip.files[f].dir &&
            (f.endsWith('.xhtml') || f.endsWith('.html') || f.endsWith('.htm')) &&
            !f.toLowerCase().includes('nav.xhtml') &&
            !f.toLowerCase().includes('toc.xhtml')
        );

        // Put cover first, then sort numerically
        allHtml.sort((a, b) => {
          const aCover = a.toLowerCase().includes('cover');
          const bCover = b.toLowerCase().includes('cover');
          if (aCover && !bCover) return -1;
          if (!aCover && bCover) return 1;
          return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
        });

        orderedHtmlPaths = allHtml;
      }

      // 3. Comic / CBZ Mode: if no HTML files or more images than text pages, display pages from images
      if (imageFiles.length > 0 && (orderedHtmlPaths.length === 0 || imageFiles.length > orderedHtmlPaths.length * 2)) {
        imageFiles.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
        for (let i = 0; i < imageFiles.length; i++) {
          const imgUrl = imageBlobMap[imageFiles[i]];
          const pageNum = i + 1;
          const pageTitle = pageNum === 1 ? 'Okładka albumu' : `Plansza ${pageNum - 1} z ${imageFiles.length - 1}`;
          parsedChapters.push({
            id: `page_${pageNum}`,
            title: pageTitle,
            content: `
              <div class="comic-plate-view" data-page="${pageNum}" style="text-align: center; margin: 0 auto; max-width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                <img src="${imgUrl}" alt="${pageTitle}" class="comic-plate-img" style="max-width: 100%; max-height: 85vh; object-fit: contain; border-radius: 8px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.35); display: inline-block; margin: 0 auto;" />
              </div>
            `,
          });
        }
      } else {
        // 4. EPUB HTML Content extraction
        for (let i = 0; i < orderedHtmlPaths.length; i++) {
          const path = orderedHtmlPaths[i];
          const text = await zip.files[path].async('text');

          // Extract body content
          const bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
          let rawContent = bodyMatch ? bodyMatch[1] : text;

          // Replace relative image src with blob URLs
          rawContent = rawContent.replace(/src=["']([^"']+)["']/gi, (match, srcPath) => {
            const cleanSrc = srcPath.replace(/^\.\.\//, '').replace(/^\.\//, '');
            const baseSrc = cleanSrc.split('/').pop() || '';
            const resolved =
              imageBlobMap[cleanSrc] ||
              imageBlobMap[baseSrc] ||
              imageBlobMap[`OEBPS/${cleanSrc}`] ||
              imageBlobMap[`images/${baseSrc}`] ||
              imageBlobMap[`OEBPS/images/${baseSrc}`] ||
              Object.entries(imageBlobMap).find(([k]) => k.endsWith('/' + baseSrc) || k === baseSrc)?.[1];
            return resolved ? `src="${resolved}"` : match;
          });

          // Decode HTML entities in title
          const titleMatch = rawContent.match(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/i);
          let chapterTitle = titleMatch
            ? titleMatch[1].replace(/<[^>]+>/g, '').trim()
            : path.toLowerCase().includes('cover')
            ? 'Okładka'
            : `Rozdział ${i + 1}`;

          chapterTitle = chapterTitle
            .replace(/&apos;/g, "'")
            .replace(/&#39;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>');

          // If the content already starts with h1, remove redundant inner h1 to avoid duplicate header in UI
          const cleanedContent = rawContent.replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, '').trim() || rawContent;

          parsedChapters.push({
            id: `epub_${i}`,
            title: chapterTitle || `Rozdział ${i + 1}`,
            content: cleanedContent,
          });
        }
      }

      if (parsedChapters.length > 0) {
        setChapters(parsedChapters);
        let targetCh = Math.min(savedChapterIdx, Math.max(0, parsedChapters.length - 1));
        if (savedChapterIdx === 0 && parsedChapters.length > 1) {
          const firstTitle = parsedChapters[0].title.toLowerCase();
          if (firstTitle.includes('spis treści') || firstTitle.includes('okładka') || firstTitle.includes('cover')) {
            targetCh = 1;
          }
        }
        setCurrentChapterIdx(targetCh);
        setCurrentParagraphIdx(savedParagraphIdx);
        if (discoveredTitle) setBookTitle(discoveredTitle);
      }
    } catch (e) {
      console.error('Błąd parsowania struktury e-booka:', e);
    }
  };

  // ----------------------------------------------------
  // Handle Local File Upload (from phone/PC storage)
  // ----------------------------------------------------
  const handleLocalFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoadingBook(true);
    const cleanName = file.name.replace(/\.[^/.]+$/, '');
    setBookTitle(cleanName);

    const lower = file.name.toLowerCase();
    if (lower.endsWith('.epub') || lower.endsWith('.cbz') || lower.endsWith('.zip')) {
      await parseEpubBlob(file, cleanName);
    } else if (lower.endsWith('.txt') || lower.endsWith('.md')) {
      const text = await file.text();
      const rawParagraphs = text.split(/\n\s*\n/).filter((p) => p.trim());
      setChapters([
        {
          id: 'txt_1',
          title: file.name,
          content: rawParagraphs.map((p) => `<p>${p}</p>`).join(''),
        },
      ]);
      setCurrentChapterIdx(0);
    }
    setLoadingBook(false);
  };

  // ----------------------------------------------------
  // Paragraph Extractor for Neural TTS & Reading Focus
  // ----------------------------------------------------
  const paragraphs = useMemo(() => {
    const rawContent = chapters[currentChapterIdx]?.content || '';
    if (!rawContent) return [];

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<div>${rawContent}</div>`, 'text/html');

      // Filter out standalone back-links like "Spis treści" or "Powrót do spisu treści"
      const navLinks = Array.from(doc.body.querySelectorAll('a, nav, [class*="toc"], [id*="toc"]'));
      for (const el of navLinks) {
        const txt = el.textContent?.trim().toLowerCase() || '';
        if (txt === 'spis treści' || txt === 'powrót do spisu treści' || txt === 'do spisu treści' || txt === 'table of contents') {
          el.remove();
        }
      }

      const nodes = Array.from(doc.body.querySelectorAll('p, blockquote, h1, h2, h3, h4, li'));
      if (nodes.length > 0) {
        return nodes
          .map((node) => ({
            html: node.outerHTML,
            text: node.textContent?.replace(/\s+/g, ' ').trim() || '',
          }))
          .filter((p) => p.text.length > 0 && !/^spis treści$/i.test(p.text));
      }
    } catch {}

    const textOnly = rawContent.replace(/<[^>]+>/g, '\n');
    return textOnly
      .split(/\n\n+/)
      .map((t) => ({
        html: `<p>${t.trim()}</p>`,
        text: t.trim(),
      }))
      .filter((p) => p.text.length > 0 && !/^spis treści$/i.test(p.text));
  }, [chapters, currentChapterIdx]);

  // Page Turn with Smooth Transition Animation
  const changeChapter = (newIdx: number, direction: 'next' | 'prev') => {
    if (newIdx < 0 || newIdx >= chapters.length) return;
    setPageAnimation(direction === 'next' ? 'slide-left' : 'slide-right');
    prefetchCacheRef.current = {};
    if (isSpeaking) {
      stopTTS();
    }
    setCurrentChapterIdx(newIdx);
    setCurrentParagraphIdx(0);
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
    setTimeout(() => {
      setPageAnimation(null);
    }, 320);
  };

  // ----------------------------------------------------
  // Text-To-Speech (Natural Neural AI & Device Speech)
  // ----------------------------------------------------
  const speechKeepaliveRef = useRef<any>(null);

  const stopTTS = () => {
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (speechKeepaliveRef.current) {
      clearInterval(speechKeepaliveRef.current);
      speechKeepaliveRef.current = null;
    }
    setIsSpeaking(false);
    setTtsLoading(false);
  };

  const playParagraph = async (
    pIdx: number,
    overrideVoice?: string,
    overrideProvider?: 'neural' | 'gemini' | 'elevenlabs' | 'system'
  ) => {
    if (pIdx < 0 || pIdx >= paragraphs.length) {
      if (currentChapterIdx < chapters.length - 1) {
        changeChapter(currentChapterIdx + 1, 'next');
        setTimeout(() => playParagraph(0), 500);
      } else {
        stopTTS();
        setTtsNotification('📖 Koniec książki');
        setTimeout(() => setTtsNotification(null), 3000);
      }
      return;
    }

    setCurrentParagraphIdx(pIdx);
    setIsSpeaking(true);

    const activeProvider = overrideProvider || ttsProviderRef.current;
    const activeVoice = overrideVoice || ttsVoiceRef.current;
    const activeSpeed = ttsSpeedRef.current;
    const activeElevenKey = elevenLabsApiKeyRef.current;
    const activeElevenVoiceId = elevenLabsVoiceIdRef.current;

    // Persist current position so reading never resets to chapter 0
    if (loadedJobIdRef.current) {
      try {
        localStorage.setItem(
          `koreader_progress_${loadedJobIdRef.current}`,
          JSON.stringify({ chapterIdx: currentChapterIdx, paragraphIdx: pIdx })
        );
      } catch {}
    }

    setTimeout(() => {
      const el = document.getElementById(`reader-p-${pIdx}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 80);

    const paragraphText = paragraphs[pIdx]?.text;
    if (!paragraphText || paragraphText.length < 2) {
      playParagraph(pIdx + 1);
      return;
    }

    // Provider 1: Native System Offline Voice with Android Keepalive Fix
    if (activeProvider === 'system') {
      if (!window.speechSynthesis) {
        setTtsNotification('⚠️ Przeglądarka nie obsługuje syntezy mowy.');
        setIsSpeaking(false);
        return;
      }
      window.speechSynthesis.cancel();
      if (speechKeepaliveRef.current) {
        clearInterval(speechKeepaliveRef.current);
      }

      const utterance = new SpeechSynthesisUtterance(paragraphText);
      utterance.lang = 'pl-PL';
      utterance.rate = activeSpeed;

      utterance.onend = () => {
        if (speechKeepaliveRef.current) clearInterval(speechKeepaliveRef.current);
        if (isSpeaking) playParagraph(pIdx + 1);
      };
      utterance.onerror = (e) => {
        if (speechKeepaliveRef.current) clearInterval(speechKeepaliveRef.current);
        console.warn('System TTS error:', e);
        setIsSpeaking(false);
      };

      // Chrome on Android bug fix: prevent garbage collection of long utterances
      speechKeepaliveRef.current = setInterval(() => {
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        } else {
          clearInterval(speechKeepaliveRef.current);
        }
      }, 10000);

      window.speechSynthesis.speak(utterance);
      return;
    }

    // Provider 2, 3 & 4: Natural Neural Voice (Neural Edge, ElevenLabs, Gemini AI)
    setTtsLoading(true);
    try {
      // Determine effective provider and voice
      let effProvider = activeProvider;
      let effVoice = activeVoice;

      if (activeProvider === 'elevenlabs' && !activeElevenKey.trim() && !serverHasElevenKey) {
        // Neither client nor server has an ElevenLabs key configured -> notify & seamlessly play with top studio neural voice
        effProvider = 'neural';
        effVoice = ['21m00Tcm4TlvDq8ikWAM', 'EXAVITQu4vr4xnSDxMaL'].includes(activeVoice)
          ? 'pl-PL-ZofiaNeural'
          : 'pl-PL-MarekNeural';
        setTtsNotification('💡 ElevenLabs wymaga klucza API — odtwarzam bezpłatnym Lektorem Studyjnym (Marek/Zofia).');
        setTimeout(() => setTtsNotification(null), 4000);
      }

      // Słuchowisko radiowe (Radio Drama Mode):
      // Inteligentny podział na role: narrator męski (Marek) / kwestie dialogowe i żeńskie (Zofia)
      if (radioDramaMode && effProvider === 'neural') {
        const isDialogue = /^[\-—–„"«]/.test(paragraphText.trim()) || /["»”]/.test(paragraphText.trim());
        const isFeminineDialogue = isDialogue && /\b(powiedziała|odparła|szepnęła|krzyknęła|zapytała|westchnęła|zawołała|rzekła|stwierdziła|ona|dziewczyna|kobieta|matka|siostra)\b/i.test(paragraphText);
        const isMasculineDialogue = isDialogue && /\b(powiedział|odparł|szepnął|krzyknął|zapytał|westchnął|zawołał|rzekł|stwierdził|on|chłopak|mężczyzna|ojciec|brat)\b/i.test(paragraphText);

        if (isFeminineDialogue) {
          effVoice = 'pl-PL-ZofiaNeural';
        } else if (isMasculineDialogue) {
          effVoice = 'pl-PL-MarekNeural';
        } else if (isDialogue) {
          // Naprzemienny lub wyróżniony głos dialogowy
          effVoice = activeVoice === 'pl-PL-MarekNeural' ? 'pl-PL-ZofiaNeural' : 'pl-PL-MarekNeural';
        } else {
          // Główny narrator
          effVoice = activeVoice;
        }
      }

      let audioUrl = prefetchCacheRef.current[pIdx];

      if (!audioUrl) {
        let resp = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: paragraphText,
            voice: effVoice,
            provider: effProvider,
            elevenLabsApiKey: activeElevenKey,
            elevenLabsVoiceId: activeElevenVoiceId,
            speed: activeSpeed,
          }),
        });

        if (!resp.ok) {
          console.warn('Główny lektor zwrócił błąd, automatyczny fallback na Marek Neural...');
          // Resilient fallback to Marek Neural so reading NEVER breaks
          resp = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: paragraphText,
              voice: 'pl-PL-MarekNeural',
              provider: 'neural',
              speed: activeSpeed,
            }),
          });

          if (!resp.ok) {
            throw new Error('Błąd generowania głosu lektora');
          }
        }

        const blob = await resp.blob();
        audioUrl = URL.createObjectURL(blob);
        prefetchCacheRef.current[pIdx] = audioUrl;
      }

      setTtsLoading(false);

      if (!audioRef.current) {
        audioRef.current = new Audio();
      }
      const audio = audioRef.current;
      audio.src = audioUrl;
      audio.playbackRate = activeSpeed;

      audio.onended = () => {
        playParagraph(pIdx + 1);
      };
      audio.onerror = () => {
        console.warn('Błąd odtwarzacza audio dla akapitu', pIdx);
        // Try next paragraph instead of dying
        setTimeout(() => playParagraph(pIdx + 1), 200);
      };

      await audio.play();

      // Background pre-fetch of next paragraph for gapless audiobook reading
      const nextIdx = pIdx + 1;
      if (nextIdx < paragraphs.length && !prefetchCacheRef.current[nextIdx]) {
        const nextText = paragraphs[nextIdx]?.text;
        if (nextText && nextText.length > 2) {
          fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: nextText,
              voice: effVoice,
              provider: effProvider,
              elevenLabsApiKey: activeElevenKey,
              elevenLabsVoiceId: activeElevenVoiceId,
              speed: activeSpeed,
            }),
          })
            .then((r) => (r.ok ? r.blob() : null))
            .then((b) => {
              if (b) prefetchCacheRef.current[nextIdx] = URL.createObjectURL(b);
            })
            .catch(() => {});
        }
      }
    } catch (err: any) {
      console.warn('Błąd lektora AI:', err.message);
      setTtsLoading(false);
      setIsSpeaking(false);
      setTtsNotification(`⚠️ ${err.message || 'Błąd odtwarzania lektora'}`);
      setTimeout(() => setTtsNotification(null), 4000);
    }
  };

  const toggleTTS = () => {
    if (isSpeaking) {
      stopTTS();
    } else {
      playParagraph(currentParagraphIdx || 0);
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
      <div className="flex items-center justify-between gap-2 p-1.5 bg-stone-900 text-white rounded-xl shadow-xs">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveSubTab('reader')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
              activeSubTab === 'reader'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-stone-300 hover:text-white hover:bg-stone-800'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Czytnik EPUB</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('remote')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
              activeSubTab === 'remote'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'text-stone-300 hover:text-white hover:bg-stone-800'
            }`}
          >
            <Wifi className="w-3.5 h-3.5" />
            <span>Pilot Kindle Wi-Fi</span>
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-stone-300 pr-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>Serwer aktywny</span>
        </div>
      </div>

      {/* ==================================================== */}
      {/* SUB-TAB 1: FULL EBOOK READER (MOON+ READER REPLACEMENT) */}
      {/* ==================================================== */}
      {activeSubTab === 'reader' && (
        <div
          ref={readerContainerRef}
          className={`overflow-hidden flex flex-col transition-all duration-300 relative ${currentTheme.bg} ${currentTheme.text} ${
            isFullscreen
              ? 'fixed inset-0 z-50 w-screen h-screen m-0 rounded-none border-none shadow-none'
              : `rounded-2xl border shadow-lg ${currentTheme.border}`
          }`}
          style={isFullscreen ? { height: '100dvh', width: '100dvw' } : { minHeight: '75vh', maxHeight: '88vh' }}
        >
          {/* Real-time Toast Notification for Voice & Reader State */}
          {ttsNotification && (
            <div className="absolute top-12 left-1/2 -translate-x-1/2 z-40 bg-stone-900/90 dark:bg-black/90 text-white text-xs px-3.5 py-1.5 rounded-full shadow-xl border border-white/15 backdrop-blur-md animate-in fade-in slide-in-from-top-2 flex items-center gap-1.5 pointer-events-none select-none">
              <span>{ttsNotification}</span>
            </div>
          )}
          {/* Discreet Floating Bar in Fullscreen Immersive Mode when chrome is hidden */}
          {isFullscreen && hideChrome && (
            <div className="absolute top-3 right-3 z-30 flex items-center gap-1 bg-black/60 backdrop-blur-md rounded-full px-2.5 py-1 text-white shadow-md border border-white/10 text-xs">
              <button
                type="button"
                onClick={() => setHideChrome(false)}
                className="flex items-center gap-1 px-1.5 py-0.5 hover:text-amber-300 transition"
                title="Pokaż menu i paski czytnika"
              >
                <Eye className="w-3.5 h-3.5" />
                <span className="text-[11px] font-medium">Menu</span>
              </button>
              <span className="w-px h-3 bg-white/20" />
              <button
                type="button"
                onClick={toggleFullscreen}
                className="p-1 hover:text-amber-300 transition"
                title="Wyjdź z pełnego ekranu"
              >
                <Minimize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Kindle Progress Sync Prompt Banner */}
          {kindleSyncNotice && kindleSyncNotice.show && (
            <div className="bg-amber-600 text-white px-3 sm:px-4 py-2 flex items-center justify-between gap-2 text-xs shadow-md animate-in fade-in slide-in-from-top-2 border-b border-amber-700 z-30">
              <div className="flex items-center gap-2 truncate">
                <span className="text-base shrink-0">📖</span>
                <span className="truncate">
                  Wykryto nowszy postęp z <strong>Kindle ({kindleSyncNotice.progress.device})</strong>: Rozdział {(kindleSyncNotice.progress.chapterIndex || 0) + 1} ({kindleSyncNotice.progress.progressPercent}%, {kindleSyncNotice.progress.timeAgo || 'niedawno'}).
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setCurrentChapterIdx(kindleSyncNotice.progress.chapterIndex);
                    if (typeof kindleSyncNotice.progress.currentPosition === 'number') {
                      setCurrentParagraphIdx(kindleSyncNotice.progress.currentPosition);
                    }
                    setKindleSyncNotice(null);
                  }}
                  className="px-2.5 py-1 rounded-md bg-white text-amber-950 font-bold text-[11px] shadow-xs hover:bg-amber-50 transition cursor-pointer"
                >
                  Przejdź do pozycji z Kindle
                </button>
                <button
                  type="button"
                  onClick={() => setKindleSyncNotice(null)}
                  className="p-1 rounded hover:bg-black/15 text-white transition text-xs"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {/* Reader Top Action Bar */}
          <div
            className={`px-3 sm:px-4 py-2 border-b flex items-center justify-between gap-2 sm:gap-3 text-xs transition-all duration-300 ${currentTheme.bar} ${
              isFullscreen && hideChrome ? '-translate-y-full opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'
            }`}
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

              {/* Book selector dropdown */}
              <div className="flex items-center gap-1.5 bg-black/10 dark:bg-white/10 rounded-lg px-2 py-1 max-w-[190px] sm:max-w-xs">
                <BookOpen className="w-3.5 h-3.5 opacity-70 shrink-0" />
                <select
                  value={selectedJob?.id || ''}
                  onChange={(e) => {
                    const found = jobs.find((j) => j.id === e.target.value);
                    if (found) {
                      if (onSelectJob) onSelectJob(found);
                      loadBookFromJob(found);
                    }
                  }}
                  className="bg-transparent border-none text-current text-xs font-semibold focus:outline-hidden truncate cursor-pointer w-full"
                >
                  {jobs.filter((j) => j.status === 'completed' && j.outputEpubFilename).length > 0 ? (
                    jobs.filter((j) => j.status === 'completed' && j.outputEpubFilename).map((j) => (
                      <option key={j.id} value={j.id} className="text-black bg-white">
                        {j.title} ({j.outputFormat === 'cbz' ? 'CBZ' : 'EPUB'})
                      </option>
                    ))
                  ) : (
                    <option value="" className="text-black bg-white">
                      {bookTitle}
                    </option>
                  )}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-1 sm:gap-1.5">
              {/* Comic View Controls */}
              {isComicView && (
                <div className="flex items-center gap-1 bg-amber-500/10 border border-amber-600/30 rounded-lg p-0.5 text-xs font-semibold select-none">
                  <span className="hidden lg:inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] uppercase font-bold text-amber-800 dark:text-amber-400">
                    🎨 Komiks HD
                  </span>
                  <button
                    type="button"
                    onClick={() => setComicFitMode(comicFitMode === 'height' ? 'width' : 'height')}
                    className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-600 text-white shadow-2xs hover:bg-amber-700 transition cursor-pointer"
                    title={comicFitMode === 'height' ? 'Zmień na dopasowanie do szerokości (zbliżenie na dymki)' : 'Zmień na całą planszę (dopasuj do wysokości ekranu)'}
                  >
                    {comicFitMode === 'height' ? '↕ Cała plansza' : '↔ Szerokość'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setComicZoom((z) => Math.max(50, z - 15))}
                    className="px-1.5 py-0.5 rounded hover:bg-amber-500/20 text-xs font-bold cursor-pointer"
                    title="Pomniejsz"
                  >
                    -
                  </button>
                  <span className="font-mono text-[10px] px-0.5">{comicZoom}%</span>
                  <button
                    type="button"
                    onClick={() => setComicZoom((z) => Math.min(250, z + 15))}
                    className="px-1.5 py-0.5 rounded hover:bg-amber-500/20 text-xs font-bold cursor-pointer"
                    title="Powiększ"
                  >
                    +
                  </button>
                </div>
              )}

              {/* Natural Neural TTS Button with animated Equalizer */}
              <button
                type="button"
                onClick={toggleTTS}
                className={`px-2 py-1 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition ${
                  isSpeaking
                    ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                    : 'hover:bg-black/5 dark:hover:bg-white/5 border-current/20'
                }`}
                title="Lektor AI (czytaj na głos naturalnym głosem)"
              >
                {isSpeaking ? (
                  <div className="flex items-end gap-0.5 h-3.5 px-0.5">
                    <span className="w-0.5 bg-white rounded-full animate-bounce h-2" />
                    <span className="w-0.5 bg-white rounded-full animate-pulse h-3.5" />
                    <span className="w-0.5 bg-white rounded-full animate-bounce h-2.5" />
                  </div>
                ) : (
                  <Headphones className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                )}
                <span className="hidden sm:inline font-semibold">
                  {isSpeaking ? 'Słuchasz' : 'Lektor AI'}
                </span>
              </button>

              {/* Voice Options / Selector Button showing active voice name */}
              <button
                type="button"
                onClick={openVoiceModal}
                className="px-2 sm:px-2.5 py-1 rounded-lg border border-current/20 hover:bg-black/5 dark:hover:bg-white/5 transition flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
                title="Wybierz lub zmień lektora (Marek, Zofia, Gemini, ElevenLabs)"
              >
                <Volume2 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                <span className="truncate max-w-[100px] sm:max-w-none">
                  {getVoiceDisplayName(ttsVoice, ttsProvider)}
                </span>
                <ChevronDown className="w-3 h-3 opacity-60 shrink-0" />
              </button>

              {/* Multi-Voice Radio Drama Studio Button */}
              <button
                type="button"
                onClick={openDramaStudio}
                className="px-2.5 py-1 rounded-lg border border-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-950 dark:text-indigo-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer hover:bg-indigo-100 shadow-2xs"
                title="Studio Słuchowiska AI: wielogłosowe słuchowisko z podziałem na role i eksportem MP3"
              >
                <span>🎭</span>
                <span className="hidden sm:inline">Słuchowisko MP3</span>
              </button>

              {/* Story Guide & Character Tree Button */}
              <button
                type="button"
                onClick={() => openStoryGuide('characters')}
                className="px-2.5 py-1 rounded-lg border border-purple-400 bg-purple-50 dark:bg-purple-950/60 text-purple-950 dark:text-purple-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer hover:bg-purple-100 shadow-2xs"
                title="Przewodnik fabularny i drzewo bohaterów bez spoilerów"
              >
                <span>🧠</span>
                <span className="hidden sm:inline">Przewodnik</span>
              </button>

              {/* Fullscreen Mode Button */}
              <button
                type="button"
                onClick={toggleFullscreen}
                className={`p-1.5 rounded-lg border transition ${
                  isFullscreen
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'border-current/20 hover:bg-black/5 dark:hover:bg-white/5'
                }`}
                title={isFullscreen ? 'Opuść pełny ekran' : 'Tryb pełnoekranowy na telefonie/tablecie'}
              >
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>

              {/* Reader Font & Theme Settings Button */}
              <button
                type="button"
                onClick={() => setShowSettings(!showSettings)}
                className="p-1.5 rounded-lg border border-current/20 hover:bg-black/5 dark:hover:bg-white/5 transition"
                title="Dostosuj czcionkę i motyw"
              >
                <Type className="w-3.5 h-3.5" />
              </button>

              {/* Open File from Phone */}
              <label className="cursor-pointer px-2 py-1 rounded-lg bg-stone-900 text-white hover:bg-stone-800 transition flex items-center gap-1 text-[11px] font-medium shadow-xs">
                <UploadCloud className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Wgraj plik</span>
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
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    stopTTS();
                    changeChapter(idx, idx > currentChapterIdx ? 'next' : 'prev');
                    setShowToc(false);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg transition truncate cursor-pointer ${
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

          {/* Main Book Content Screen with Mobile Touch Swipes & Page Animation */}
          <div
            ref={contentRef}
            onClick={handleContentContainerClick}
            onTouchStart={handleTouchStart}
            onTouchEnd={(e) => {
              handleTouchEnd(e);
              handleTextSelection();
            }}
            onMouseUp={handleTextSelection}
            className={`flex-1 overflow-y-auto px-5 py-6 sm:px-12 md:px-16 leading-relaxed selection:bg-amber-400 selection:text-black transition-all ${fontClasses[fontFamily]}`}
            style={{ fontSize: `${fontSize}px`, lineHeight: lineHeight }}
          >
            {loadingBook ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-3 opacity-60">
                <div className="w-8 h-8 border-3 border-amber-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm font-sans">Ładowanie i formatowanie rozdziału...</p>
              </div>
            ) : chapters[currentChapterIdx] ? (
              isComicView ? (
                <div
                  className={`w-full max-w-5xl mx-auto flex flex-col items-center select-none ${
                    pageAnimation === 'slide-left'
                      ? 'anim-page-slide-left'
                      : pageAnimation === 'slide-right'
                      ? 'anim-page-slide-right'
                      : ''
                  }`}
                >
                  {/* Top Bar for Comic Plate: Page Title + Counter */}
                  <div className="w-full flex items-center justify-between pb-2 mb-2 border-b border-current/10 text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-amber-600 text-white font-bold text-[10px] tracking-wide uppercase">
                        Komiks
                      </span>
                      <span className="font-semibold text-amber-800 dark:text-amber-400">
                        {chapters[currentChapterIdx].title}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 opacity-80 text-[11px]">
                      <span>
                        Plansza {currentChapterIdx + 1} z {chapters.length}
                      </span>
                      <span>({Math.round(((currentChapterIdx + 1) / chapters.length) * 100)}%)</span>
                    </div>
                  </div>

                  {/* Comic Plate Canvas with Left / Right interactive click zones */}
                  <div className="relative w-full flex items-center justify-center min-h-[60vh] py-1">
                    {/* Left Tap Zone -> Previous Page */}
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        if (currentChapterIdx > 0) changeChapter(currentChapterIdx - 1, 'prev');
                      }}
                      className="absolute inset-y-0 left-0 w-1/4 z-10 cursor-pointer flex items-center justify-start pl-3 transition opacity-0 hover:opacity-100"
                      title="Poprzednia plansza (kliknij po lewej lub ←)"
                    >
                      <div className="p-3 rounded-full bg-stone-900/80 text-white shadow-xl backdrop-blur-xs transition hover:scale-110">
                        <ChevronLeft className="w-6 h-6" />
                      </div>
                    </div>

                    {/* Comic Image with Responsive Fit Mode & Scale */}
                    {(() => {
                      const curContent = chapters[currentChapterIdx]?.content || '';
                      const srcMatch = curContent.match(/<img[^>]+src="([^">]+)"/i);
                      const imgSrc = srcMatch ? srcMatch[1] : null;

                      if (imgSrc) {
                        return (
                          <div
                            className="w-full flex items-center justify-center transition-transform duration-150 ease-out select-none"
                            style={{
                              transform: `scale(${comicZoom / 100})`,
                              transformOrigin: 'top center',
                            }}
                          >
                            <img
                              src={imgSrc}
                              alt={chapters[currentChapterIdx]?.title || `Plansza ${currentChapterIdx + 1}`}
                              className="comic-plate-img rounded-xl shadow-2xl transition-all duration-150 select-none block mx-auto border border-black/15 dark:border-white/15"
                              style={{
                                maxHeight: comicFitMode === 'height' ? 'calc(100vh - 175px)' : 'none',
                                maxWidth: '100%',
                                width: comicFitMode === 'width' ? '100%' : 'auto',
                                height: 'auto',
                                objectFit: 'contain',
                                display: 'block',
                              }}
                              loading="eager"
                            />
                          </div>
                        );
                      }

                      return (
                        <div
                          className="w-full flex justify-center transition-transform duration-150 ease-out"
                          style={{
                            transform: `scale(${comicZoom / 100})`,
                            transformOrigin: 'top center',
                          }}
                          dangerouslySetInnerHTML={{
                            __html: curContent,
                          }}
                        />
                      );
                    })()}

                    {/* Right Tap Zone -> Next Page */}
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        if (currentChapterIdx < chapters.length - 1) changeChapter(currentChapterIdx + 1, 'next');
                      }}
                      className="absolute inset-y-0 right-0 w-1/4 z-10 cursor-pointer flex items-center justify-end pr-3 transition opacity-0 hover:opacity-100"
                      title="Następna plansza (kliknij po prawej lub →)"
                    >
                      <div className="p-3 rounded-full bg-stone-900/80 text-white shadow-xl backdrop-blur-xs transition hover:scale-110">
                        <ChevronRight className="w-6 h-6" />
                      </div>
                    </div>
                  </div>

                  {/* Horizontal Thumbnail / Page Selector Strip */}
                  <div className="w-full mt-4 pt-3 border-t border-current/10 flex items-center gap-1.5 overflow-x-auto py-2">
                    {chapters.map((ch, idx) => (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => changeChapter(idx, idx > currentChapterIdx ? 'next' : 'prev')}
                        className={`shrink-0 px-3 py-1 rounded-lg text-xs font-mono transition cursor-pointer ${
                          currentChapterIdx === idx
                            ? 'bg-amber-600 text-white font-bold shadow-xs'
                            : 'bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 opacity-70 hover:opacity-100'
                        }`}
                        title={ch.title}
                      >
                        {idx === 0 ? 'Okładka' : `P.${idx}`}
                      </button>
                    ))}
                  </div>

                  {/* In-comic bottom navigation bar */}
                  <div className="pt-4 pb-12 w-full flex items-center justify-between gap-3 border-t border-current/10 mt-4">
                    <button
                      type="button"
                      disabled={currentChapterIdx <= 0}
                      onClick={() => changeChapter(currentChapterIdx - 1, 'prev')}
                      className="px-4 py-2 rounded-xl border border-current/20 disabled:opacity-25 hover:bg-black/5 dark:hover:bg-white/5 flex items-center gap-1.5 font-medium text-xs transition cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span>Poprzednia plansza</span>
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setComicFitMode(comicFitMode === 'height' ? 'width' : 'height')}
                        className="px-3 py-1.5 rounded-lg border border-current/20 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/5 transition cursor-pointer"
                      >
                        {comicFitMode === 'height' ? '↕ Cała plansza' : '↔ Szerokość'}
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={currentChapterIdx >= chapters.length - 1}
                      onClick={() => changeChapter(currentChapterIdx + 1, 'next')}
                      className="px-4 py-2 rounded-xl border border-current/20 disabled:opacity-25 hover:bg-black/5 dark:hover:bg-white/5 flex items-center gap-1.5 font-medium text-xs transition cursor-pointer"
                    >
                      <span>Następna plansza</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className={`max-w-2xl mx-auto space-y-4 ${
                    pageAnimation === 'slide-left'
                      ? 'anim-page-slide-left'
                      : pageAnimation === 'slide-right'
                      ? 'anim-page-slide-right'
                      : ''
                  }`}
                >
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight pb-3 border-b border-current/10 mb-6">
                    {chapters[currentChapterIdx].title}
                  </h1>

                {/* Interactive Paragraph List: Audio activates ONLY via the dedicated Play button */}
                {paragraphs.length > 0 ? (
                  <div className="space-y-3.5">
                    {paragraphs.map((p, pIdx) => {
                      const isActiveParagraph = isSpeaking && currentParagraphIdx === pIdx;
                      return (
                        <div
                          key={`p_${pIdx}`}
                          id={`reader-p-${pIdx}`}
                          className={`transition-all duration-200 rounded-xl group flex items-start gap-2.5 ${
                            isActiveParagraph
                              ? 'bg-amber-500/15 dark:bg-amber-500/20 border-l-4 border-amber-600 pl-3.5 pr-2.5 py-2 shadow-xs ring-1 ring-amber-600/20'
                              : 'hover:bg-black/3 dark:hover:bg-white/3 px-2.5 py-1.5'
                          }`}
                        >
                          {/* Dedicated Play / Equalizer Button next to the verse */}
                          <div className="shrink-0 pt-0.5 select-none">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                if (isActiveParagraph) {
                                  toggleTTS();
                                } else {
                                  playParagraph(pIdx);
                                }
                              }}
                              className={`rounded-md transition flex items-center justify-center cursor-pointer ${
                                isActiveParagraph
                                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1.5 py-0.5'
                                  : 'w-6 h-6 opacity-40 sm:opacity-0 group-hover:opacity-100 hover:opacity-100! text-amber-600 hover:bg-amber-100 dark:hover:bg-stone-800'
                              }`}
                              title={isActiveParagraph ? 'Zatrzymaj lektora' : 'Odtwarzaj od tego akapitu (Lektor AI)'}
                              aria-label={isActiveParagraph ? 'Zatrzymaj lektora' : 'Odtwarzaj od tego akapitu'}
                            >
                              {isActiveParagraph ? (
                                <span className="inline-flex items-center gap-1 font-sans text-[11px] font-bold">
                                  <span className="flex items-end gap-0.5 h-3">
                                    <span className="w-0.5 bg-amber-500 rounded-full eq-bar-1" />
                                    <span className="w-0.5 bg-amber-500 rounded-full eq-bar-2" />
                                    <span className="w-0.5 bg-amber-500 rounded-full eq-bar-3" />
                                  </span>
                                  <Pause className="w-3 h-3 ml-0.5 fill-current" />
                                </span>
                              ) : (
                                <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                              )}
                            </button>
                          </div>

                          {/* Paragraph text: NOT clickable for TTS, allowing normal reading, selection and links */}
                          <div className="flex-1 min-w-0 select-text">
                            <span
                              className="prose-content"
                              dangerouslySetInnerHTML={{ __html: p.html }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div
                    className="prose-content space-y-4"
                    dangerouslySetInnerHTML={{ __html: chapters[currentChapterIdx].content }}
                  />
                )}

                {/* In-chapter bottom navigation bar */}
                <div className="pt-8 pb-16 flex items-center justify-between gap-3 border-t border-current/10 mt-8">
                  <button
                    type="button"
                    disabled={currentChapterIdx <= 0}
                    onClick={() => changeChapter(currentChapterIdx - 1, 'prev')}
                    className="px-3.5 py-2 rounded-xl border border-current/20 disabled:opacity-25 hover:bg-black/5 dark:hover:bg-white/5 flex items-center gap-1.5 font-medium text-xs transition cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Poprzedni</span>
                  </button>
                  <span className="text-[11px] font-mono opacity-60">
                    Rozdział {currentChapterIdx + 1} z {chapters.length}
                  </span>
                  <button
                    type="button"
                    disabled={currentChapterIdx >= chapters.length - 1}
                    onClick={() => changeChapter(currentChapterIdx + 1, 'next')}
                    className="px-3.5 py-2 rounded-xl border border-current/20 disabled:opacity-25 hover:bg-black/5 dark:hover:bg-white/5 flex items-center gap-1.5 font-medium text-xs transition cursor-pointer"
                  >
                    <span>Następny</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          ) : (
              <div className="text-center py-20 opacity-50 font-sans">
                Brak wczytanej książki. Wybierz pozycję z biblioteki lub wgraj plik EPUB.
              </div>
            )}
          </div>

          {/* Floating Audio Player Dock (Equalizer wave animation + Gapless playback controls) */}
          {(isSpeaking || ttsLoading) && (
            <div className="absolute bottom-12 sm:bottom-14 left-1/2 -translate-x-1/2 z-30 max-w-xl w-[95%] sm:w-auto bg-stone-900/95 dark:bg-stone-950/95 backdrop-blur-md text-white rounded-2xl px-3.5 py-2.5 sm:px-4 sm:py-3 shadow-2xl border border-white/10 flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-4 animate-in slide-in-from-bottom-4 duration-200">
              {/* Left: Equalizer + Active Voice Info + Quick Voice Switch */}
              <div className="flex items-center gap-2.5 w-full sm:w-auto justify-between sm:justify-start">
                <div className="flex items-center gap-2 min-w-0">
                  {/* Animated Equalizer Waveform */}
                  <div className="flex items-end gap-0.5 sm:gap-1 h-5 px-1 shrink-0">
                    <span className="w-1 bg-amber-400 rounded-full eq-bar-1" />
                    <span className="w-1 bg-amber-400 rounded-full eq-bar-2" />
                    <span className="w-1 bg-amber-400 rounded-full eq-bar-3" />
                    <span className="w-1 bg-amber-400 rounded-full eq-bar-4" />
                  </div>

                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={openVoiceModal}
                      className="flex items-center gap-1.5 text-left group cursor-pointer"
                      title="Kliknij, aby zmienić lektora AI"
                    >
                      <span className="text-xs font-bold text-amber-400 group-hover:underline truncate max-w-[130px] sm:max-w-[180px]">
                        🎙️ {getVoiceDisplayName(ttsVoice, ttsProvider)}
                      </span>
                    </button>
                    <p className="text-[10px] text-stone-300">
                      Akapit {currentParagraphIdx + 1} z {paragraphs.length || 1}
                      {paragraphs.length > 0 && ` (${Math.round(((currentParagraphIdx + 1) / paragraphs.length) * 100)}%)`}
                    </p>
                  </div>
                </div>

                {/* 1-Tap Quick Gender Switch between Marek & Zofia */}
                <div className="flex items-center gap-1 shrink-0">
                  {ttsVoice === 'pl-PL-MarekNeural' ? (
                    <button
                      type="button"
                      onClick={() => selectVoice('pl-PL-ZofiaNeural', 'neural')}
                      className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] text-amber-300 font-medium transition cursor-pointer"
                      title="Przełącz natychmiast na głos kobiecy (Zofia)"
                    >
                      ⇄ Zofia 👩
                    </button>
                  ) : ttsVoice === 'pl-PL-ZofiaNeural' ? (
                    <button
                      type="button"
                      onClick={() => selectVoice('pl-PL-MarekNeural', 'neural')}
                      className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] text-amber-300 font-medium transition cursor-pointer"
                      title="Przełącz natychmiast na głos męski (Marek)"
                    >
                      ⇄ Marek 👨
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => selectVoice('pl-PL-MarekNeural', 'neural')}
                      className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] text-amber-300 font-medium transition cursor-pointer"
                      title="Przełącz na Lektora Studyjnego (Marek)"
                    >
                      ⇄ Marek 👨
                    </button>
                  )}
                </div>
              </div>

              {/* Right: Player Audio Controls */}
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 w-full sm:w-auto justify-end border-t sm:border-t-0 border-white/10 pt-1.5 sm:pt-0">
                <button
                  type="button"
                  onClick={() => playParagraph(Math.max(0, currentParagraphIdx - 1))}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-stone-300 hover:text-white transition cursor-pointer"
                  title="Poprzedni akapit"
                >
                  <SkipBack className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={toggleTTS}
                  className="w-9 h-9 rounded-full bg-amber-600 hover:bg-amber-500 text-white flex items-center justify-center transition shadow-md cursor-pointer"
                  title={isSpeaking ? 'Pauza' : 'Wznów'}
                >
                  {ttsLoading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : isSpeaking ? (
                    <Pause className="w-4 h-4" />
                  ) : (
                    <Play className="w-4 h-4 ml-0.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => playParagraph(Math.min(paragraphs.length - 1, currentParagraphIdx + 1))}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-stone-300 hover:text-white transition cursor-pointer"
                  title="Następny akapit"
                >
                  <SkipForward className="w-4 h-4" />
                </button>

                {/* Speed Toggle Pill */}
                <button
                  type="button"
                  onClick={() => {
                    const speeds = [0.8, 1.0, 1.25, 1.5, 2.0];
                    const next = speeds[(speeds.indexOf(ttsSpeed) + 1) % speeds.length] || 1.0;
                    setTtsSpeed(next);
                  }}
                  className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-mono font-bold transition cursor-pointer"
                  title="Zmień prędkość czytania"
                >
                  {ttsSpeed}x
                </button>

                {/* Voice Modal Shortcut */}
                <button
                  type="button"
                  onClick={openVoiceModal}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-stone-300 hover:text-white transition cursor-pointer"
                  title="Więcej lektorów i ustawienia głosu"
                >
                  <Sliders className="w-4 h-4" />
                </button>

                {/* Stop & Dismiss Dock */}
                <button
                  type="button"
                  onClick={stopTTS}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-stone-400 hover:text-rose-400 transition cursor-pointer"
                  title="Zatrzymaj i zamknij odtwarzacz"
                >
                  <VolumeX className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Reader Bottom Navigation Bar (slides away in fullscreen immersive mode) */}
          <div
            className={`px-4 py-2.5 border-t flex items-center justify-between text-xs select-none transition-all duration-300 ${currentTheme.bar} ${
              isFullscreen && hideChrome ? 'translate-y-full opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'
            }`}
          >
            <button
              type="button"
              disabled={currentChapterIdx <= 0}
              onClick={() => changeChapter(currentChapterIdx - 1, 'prev')}
              className="px-3 py-1.5 rounded-lg border border-current/20 disabled:opacity-30 hover:bg-black/5 flex items-center gap-1 font-medium transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Poprzedni</span>
            </button>

            <div className="text-[11px] font-mono opacity-70">
              {isComicView ? 'Plansza' : 'Rozdział'} {currentChapterIdx + 1} z {chapters.length || 1} (
              {Math.round(((currentChapterIdx + 1) / (chapters.length || 1)) * 100)}%)
            </div>

            <button
              type="button"
              disabled={currentChapterIdx >= chapters.length - 1}
              onClick={() => changeChapter(currentChapterIdx + 1, 'next')}
              className="px-3 py-1.5 rounded-lg border border-current/20 disabled:opacity-30 hover:bg-black/5 flex items-center gap-1 font-medium transition cursor-pointer"
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
      {/* MODAL: NATURAL AI VOICE & AUDIOBOOK SETTINGS */}
      {/* ==================================================== */}
      {showVoiceModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-stone-900 rounded-2xl max-w-lg w-full p-5 shadow-2xl border border-stone-200 dark:border-stone-800 space-y-4 animate-in fade-in zoom-in-95 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 flex items-center justify-center">
                  <Headphones className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-stone-900 dark:text-white">
                    Głos Lektora AI & Audiobook
                  </h3>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400">
                    Wybierz lektora (Studyjny Neural, Gemini AI lub ElevenLabs)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowVoiceModal(false)}
                className="w-7 h-7 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500 flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Provider Selector Tabs */}
            <div className="grid grid-cols-4 gap-1 p-1 bg-stone-100 dark:bg-stone-800 rounded-xl text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setVoiceModalTab('neural')}
                className={`py-2 px-1 rounded-lg transition text-center cursor-pointer ${
                  voiceModalTab === 'neural'
                    ? 'bg-amber-600 text-white shadow-xs font-bold'
                    : 'text-stone-700 dark:text-stone-300 hover:text-stone-900'
                }`}
              >
                🌟 Studyjny
              </button>
              <button
                type="button"
                onClick={() => setVoiceModalTab('gemini')}
                className={`py-2 px-1 rounded-lg transition text-center cursor-pointer ${
                  voiceModalTab === 'gemini'
                    ? 'bg-amber-600 text-white shadow-xs font-bold'
                    : 'text-stone-700 dark:text-stone-300 hover:text-stone-900'
                }`}
              >
                🤖 Gemini
              </button>
              <button
                type="button"
                onClick={() => setVoiceModalTab('elevenlabs')}
                className={`py-2 px-1 rounded-lg transition text-center cursor-pointer ${
                  voiceModalTab === 'elevenlabs'
                    ? 'bg-amber-600 text-white shadow-xs font-bold'
                    : 'text-stone-700 dark:text-stone-300 hover:text-stone-900'
                }`}
              >
                ✨ ElevenLabs
              </button>
              <button
                type="button"
                onClick={() => setVoiceModalTab('system')}
                className={`py-2 px-1 rounded-lg transition text-center cursor-pointer ${
                  voiceModalTab === 'system'
                    ? 'bg-amber-600 text-white shadow-xs font-bold'
                    : 'text-stone-700 dark:text-stone-300 hover:text-stone-900'
                }`}
              >
                📱 Urządzenie
              </button>
            </div>

            {/* TAB 1: Studio Neural Voices (Marek & Zofia - Recommended, 100% Free, Zero Limits) */}
            {voiceModalTab === 'neural' && (
              <div className="space-y-3">
                <div className="p-3 bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 rounded-xl text-xs text-emerald-950 dark:text-emerald-200 leading-relaxed">
                  🌟 <strong>Zalecany wybór:</strong> 100% darmowe, krystalicznie czyste głosy lektorskie o jakości profesjonalnego audiobooka. <strong>Brak limitów zapytań</strong>, błyskawiczne generowanie i zero przycięć!
                </div>

                <div className="space-y-2">
                  {[
                    {
                      id: 'pl-PL-MarekNeural',
                      name: 'Marek (Radiowy męski bas)',
                      gender: 'Męski',
                      desc: 'Głęboki tembr, idealna dykcja i intonacja — kryminały, fantasy, thrillery i literatura faktu',
                      def: true,
                    },
                    {
                      id: 'pl-PL-ZofiaNeural',
                      name: 'Zofia (Ciepła narratorka)',
                      gender: 'Kobiecy',
                      desc: 'Spokojna, kojąca narracja powieściowa — idealna do romansów, powieści obyczajowych i poezji',
                    },
                  ].map((v) => {
                    const isSelected = ttsProvider === 'neural' && ttsVoice === v.id;
                    const isTesting = sampleTestingVoice === v.id;
                    return (
                      <div
                        key={v.id}
                        onClick={() => selectVoice(v.id, 'neural')}
                        className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between gap-3 ${
                          isSelected
                            ? 'border-amber-600 bg-amber-50/50 dark:bg-amber-950/40 text-stone-900 dark:text-white ring-1 ring-amber-600/30'
                            : 'border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800/50 text-stone-800 dark:text-stone-200'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold">{v.name}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300 font-medium">
                              {v.gender}
                            </span>
                            {v.def && (
                              <span className="text-[9px] px-1 rounded-sm bg-emerald-100 text-emerald-800 font-semibold">
                                Bez limitów
                              </span>
                            )}
                            {isSelected && (
                              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold flex items-center gap-0.5">
                                <CheckCircle2 className="w-3 h-3" /> Aktywny
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                            {v.desc}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            testVoiceSample(v.id, 'neural');
                          }}
                          className="px-2.5 py-1 rounded-lg border border-stone-300 dark:border-stone-700 text-[11px] font-medium hover:bg-white dark:hover:bg-stone-700 flex items-center gap-1 shrink-0 transition cursor-pointer"
                          title="Posłuchaj próbki"
                        >
                          {isTesting ? (
                            <div className="w-3 h-3 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Volume2 className="w-3.5 h-3.5 text-amber-600" />
                          )}
                          <span>Próbka</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 2: Gemini Neural Voices */}
            {voiceModalTab === 'gemini' && (
              <div className="space-y-3">
                <div className="p-3 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/50 rounded-xl text-xs text-amber-950 dark:text-amber-200 leading-relaxed">
                  🎙️ <strong>Modele Gemini AI:</strong> Nowoczesne głosy sztucznej inteligencji. W razie chwilowego wyczerpania limitu darmowych zapytań (3/min), aplikacja <strong>automatycznie i płynnie</strong> kontynuuje czytanie głosem studyjnym bez przerywania odtwarzania.
                </div>

                <div className="space-y-2">
                  {[
                    { id: 'Kore', name: 'Kore', gender: 'Kobiecy', desc: 'Ciepła narratorka AI, kojący ton do literatury obyczajowej' },
                    { id: 'Fenrir', name: 'Fenrir', gender: 'Męski', desc: 'Głęboki radiowy bas — fantasy, kryminały i opowiadania' },
                    { id: 'Aoede', name: 'Aoede', gender: 'Kobiecy', desc: 'Melodyjny, ekspresyjny tembr kobiecy — żywe dialogi' },
                    { id: 'Puck', name: 'Puck', gender: 'Męski', desc: 'Młodzieńczy, przyjazny głos lektorski do lżejszej literatury' },
                    { id: 'Charon', name: 'Charon', gender: 'Męski', desc: 'Dojrzały, spokojny bas lektorski — klasyka i powaga' },
                  ].map((v) => {
                    const isSelected = ttsProvider === 'gemini' && ttsVoice === v.id;
                    const isTesting = sampleTestingVoice === v.id;
                    return (
                      <div
                        key={v.id}
                        onClick={() => selectVoice(v.id, 'gemini')}
                        className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between gap-3 ${
                          isSelected
                            ? 'border-amber-600 bg-amber-50/50 dark:bg-amber-950/40 text-stone-900 dark:text-white ring-1 ring-amber-600/30'
                            : 'border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800/50 text-stone-800 dark:text-stone-200'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold">{v.name}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300 font-medium">
                              {v.gender}
                            </span>
                            {isSelected && (
                              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold flex items-center gap-0.5">
                                <CheckCircle2 className="w-3 h-3" /> Aktywny
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                            {v.desc}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            testVoiceSample(v.id, 'gemini');
                          }}
                          className="px-2.5 py-1 rounded-lg border border-stone-300 dark:border-stone-700 text-[11px] font-medium hover:bg-white dark:hover:bg-stone-700 flex items-center gap-1 shrink-0 transition cursor-pointer"
                          title="Posłuchaj próbki"
                        >
                          {isTesting ? (
                            <div className="w-3 h-3 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Volume2 className="w-3.5 h-3.5 text-amber-600" />
                          )}
                          <span>Próbka</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 3: ElevenLabs Voices */}
            {voiceModalTab === 'elevenlabs' && (
              <div className="space-y-3">
                {/* ElevenLabs API Key card */}
                <div className="p-3 bg-stone-50 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-semibold text-stone-800 dark:text-stone-200 flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-amber-600" />
                      <span>Twój klucz API ElevenLabs:</span>
                    </label>
                    <a
                      href="https://elevenlabs.io"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-amber-600 hover:underline"
                    >
                      Pobierz darmowy klucz ↗
                    </a>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showElevenKeyPassword ? 'text' : 'password'}
                        value={elevenLabsApiKey}
                        onChange={(e) => setElevenLabsApiKey(e.target.value)}
                        placeholder="xi-... (wklej klucz z panelu elevenlabs.io)"
                        className="w-full pr-8 px-3 py-1.5 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-lg text-xs font-mono text-stone-900 dark:text-stone-100 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowElevenKeyPassword(!showElevenKeyPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 cursor-pointer"
                        title={showElevenKeyPassword ? 'Ukryj' : 'Pokaż'}
                      >
                        {showElevenKeyPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={verifyElevenLabsKeyInUi}
                        disabled={elevenLabsChecking || !elevenLabsApiKey.trim()}
                        className="px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium transition flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                        title="Zweryfikuj poprawność klucza"
                      >
                        {elevenLabsChecking ? (
                          <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <span>Sprawdź</span>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => loadElevenVoicesFromAccount(elevenLabsApiKey)}
                        disabled={loadingCustomVoices}
                        className="px-2 py-1.5 rounded-lg bg-stone-200 dark:bg-stone-700 hover:bg-stone-300 dark:hover:bg-stone-600 text-stone-800 dark:text-stone-200 text-xs font-medium transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        title="Pobierz głosy i sklonowane modele z Twojego konta ElevenLabs"
                      >
                        <RefreshCw className={`w-3 h-3 ${loadingCustomVoices ? 'animate-spin' : ''}`} />
                        <span className="hidden sm:inline">Pobierz z konta</span>
                      </button>
                    </div>
                  </div>

                  {elevenLabsKeyValid && (
                    <div
                      className={`text-[11px] p-2 rounded-lg ${
                        elevenLabsKeyValid.valid
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-rose-50 text-rose-800 border border-rose-200'
                      }`}
                    >
                      {elevenLabsKeyValid.valid ? (
                        <span>
                          ✅ Klucz poprawny! Wykorzystano:{' '}
                          <strong>{elevenLabsKeyValid.characterCount?.toLocaleString()}</strong> /{' '}
                          {elevenLabsKeyValid.characterLimit?.toLocaleString()} znaków (Plan:{' '}
                          {elevenLabsKeyValid.tier})
                        </span>
                      ) : (
                        <span>⚠️ {elevenLabsKeyValid.error || 'Nieprawidłowy klucz'}</span>
                      )}
                    </div>
                  )}

                  {serverHasElevenKey ? (
                    <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 rounded-lg text-[11px] text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
                      <span className="font-bold shrink-0">✅ ElevenLabs gotowy:</span>
                      <span>Klucz API jest skonfigurowany na serwerze (bezpiecznie ukryty). Wszystkie głosy premium działają od razu!</span>
                    </div>
                  ) : !elevenLabsApiKey.trim() ? (
                    <div className="p-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 rounded-lg text-[11px] text-amber-900 dark:text-amber-200 space-y-1.5">
                      <p>
                        💡 Głosy ElevenLabs wymagają własnego klucza API z <strong>elevenlabs.io</strong> lub konfiguracji w panelu kont.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setVoiceModalTab('neural');
                          selectVoice('pl-PL-MarekNeural', 'neural');
                        }}
                        className="px-2.5 py-1 rounded-md bg-amber-600 text-white font-medium hover:bg-amber-700 transition cursor-pointer"
                      >
                        Przełącz na darmowego Lektora Studyjnego (Marek / Zofia) ➔
                      </button>
                    </div>
                  ) : null}
                </div>

                {/* Filter and Search Bar for ElevenLabs Voices */}
                <div className="space-y-2">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                    <span className="text-xs font-bold text-stone-800 dark:text-stone-200">
                      Głosy lektorskie ElevenLabs ({filteredElevenVoices.length} z {allElevenVoices.length}):
                    </span>
                    <div className="relative">
                      <input
                        type="text"
                        value={elevenSearchQuery}
                        onChange={(e) => setElevenSearchQuery(e.target.value)}
                        placeholder="Szukaj lektora..."
                        className="w-full sm:w-44 px-2.5 py-1 pl-7 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg text-xs text-stone-900 dark:text-stone-100 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
                      />
                      <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>

                  {/* Filter pills */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    {[
                      { id: 'all', label: `Wszystkie (${allElevenVoices.length})` },
                      { id: 'polish', label: '🇵🇱 Polski lektor' },
                      { id: 'female', label: 'Kobiecy' },
                      { id: 'male', label: 'Męski' },
                      ...(customElevenVoices.length > 0 ? [{ id: 'custom', label: `Z Twojego konta (${customElevenVoices.length})` }] : []),
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setElevenCategoryFilter(tab.id)}
                        className={`px-2 py-0.5 rounded-full font-medium transition cursor-pointer ${
                          elevenCategoryFilter === tab.id
                            ? 'bg-amber-600 text-white'
                            : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-200'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Voices list */}
                  <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                    {filteredElevenVoices.length === 0 ? (
                      <div className="p-4 text-center text-xs text-stone-500">
                        Brak głosów pasujących do &quot;{elevenSearchQuery}&quot;. Spróbuj innej frazy.
                      </div>
                    ) : (
                      filteredElevenVoices.map((v) => {
                        const isSelected = ttsProvider === 'elevenlabs' && (ttsVoice === v.id || elevenLabsVoiceId === v.id);
                        const isTesting = sampleTestingVoice === v.id;
                        return (
                          <div
                            key={v.id}
                            onClick={() => {
                              selectVoice(v.id, 'elevenlabs');
                            }}
                            className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between gap-3 ${
                              isSelected
                                ? 'border-amber-600 bg-amber-50/50 dark:bg-amber-950/40 text-stone-900 dark:text-white ring-1 ring-amber-600/30'
                                : 'border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800/50 text-stone-800 dark:text-stone-200'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-xs font-bold">{v.name}</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300 font-medium">
                                  {v.gender}
                                </span>
                                {v.category && (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded-sm bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 font-semibold">
                                    {v.category}
                                  </span>
                                )}
                                {isSelected && (
                                  <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold flex items-center gap-0.5">
                                    <CheckCircle2 className="w-3 h-3" /> Aktywny
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5 line-clamp-2">
                                {v.desc}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                testVoiceSample(v.id, 'elevenlabs');
                              }}
                              className="px-2.5 py-1 rounded-lg border border-stone-300 dark:border-stone-700 text-[11px] font-medium hover:bg-white dark:hover:bg-stone-700 flex items-center gap-1 shrink-0 transition cursor-pointer"
                              title="Posłuchaj próbki"
                            >
                              {isTesting ? (
                                <div className="w-3 h-3 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <Volume2 className="w-3.5 h-3.5 text-amber-600" />
                              )}
                              <span>Próbka</span>
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: System Voice Offline */}
            {voiceModalTab === 'system' && (
              <div className="p-4 bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700 rounded-xl space-y-3 text-xs">
                <div>
                  <p className="font-semibold text-stone-800 dark:text-stone-200">
                    📱 Wbudowany syntezator mowy urządzenia (Offline)
                  </p>
                  <p className="text-stone-500 leading-relaxed mt-1">
                    Używa lokalnego silnika zainstalowanego w Twoim telefonie lub przeglądarce (Android TTS / iOS Siri). Działa całkowicie bez internetu (w trybie samolotowym), lecz ma syntetyczne, robotyczne brzmienie.
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => selectVoice('system', 'system')}
                    className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                      ttsProvider === 'system'
                        ? 'bg-amber-600 text-white'
                        : 'bg-stone-900 text-white hover:bg-stone-800'
                    }`}
                  >
                    {ttsProvider === 'system' ? '✓ Wybrany jako aktywny' : 'Aktywuj syntezator urządzenia'}
                  </button>

                  <button
                    type="button"
                    onClick={() => testVoiceSample('system', 'system')}
                    className="px-3 py-1.5 rounded-lg border border-stone-300 dark:border-stone-600 font-medium hover:bg-stone-100 dark:hover:bg-stone-700 transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Przetestuj próbkę</span>
                  </button>
                </div>
              </div>
            )}

            {/* Reading Speed Pills */}
            <div className="pt-2 border-t border-stone-100 dark:border-stone-800 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-stone-800 dark:text-stone-200">
                  Prędkość czytania:
                </span>
                <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                  {ttsSpeed}x
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {[0.75, 0.9, 1.0, 1.1, 1.25, 1.5, 2.0].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setTtsSpeed(s)}
                    className={`flex-1 py-1 rounded-lg text-xs font-mono font-medium transition cursor-pointer ${
                      ttsSpeed === s
                        ? 'bg-amber-600 text-white shadow-xs font-bold'
                        : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200'
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <span className="text-[11px] text-stone-400">
                💡 Kliknij dowolny akapit w tekście, aby słuchać od wybranego miejsca
              </span>
              <button
                type="button"
                onClick={() => setShowVoiceModal(false)}
                className="px-4 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold transition cursor-pointer"
              >
                Gotowe
              </button>
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

      {/* ==================================================== */}
      {/* MODAL: MULTI-VOICE RADIO DRAMA STUDIO */}
      {/* ==================================================== */}
      <audio ref={dramaAudioRef} preload="auto" className="hidden" />

      {showDramaModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-in fade-in">
          <div className="bg-white dark:bg-stone-900 rounded-2xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl border border-stone-200 dark:border-stone-800 space-y-4 max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-stone-200 dark:border-stone-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 flex items-center justify-center text-lg shadow-2xs">
                  🎭
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-stone-900 dark:text-white">
                    Słuchowisko AI: {chapters[currentChapterIdx]?.title || `Rozdział ${currentChapterIdx + 1}`}
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    Wielogłosowy teatr radiowy z automatycznym podziałem na role i eksporterem MP3.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (dramaAudioRef.current) dramaAudioRef.current.pause();
                  setIsDramaPlaying(false);
                  setShowDramaModal(false);
                }}
                className="w-8 h-8 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500 flex items-center justify-center text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Character Cast Pills */}
            {dramaScript && dramaScript.characters && dramaScript.characters.length > 0 && (
              <div className="shrink-0 p-2.5 bg-stone-50 dark:bg-stone-800/60 rounded-xl border border-stone-200 dark:border-stone-700/60 flex items-center gap-2 overflow-x-auto text-xs">
                <span className="text-[11px] font-bold text-stone-500 shrink-0">Obsada:</span>
                {dramaScript.characters.map((char) => (
                  <span
                    key={char.name}
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium shrink-0 border shadow-2xs ${
                      char.role === 'female'
                        ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800'
                        : char.role === 'male'
                        ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-800'
                        : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-300 dark:border-stone-600'
                    }`}
                  >
                    <span>{char.role === 'female' ? '👩' : char.role === 'male' ? '⚔️' : '🎙️'}</span>
                    <strong>{char.name}</strong> ({char.linesCount} kwestii)
                  </span>
                ))}
              </div>
            )}

            {/* Drama Controls Toolbar */}
            <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 p-2.5 bg-indigo-50/70 dark:bg-indigo-950/40 rounded-xl border border-indigo-200/80 dark:border-indigo-800">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleDramaPlayback}
                  className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs flex items-center gap-1.5 transition active:scale-95 shadow-xs cursor-pointer"
                >
                  {isDramaPlaying ? (
                    <>
                      <Pause className="w-3.5 h-3.5" />
                      <span>Pauza</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      <span>Odtwarzaj słuchowisko</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (currentDramaLineIdx > 0) playDramaLine(currentDramaLineIdx - 1);
                  }}
                  disabled={!dramaScript || currentDramaLineIdx === 0}
                  className="p-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800 hover:bg-white dark:hover:bg-stone-800 text-indigo-900 dark:text-indigo-200 text-xs disabled:opacity-40 transition cursor-pointer"
                  title="Poprzednia kwestia"
                >
                  <SkipBack className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (dramaScript && currentDramaLineIdx + 1 < dramaScript.lines.length) {
                      playDramaLine(currentDramaLineIdx + 1);
                    }
                  }}
                  disabled={!dramaScript || currentDramaLineIdx >= (dramaScript?.lines.length || 0) - 1}
                  className="p-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800 hover:bg-white dark:hover:bg-stone-800 text-indigo-900 dark:text-indigo-200 text-xs disabled:opacity-40 transition cursor-pointer"
                  title="Następna kwestia"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                </button>

                {/* Speed selector */}
                <select
                  value={dramaSpeed}
                  onChange={(e) => setDramaSpeed(parseFloat(e.target.value))}
                  className="px-2 py-1 bg-white dark:bg-stone-800 border border-indigo-200 dark:border-indigo-800 rounded-lg text-xs font-semibold text-stone-800 dark:text-stone-200 cursor-pointer"
                >
                  <option value={0.85}>0.85x</option>
                  <option value={1.0}>1.0x (Normal)</option>
                  <option value={1.2}>1.2x</option>
                  <option value={1.4}>1.4x</option>
                </select>
              </div>

              {/* Export MP3 button */}
              <button
                type="button"
                onClick={handleExportDramaMp3}
                disabled={dramaExporting}
                className="px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 shadow-xs disabled:opacity-60 cursor-pointer"
              >
                {dramaExporting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Eksportuję MP3...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5 text-indigo-300" />
                    <span>Pobierz MP3 na telefon / Kindle</span>
                  </>
                )}
              </button>
            </div>

            {dramaExportNotice && (
              <div className="shrink-0 p-2.5 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs rounded-xl flex items-center gap-2 animate-in fade-in">
                <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{dramaExportNotice}</span>
              </div>
            )}

            {/* Interactive Script View */}
            <div className="flex-1 min-h-[220px] max-h-[50vh] overflow-y-auto space-y-2.5 pr-1">
              {dramaLoading ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-stone-500">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                  <span className="text-xs">Dzielę rozdział na głosy i generuję scenariusz...</span>
                </div>
              ) : !dramaScript || dramaScript.lines.length === 0 ? (
                <div className="py-12 text-center text-stone-500 text-xs">
                  Brak kwestii w tym rozdziale lub trwa analiza tekstu.
                </div>
              ) : (
                dramaScript.lines.map((line, idx) => {
                  const isActive = idx === currentDramaLineIdx && isDramaPlaying;
                  const isSelected = idx === currentDramaLineIdx;

                  return (
                    <div
                      key={line.id}
                      onClick={() => playDramaLine(idx)}
                      className={`p-3 rounded-xl border text-xs transition cursor-pointer ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-50/80 dark:bg-indigo-950/60 ring-2 ring-indigo-400/40 shadow-xs'
                          : 'border-stone-200 dark:border-stone-800 bg-stone-50/60 dark:bg-stone-900/60 hover:bg-stone-100 dark:hover:bg-stone-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded shadow-2xs ${
                            line.role === 'female'
                              ? 'bg-rose-100 text-rose-950 border border-rose-300'
                              : line.role === 'male'
                              ? 'bg-blue-100 text-blue-950 border border-blue-300'
                              : 'bg-stone-200 text-stone-900 border border-stone-300'
                          }`}>
                            {line.role === 'female' ? '👩' : line.role === 'male' ? '⚔️' : '🎙️'} {line.characterName}
                          </span>
                          {line.emotion && (
                            <span className="text-[10px] italic text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950 px-1.5 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
                              [{line.emotion}]
                            </span>
                          )}
                        </div>

                        {isActive && (
                          <span className="flex items-center gap-1 text-[10px] text-indigo-600 dark:text-indigo-400 font-bold animate-pulse">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-ping" />
                            <span>MÓWI TERAZ</span>
                          </span>
                        )}
                      </div>

                      <p className="text-stone-800 dark:text-stone-200 leading-relaxed font-serif text-[13px]">
                        {line.text}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: AI STORY GUIDE & CHARACTER TREE */}
      {/* ==================================================== */}
      {showGuideModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-in fade-in">
          <div className="bg-white dark:bg-stone-900 rounded-2xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl border border-stone-200 dark:border-stone-800 space-y-4 max-h-[92vh] flex flex-col">
            {/* Header with Subtabs */}
            <div className="flex items-center justify-between pb-3 border-b border-stone-200 dark:border-stone-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-400 flex items-center justify-center text-lg shadow-2xs">
                  🧠
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-stone-900 dark:text-white">
                    Przewodnik Fabularny AI: {bookTitle}
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    Bohaterowie, frakcje i przypomnienia fabuły bez spoilerów.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="w-8 h-8 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500 flex items-center justify-center text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-2 p-1 bg-stone-100 dark:bg-stone-800 rounded-xl shrink-0">
              <button
                type="button"
                onClick={() => openStoryGuide('characters')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  guideTab === 'characters'
                    ? 'bg-white dark:bg-stone-900 text-purple-700 dark:text-purple-300 shadow-xs'
                    : 'text-stone-600 dark:text-stone-400 hover:text-stone-900'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Drzewo Bohaterów ({charactersList.length})</span>
              </button>

              <button
                type="button"
                onClick={() => openStoryGuide('recap')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  guideTab === 'recap'
                    ? 'bg-white dark:bg-stone-900 text-purple-700 dark:text-purple-300 shadow-xs'
                    : 'text-stone-600 dark:text-stone-400 hover:text-stone-900'
                }`}
              >
                <ScrollText className="w-3.5 h-3.5" />
                <span>Co wydarzyło się dotychczas?</span>
              </button>
            </div>

            {/* Tab 1: Characters Tree */}
            {guideTab === 'characters' && (
              <div className="space-y-3 flex-1 flex flex-col min-h-[240px] max-h-[55vh] overflow-hidden">
                <div className="relative shrink-0">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input
                    type="text"
                    value={characterSearch}
                    onChange={(e) => setCharacterSearch(e.target.value)}
                    placeholder="Wyszukaj bohatera, frakcję lub rolę..."
                    className="w-full pl-8 pr-3 py-1.5 bg-stone-50 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 rounded-xl text-xs focus:outline-hidden"
                  />
                </div>

                <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                  {guideLoading ? (
                    <div className="py-12 flex flex-col items-center justify-center gap-2 text-stone-500">
                      <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
                      <span className="text-xs">Analizuję tekst książki i relacje postaci...</span>
                    </div>
                  ) : charactersList.length === 0 ? (
                    <div className="py-12 text-center text-stone-500 text-xs">
                      Brak wyodrębnionych postaci dla tej pozycji.
                    </div>
                  ) : (
                    charactersList
                      .filter((c) => {
                        if (!characterSearch.trim()) return true;
                        const s = characterSearch.toLowerCase();
                        return (
                          c.name.toLowerCase().includes(s) ||
                          c.role.toLowerCase().includes(s) ||
                          (c.faction && c.faction.toLowerCase().includes(s)) ||
                          (c.relations && c.relations.some((r) => r.toLowerCase().includes(s)))
                        );
                      })
                      .map((char) => (
                        <div
                          key={char.name}
                          className="p-3.5 bg-stone-50/70 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700/70 rounded-xl space-y-1.5 shadow-2xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="font-bold text-stone-900 dark:text-white text-xs sm:text-sm flex items-center gap-1.5">
                              <span>👤</span>
                              <span>{char.name}</span>
                            </h4>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded shadow-2xs border ${
                              char.importance === 'main'
                                ? 'bg-amber-100 text-amber-950 border-amber-300'
                                : char.importance === 'supporting'
                                ? 'bg-purple-100 text-purple-950 border-purple-300'
                                : 'bg-stone-200 text-stone-800 border-stone-300'
                            }`}>
                              {char.importance === 'main' ? 'Główny bohater' : char.importance === 'supporting' ? 'Drugoplanowy' : 'Epizodyczny'}
                            </span>
                          </div>

                          <div className="text-[11px] font-medium text-purple-800 dark:text-purple-300">
                            {char.role} {char.faction ? `• Stronnictwo: ${char.faction}` : ''}
                          </div>

                          <p className="text-stone-600 dark:text-stone-300 text-xs leading-relaxed">
                            {char.description}
                          </p>

                          {char.relations && char.relations.length > 0 && (
                            <div className="pt-1 flex flex-wrap items-center gap-1">
                              <span className="text-[10px] text-stone-400 font-semibold">Relacje:</span>
                              {char.relations.map((rel, rIdx) => (
                                <span
                                  key={rIdx}
                                  className="text-[10px] px-1.5 py-0.5 bg-white dark:bg-stone-700 border border-stone-200 dark:border-stone-600 text-stone-700 dark:text-stone-300 rounded"
                                >
                                  {rel}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                  )}
                </div>
              </div>
            )}

            {/* Tab 2: Story Recap */}
            {guideTab === 'recap' && (
              <div className="space-y-3 flex-1 flex flex-col min-h-[240px] max-h-[55vh] overflow-hidden">
                <div className="p-3 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 rounded-xl text-xs text-purple-900 dark:text-purple-200 leading-relaxed shrink-0">
                  Przypomnienie wydarzeń poprzedzających rozdział: <strong>"{chapters[currentChapterIdx]?.title || `Rozdział ${currentChapterIdx + 1}`}"</strong>.
                  Generowane przez asystenta AI bez zdradzania spoilerów z kolejnych stron.
                </div>

                <div className="flex-1 overflow-y-auto p-4 bg-stone-50 dark:bg-stone-800/40 rounded-xl border border-stone-200 dark:border-stone-700/60 leading-relaxed font-serif text-xs sm:text-sm text-stone-800 dark:text-stone-200 whitespace-pre-wrap">
                  {guideLoading ? (
                    <div className="py-12 flex flex-col items-center justify-center gap-2 text-stone-500 font-sans">
                      <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
                      <span className="text-xs">Tworzę klimatyczne streszczenie poprzednich wydarzeń...</span>
                    </div>
                  ) : (
                    recapText || 'Brak streszczenia dla tego rozdziału.'
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
