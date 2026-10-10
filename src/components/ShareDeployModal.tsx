import React, { useState } from 'react';
import {
  Globe,
  X,
  Copy,
  Check,
  Server,
  Zap,
  ExternalLink,
  ShieldAlert,
  Smartphone,
  Terminal,
  HelpCircle,
} from 'lucide-react';

interface ShareDeployModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverUrl: string;
}

export const ShareDeployModal: React.FC<ShareDeployModalProps> = ({
  isOpen,
  onClose,
  serverUrl,
}) => {
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const cloudflareCmd = 'npx --yes @cloudflare/cloudflared tunnel --url http://localhost:3000';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-stone-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="bg-white rounded-2xl shadow-2xl border border-stone-200 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden text-stone-900 animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between bg-stone-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-700 flex items-center justify-center">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-semibold text-stone-900">
                Udostępnianie i Darmowy Hosting dla Testerów
              </h3>
              <p className="text-xs text-stone-500">
                Jak udostępnić aplikację każdemu bez wymogu logowania do Google
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 transition cursor-pointer"
            aria-label="Zamknij"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs sm:text-sm">
          {/* Why preview requires login */}
          <div className="bg-amber-50/80 border border-amber-200/80 rounded-xl p-3.5 flex gap-3 text-amber-900">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-xs sm:text-sm text-amber-950">
                Dlaczego obecny adres Cloud Run każe się logować?
              </p>
              <p className="text-xs leading-relaxed text-amber-900/90">
                Adresy podglądu deweloperskiego Google Cloud (z końcówką <code>.run.app</code>) mają automatycznie włączoną ochronę <strong>Google Identity-Aware Proxy</strong>. Oznacza to, że tylko właściciel projektu z kontem Google ma do nich dostęp. Aby każdy znajomy lub tester mógł wejść od ręki bez żadnego logowania, skorzystaj z poniższych darmowych rozwiązań:
              </p>
            </div>
          </div>

          {/* Option 1: Hugging Face Spaces */}
          <div className="border border-stone-200 rounded-xl p-4 hover:border-stone-300 transition bg-white space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 uppercase tracking-wide">
                  Najlepszy wybór
                </span>
                <h4 className="font-semibold text-stone-900 text-sm">
                  1. Hugging Face Spaces (Docker) — 100% Darmowy & 16 GB RAM
                </h4>
              </div>
              <a
                href="https://huggingface.co/spaces"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-600 hover:underline flex items-center gap-1 shrink-0 font-medium"
              >
                Otwórz HF <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <p className="text-xs text-stone-600 leading-relaxed">
              Daje stały, publiczny adres HTTPS (np. <code>https://twoj-login-koreader.hf.space</code>). <strong>Każdy wchodzi bez logowania</strong>, 2 vCPU, aż 16 GB RAM i 50 GB dysku na książki. Nie wymaga karty kredytowej!
            </p>
            <div className="bg-stone-50 rounded-lg p-2.5 text-xs text-stone-700 space-y-1 border border-stone-100">
              <p className="font-medium text-stone-800">Jak wdrożyć w 2 minuty:</p>
              <ol className="list-decimal list-inside space-y-1 text-stone-600 pl-1">
                <li>Wejdź na Hugging Face → kliknij <strong>New Space</strong>.</li>
                <li>Wybierz <strong>Docker (Blank)</strong> i darmowy plan CPU Basic (16GB RAM).</li>
                <li>Projekt zawiera już gotowy, zoptymalizowany plik <code>Dockerfile</code>. Wgraj pliki projektu i Space sam się zbuduje!</li>
              </ol>
            </div>
          </div>

          {/* Option 2: Koyeb */}
          <div className="border border-stone-200 rounded-xl p-4 hover:border-stone-300 transition bg-white space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 uppercase tracking-wide">
                  Szybki start
                </span>
                <h4 className="font-semibold text-stone-900 text-sm">
                  2. Koyeb (koyeb.com) — Lepszy niż Render
                </h4>
              </div>
              <a
                href="https://app.koyeb.com"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-600 hover:underline flex items-center gap-1 shrink-0 font-medium"
              >
                Koyeb.com <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <p className="text-xs text-stone-600 leading-relaxed">
              Darmowy plan Hobby bez limitów Renderowych. Daje adres <code>https://twoja-app.koyeb.app</code> dostępny publicznie dla każdego bez logowania.
            </p>
            <div className="bg-stone-50 rounded-lg p-2.5 text-xs text-stone-700 space-y-1 border border-stone-100">
              <p className="font-medium text-stone-800">Kroki:</p>
              <p className="text-stone-600">
                Połącz konto GitHub z Koyeb → wybierz repozytorium → Koyeb sam rozpozna Node.js i uruchomi serwer na porcie 3000.
              </p>
            </div>
          </div>

          {/* Option 3: Cloudflare Quick Tunnel */}
          <div className="border border-stone-200 rounded-xl p-4 hover:border-stone-300 transition bg-white space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 uppercase tracking-wide">
                  Błyskawiczny test
                </span>
                <h4 className="font-semibold text-stone-900 text-sm">
                  3. Cloudflare Quick Tunnel (z własnego komputera / serwera)
                </h4>
              </div>
            </div>
            <p className="text-xs text-stone-600 leading-relaxed">
              Jeśli uruchamiasz projekt na swoim komputerze lub serwerze VPS, możesz w 5 sekund uzyskać publiczny link HTTPS Cloudflare bez rejestracji i bez logowania:
            </p>
            <div className="bg-stone-900 text-stone-100 rounded-lg p-2.5 font-mono text-xs flex items-center justify-between gap-2">
              <span className="truncate">{cloudflareCmd}</span>
              <button
                type="button"
                onClick={() => copyToClipboard(cloudflareCmd, 'cf')}
                className="p-1 hover:bg-stone-800 rounded transition shrink-0 cursor-pointer text-stone-300 hover:text-white"
                title="Kopiuj polecenie"
              >
                {copiedCmd === 'cf' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
            <p className="text-[11px] text-stone-500">
              Otrzymasz adres <code>https://*.trycloudflare.com</code>, który działa natychmiast na każdym telefonie.
            </p>
          </div>

          {/* Option 4: Native APK / PWA */}
          <div className="border border-stone-200 rounded-xl p-4 bg-stone-50/60 space-y-2">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-stone-700" />
              <h4 className="font-semibold text-stone-900 text-sm">
                4. Testowanie bezpośrednio na telefonie (APK / PWA)
              </h4>
            </div>
            <p className="text-xs text-stone-600 leading-relaxed">
              Tester może również pobrać gotowy plik aplikacji Android APK przygotowany w projekcie:
            </p>
            <div className="flex items-center gap-2 pt-1">
              <a
                href="/download/KOReader-Companion.apk"
                download="KOReader-Companion.apk"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-900 text-white text-xs font-medium hover:bg-stone-800 transition cursor-pointer"
              >
                <Smartphone className="w-3.5 h-3.5" />
                Pobierz KOReader-Companion.apk
              </a>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-stone-100 flex items-center justify-between bg-stone-50/70">
          <span className="text-[11px] text-stone-500">
            Wszystkie opcje są w 100% darmowe i nie wymagają konta Google od testera.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg bg-stone-900 text-white text-xs font-medium hover:bg-stone-800 transition cursor-pointer"
          >
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
};
