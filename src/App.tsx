import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { UploadConverter } from './components/UploadConverter';
import { StorybookCreator } from './components/StorybookCreator';
import { BookSearcher } from './components/BookSearcher';
import { JobsLibrary } from './components/JobsLibrary';
import { KindlePluginGuide } from './components/KindlePluginGuide';
import { AndroidCompanionReader } from './components/AndroidCompanionReader';
import { Job } from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('mode') === 'reader') return 'reader';
    }
    return 'reader';
  });
  const [serverUrl, setServerUrl] = useState<string>(window.location.origin);
  const [keysStatus, setKeysStatus] = useState<{ openrouter: boolean; openai: boolean; claude: boolean; gemini?: boolean }>({
    openrouter: true,
    openai: false,
    claude: false,
    gemini: true,
  });
  const [jobs, setJobs] = useState<Job[]>([]);

  // Fetch status and jobs
  const fetchStatus = useCallback(async () => {
    try {
      const resp = await fetch('/api/status');
      if (resp.ok) {
        const data = await resp.json();
        if (data.baseUrl) setServerUrl(data.baseUrl);
        if (data.keys) setKeysStatus(data.keys);
      }
    } catch (e) {
      console.warn('Nie udało się pobrać statusu serwera:', e);
    }
  }, []);

  const fetchJobs = useCallback(async () => {
    try {
      const resp = await fetch('/api/jobs');
      if (resp.ok) {
        const data: Job[] = await resp.json();
        setJobs(data);
      }
    } catch (e) {
      console.warn('Nie udało się pobrać listy zadań:', e);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchJobs();
  }, [fetchStatus, fetchJobs]);

  // Periodic polling if there are active jobs
  useEffect(() => {
    const hasActiveJobs = jobs.some(
      (j) => j.status === 'queued' || j.status === 'extracting' || j.status === 'translating' || j.status === 'packaging'
    );

    const interval = setInterval(() => {
      fetchJobs();
    }, hasActiveJobs ? 2500 : 10000);

    return () => clearInterval(interval);
  }, [jobs, fetchJobs]);

  const handleJobCreated = (newJob: Job) => {
    setJobs((prev) => [newJob, ...prev.filter((j) => j.id !== newJob.id)]);
    setActiveTab('library');
  };

  return (
    <div className="min-h-screen bg-stone-100/60 text-stone-900 flex flex-col font-sans selection:bg-stone-900 selection:text-white">
      {/* Top Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        serverUrl={serverUrl}
        keysStatus={keysStatus}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6 sm:px-6">
        {activeTab === 'reader' && (
          <AndroidCompanionReader
            serverUrl={serverUrl}
            jobs={jobs}
            onRefreshJobs={fetchJobs}
            onSelectJobForConversion={() => setActiveTab('convert')}
          />
        )}

        {activeTab === 'convert' && (
          <UploadConverter onJobCreated={handleJobCreated} serverUrl={serverUrl} />
        )}

        {activeTab === 'storybook' && (
          <StorybookCreator onJobCreated={handleJobCreated} />
        )}

        {activeTab === 'search' && (
          <BookSearcher onOrderCreated={handleJobCreated} />
        )}

        {activeTab === 'library' && (
          <JobsLibrary
            jobs={jobs}
            onRefresh={fetchJobs}
            serverUrl={serverUrl}
            onReadJob={() => setActiveTab('reader')}
          />
        )}

        {activeTab === 'plugin' && (
          <KindlePluginGuide serverUrl={serverUrl} />
        )}
      </main>

      {/* Bottom Footer */}
      <footer className="border-t border-stone-200 bg-white py-4 mt-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-stone-500">
          <div className="flex items-center gap-2">
            <span>KOReader AI Book Cloud</span>
            <span>•</span>
            <span>Zoptymalizowany pod Kindle 10 (E-Ink & 512 MB RAM)</span>
          </div>
          <div className="flex items-center gap-3">
            <span>Silniki: Claude 3.5 Sonnet, GPT-4o, OpenRouter</span>
            <span>•</span>
            <a href="/opds" target="_blank" rel="noreferrer" className="underline hover:text-stone-800">
              Katalog OPDS
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
