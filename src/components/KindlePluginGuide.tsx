import React, { useState, useEffect } from 'react';
import JSZip from 'jszip';
import {
  Download,
  Code2,
  Check,
  Copy,
  FolderCheck,
  Terminal,
  HelpCircle,
  Smartphone,
  AlertTriangle,
  Globe,
  Wifi,
  Share2,
  ExternalLink,
  ShieldAlert,
  FileCode,
  Cloud,
} from 'lucide-react';

interface KindlePluginGuideProps {
  serverUrl: string;
}

export const KindlePluginGuide: React.FC<KindlePluginGuideProps> = ({ serverUrl }) => {
  const RENDER_PROD_URL = 'https://ko-zviz.onrender.com';

  // Compute default suggested URL (prioritize live Render URL)
  const [selectedServerUrl, setSelectedServerUrl] = useState<string>(RENDER_PROD_URL);
  const [activeCodeTab, setActiveCodeTab] = useState<'meta' | 'main'>('main');
  const [pluginCode, setPluginCode] = useState<{ metaLua: string; mainLua: string } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [isGeneratingZip, setIsGeneratingZip] = useState(false);

  // Live Tunnel State
  const [tunnelStatus, setTunnelStatus] = useState<{ active: boolean; url: string | null; error?: string } | null>(null);
  const [isStartingTunnel, setIsStartingTunnel] = useState(false);

  // Poll tunnel status
  useEffect(() => {
    const checkTunnel = () => {
      fetch('/api/tunnel')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) {
            setTunnelStatus(data);
            if (data.active && data.url && selectedServerUrl.includes('run.app')) {
              setSelectedServerUrl(data.url);
            }
          }
        })
        .catch(() => {});
    };
    checkTunnel();
    const timer = setInterval(checkTunnel, 6000);
    return () => clearInterval(timer);
  }, []);

  const handleStartTunnel = async () => {
    setIsStartingTunnel(true);
    try {
      const res = await fetch('/api/tunnel/start', { method: 'POST' });
      const data = await res.json();
      if (data.url) {
        setSelectedServerUrl(data.url);
      }
      setTunnelStatus(data);
    } catch (e) {
      console.error('Błąd startu tunelu:', e);
    } finally {
      setIsStartingTunnel(false);
    }
  };

  useEffect(() => {
    if (serverUrl && !selectedServerUrl) {
      setSelectedServerUrl(sharedSuggestedUrl || serverUrl);
    }
  }, [serverUrl]);

  useEffect(() => {
    const urlParam = encodeURIComponent(selectedServerUrl || serverUrl);
    fetch(`/api/koreader/plugin/code?serverUrl=${urlParam}`)
      .then((res) => res.json())
      .then((data) => setPluginCode(data))
      .catch((err) => console.error('Błąd pobierania kodu wtyczki:', err));
  }, [selectedServerUrl, serverUrl]);

  const handleCopyCode = () => {
    if (!pluginCode) return;
    const text = activeCodeTab === 'meta' ? pluginCode.metaLua : pluginCode.mainLua;
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(selectedServerUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  // Generowanie prawdziwego, binarnego ZIP bezpośrednio w pamięci przeglądarki (omija wszelkie filtry proxy)
  const handleDownloadZipClient = async () => {
    setIsGeneratingZip(true);
    try {
      let code = pluginCode;
      if (!code) {
        const urlParam = encodeURIComponent(selectedServerUrl || serverUrl);
        const res = await fetch(`/api/koreader/plugin/code?serverUrl=${urlParam}`);
        code = await res.json();
      }
      if (!code) throw new Error('Brak kodu wtyczki');

      const zip = new JSZip();
      const folder = zip.folder('aibooks.koplugin');
      if (folder) {
        folder.file('_meta.lua', code.metaLua);
        folder.file('main.lua', code.mainLua);
        folder.file(
          'README.txt',
          `KOReader AI Book Cloud Plugin for Kindle 10\n\nInstalacja:\n1. Skopiuj caly folder "aibooks.koplugin" do katalogu "koreader/plugins/" na czytniku Kindle.\n2. Pelna sciezka: /koreader/plugins/aibooks.koplugin/main.lua\n3. Zrestartuj KOReadera.\n4. W menu glownym lub po przytrzymaniu pliku PDF/EPUB wybierz "AI Ksiazki i Tlumacz".\n\nSkonfigurowany adres serwera:\n${selectedServerUrl}\n`
        );
      }

      const blob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 },
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'aibooks.koplugin.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Błąd generowania ZIP w przeglądarce:', err);
    } finally {
      setIsGeneratingZip(false);
    }
  };

  const handleDownloadSingleFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const isDevUrl = serverUrl.includes('ais-dev-');

  return (
    <div className="space-y-6">
      {/* Explanation of the 10KB HTML / Cookie Check */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-amber-100 text-amber-800 shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-amber-900 flex items-center gap-2">
              Dlaczego poprzedni plik miał ~10KB i był stroną HTML (Cookie check / Bot protection)?
            </h3>
            <p className="text-xs text-amber-800 leading-relaxed">
              Adres <code className="font-semibold">{serverUrl}</code> to środowisko podglądu deweloperskiego Google AI Studio w Cloud Run. Google zabezpiecza je automatyczną weryfikacją przeglądarki (<code>__cookie_check.html</code>). Gdy przeglądarka pobierała plik przez zwykły link HTML z zewnątrz, serwer zamiast archiwum odesłał stronę zabezpieczeń, a przeglądarka zapisała ją z rozszerzeniem <code>.zip</code>.
            </p>
            <p className="text-xs text-amber-900 leading-relaxed font-semibold">
              ✅ <strong>Rozwiązaliśmy to:</strong> Poniższy przycisk generuje teraz <strong>w 100% prawdziwe, czyste archiwum ZIP bezpośrednio w pamięci Twojej przeglądarki</strong> za pomocą biblioteki JSZip. Pobierzesz prawdziwe pliki <code>main.lua</code> i <code>_meta.lua</code>, a nie stronę HTML!
            </p>
          </div>
        </div>
      </div>

      {/* Download Action Card with Interactive Server URL Configuration */}
      <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-2xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xl">📦</span>
              <h2 className="text-base font-bold text-stone-900">
                Pobierz wtyczkę dla KOReadera (Kindle 10)
              </h2>
            </div>
            <p className="text-xs text-stone-500 max-w-2xl">
              Paczka zip tworzy gotowy folder <code>aibooks.koplugin</code> z plikami <code>_meta.lua</code>, <code>main.lua</code> oraz skonfigurowanym adresem Twojego serwera.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadZipClient}
              disabled={isGeneratingZip}
              className="px-5 py-3 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-medium text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition active:scale-95 shrink-0 disabled:opacity-50 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>{isGeneratingZip ? 'Pakowanie ZIP w przeglądarce...' : 'Pobierz aibooks.koplugin.zip'}</span>
            </button>
          </div>
        </div>

        {/* Individual File Download options */}
        {pluginCode && (
          <div className="pt-2 flex flex-wrap items-center gap-2 text-xs border-t border-stone-100">
            <span className="text-stone-500 font-medium text-[11px]">Alternatywa: pobierz bezpośrednio pojedyncze pliki Lua:</span>
            <button
              onClick={() => handleDownloadSingleFile('main.lua', pluginCode.mainLua)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-700 text-xs font-mono transition cursor-pointer"
            >
              <FileCode className="w-3.5 h-3.5 text-stone-500" />
              <span>Pobierz main.lua</span>
            </button>
            <button
              onClick={() => handleDownloadSingleFile('_meta.lua', pluginCode.metaLua)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-700 text-xs font-mono transition cursor-pointer"
            >
              <FileCode className="w-3.5 h-3.5 text-stone-500" />
              <span>Pobierz _meta.lua</span>
            </button>
          </div>
        )}

        {/* URL Configuration Input */}
        <div className="pt-2 border-t border-stone-100 space-y-2">
          <label className="text-xs font-semibold text-stone-700 block">
            Adres serwera do wpisania we wtyczce (zmienia kod w locie):
          </label>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1">
              <Globe className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={selectedServerUrl}
                onChange={(e) => setSelectedServerUrl(e.target.value)}
                placeholder="np. https://twoj-serwer.onrender.com lub http://192.168.1.50:3000"
                className="w-full pl-9 pr-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-mono text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900 focus:bg-white transition"
              />
            </div>

            <button
              onClick={handleCopyUrl}
              className="px-3.5 py-2 text-xs rounded-xl border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 flex items-center justify-center gap-1.5 transition shrink-0 cursor-pointer"
            >
              {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>Kopiuj</span>
            </button>
          </div>

          {/* Quick preset chips */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[11px] text-stone-400 font-medium">Szybki wybór:</span>
            <button
              type="button"
              onClick={() => setSelectedServerUrl(RENDER_PROD_URL)}
              className={`text-[11px] px-2.5 py-1 rounded-lg border transition flex items-center gap-1.5 ${
                selectedServerUrl === RENDER_PROD_URL
                  ? 'bg-emerald-800 text-white border-emerald-800 font-semibold shadow-xs'
                  : 'bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100 font-medium'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>🚀 Twój serwer Render 24/7 (ko-zviz.onrender.com)</span>
            </button>
            {tunnelStatus?.url && (
              <button
                type="button"
                onClick={() => setSelectedServerUrl(tunnelStatus.url!)}
                className={`text-[11px] px-2.5 py-1 rounded-lg border transition flex items-center gap-1.5 ${
                  selectedServerUrl === tunnelStatus.url
                    ? 'bg-emerald-800 text-white border-emerald-800 font-semibold shadow-xs'
                    : 'bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100 font-medium'
                }`}
              >
                <span>🚇 Tunel zapasowy</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelectedServerUrl('http://192.168.1.50:3000')}
              className={`text-[11px] px-2.5 py-1 rounded-lg border transition ${
                selectedServerUrl === 'http://192.168.1.50:3000'
                  ? 'bg-stone-900 text-white border-stone-900 font-medium'
                  : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
              }`}
            >
              📶 Domowe Wi-Fi
            </button>
          </div>
        </div>

        {/* Live Tunnel Banner for 100% 302-free connection */}
        <div className="pt-3 border-t border-stone-100">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                <span className="text-xs font-bold text-emerald-950">
                  Tunel Localtunnel bez blokad Cloud Run (Zalecany dla Kindle)
                </span>
              </div>
              <p className="text-[11px] text-emerald-800">
                {tunnelStatus?.active && tunnelStatus.url ? (
                  <>
                    Aktywny adres bez przekierowań 302: <code className="font-bold bg-white px-1.5 py-0.5 rounded border border-emerald-300">{tunnelStatus.url}</code>
                  </>
                ) : (
                  'Tworzy unikalny adres HTTPS bez cookies i logowania Google, który czytnik Kindle odbiera bezpośrednio.'
                )}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {tunnelStatus?.url && (
                <button
                  type="button"
                  onClick={() => setSelectedServerUrl(tunnelStatus.url!)}
                  className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-medium transition cursor-pointer shadow-2xs"
                >
                  Użyj tego adresu
                </button>
              )}
              <button
                type="button"
                onClick={handleStartTunnel}
                disabled={isStartingTunnel}
                className="px-3 py-1.5 bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-900 rounded-lg text-xs font-medium transition cursor-pointer"
              >
                {isStartingTunnel ? 'Łączenie...' : tunnelStatus?.active ? 'Odśwież tunel' : 'Włącz tunel'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Standalone 24/7 Cloud Guide */}
      <div className="bg-stone-900 text-stone-100 rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
            <Cloud className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">
              Jak sprawić, by Kindle działał 24/7 bez włączonego komputera?
            </h3>
            <p className="text-xs text-stone-400">
              Kindle nie ma pełnej przeglądarki, więc nie przejdzie blokady botów Google (<code>__cookie_check.html</code>). Oto jak uruchomić czysty serwer w chmurze:
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
            <div className="font-semibold text-white flex items-center gap-1.5">
              <span>🚀</span>
              <span>1. Darmowy hosting (Render.com)</span>
            </div>
            <p className="text-stone-300 text-[11px] leading-relaxed">
              W Render.com kliknij <strong>New +</strong> &gt; <strong>Web Service</strong> i połącz repozytorium. W projekcie znajduje się już gotowy plik <code>render.yaml</code>, który automatycznie skonfiguruje parametry!
            </p>
            <p className="text-emerald-400 text-[11px]">
              Otrzymasz stały link HTTPS (np. <code>https://kindle-ai-cloud.onrender.com</code>), który działa 24/7 bez żadnych blokad Google!
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
            <div className="font-semibold text-white flex items-center gap-1.5">
              <span>🌐</span>
              <span>2. Przycisk „Share” w AI Studio</span>
            </div>
            <p className="text-stone-300 text-[11px] leading-relaxed">
              Kliknij przycisk <strong>Share</strong> w prawym górnym rogu ekranu Google AI Studio. System opublikuje instancję <code>ais-pre-...</code>.
            </p>
            <p className="text-stone-400 text-[11px]">
              Działa bez potrzeby włączania Twojego komputera, bezpośrednio na klastrach Google.
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
            <div className="font-semibold text-white flex items-center gap-1.5">
              <span>📶</span>
              <span>3. Domowy mini-PC / Raspberry Pi</span>
            </div>
            <p className="text-stone-300 text-[11px] leading-relaxed">
              Jeśli posiadasz Raspberry Pi lub domowy mini-serwer, uruchom aplikację przez <code className="text-stone-200 bg-white/10 px-1 py-0.5 rounded">npm start</code>.
            </p>
            <p className="text-stone-400 text-[11px]">
              Kindle w domowym Wi-Fi łączy się bezpośrednio pod adresem IP routera (np. <code>192.168.1.100:3000</code>).
            </p>
          </div>
        </div>

        {/* Detailed step-by-step for Render */}
        <div className="bg-white/10 border border-emerald-500/30 rounded-xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs uppercase tracking-wide">
            <Check className="w-4 h-4" />
            <span>Jak krok po kroku uruchomić serwer na Render.com (bez znajomości Gita):</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-stone-300">
            <div className="bg-black/30 p-3 rounded-lg border border-white/5 space-y-1">
              <span className="text-emerald-300 font-bold block">Krok 0: 1-klikowy eksport z AI Studio na GitHub</span>
              <p className="text-[11px] text-stone-300">
                Nie musisz nic instalować ani wpisywać w terminalu! W prawym górnym rogu tego okna (w Google AI Studio) kliknij <strong>Export</strong> (lub ikonę GitHub / menu z trzema kropkami) ➔ <strong>Export to GitHub</strong>. AI Studio samo utworzy dla Ciebie nowe repozytorium na Twoim koncie GitHub w 5 sekund.
              </p>
            </div>
            <div className="bg-black/30 p-3 rounded-lg border border-white/5 space-y-1">
              <span className="text-white font-bold block">Krok 1: W Render.com kliknij "+ New"</span>
              <p className="text-[11px] text-stone-300">
                Zaloguj się na darmowe konto w <strong>dashboard.render.com</strong>. W prawym górnym rogu kliknij niebieski przycisk <strong>+ New</strong>, a następnie wybierz <strong>Web Service</strong>.
              </p>
            </div>
            <div className="bg-black/30 p-3 rounded-lg border border-white/5 space-y-1">
              <span className="text-white font-bold block">Krok 2: Połącz utworzone repozytorium</span>
              <p className="text-[11px] text-stone-300">
                Wybierz <em>Build and deploy from a Git repository</em>. Render wyświetli listę Twoich repozytoriów na GitHubie — przy repozytorium wyeksportowanym z AI Studio kliknij <strong>Connect</strong>.
              </p>
            </div>
            <div className="bg-black/30 p-3 rounded-lg border border-white/5 space-y-1">
              <span className="text-white font-bold block">Krok 3: Formularz i Start</span>
              <p className="text-[11px] text-stone-300">
                Dzięki plikowi <code>render.yaml</code>, który już dodałem do Twojego projektu, Render sam wypełni parametry. W sekcji <em>Environment Variables</em> upewnij się, że wpisany jest <code>GEMINI_API_KEY</code>. Na dole kliknij <strong>Deploy Web Service</strong> i gotowe!
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Step by step installation guide */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-2.5 shadow-2xs">
          <div className="w-7 h-7 rounded-lg bg-stone-900 text-white text-xs font-bold flex items-center justify-center">
            1
          </div>
          <h3 className="font-semibold text-stone-900 text-sm">Podłącz Kindle przez USB</h3>
          <p className="text-xs text-stone-500 leading-relaxed">
            Podłącz czytnik Kindle 10 do komputera kablem USB. Otwórz pamięć masową czytnika.
          </p>
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-2.5 shadow-2xs">
          <div className="w-7 h-7 rounded-lg bg-stone-900 text-white text-xs font-bold flex items-center justify-center">
            2
          </div>
          <h3 className="font-semibold text-stone-900 text-sm">Wypakuj folder wtyczki</h3>
          <p className="text-xs text-stone-500 leading-relaxed">
            Wypakuj pobrany folder <code>aibooks.koplugin</code> do katalogu:
            <br />
            <code className="bg-stone-100 px-1 py-0.5 rounded text-[11px] font-mono text-stone-800">
              koreader/plugins/
            </code>
          </p>
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-2.5 shadow-2xs">
          <div className="w-7 h-7 rounded-lg bg-stone-900 text-white text-xs font-bold flex items-center justify-center">
            3
          </div>
          <h3 className="font-semibold text-stone-900 text-sm">Zrestartuj KOReadera</h3>
          <p className="text-xs text-stone-500 leading-relaxed">
            Bezpiecznie odłącz Kindle i zrestartuj KOReadera. W menu głównym oraz po przytrzymaniu pliku PDF pojawi się opcja <strong className="text-stone-800">AI Tłumacz</strong>.
          </p>
        </div>
      </div>

      {/* PC Emulator Testing Section */}
      <div className="bg-stone-900 text-stone-100 rounded-2xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <span className="text-[11px] font-mono tracking-wider uppercase text-emerald-400 font-semibold">
              💻 Testowanie bez Kindle na PC
            </span>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              Oficjalny emulator / wersja desktopowa KOReader na Windows, Mac i Linux
            </h3>
          </div>
          <a
            href="https://github.com/koreader/koreader/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium text-white transition self-start sm:self-auto"
          >
            <span>Pobierz KOReader na PC (Releases)</span>
            <span>↗</span>
          </a>
        </div>

        <p className="text-xs text-stone-300 leading-relaxed max-w-3xl">
          Nie musisz za każdym razem wgrywać plików na czytnik przez USB, żeby przetestować wtyczkę!
          KOReader posiada <strong>oficjalną wersję natywną na PC (Linux AppImage / Windows x86_64 / macOS)</strong>,
          która działa dokładnie tak samo jak na e-papierze Kindle (to identyczny silnik Lua i ten sam interfejs dotykowy).
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 text-xs">
          <div className="bg-white/5 border border-white/10 p-3.5 rounded-xl space-y-1.5">
            <div className="font-semibold text-white flex items-center gap-1.5">
              <span>🪟</span>
              <span>Windows</span>
            </div>
            <p className="text-stone-400 text-[11px] leading-relaxed">
              Z GitHub Releases pobierz plik <code className="text-stone-200 bg-white/10 px-1 py-0.5 rounded">koreader-windows-x86_64-...zip</code>.
              Rozpakuj i wrzuć wtyczkę do folderu <code className="text-stone-200 bg-white/10 px-1 py-0.5 rounded">plugins/aibooks.koplugin</code>.
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 p-3.5 rounded-xl space-y-1.5">
            <div className="font-semibold text-white flex items-center gap-1.5">
              <span>🐧</span>
              <span>Linux (Najprościej)</span>
            </div>
            <p className="text-stone-400 text-[11px] leading-relaxed">
              Pobierz plik <code className="text-stone-200 bg-white/10 px-1 py-0.5 rounded">koreader-appimage-x86_64-....AppImage</code>.
              Katalog wtyczek to domyślnie <code className="text-stone-200 bg-white/10 px-1 py-0.5 rounded">~/.config/koreader/plugins/</code>.
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 p-3.5 rounded-xl space-y-1.5">
            <div className="font-semibold text-white flex items-center gap-1.5">
              <span>🍎</span>
              <span>macOS</span>
            </div>
            <p className="text-stone-400 text-[11px] leading-relaxed">
              Pobierz wersję <code className="text-stone-200 bg-white/10 px-1 py-0.5 rounded">koreader-macos-...dmg</code> lub uruchom
              przez terminal emulator deweloperski KOReadera (<code className="text-stone-200 bg-white/10 px-1 py-0.5 rounded">./komorebi</code>).
            </p>
          </div>
        </div>

        <div className="bg-stone-800/80 border border-stone-700/60 p-3 rounded-xl text-stone-300 text-xs flex items-center gap-2">
          <span>💡</span>
          <span>
            W emulatorze na PC myszka emuluje dotyk palca. Przytrzymanie lewego przycisku myszy na pliku PDF wywołuje menu kontekstowe z tłumaczeniem.
          </span>
        </div>
      </div>

      {/* How to use on Kindle */}
      <div className="bg-stone-50 border border-stone-200 rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-stone-700" />
          Jak korzystać z wtyczki na ekranie Kindle 10?
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-stone-600">
          <div className="bg-white p-4 rounded-xl border border-stone-200 space-y-1.5">
            <h4 className="font-semibold text-stone-800 flex items-center gap-1.5">
              <span>📖</span>
              <span>1. Tłumaczenie z pamięci Kindle</span>
            </h4>
            <p className="leading-relaxed text-[11px]">
              W Menedżerze Plików KOReadera <strong>przytrzymaj palec na dowolnym pliku PDF lub EPUB</strong>. W menu wybierz <span className="font-semibold text-stone-800">„AI: Przetłumacz na polski i konwertuj do EPUB”</span>.
            </p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-stone-200 space-y-1.5">
            <h4 className="font-semibold text-stone-800 flex items-center gap-1.5">
              <span>💡</span>
              <span>2. Doradca AI po opisie nastroju</span>
            </h4>
            <p className="leading-relaxed text-[11px]">
              Menu KOReadera → <span className="font-semibold text-stone-800">„AI Książki i Tłumacz”</span> → <span className="font-semibold text-stone-800">„Doradca AI: Opisz co chcesz przeczytać”</span>. Wpisz np. <em>„cyberpunk o tożsamości AI”</em>, a serwer wytypuje książki!
            </p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-stone-200 space-y-1.5">
            <h4 className="font-semibold text-stone-800 flex items-center gap-1.5">
              <span>🌐</span>
              <span>3. Szukanie w sieci i linki URL</span>
            </h4>
            <p className="leading-relaxed text-[11px]">
              Szukaj bezpośrednio po tytule/autorze lub wklej link z Anna's Archive / LibGen / Z-Library w opcji <span className="font-semibold text-stone-800">„Pobierz z URL”</span>. Chmura przygotuje EPUB i zaoferuje otwarcie na czytniku.
            </p>
          </div>
        </div>

        {/* Server Address info */}
        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-stone-200/80">
          <div className="text-xs text-stone-500">
            Adres serwera wpisany we wtyczce:{' '}
            <code className="font-mono text-stone-800 font-semibold">{serverUrl}</code>
          </div>
          <button
            onClick={handleCopyUrl}
            className="text-xs text-stone-700 bg-white border border-stone-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-stone-50 self-start sm:self-auto transition"
          >
            {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>Kopiuj adres</span>
          </button>
        </div>
      </div>

      {/* Code Inspector */}
      <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-stone-700" />
            <h3 className="text-sm font-bold text-stone-900">
              Podgląd kodu źródłowego wtyczki Lua (dla zaawansowanych)
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex border border-stone-200 rounded-lg overflow-hidden p-0.5 bg-stone-100 text-xs">
              <button
                onClick={() => setActiveCodeTab('main')}
                className={`px-3 py-1 rounded-md font-medium transition ${
                  activeCodeTab === 'main' ? 'bg-white shadow-2xs text-stone-900' : 'text-stone-600'
                }`}
              >
                main.lua
              </button>
              <button
                onClick={() => setActiveCodeTab('meta')}
                className={`px-3 py-1 rounded-md font-medium transition ${
                  activeCodeTab === 'meta' ? 'bg-white shadow-2xs text-stone-900' : 'text-stone-600'
                }`}
              >
                _meta.lua
              </button>
            </div>

            <button
              onClick={handleCopyCode}
              className="px-3 py-1.5 text-xs rounded-lg border border-stone-200 bg-white hover:bg-stone-50 flex items-center gap-1 text-stone-700 transition"
            >
              {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>Kopiuj kod</span>
            </button>
          </div>
        </div>

        {/* Code viewer box */}
        <pre className="p-4 bg-stone-900 text-stone-100 rounded-xl font-mono text-[11px] leading-relaxed overflow-x-auto max-h-96">
          <code>
            {pluginCode
              ? activeCodeTab === 'meta'
                ? pluginCode.metaLua
                : pluginCode.mainLua
              : '-- Ładowanie kodu wtyczki...'}
          </code>
        </pre>
      </div>
    </div>
  );
};
