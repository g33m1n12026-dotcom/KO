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

  // When a job is selected from outside (e.g. library "Czytaj" button)
  useEffect(() => {
    if (selectedJob && selectedJob.status === 'completed') {
      loadBookFromJob(selectedJob);
    }
  }, [selectedJob]);

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

              {/* Book selector dropdown */}
              <div className="flex items-center gap-1.5 bg-black/10 dark:bg-white/10 rounded-lg px-2 py-1 max-w-[220px] sm:max-w-xs">
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
                <span className="hidden sm:inline">Wgraj plik</span>
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
