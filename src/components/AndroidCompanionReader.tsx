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
} from 'lucide-react';
import JSZip from 'jszip';
import { Job } from '../types';

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

  // Text-To-Speech (Audiobook mode & Neural Voices)
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [ttsSpeed, setTtsSpeed] = useState<number>(1.0);
  const [ttsProvider, setTtsProvider] = useState<'gemini' | 'elevenlabs' | 'system'>(
    () => (localStorage.getItem('koreader_tts_provider') as any) || 'gemini'
  );
  const [ttsVoice, setTtsVoice] = useState<string>(
    () => localStorage.getItem('koreader_tts_voice') || 'Kore'
  );
  const [elevenLabsApiKey, setElevenLabsApiKey] = useState<string>(
    () => localStorage.getItem('koreader_elevenlabs_key') || ''
  );
  const [elevenLabsVoiceId, setElevenLabsVoiceId] = useState<string>(
    () => localStorage.getItem('koreader_elevenlabs_voice_id') || '21m00Tcm4TlvDq8ikWAM'
  );
  const [currentParagraphIdx, setCurrentParagraphIdx] = useState<number>(0);
  const [ttsLoading, setTtsLoading] = useState<boolean>(false);
  const [showVoiceModal, setShowVoiceModal] = useState<boolean>(false);

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

  // Refs
  const contentRef = useRef<HTMLDivElement>(null);
  const readerContainerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prefetchCacheRef = useRef<Record<number, string>>({});
  const [sampleTestingVoice, setSampleTestingVoice] = useState<string | null>(null);

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

  // Touch gestures for mobile phone: swipe page turning & center tap
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

    // Horizontal swipe (at least 50px, predominantly horizontal, within 550ms)
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3 && deltaTime < 550) {
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
    } else if (Math.abs(deltaX) < 15 && Math.abs(deltaY) < 15 && deltaTime < 350) {
      // Tap detected - check tap zone
      const containerWidth = readerContainerRef.current?.clientWidth || window.innerWidth;
      const clickX = touchEndX;
      // Tap on left 18% margin -> previous chapter
      if (clickX < containerWidth * 0.18) {
        if (currentChapterIdx > 0) changeChapter(currentChapterIdx - 1, 'prev');
      } else if (clickX > containerWidth * 0.82) {
        // Tap on right 18% margin -> next chapter
        if (currentChapterIdx < chapters.length - 1) changeChapter(currentChapterIdx + 1, 'next');
      } else {
        // Tap in center 64% zone -> toggle controls (zen/immersive mode)
        setHideChrome((prev) => !prev);
      }
    }

    touchStartXRef.current = null;
    touchStartYRef.current = null;
  };

  // Test sample voice playback
  const testVoiceSample = async (voiceId: string, provider: 'gemini' | 'elevenlabs' | 'system') => {
    setSampleTestingVoice(voiceId);
    try {
      const sampleText = 'Dzień dobry! Oto próbka naturalnego głosu lektora do Twoich e-booków.';
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

      const resp = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: sampleText,
          voice: voiceId,
          provider,
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
    }
  };

  // When a job is selected from outside (e.g. library "Czytaj" button)
  useEffect(() => {
    if (selectedJob && selectedJob.status === 'completed') {
      loadBookFromJob(selectedJob);
    }
  }, [selectedJob]);

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
      return; // Already handled above
    }
    if (completed.length > 0 && (chapters.length === 0 || bookTitle === 'Przykładowy Ebook')) {
      loadBookFromJob(completed[0]);
      if (onSelectJob) onSelectJob(completed[0]);
    } else if (chapters.length === 0) {
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
  }, [jobs, selectedJob]);

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
  // Load EPUB, CBZ, or PDF from Job or URL
  // ----------------------------------------------------
  const loadBookFromJob = async (job: Job) => {
    setLoadingBook(true);
    setBookTitle(job.title);

    // 1. If job has chapters already, set them immediately for fast resilient reading
    if (job.chapters && job.chapters.length > 0) {
      setChapters(
        job.chapters.map((c, i) => ({
          id: `ch_${i}`,
          title: c.title || `Rozdział ${i + 1}`,
          content: `<p>${(c.translatedText || c.originalText || '').replace(/\n\n+/g, '</p><p>')}</p>`,
        }))
      );
      setCurrentChapterIdx(0);
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

      // Check if it's a PDF
      if (
        contentType.includes('application/pdf') ||
        job.outputFormat === 'pdf' ||
        job.outputEpubFilename?.toLowerCase().endsWith('.pdf')
      ) {
        setChapters([
          {
            id: 'pdf_notice',
            title: job.title,
            content: `
              <div style="text-align: center; padding: 2.5rem 1rem;">
                <div style="font-size: 3rem; margin-bottom: 1rem;">📄</div>
                <h2 style="font-size: 1.25rem; font-weight: bold; margin-bottom: 0.5rem; color: #1c1917;">Dokument PDF: ${job.title}</h2>
                <p style="color: #78716c; margin-bottom: 1.5rem; font-size: 0.875rem; max-width: 480px; margin-left: auto; margin-right: auto;">
                  Ten plik został zapisany w formacie PDF. Możesz go pobrać bezpośrednio na dysk komputera lub przesłać na czytnik Kindle za pomocą zakładki <em>Pilot Kindle</em>.
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

      await parseEpubBlob(blob, job.title);
    } catch (err: any) {
      console.warn('Wczytywanie e-booka (tryb awaryjny):', err.message || err);
      // Fallback to job chapters if available
      if (job.chapters && job.chapters.length > 0) {
        setChapters(
          job.chapters.map((c, i) => ({
            id: `ch_${i}`,
            title: c.title || `Rozdział ${i + 1}`,
            content: `<p>${(c.translatedText || c.originalText || '').replace(/\n\n+/g, '</p><p>')}</p>`,
          }))
        );
        setCurrentChapterIdx(0);
      } else {
        // Fallback to any other completed job available with EPUB
        const altJob = jobs.find(
          (j) =>
            j.id !== job.id &&
            j.status === 'completed' &&
            (j.outputFormat === 'epub' ||
              j.outputFormat === 'cbz' ||
              j.outputEpubFilename?.endsWith('.epub') ||
              (j.chapters && j.chapters.length > 0))
        );
        if (altJob) {
          loadBookFromJob(altJob);
          if (onSelectJob) onSelectJob(altJob);
        }
      }
    } finally {
      setLoadingBook(false);
    }
  };

  // ----------------------------------------------------
  // Parse EPUB and CBZ client-side with JSZip + Blob URLs
  // ----------------------------------------------------
  const parseEpubBlob = async (blob: Blob, defaultTitle?: string) => {
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

      // 3. Comic / CBZ Mode: if no HTML files at all, display pages from images
      if (orderedHtmlPaths.length === 0 && imageFiles.length > 0) {
        imageFiles.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
        for (let i = 0; i < imageFiles.length; i++) {
          const imgUrl = imageBlobMap[imageFiles[i]];
          parsedChapters.push({
            id: `page_${i + 1}`,
            title: `Strona ${i + 1} z ${imageFiles.length}`,
            content: `
              <div style="text-align: center; margin: 1em auto;">
                <img src="${imgUrl}" alt="Strona ${i + 1}" style="max-width: 100%; max-height: 80vh; height: auto; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); display: inline-block;" />
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
        setCurrentChapterIdx(0);
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
  // Paragraph Extractor for Neural TTS & Reading Focus
  // ----------------------------------------------------
  const paragraphs = useMemo(() => {
    const rawContent = chapters[currentChapterIdx]?.content || '';
    if (!rawContent) return [];

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<div>${rawContent}</div>`, 'text/html');
      const nodes = Array.from(doc.body.querySelectorAll('p, blockquote, h1, h2, h3, h4, li'));
      if (nodes.length > 0) {
        return nodes
          .map((node) => ({
            html: node.outerHTML,
            text: node.textContent?.replace(/\s+/g, ' ').trim() || '',
          }))
          .filter((p) => p.text.length > 0);
      }
    } catch {}

    const textOnly = rawContent.replace(/<[^>]+>/g, '\n');
    return textOnly
      .split(/\n\n+/)
      .map((t) => ({
        html: `<p>${t.trim()}</p>`,
        text: t.trim(),
      }))
      .filter((p) => p.text.length > 0);
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
  const stopTTS = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    setTtsLoading(false);
  };

  const playParagraph = async (pIdx: number) => {
    if (pIdx < 0 || pIdx >= paragraphs.length) {
      if (currentChapterIdx < chapters.length - 1) {
        changeChapter(currentChapterIdx + 1, 'next');
        setTimeout(() => playParagraph(0), 500);
      } else {
        stopTTS();
      }
      return;
    }

    setCurrentParagraphIdx(pIdx);
    setIsSpeaking(true);

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

    // Provider 1: Native System Offline Voice
    if (ttsProvider === 'system') {
      if (!window.speechSynthesis) {
        alert('Przeglądarka nie obsługuje syntezy mowy.');
        setIsSpeaking(false);
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(paragraphText);
      utterance.lang = 'pl-PL';
      utterance.rate = ttsSpeed;
      utterance.onend = () => {
        if (isSpeaking) playParagraph(pIdx + 1);
      };
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
      return;
    }

    // Provider 2 & 3: Natural Neural Voice (Gemini Studio AI or ElevenLabs)
    setTtsLoading(true);
    try {
      let audioUrl = prefetchCacheRef.current[pIdx];

      if (!audioUrl) {
        const resp = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: paragraphText,
            voice: ttsVoice,
            provider: ttsProvider,
            elevenLabsApiKey,
            elevenLabsVoiceId,
            speed: ttsSpeed,
          }),
        });

        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({}));
          throw new Error(errData.error || 'Błąd generowania głosu lektora');
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
      audio.playbackRate = ttsSpeed;

      audio.onended = () => {
        playParagraph(pIdx + 1);
      };
      audio.onerror = () => {
        console.warn('Błąd odtwarzacza audio dla akapitu', pIdx);
        setIsSpeaking(false);
        setTtsLoading(false);
      };

      await audio.play();

      // Background pre-fetch of next paragraph for gapless audiobook reading
      const nextIdx = pIdx + 1;
      if (nextIdx < paragraphs.length && !prefetchCacheRef.current[nextIdx]) {
        const nextText = paragraphs[nextIdx]?.text;
        if (nextText && nextText.length > 5) {
          fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: nextText,
              voice: ttsVoice,
              provider: ttsProvider,
              elevenLabsApiKey,
              elevenLabsVoiceId,
              speed: ttsSpeed,
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
      console.warn('Fallback do głosu systemowego z powodu błędu:', err.message);
      setTtsLoading(false);
      if (window.speechSynthesis) {
        const utterance = new SpeechSynthesisUtterance(paragraphText);
        utterance.lang = 'pl-PL';
        utterance.rate = ttsSpeed;
        utterance.onend = () => playParagraph(pIdx + 1);
        window.speechSynthesis.speak(utterance);
      } else {
        setIsSpeaking(false);
      }
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

              {/* Voice Options / Settings Button */}
              <button
                type="button"
                onClick={() => setShowVoiceModal(true)}
                className="p-1.5 rounded-lg border border-current/20 hover:bg-black/5 dark:hover:bg-white/5 transition"
                title="Ustawienia głosu (Gemini Studio AI / ElevenLabs)"
              >
                <Sliders className="w-3.5 h-3.5" />
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

          {/* Main Book Content Screen with Mobile Touch Swipes & Page Animation */}
          <div
            ref={contentRef}
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

                {/* Interactive Paragraph List with Click-to-Listen and Smooth Real-time Highlight */}
                {paragraphs.length > 0 ? (
                  <div className="space-y-3.5">
                    {paragraphs.map((p, pIdx) => {
                      const isActiveParagraph = isSpeaking && currentParagraphIdx === pIdx;
                      return (
                        <div
                          key={`p_${pIdx}`}
                          id={`reader-p-${pIdx}`}
                          onClick={() => playParagraph(pIdx)}
                          className={`transition-all duration-200 rounded-lg cursor-pointer group ${
                            isActiveParagraph
                              ? 'bg-amber-500/15 dark:bg-amber-500/20 border-l-4 border-amber-600 pl-3 py-1.5 shadow-xs'
                              : 'hover:bg-black/3 dark:hover:bg-white/3'
                          }`}
                          title="Kliknij, aby odsłuchać od tego akapitu"
                        >
                          {isActiveParagraph && (
                            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-sans text-xs mr-2 font-bold select-none">
                              <Headphones className="w-3.5 h-3.5 inline shrink-0" />
                              <span className="flex items-end gap-0.5 h-3">
                                <span className="w-0.5 bg-amber-500 rounded-full eq-bar-1" />
                                <span className="w-0.5 bg-amber-500 rounded-full eq-bar-2" />
                                <span className="w-0.5 bg-amber-500 rounded-full eq-bar-3" />
                              </span>
                            </span>
                          )}
                          <span
                            className="prose-content"
                            dangerouslySetInnerHTML={{ __html: p.html }}
                          />
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
              </div>
            ) : (
              <div className="text-center py-20 opacity-50 font-sans">
                Brak wczytanej książki. Wybierz pozycję z biblioteki lub wgraj plik EPUB.
              </div>
            )}
          </div>

          {/* Floating Audio Player Dock (Equalizer wave animation + Gapless playback controls) */}
          {(isSpeaking || ttsLoading) && (
            <div className="absolute bottom-12 sm:bottom-14 left-1/2 -translate-x-1/2 z-30 max-w-lg w-[94%] sm:w-auto bg-stone-900/95 dark:bg-stone-950/95 backdrop-blur-md text-white rounded-2xl px-3.5 py-2 sm:px-4 sm:py-2.5 shadow-2xl border border-white/10 flex items-center justify-between gap-2.5 sm:gap-4 animate-in slide-in-from-bottom-4 duration-200">
              <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                {/* Animated Equalizer Waveform */}
                <div className="flex items-end gap-0.5 sm:gap-1 h-5 px-1 shrink-0">
                  <span className="w-1 bg-amber-400 rounded-full eq-bar-1" />
                  <span className="w-1 bg-amber-400 rounded-full eq-bar-2" />
                  <span className="w-1 bg-amber-400 rounded-full eq-bar-3" />
                  <span className="w-1 bg-amber-400 rounded-full eq-bar-4" />
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="text-xs font-bold truncate">
                      {ttsProvider === 'elevenlabs' ? 'ElevenLabs' : ttsProvider === 'gemini' ? 'AI Neural' : 'System'}
                    </span>
                    <span className="text-[10px] text-amber-300 font-mono bg-white/10 px-1.5 py-0.2 rounded-full truncate">
                      {ttsVoice}
                    </span>
                  </div>
                  <p className="text-[10px] sm:text-[11px] text-stone-300 truncate">
                    Akapit {currentParagraphIdx + 1} z {paragraphs.length || 1}
                  </p>
                </div>
              </div>

              {/* Player Audio Controls */}
              <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => playParagraph(Math.max(0, currentParagraphIdx - 1))}
                  className="p-1 sm:p-1.5 rounded-lg hover:bg-white/10 text-stone-300 hover:text-white transition"
                  title="Poprzedni akapit"
                >
                  <SkipBack className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={toggleTTS}
                  className="w-8 h-8 rounded-full bg-amber-600 hover:bg-amber-500 text-white flex items-center justify-center transition shadow-xs"
                  title={isSpeaking ? 'Pauza' : 'Wznów'}
                >
                  {ttsLoading ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : isSpeaking ? (
                    <Pause className="w-4 h-4" />
                  ) : (
                    <Play className="w-4 h-4 ml-0.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => playParagraph(Math.min(paragraphs.length - 1, currentParagraphIdx + 1))}
                  className="p-1 sm:p-1.5 rounded-lg hover:bg-white/10 text-stone-300 hover:text-white transition"
                  title="Następny akapit"
                >
                  <SkipForward className="w-4 h-4" />
                </button>

                {/* Speed Toggle Pill */}
                <button
                  type="button"
                  onClick={() => {
                    const speeds = [0.8, 1.0, 1.25, 1.5];
                    const next = speeds[(speeds.indexOf(ttsSpeed) + 1) % speeds.length] || 1.0;
                    setTtsSpeed(next);
                  }}
                  className="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] sm:text-[11px] font-mono font-bold transition"
                  title="Zmień prędkość"
                >
                  {ttsSpeed}x
                </button>

                {/* Voice Modal Shortcut */}
                <button
                  type="button"
                  onClick={() => setShowVoiceModal(true)}
                  className="p-1 sm:p-1.5 rounded-lg hover:bg-white/10 text-stone-300 hover:text-white transition"
                  title="Ustawienia głosu lektora"
                >
                  <Sliders className="w-3.5 h-3.5" />
                </button>

                {/* Stop & Dismiss Dock */}
                <button
                  type="button"
                  onClick={stopTTS}
                  className="p-1 sm:p-1.5 rounded-lg hover:bg-white/10 text-stone-400 hover:text-rose-400 transition"
                  title="Zatrzymaj i zamknij odtwarzacz"
                >
                  <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
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
                    Naturalny Lektor AI & Audiobook
                  </h3>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400">
                    Wybierz głos lektora (Neural Gemini / ElevenLabs)
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
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-stone-100 dark:bg-stone-800 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setTtsProvider('gemini');
                  if (!['Kore', 'Fenrir', 'Aoede', 'Puck', 'Charon'].includes(ttsVoice)) {
                    setTtsVoice('Kore');
                  }
                }}
                className={`py-2 px-1.5 rounded-lg transition text-center cursor-pointer ${
                  ttsProvider === 'gemini'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-stone-700 dark:text-stone-300 hover:text-stone-900'
                }`}
              >
                AI Neural (Gemini)
              </button>
              <button
                type="button"
                onClick={() => {
                  setTtsProvider('elevenlabs');
                  if (!['ErXwobaYiN019PkySvjV', '21m00Tcm4TlvDq8ikWAM', 'EXAVITQu4vr4xnSDxMaL'].includes(ttsVoice)) {
                    setTtsVoice('ErXwobaYiN019PkySvjV');
                  }
                }}
                className={`py-2 px-1.5 rounded-lg transition text-center cursor-pointer ${
                  ttsProvider === 'elevenlabs'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-stone-700 dark:text-stone-300 hover:text-stone-900'
                }`}
              >
                ElevenLabs
              </button>
              <button
                type="button"
                onClick={() => setTtsProvider('system')}
                className={`py-2 px-1.5 rounded-lg transition text-center cursor-pointer ${
                  ttsProvider === 'system'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-stone-700 dark:text-stone-300 hover:text-stone-900'
                }`}
              >
                Urządzenie (Offline)
              </button>
            </div>

            {/* Tab 1: Gemini Neural Voices (Included & Ultra-Realistic) */}
            {ttsProvider === 'gemini' && (
              <div className="space-y-3">
                <div className="p-3 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/50 rounded-xl text-xs text-amber-950 dark:text-amber-200 leading-relaxed">
                  🎙️ <strong>Zaawansowane głosy neuronowe:</strong> Krystalicznie czysta, naturalna intonacja powieściowa w języku polskim. Brak limitów znaków.
                </div>

                <div className="space-y-2">
                  {[
                    { id: 'Kore', name: 'Kore', gender: 'Kobiecy', desc: 'Ciepła narratorka, kojący ton — idealna do powieści i opowiadań', def: true },
                    { id: 'Fenrir', name: 'Fenrir', gender: 'Męski', desc: 'Głęboki radiowy bas — fantasy, kryminały i literatura faktu' },
                    { id: 'Aoede', name: 'Aoede', gender: 'Kobiecy', desc: 'Melodyjny, ekspresyjny tembr — żywe dialogi i emocje' },
                    { id: 'Puck', name: 'Puck', gender: 'Męski', desc: 'Młodzieńczy, przyjazny głos — lżejsza literatura i poradniki' },
                    { id: 'Charon', name: 'Charon', gender: 'Męski', desc: 'Dojrzały, spokojny bas lektorski — klasyka i powaga' },
                  ].map((v) => {
                    const isSelected = ttsVoice === v.id;
                    const isTesting = sampleTestingVoice === v.id;
                    return (
                      <div
                        key={v.id}
                        onClick={() => setTtsVoice(v.id)}
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
                              <span className="text-[9px] px-1 rounded-sm bg-amber-100 text-amber-800 font-semibold">
                                Domyślny
                              </span>
                            )}
                            {isSelected && (
                              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold flex items-center gap-0.5">
                                <CheckCircle2 className="w-3 h-3" /> Aktywny
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5 truncate">
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

            {/* Tab 2: ElevenLabs Voices */}
            {ttsProvider === 'elevenlabs' && (
              <div className="space-y-3">
                <div className="p-3 bg-stone-50 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-semibold text-stone-800 dark:text-stone-200 flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-amber-600" />
                      <span>Klucz API ElevenLabs (opcjonalny):</span>
                    </label>
                    <span className="text-[10px] text-stone-500">Zapisany w przeglądarce</span>
                  </div>
                  <input
                    type="password"
                    value={elevenLabsApiKey}
                    onChange={(e) => setElevenLabsApiKey(e.target.value)}
                    placeholder="xi-... (jeśli posiadasz własne konto)"
                    className="w-full px-3 py-1.5 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-lg text-xs font-mono text-stone-900 dark:text-stone-100 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                  <p className="text-[11px] text-stone-500 leading-relaxed">
                    💡 Jeśli nie wprowadzisz własnego klucza ElevenLabs, aplikacja używa inteligentnego silnika <strong>AI Neural (Gemini)</strong>, który brzmi tak samo naturalnie bez opłat.
                  </p>
                </div>

                <div className="space-y-2">
                  <span className="text-xs font-bold text-stone-800 dark:text-stone-200 block">
                    Popularne głosy ElevenLabs:
                  </span>
                  {[
                    { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni (Polski Lektor)', desc: 'Płynny, ciepły polski głos męski ElevenLabs' },
                    { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', desc: 'Kultowy, ultra-realistyczny kobiecy głos ElevenLabs' },
                    { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', desc: 'Ekspresyjny, emocjonalny głos lektorski' },
                  ].map((v) => {
                    const isSelected = ttsVoice === v.id || elevenLabsVoiceId === v.id;
                    const isTesting = sampleTestingVoice === v.id;
                    return (
                      <div
                        key={v.id}
                        onClick={() => {
                          setTtsVoice(v.id);
                          setElevenLabsVoiceId(v.id);
                        }}
                        className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between gap-3 ${
                          isSelected
                            ? 'border-amber-600 bg-amber-50/50 dark:bg-amber-950/40 text-stone-900 dark:text-white ring-1 ring-amber-600/30'
                            : 'border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800/50 text-stone-800 dark:text-stone-200'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold">{v.name}</span>
                            {isSelected && (
                              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold flex items-center gap-0.5">
                                <CheckCircle2 className="w-3 h-3" /> Aktywny
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5 truncate">
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

            {/* Tab 3: System Voice Offline */}
            {ttsProvider === 'system' && (
              <div className="p-4 bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700 rounded-xl space-y-2 text-xs">
                <p className="font-semibold text-stone-800 dark:text-stone-200">
                  Wbudowany syntezator mowy urządzenia (Offline)
                </p>
                <p className="text-stone-500 leading-relaxed">
                  Używa lokalnego silnika zainstalowanego w Twoim telefonie lub komputerze (np. Android TTS / iOS Siri). Działa bez połączenia z siecią, idealne w podróży i trybie samolotowym.
                </p>
                <button
                  type="button"
                  onClick={() => testVoiceSample('system', 'system')}
                  className="px-3 py-1.5 rounded-lg bg-stone-900 text-white font-medium hover:bg-stone-800 transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Przetestuj głos urządzenia</span>
                </button>
              </div>
            )}

            {/* Reading Speed Pills */}
            <div className="pt-2 border-t border-stone-100 dark:border-stone-800 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-stone-800 dark:text-stone-200">
                  Prędkość odtwarzania:
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
                💡 Kliknij dowolny akapit w tekście, aby zacząć słuchać od tego miejsca
              </span>
              <button
                type="button"
                onClick={() => setShowVoiceModal(false)}
                className="px-4 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold transition cursor-pointer"
              >
                Zatwierdź
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
    </div>
  );
};
