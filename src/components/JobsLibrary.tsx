import React, { useState } from 'react';
import { Download, RefreshCw, BookCheck, Clock, AlertTriangle, FileCode, CheckCircle2, ChevronDown, ChevronUp, BookOpen } from 'lucide-react';
import { Job } from '../types';

interface JobsLibraryProps {
  jobs: Job[];
  onRefresh: () => void;
  serverUrl: string;
  onReadJob?: (job: Job) => void;
}

export const JobsLibrary: React.FC<JobsLibraryProps> = ({ jobs, onRefresh, serverUrl, onReadJob }) => {
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedJobId(expandedJobId === id ? null : id);
  };

  const completedJobs = jobs.filter((j) => j.status === 'completed');
  const activeJobs = jobs.filter((j) => j.status !== 'completed' && j.status !== 'failed');
  const failedJobs = jobs.filter((j) => j.status === 'failed');

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white border border-stone-200 rounded-2xl p-5 shadow-2xs">
        <div>
          <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
            <BookCheck className="w-5 h-5 text-stone-800" />
            Kolejka zadań i Biblioteka gotowych EPUB
          </h2>
          <p className="text-xs text-stone-500 mt-1">
            Wszystkie książki po ukończeniu tłumaczenia są natychmiast dostępne do pobrania przez wtyczkę na Kindle 10 lub bezpośrednio z przeglądarki.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="px-3.5 py-1.5 rounded-lg border border-stone-200 text-stone-700 bg-stone-50 hover:bg-stone-100 text-xs font-medium flex items-center gap-1.5 transition active:scale-95"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Odśwież status</span>
          </button>
        </div>
      </div>

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
                  <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-900 self-start sm:self-auto">
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

                    <a
                      href={`/api/download/${job.id}`}
                      download={job.outputEpubFilename || 'ksiazka.epub'}
                      className="px-3.5 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-xs font-medium flex items-center gap-1.5 transition active:scale-95 shadow-xs"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Pobierz EPUB</span>
                    </a>
                  </div>
                </div>

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
          <h3 className="text-xs font-bold text-red-700 uppercase tracking-wider flex items-center gap-2 px-1">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            Błędy ({failedJobs.length})
          </h3>
          <div className="space-y-2">
            {failedJobs.map((job) => (
              <div
                key={job.id}
                className="bg-red-50/50 border border-red-200 rounded-xl p-3.5 text-xs text-red-800 flex items-start justify-between gap-3"
              >
                <div>
                  <div className="font-semibold text-stone-900">{job.title}</div>
                  <div className="text-red-700 mt-1">{job.error || 'Nieznany błąd'}</div>
                </div>
              </div>
            ))}
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
