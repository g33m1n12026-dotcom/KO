import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Download,
  RefreshCw,
  BookCheck,
  Clock,
  AlertTriangle,
  FileCode,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Trash2,
  Loader2,
  X,
  Smartphone,
  UploadCloud,
  RotateCcw,
  LayoutGrid,
  LayoutList,
  Library,
  Search,
  Sparkles,
  Layers,
} from 'lucide-react';
import { Job, ReadingProgress } from '../types';
import { KNOWN_SERIES, detectBookSeriesClient, KnownSeriesDef } from '../utils/series';

interface JobsLibraryProps {
  jobs: Job[];
  onRefresh: () => void;
  onDeleteJob?: (jobId: string) => void;
  serverUrl: string;
  onReadJob?: (job: Job) => void;
  onNavigateSearch?: (query: string) => void;
}

export const JobsLibrary: React.FC<JobsLibraryProps> = ({ jobs, onRefresh, onDeleteJob, serverUrl, onReadJob, onNavigateSearch }) => {
  const [localJobs, setLocalJobs] = useState<Job[]>(jobs);

  useEffect(() => {
    setLocalJobs(jobs);
  }, [jobs]);

  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteJob, setConfirmDeleteJob] = useState<{ id: string; title: string } | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const handleResumeJob = async (id: string) => {
    setActionLoadingId(id);
    try {
      const res = await fetch(`/api/jobs/${id}/resume`, { method: 'POST' });
      if (res.ok) {
        onRefresh();
      }
    } catch (e) {
      console.error('Błąd wznawiania:', e);
    } finally {
      setActionLoadingId(null);
    }
  };

  const [convertingJobId, setConvertingJobId] = useState<string | null>(null);
  const [conversionSuccessMsg, setConversionSuccessMsg] = useState<string | null>(null);

  const handleConvertFormat = async (id: string, targetFormat: 'epub' | 'cbz' | 'txt') => {
    setConvertingJobId(`${id}_${targetFormat}`);
    try {
      const res = await fetch(`/api/jobs/${id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: targetFormat }),
      });
      if (res.ok) {
        setConversionSuccessMsg(`Pomyślnie przekonwertowano do formatu ${targetFormat.toUpperCase()}!`);
        setTimeout(() => setConversionSuccessMsg(null), 4000);
        onRefresh();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Nie udało się przekonwertować pliku');
      }
    } catch (e: any) {
      alert('Błąd konwersji: ' + (e.message || 'Brak połączenia'));
    } finally {
      setConvertingJobId(null);
    }
  };

  // Local phone file upload to OPDS
  const [isUploadingDirect, setIsUploadingDirect] = useState(false);
  const [directUploadSuccess, setDirectUploadSuccess] = useState<string | null>(null);
  const [directUploadError, setDirectUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Synchronization with permanent Vercel cloud server
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const handleSyncWithCloud = async () => {
    setIsSyncingCloud(true);
    setSyncMessage(null);
    try {
      const cloudUrl = 'https://ko-kohl.vercel.app';
      // 1. Fetch from cloud
      let cloudJobs: Job[] = [];
      try {
        const cloudRes = await fetch(`${cloudUrl}/api/jobs`, { signal: AbortSignal.timeout(6000) });
        if (cloudRes.ok) {
          cloudJobs = await cloudRes.json();
        }
      } catch (e) {
        console.warn('Nie udało się pobrać z chmury Vercel:', e);
      }

      // 2. Push local jobs to cloud
      if (localJobs.length > 0) {
        try {
          await fetch(`${cloudUrl}/api/jobs/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobs: localJobs }),
            signal: AbortSignal.timeout(6000),
          });
        } catch (e) {
          console.warn('Nie udało się wysłać zadań na Vercel:', e);
        }
      }

      // 3. Save cloud jobs locally
      if (cloudJobs.length > 0) {
        try {
          const syncLocal = await fetch('/api/jobs/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobs: cloudJobs }),
          });
          if (syncLocal.ok) {
            const merged: Job[] = await syncLocal.json();
            setLocalJobs(merged);
          }
        } catch (e) {
          console.warn('Błąd lokalnego zapisu synchronizacji:', e);
        }
      }

      setSyncMessage('Biblioteka zsynchronizowana z serwerem w chmurze Vercel!');
      onRefresh();
      setTimeout(() => setSyncMessage(null), 5000);
    } catch (err: any) {
      setSyncMessage(`Błąd synchronizacji: ${err.message || 'Błąd połączenia'}`);
    } finally {
      setIsSyncingCloud(false);
    }
  };

  const handleDirectFileUpload = async (file: File) => {
    setIsUploadingDirect(true);
    setDirectUploadSuccess(null);
    setDirectUploadError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload-direct', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Błąd wgrywania pliku' }));
        throw new Error(err.error || 'Nie udało się wgrać pliku');
      }
      const createdJob: Job = await res.json();
      setLocalJobs((prev) => [createdJob, ...prev]);
      setDirectUploadSuccess(`Wgrano "${file.name}"! Książka jest natychmiast dostępna w OPDS czytnika.`);
      onRefresh();
      setTimeout(() => setDirectUploadSuccess(null), 6000);
    } catch (err: any) {
      setDirectUploadError(err.message || 'Błąd wysyłania pliku');
    } finally {
      setIsUploadingDirect(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  useEffect(() => {
    setLocalJobs(jobs);
  }, [jobs]);

  const toggleExpand = (id: string) => {
    setExpandedJobId(expandedJobId === id ? null : id);
  };

  const executeDeleteJob = async (jobId: string) => {
    // Immediate optimistic removal from UI
    setLocalJobs((prev) => prev.filter((j) => j.id !== jobId));
    if (onDeleteJob) {
      onDeleteJob(jobId);
    }
    setConfirmDeleteId(null);
    setConfirmDeleteJob(null);
    setDeletingId(jobId);

    try {
      const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE' });
      if (!res.ok) {
        console.warn('Nie udało się usunąć pozycji na serwerze');
      }
      onRefresh();
    } catch (err: any) {
      console.error('Błąd sieci podczas usuwania:', err);
    } finally {
      setDeletingId(null);
    }
  };

  const clearAllFailed = async () => {
    const ids = failedJobs.map((j) => j.id);
    setLocalJobs((prev) => prev.filter((j) => j.status !== 'failed'));
    ids.forEach((id) => onDeleteJob?.(id));
    fetch('/api/jobs/clear-failed', { method: 'POST' }).catch(() => {});
    for (const id of ids) {
      fetch(`/api/jobs/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
    }
    setTimeout(onRefresh, 500);
  };

  const completedJobs = localJobs.filter((j) => j.status === 'completed');
  const activeJobs = localJobs.filter((j) => j.status !== 'completed' && j.status !== 'failed');
  const completedTitles = new Set(completedJobs.map((j) => j.title.toLowerCase().replace(/[^a-z0-9]/g, '')));
  const failedJobs = localJobs.filter(
    (j) => j.status === 'failed' && !completedTitles.has(j.title.toLowerCase().replace(/[^a-z0-9]/g, ''))
  );

  const [libraryTab, setLibraryTab] = useState<'books' | 'series' | 'active' | 'errors'>('books');
  const [syncMap, setSyncMap] = useState<Record<string, ReadingProgress>>({});

  const fetchSyncProgress = async () => {
    try {
      const res = await fetch('/api/sync/all');
      if (res.ok) {
        const data = await res.json();
        if (data.progressMap) {
          setSyncMap(data.progressMap);
        }
      }
    } catch (e) {
      console.warn('Nie udało się pobrać postępów czytania:', e);
    }
  };

  useEffect(() => {
    fetchSyncProgress();
    const interval = setInterval(fetchSyncProgress, 12000);
    return () => clearInterval(interval);
  }, []);

  const seriesOverview = useMemo(() => {
    const map = new Map<string, {
      seriesDef: KnownSeriesDef;
      ownedJobs: Map<number, Job>;
    }>();

    for (const def of KNOWN_SERIES) {
      map.set(def.name.toLowerCase(), {
        seriesDef: def,
        ownedJobs: new Map(),
      });
    }

    for (const job of completedJobs) {
      const sInfo = job.series || detectBookSeriesClient(job.title);
      if (sInfo) {
        let entry = map.get(sInfo.name.toLowerCase());
        if (!entry) {
          const totalTomes = sInfo.total || Math.max(sInfo.tome, 3);
          const def: KnownSeriesDef = {
            name: sInfo.name,
            total: totalTomes,
            tomes: Array.from({ length: totalTomes }, (_, i) => ({
              number: i + 1,
              title: `Tom ${i + 1}`,
            })),
          };
          entry = { seriesDef: def, ownedJobs: new Map() };
          map.set(sInfo.name.toLowerCase(), entry);
        }
        entry.ownedJobs.set(sInfo.tome, job);
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      // Prioritize series with owned books first
      if (b.ownedJobs.size !== a.ownedJobs.size) {
        return b.ownedJobs.size - a.ownedJobs.size;
      }
      return a.seriesDef.name.localeCompare(b.seriesDef.name);
    });
  }, [completedJobs]);

  const [bookViewMode, setBookViewMode] = useState<'grid' | 'list'>(() => {
    try {
      return (localStorage.getItem('koreader_library_view_mode') as 'grid' | 'list') || 'grid';
    } catch {
      return 'grid';
    }
  });

  const handleSetBookViewMode = (mode: 'grid' | 'list') => {
    setBookViewMode(mode);
    try {
      localStorage.setItem('koreader_library_view_mode', mode);
    } catch {}
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 bg-white border border-stone-200 rounded-2xl p-3.5 sm:p-5 shadow-2xs">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-stone-900 flex items-center gap-2">
            <BookCheck className="w-4 h-4 sm:w-5 sm:h-5 text-stone-800" />
            Biblioteka książek & Kolejka (OPDS)
          </h2>
          <p className="text-[11px] text-stone-500 mt-0.5">
            Książki są dostępne w katalogu OPDS na czytniku Kindle oraz do pobrania poniżej.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".epub,.pdf,.mobi,.cbz,.txt,.azw3,.fb2"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleDirectFileUpload(e.target.files[0]);
              }
            }}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingDirect}
            className="px-3 py-1.5 rounded-lg border border-stone-800 text-white bg-stone-900 hover:bg-stone-800 text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 shadow-xs disabled:opacity-60"
          >
            {isUploadingDirect ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Wgrywanie...</span>
              </>
            ) : (
              <>
                <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                <span>Wgraj z telefonu do OPDS</span>
              </>
            )}
          </button>

          <button
            onClick={handleSyncWithCloud}
            disabled={isSyncingCloud}
            className="px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-900 bg-emerald-50 hover:bg-emerald-100 text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50 cursor-pointer"
            title="Synchronizuj listę książek z serwerem Vercel (https://ko-kohl.vercel.app)"
          >
            {isSyncingCloud ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-700" />
            ) : (
              <UploadCloud className="w-3.5 h-3.5 text-emerald-700" />
            )}
            <span>{isSyncingCloud ? 'Synchronizacja...' : 'Sync z chmurą'}</span>
          </button>

          <button
            onClick={onRefresh}
            className="px-3 py-1.5 rounded-lg border border-stone-200 text-stone-700 bg-stone-50 hover:bg-stone-100 text-xs font-medium flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Odśwież status</span>
          </button>
        </div>
      </div>

      {/* Sync Status Banner */}
      {syncMessage && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs font-medium animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{syncMessage}</span>
        </div>
      )}

      {/* Upload Alerts */}
      {directUploadSuccess && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-medium animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{directUploadSuccess}</span>
        </div>
      )}

      {directUploadError && (
        <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-medium">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{directUploadError}</span>
        </div>
      )}

      {/* Library View Switcher & Sub-tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-200 pb-3">
        <div className="flex items-center gap-1.5 p-1 bg-stone-100 rounded-xl">
          <button
            type="button"
            onClick={() => setLibraryTab('books')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              libraryTab === 'books'
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Gotowe książki ({completedJobs.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setLibraryTab('series')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              libraryTab === 'series'
                ? 'bg-purple-50 text-purple-950 border border-purple-200 shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-purple-600" />
            <span>Cykle i Serie</span>
          </button>

          <button
            type="button"
            onClick={() => setLibraryTab('active')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              libraryTab === 'active'
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${activeJobs.length > 0 ? 'bg-amber-500 animate-pulse' : 'bg-stone-300'}`} />
            <span>W toku ({activeJobs.length})</span>
          </button>

          {failedJobs.length > 0 && (
            <button
              type="button"
              onClick={() => setLibraryTab('errors')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                libraryTab === 'errors'
                  ? 'bg-rose-50 text-rose-900 border border-rose-200 shadow-xs'
                  : 'text-rose-600 hover:text-rose-900'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
              <span>Błędy ({failedJobs.length})</span>
            </button>
          )}
        </div>

        {libraryTab === 'books' && completedJobs.length > 0 && (
          <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl self-end sm:self-auto">
            <button
              type="button"
              onClick={() => handleSetBookViewMode('grid')}
              className={`px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer ${
                bookViewMode === 'grid'
                  ? 'bg-white text-stone-900 shadow-2xs font-bold'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
              title="Widok kafelków"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Kafelki</span>
            </button>
            <button
              type="button"
              onClick={() => handleSetBookViewMode('list')}
              className={`px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer ${
                bookViewMode === 'list'
                  ? 'bg-white text-stone-900 shadow-2xs font-bold'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
              title="Widok listy"
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Lista</span>
            </button>
          </div>
        )}
      </div>

      {/* Active Jobs Tab */}
      {libraryTab === 'active' && (
        <div className="space-y-3 animate-fadeIn">
          {activeJobs.length === 0 ? (
            <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center text-stone-500 text-sm">
              <Clock className="w-8 h-8 text-stone-300 mx-auto mb-2" />
              Kolejka jest pusta. Żadne zadanie nie jest aktualnie przetwarzane.
            </div>
          ) : (
            <div className="space-y-3">
              {activeJobs.map((job) => (
                <div
                  key={job.id}
                  className="bg-white border border-amber-200/90 rounded-xl p-4 shadow-2xs space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-stone-900 text-sm">{job.title}</h4>
                        {job.sourceType === 'storybook' && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                            ✨ Książka na życzenie
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-stone-500">
                        Silnik: <strong>{job.engine}</strong> • {job.sourceType === 'storybook' ? 'Tworzenie e-booka' : `Język docelowy: ${job.targetLang}`} • ID: <code className="font-mono text-[10px]">{job.id}</code>
                      </p>
                    </div>
                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-900">
                        {job.sourceType === 'storybook' ? (
                          job.status === 'extracting' ? 'Planowanie fabuły...' :
                          job.status === 'translating' ? `Pisanie: Rozdz. ${job.currentChapter}/${job.totalChapters || '?'}` :
                          job.status === 'packaging' ? 'Generowanie rycin i EPUB...' :
                          'Oczekuje w kolejce'
                        ) : (
                          job.status === 'extracting' ? 'Ekstrakcja tekstu...' :
                          job.status === 'translating' ? `Tłumaczenie: Rozdz. ${job.currentChapter}/${job.totalChapters || '?'}` :
                          job.status === 'packaging' ? 'Tworzenie EPUB...' :
                          'Oczekuje w kolejce'
                        )}
                      </span>
                      <button
                        type="button"
                        title="Anuluj i usuń zadanie"
                        disabled={deletingId === job.id}
                        onClick={() => setConfirmDeleteJob({ id: job.id, title: job.title })}
                        className="p-1 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 border border-stone-200 transition active:scale-90 cursor-pointer"
                      >
                        {deletingId === job.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-red-600" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-stone-600 font-medium">
                      <span>Postęp</span>
                      <span>{job.progress}%</span>
                    </div>
                    <div className="w-full h-2 bg-stone-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500 transition-all duration-500 rounded-full"
                        style={{ width: `${Math.max(5, job.progress)}%` }}
                      />
                    </div>
                  </div>

                  {/* Latest log */}
                  {job.logs && job.logs.length > 0 && (
                    <div className="bg-stone-50 rounded-lg p-2 font-mono text-[11px] text-stone-600 truncate border border-stone-100">
                      {job.logs[job.logs.length - 1]}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Errors Tab (isolated completely from books) */}
      {libraryTab === 'errors' && (
        <div className="space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold text-red-700 uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              Wystąpione błędy ({failedJobs.length})
            </h3>
            <button
              type="button"
              onClick={clearAllFailed}
              className="text-xs font-medium text-red-700 hover:text-red-800 bg-red-50 hover:bg-red-100 border border-red-200 px-2.5 py-1 rounded-lg transition cursor-pointer"
            >
              Wyczyść wszystkie błędy
            </button>
          </div>

          {failedJobs.length === 0 ? (
            <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center text-stone-500 text-sm">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              Brak jakichkolwiek błędów. Wszystko działa prawidłowo!
            </div>
          ) : (
            <div className="space-y-2">
              {failedJobs.map((job) => (
                <div
                  key={job.id}
                  className="bg-red-50/70 border border-red-200 rounded-xl p-4 text-xs text-red-800 flex items-start justify-between gap-3 shadow-2xs"
                >
                  <div className="space-y-2 flex-1">
                    <div className="font-semibold text-stone-900 text-sm">{job.title}</div>
                    <div className="text-red-700 bg-red-100/70 p-2.5 rounded-lg border border-red-200 font-mono text-[11px]">
                      {job.error || 'Nieznany błąd podczas pobierania lub przetwarzania pliku.'}
                    </div>
                    {job.chapters && job.chapters.length > 0 && (
                      <div className="text-[11px] text-stone-600 font-medium">
                        Postęp: {job.chapters.filter((c) => c.status === 'completed').length} z {job.chapters.length} rozdziałów już przetłumaczonych.
                      </div>
                    )}
                    {job.logs && job.logs.length > 0 && (
                      <div className="mt-2 text-[10px] text-stone-500 font-mono bg-white p-2 rounded-md border border-stone-200 max-h-32 overflow-y-auto">
                        {job.logs.slice(-5).map((l, i) => (
                          <div key={i}>{l}</div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <button
                      type="button"
                      title="Usuń to zgłoszenie błędu"
                      onClick={() => executeDeleteJob(job.id)}
                      className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-white rounded-lg transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    {job.chapters && job.chapters.length > 0 && (
                      <button
                        type="button"
                        onClick={() => handleResumeJob(job.id)}
                        disabled={actionLoadingId === job.id}
                        className="px-2 py-1 bg-amber-600 text-white rounded text-[10px] font-semibold hover:bg-amber-700 transition"
                      >
                        Wznów
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Completed Books Library Tab */}
      {libraryTab === 'books' && (
        <div className="space-y-3 animate-fadeIn">
          {completedJobs.length === 0 ? (
            <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center text-stone-500 text-sm">
              <BookCheck className="w-8 h-8 text-stone-300 mx-auto mb-2" />
              Brak gotowych książek w bibliotece. Wybierz plik w pierwszej zakładce lub wyszukaj pozycję w sieci!
            </div>
          ) : (
            <div className={bookViewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 gap-4" : "space-y-2"}>
            {completedJobs.map((job) => {
              const ext = (job.outputEpubFilename || '').toLowerCase();
              const formatLabel = job.detailedFormat 
                ? job.detailedFormat 
                : ext.endsWith('.pdf') 
                ? 'PDF' 
                : ext.endsWith('.cbz') 
                ? 'CBZ' 
                : ext.endsWith('.mobi') 
                ? 'MOBI' 
                : ext.endsWith('.txt') 
                ? 'TXT' 
                : 'EPUB';

              const isPdf = formatLabel.includes('PDF');
              const isEpub3 = formatLabel === 'EPUB 3';
              const isEpub2 = formatLabel === 'EPUB 2';
              const isCbz = formatLabel.includes('CBZ');
              const isMobi = formatLabel.includes('MOBI');

              const formatBadgeClass = isEpub3
                ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                : isEpub2
                ? 'bg-teal-100 text-teal-900 border-teal-300'
                : isPdf
                ? 'bg-stone-200 text-stone-800 border-stone-300'
                : isCbz
                ? 'bg-indigo-100 text-indigo-900 border-indigo-300'
                : isMobi
                ? 'bg-amber-100 text-amber-900 border-amber-300'
                : 'bg-emerald-100 text-emerald-800 border-emerald-200';

              const sync = syncMap[job.id] || Object.values(syncMap).find(s => s.title.toLowerCase() === job.title.toLowerCase());
              const sInfo = job.series || detectBookSeriesClient(job.title);

              return (
              <div
                key={job.id}
                className={bookViewMode === 'grid'
                  ? "bg-white border border-stone-200 rounded-xl p-5 hover:border-stone-300 transition shadow-2xs flex flex-col justify-between"
                  : "bg-white border border-stone-200 rounded-xl px-4 py-2.5 hover:border-stone-300 transition shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                }
              >
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {bookViewMode === 'list' && (
                        <div className="w-7 h-7 rounded-md bg-stone-100 border border-stone-200 flex items-center justify-center shrink-0 text-sm shadow-2xs">
                          {job.sourceType === 'storybook' ? '✨' : isPdf ? '📄' : isCbz ? '🎨' : '📖'}
                        </div>
                      )}
                      <h4 className="font-semibold text-stone-900 text-xs sm:text-sm leading-snug truncate" title={job.title}>
                        {job.title}
                      </h4>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded shadow-2xs border ${formatBadgeClass}`}
                        title={`Dokładny format pliku: ${formatLabel}`}
                      >
                        {job.sourceType === 'storybook' ? '✨ E-BOOK AI' : formatLabel}
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-stone-500 flex items-center gap-1.5 flex-wrap">
                    <span>Rozdziałów: <strong>{job.totalChapters}</strong></span>
                    <span>•</span>
                    <span>{job.sourceType === 'storybook' ? 'Autor: AI Storybook' : `Silnik AI: ${job.engine}`}</span>
                    <span>•</span>
                    <span className="font-mono text-[10px] text-stone-400 truncate max-w-[200px]">{job.outputEpubFilename}</span>
                  </p>

                  {/* Sync progress & series pills */}
                  {(sync || sInfo) && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {sync && (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span>📖 {sync.progressPercent}% ({sync.device} • {sync.timeAgo})</span>
                        </span>
                      )}

                      {sInfo && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-purple-50 text-purple-800 border border-purple-200 shadow-2xs">
                          <span>📚 Cykl:</span> <strong>{sInfo.name}</strong> (Tom {sInfo.tome}{sInfo.total ? ` z ${sInfo.total}` : ''})
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className={bookViewMode === 'grid'
                  ? "mt-4 pt-3 border-t border-stone-100 flex items-center justify-between gap-2"
                  : "flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-stone-100"
                }>
                  <button
                    onClick={() => toggleExpand(job.id)}
                    className="text-xs text-stone-500 hover:text-stone-800 flex items-center gap-1"
                  >
                    <span>Logi</span>
                    {expandedJobId === job.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>

                  <div className="flex items-center gap-2">
                    {onReadJob && (
                      <button
                        type="button"
                        onClick={() => onReadJob(job)}
                        className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium flex items-center gap-1.5 transition active:scale-95 shadow-xs"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Czytaj</span>
                      </button>
                    )}

                    {/* Format Conversion dropdown / quick button */}
                    <div className="relative group">
                      <button
                        type="button"
                        className="px-2.5 py-1.5 rounded-lg border border-stone-200 hover:border-amber-400 bg-stone-50 hover:bg-amber-50 text-stone-700 hover:text-amber-950 text-xs font-medium flex items-center gap-1 transition cursor-pointer shadow-2xs"
                        title="Dodatkowe narzędzia: Przerób ten plik na inny format (EPUB 3 / CBZ Komiks / TXT)"
                      >
                        <RefreshCw className={`w-3 h-3 ${convertingJobId?.startsWith(job.id) ? 'animate-spin text-amber-600' : 'text-stone-500'}`} />
                        <span>Konwertuj</span>
                      </button>
                      <div className="hidden group-hover:flex group-focus-within:flex flex-col absolute right-0 bottom-full mb-1 bg-white border border-stone-200 rounded-xl shadow-lg p-1.5 z-30 min-w-[190px] animate-fadeIn">
                        <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider px-2 py-1">
                          Przerób format na:
                        </span>
                        {(!job.detailedFormat?.includes('EPUB 3')) && (
                          <button
                            type="button"
                            onClick={() => handleConvertFormat(job.id, 'epub')}
                            disabled={convertingJobId === `${job.id}_epub`}
                            className="px-2.5 py-1.5 rounded-lg text-left text-xs text-stone-700 hover:bg-emerald-50 hover:text-emerald-900 flex items-center justify-between transition cursor-pointer"
                          >
                            <span>📖 Czytnikowy EPUB 3</span>
                            {convertingJobId === `${job.id}_epub` && <Loader2 className="w-3 h-3 animate-spin text-emerald-600" />}
                          </button>
                        )}
                        {(!job.detailedFormat?.includes('CBZ')) && (
                          <button
                            type="button"
                            onClick={() => handleConvertFormat(job.id, 'cbz')}
                            disabled={convertingJobId === `${job.id}_cbz`}
                            className="px-2.5 py-1.5 rounded-lg text-left text-xs text-stone-700 hover:bg-indigo-50 hover:text-indigo-900 flex items-center justify-between transition cursor-pointer"
                          >
                            <span>🎨 Komiks / Manga (CBZ)</span>
                            {convertingJobId === `${job.id}_cbz` && <Loader2 className="w-3 h-3 animate-spin text-indigo-600" />}
                          </button>
                        )}
                        {(!job.detailedFormat?.includes('TXT')) && (
                          <button
                            type="button"
                            onClick={() => handleConvertFormat(job.id, 'txt')}
                            disabled={convertingJobId === `${job.id}_txt`}
                            className="px-2.5 py-1.5 rounded-lg text-left text-xs text-stone-700 hover:bg-stone-100 flex items-center justify-between transition cursor-pointer"
                          >
                            <span>📄 Czysty tekst (TXT)</span>
                            {convertingJobId === `${job.id}_txt` && <Loader2 className="w-3 h-3 animate-spin text-stone-600" />}
                          </button>
                        )}
                      </div>
                    </div>

                    <a
                      href={`/api/download/${job.id}`}
                      download={job.outputEpubFilename || `${job.title}.${job.outputFormat || 'epub'}`}
                      className="px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-xs font-medium flex items-center gap-1.5 transition active:scale-95 shadow-xs cursor-pointer no-underline"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>
                        Pobierz {job.outputFormat ? job.outputFormat.toUpperCase() : 'PLIK'}
                      </span>
                    </a>

                    <button
                      type="button"
                      title="Usuń książkę z biblioteki i zwolnij miejsce na dysku"
                      disabled={deletingId === job.id}
                      onClick={() => setConfirmDeleteId(confirmDeleteId === job.id ? null : job.id)}
                      className="p-1.5 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 border border-stone-200 hover:border-red-200 transition active:scale-90 cursor-pointer"
                    >
                      {deletingId === job.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-red-600" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Inline Confirmation for deleting book */}
                {confirmDeleteId === job.id && (
                  <div className="mt-3 p-2.5 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between gap-2 text-xs">
                    <span className="text-red-900 font-medium">Usunąć książkę i plik z dysku serwera?</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => executeDeleteJob(job.id)}
                        className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg text-xs transition cursor-pointer"
                      >
                        Tak, usuń
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-1 text-stone-600 hover:bg-stone-200/60 rounded-lg text-xs transition cursor-pointer"
                      >
                        Anuluj
                      </button>
                    </div>
                  </div>
                )}

                {/* Expanded logs / chapter preview */}
                {expandedJobId === job.id && (
                  <div className="mt-3 p-3 bg-stone-50 border border-stone-200 rounded-lg space-y-2 text-[11px] font-mono max-h-48 overflow-y-auto">
                    <div className="font-bold text-stone-700">Dziennik przetwarzania:</div>
                    {job.logs.map((log, idx) => (
                      <div key={idx} className="text-stone-600">
                        {log}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          </div>
        )}
      </div>
    )}

      {/* Series & Tomes Manager Tab */}
      {libraryTab === 'series' && (
        <div className="space-y-6 animate-fadeIn">
          <div className="bg-gradient-to-r from-purple-50 via-white to-purple-50/30 border border-purple-200/80 rounded-2xl p-4 sm:p-5 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <h3 className="font-bold text-stone-900 text-sm sm:text-base flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-600" />
                  Automatyczny Menedżer Serii i Kolejnych Tomów
                </h3>
                <p className="text-xs text-stone-600 leading-relaxed max-w-2xl">
                  Grupuj posiadane tomy, sprawdzaj co czytać w następnej kolejności i pobieraj brakujące części cyklu bezpośrednio z bibliotek 1 kliknięciem.
                </p>
              </div>
              <div className="px-3 py-1.5 bg-purple-100/70 border border-purple-200 text-purple-900 rounded-xl text-xs font-semibold self-start sm:self-auto flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                <span>Inteligentne dopasowanie</span>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            {seriesOverview.map(({ seriesDef, ownedJobs }) => {
              const ownedCount = ownedJobs.size;
              const totalCount = seriesDef.total || seriesDef.tomes.length;
              const percent = Math.round((ownedCount / totalCount) * 100);

              return (
                <div
                  key={seriesDef.name}
                  className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4"
                >
                  {/* Series Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-stone-100">
                    <div>
                      <h4 className="font-bold text-stone-900 text-sm sm:text-base flex items-center gap-2">
                        <span>📚</span>
                        <span>{seriesDef.name}</span>
                      </h4>
                      <p className="text-xs text-stone-500 mt-0.5">
                        Posiadasz <strong>{ownedCount}</strong> z <strong>{totalCount}</strong> tomów cyklu ({percent}%)
                      </p>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full sm:w-48 bg-stone-100 rounded-full h-2.5 overflow-hidden border border-stone-200">
                      <div
                        className="bg-purple-600 h-full rounded-full transition-all duration-500"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>

                  {/* Tomes Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {seriesDef.tomes.map((tome) => {
                      const owned = ownedJobs.get(tome.number);
                      const sync = owned ? (syncMap[owned.id] || Object.values(syncMap).find(s => s.title.toLowerCase() === owned.title.toLowerCase())) : null;

                      if (owned) {
                        return (
                          <div
                            key={tome.number}
                            className="bg-emerald-50/40 border border-emerald-200 rounded-xl p-3 flex flex-col justify-between gap-2.5 hover:border-emerald-300 transition shadow-2xs"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center justify-between gap-1.5">
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300">
                                  Tom {tome.number}
                                </span>
                                <span className="text-[10px] font-semibold text-emerald-700 flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  W bibliotece
                                </span>
                              </div>
                              <h5 className="font-semibold text-stone-900 text-xs leading-snug line-clamp-2">
                                {owned.title || tome.title}
                              </h5>
                              {sync && (
                                <p className="text-[10px] text-emerald-800 font-medium">
                                  📖 Postęp: {sync.progressPercent}% ({sync.device})
                                </p>
                              )}
                            </div>

                            <div className="flex items-center justify-between gap-2 pt-2 border-t border-emerald-100">
                              <span className="text-[10px] text-stone-500 font-mono">
                                {owned.totalChapters} rozdz.
                              </span>
                              {onReadJob && (
                                <button
                                  type="button"
                                  onClick={() => onReadJob(owned)}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer shadow-2xs"
                                >
                                  <BookOpen className="w-3 h-3" />
                                  <span>Czytaj</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      }

                      // Missing tome
                      return (
                        <div
                          key={tome.number}
                          className="bg-stone-50/60 border border-dashed border-stone-300 rounded-xl p-3 flex flex-col justify-between gap-2.5 hover:border-purple-300 transition"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-1.5">
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-stone-200 text-stone-700">
                                Tom {tome.number}
                              </span>
                              <span className="text-[10px] text-stone-400">
                                Brakujący tom
                              </span>
                            </div>
                            <h5 className="font-medium text-stone-700 text-xs leading-snug line-clamp-2">
                              {tome.title}
                            </h5>
                          </div>

                          <div className="pt-2 border-t border-stone-200/60 flex items-center justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                const q = `${seriesDef.name} ${tome.title}`;
                                onNavigateSearch?.(q);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer shadow-2xs"
                              title="Wyszukaj i pobierz ten tom 1 kliknięciem"
                            >
                              <Search className="w-3 h-3 text-purple-600" />
                              <span>Pobierz Tom {tome.number}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal (Avoids window.confirm in iframe) */}
      {confirmDeleteJob && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-xl border border-stone-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-stone-900 text-sm">Usunąć książkę?</h4>
                <p className="text-xs text-stone-500">Zwolni to miejsce na dysku serwera.</p>
              </div>
            </div>

            <p className="text-xs text-stone-700 bg-stone-50 p-3 rounded-xl border border-stone-200 line-clamp-3">
              "{confirmDeleteJob.title}"
            </p>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmDeleteJob(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-stone-600 hover:bg-stone-100 transition cursor-pointer"
              >
                Anuluj
              </button>
              <button
                type="button"
                disabled={deletingId === confirmDeleteJob.id}
                onClick={() => executeDeleteJob(confirmDeleteJob.id)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-700 text-white flex items-center gap-1.5 transition active:scale-95 shadow-xs cursor-pointer"
              >
                {deletingId === confirmDeleteJob.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>Usuń książkę</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OPDS Integration Notice for KOReader */}
      <div className="p-4 rounded-xl bg-stone-100/80 border border-stone-200 text-xs text-stone-600 space-y-1.5">
        <h4 className="font-bold text-stone-800 flex items-center gap-1.5">
          <span>⚡ Wskazówka: Dostęp przez wbudowany w KOReader katalog OPDS</span>
        </h4>
        <p className="leading-relaxed">
          KOReader ma wbudowaną obsługę katalogów <strong>OPDS</strong>. Możesz wejść w KOReaderze w menu <strong>Wyszukiwanie → Katalogi OPDS → Dodaj nowy katalog</strong> i wpisać adres:
        </p>
        <code className="block p-2 bg-white rounded border border-stone-200 font-mono text-[11px] text-stone-900 select-all">
          {serverUrl}/opds
        </code>
        <p className="text-[11px] text-stone-500">
          Dzięki temu każda przetłumaczona książka pojawi się natychmiast na Twoim Kindle do pobrania 1 kliknięciem bez podłączania kabla USB!
        </p>
      </div>
    </div>
  );
};
