import React, { useState, useEffect, useRef } from 'react';
import { Download, RefreshCw, BookCheck, Clock, AlertTriangle, FileCode, CheckCircle2, ChevronDown, ChevronUp, BookOpen, Trash2, Loader2, X, Smartphone, UploadCloud } from 'lucide-react';
import { Job } from '../types';

interface JobsLibraryProps {
  jobs: Job[];
  onRefresh: () => void;
  onDeleteJob?: (jobId: string) => void;
  serverUrl: string;
  onReadJob?: (job: Job) => void;
}

export const JobsLibrary: React.FC<JobsLibraryProps> = ({ jobs, onRefresh, onDeleteJob, serverUrl, onReadJob }) => {
  const [localJobs, setLocalJobs] = useState<Job[]>(jobs);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteJob, setConfirmDeleteJob] = useState<{ id: string; title: string } | null>(null);

  // Local phone file upload to OPDS
  const [isUploadingDirect, setIsUploadingDirect] = useState(false);
  const [directUploadSuccess, setDirectUploadSuccess] = useState<string | null>(null);
  const [directUploadError, setDirectUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
            onClick={onRefresh}
            className="px-3 py-1.5 rounded-lg border border-stone-200 text-stone-700 bg-stone-50 hover:bg-stone-100 text-xs font-medium flex items-center gap-1.5 transition active:scale-95"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Odśwież status</span>
          </button>
        </div>
      </div>

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

      {/* Active Jobs Section */}
      {activeJobs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center gap-2 px-1">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            Przetwarzane w toku ({activeJobs.length})
          </h3>

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
        </div>
      )}

      {/* Completed Books Library */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center gap-2 px-1">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          Gotowe książki do czytania ({completedJobs.length})
        </h3>

        {completedJobs.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center text-stone-500 text-sm">
            <BookCheck className="w-8 h-8 text-stone-300 mx-auto mb-2" />
            Brak przetłumaczonych książek w bibliotece. Wybierz plik w pierwszej zakładce lub wyszukaj pozycję w sieci!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {completedJobs.map((job) => (
              <div
                key={job.id}
                className="bg-white border border-stone-200 rounded-xl p-5 hover:border-stone-300 transition shadow-2xs flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-semibold text-stone-900 text-sm leading-snug">
                      {job.title}
                    </h4>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 shrink-0">
                      {job.sourceType === 'storybook' ? '✨ E-BOOK AI' : job.outputFormat === 'cbz' ? 'CBZ KOMIKS' : 'EPUB 3 PL'}
                    </span>
                  </div>

                  <p className="text-xs text-stone-500">
                    Rozdziałów: <strong>{job.totalChapters}</strong> • {job.sourceType === 'storybook' ? 'Autor: AI Storybook' : `Silnik AI: ${job.engine}`}
                  </p>

                  <div className="text-[11px] text-stone-400 font-mono">
                    Plik: {job.outputEpubFilename}
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between gap-2">
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

                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await fetch(`/api/download/${job.id}`);
                          if (!res.ok) {
                            const err = await res.json().catch(() => ({}));
                            alert(err.error || 'Plik e-booka nie został odnaleziony na serwerze.');
                            return;
                          }
                          const blob = await res.blob();
                          const url = window.URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = job.outputEpubFilename || 'ksiazka.epub';
                          document.body.appendChild(a);
                          a.click();
                          window.URL.revokeObjectURL(url);
                          document.body.removeChild(a);
                        } catch (e: any) {
                          alert('Błąd podczas pobierania: ' + (e.message || 'Brak połączenia'));
                        }
                      }}
                      className="px-3.5 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-xs font-medium flex items-center gap-1.5 transition active:scale-95 shadow-xs cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Pobierz EPUB</span>
                    </button>

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
            ))}
          </div>
        )}
      </div>

      {/* Failed Jobs */}
      {failedJobs.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold text-red-700 uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              Błędy ({failedJobs.length})
            </h3>
            <button
              type="button"
              onClick={clearAllFailed}
              className="text-xs font-medium text-red-700 hover:text-red-800 bg-red-50 hover:bg-red-100 border border-red-200 px-2.5 py-1 rounded-lg transition cursor-pointer"
            >
              Wyczyść wszystkie błędy
            </button>
          </div>
          <div className="space-y-2">
            {failedJobs.map((job) => (
              <div
                key={job.id}
                className="bg-red-50/50 border border-red-200 rounded-xl p-3.5 text-xs text-red-800 flex items-start justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="font-semibold text-stone-900">{job.title}</div>
                  <div className="text-red-700">{job.error || 'Nieznany błąd'}</div>
                  {job.logs && job.logs.length > 0 && (
                    <div className="text-[10px] text-stone-500 font-mono">
                      Ostatni wpis: {job.logs[job.logs.length - 1]}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  title="Usuń wpis o błędzie"
                  onClick={() => executeDeleteJob(job.id)}
                  className="p-1.5 rounded-lg text-red-400 hover:text-red-700 hover:bg-red-100 transition active:scale-90 cursor-pointer shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
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
