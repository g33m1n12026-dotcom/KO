import React, { useState, useEffect } from 'react';
import { X, Key, ExternalLink, CheckCircle2, Save, Loader2 } from 'lucide-react';

interface AccountsSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AccountsSettingsModal: React.FC<AccountsSettingsModalProps> = ({ isOpen, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [iaAccessKey, setIaAccessKey] = useState('');
  const [iaSecretKey, setIaSecretKey] = useState('');
  const [iaSessionCookie, setIaSessionCookie] = useState('');
  const [zlibEmail, setZlibEmail] = useState('');
  const [zlibPassword, setZlibPassword] = useState('');
  const [annasKey, setAnnasKey] = useState('');
  const [chomikAccount, setChomikAccount] = useState('');
  const [chomikEmail, setChomikEmail] = useState('');
  const [chomikPassword, setChomikPassword] = useState('');

  const [docerEmail, setDocerEmail] = useState('');
  const [docerPassword, setDocerPassword] = useState('');
  const [fourSharedEmail, setFourSharedEmail] = useState('');
  const [fourSharedPassword, setFourSharedPassword] = useState('');

  const [accountStatus, setAccountStatus] = useState<{
    internetArchive: { hasKeys: boolean; hasCookie: boolean; accessKeyMasked?: string };
    zlibrary?: { isConnected: boolean; emailMasked?: string; userName?: string; downloadsToday?: number; downloadsLimit?: number };
    annasArchive: { hasKey: boolean; fastDownloadKeyMasked?: string };
    chomikuj?: { isConnected: boolean; accountName?: string; emailMasked?: string; hasPassword?: boolean };
    docer?: { isConnected: boolean; emailMasked?: string; hasPassword?: boolean };
    fourShared?: { isConnected: boolean; emailMasked?: string; hasPassword?: boolean };
  } | null>(null);

  const [isTesting, setIsTesting] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string; latencyMs?: number }> | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    fetchStatus();
  }, [isOpen]);

  const fetchStatus = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/settings/accounts');
      if (res.ok) {
        const data = await res.json();
        setAccountStatus(data);
      }
    } catch (err: any) {
      console.warn('Nie udało się pobrać statusu kont:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTestAccounts = async () => {
    setIsTesting(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/settings/accounts/test');
      if (res.ok) {
        const data = await res.json();
        const map: Record<string, { ok: boolean; message: string; latencyMs?: number }> = {};
        for (const r of data.results || []) {
          map[r.account] = { ok: r.ok, message: r.message, latencyMs: r.latencyMs };
        }
        setTestResults(map);
        setSuccessMsg('Test wszystkich połączeń z kontami został ukończony!');
        setTimeout(() => setSuccessMsg(null), 5000);
      } else {
        throw new Error('Błąd serwera podczas testowania kont');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Wystąpił błąd podczas testowania kont');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/settings/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          internetArchive: {
            accessKey: iaAccessKey.trim() || undefined,
            secretKey: iaSecretKey.trim() || undefined,
            sessionCookie: iaSessionCookie.trim() || undefined,
          },
          zlibrary: {
            email: zlibEmail.trim() || undefined,
            password: zlibPassword.trim() || undefined,
          },
          annasArchive: {
            fastDownloadKey: annasKey.trim() || undefined,
          },
          chomikuj: {
            accountName: chomikAccount.trim() || undefined,
            email: chomikEmail.trim() || undefined,
            password: chomikPassword.trim() || undefined,
          },
          docer: {
            email: docerEmail.trim() || undefined,
            password: docerPassword.trim() || undefined,
          },
          fourShared: {
            email: fourSharedEmail.trim() || undefined,
            password: fourSharedPassword.trim() || undefined,
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Nie udało się zapisać ustawień');
      }

      const data = await res.json();
      setAccountStatus(data.status);
      setSuccessMsg('Ustawienia kont i kluczy zostały pomyślnie zaktualizowane!');
      setIaAccessKey('');
      setIaSecretKey('');
      setIaSessionCookie('');
      setZlibEmail('');
      setZlibPassword('');
      setAnnasKey('');
      setChomikAccount('');
      setChomikEmail('');
      setChomikPassword('');
      setDocerEmail('');
      setDocerPassword('');
      setFourSharedEmail('');
      setFourSharedPassword('');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Wystąpił błąd podczas zapisu');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-stone-200 overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-stone-200 bg-stone-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-800 flex items-center justify-center font-bold">
              <Key className="w-4 h-4 text-amber-700" />
            </div>
            <div>
              <h3 className="font-bold text-stone-900 text-sm sm:text-base">
                Konta i Klucze Repozytoriów (Archive.org, Z-Library, Anna's Archive)
              </h3>
              <p className="text-xs text-stone-500">
                Współdzielenie poświadczeń dla bezpośrednich pobrań i wydań chronionych
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200/50 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 text-xs text-stone-700">
          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 flex items-center gap-2 font-medium">
              <X className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Section 1: Internet Archive */}
          <div className="p-4 sm:p-5 bg-stone-50/70 border border-stone-200 rounded-2xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-base">🏛️</span>
                <h4 className="font-bold text-stone-900 text-sm">Internet Archive (archive.org)</h4>
              </div>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border self-start sm:self-auto ${
                  accountStatus?.internetArchive.hasKeys
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-stone-100 text-stone-600 border-stone-200'
                }`}
              >
                {accountStatus?.internetArchive.hasKeys
                  ? `✅ Aktywne klucze S3 (${accountStatus.internetArchive.accessKeyMasked})`
                  : '⚪ Brak kluczy (dostęp tylko do wydań otwartych)'}
              </span>
            </div>

            <div className="text-stone-600 space-y-1.5 leading-relaxed bg-white p-3.5 rounded-xl border border-stone-200">
              <p className="font-medium text-stone-800">
                Poświadczenia dostępowe S3 Internet Archive:
              </p>
              <p>
                Umożliwiają bezpośrednie pobieranie zdigitalizowanych książek z repozytoriów Archive.org bez blokad 401.
              </p>
              <p className="font-semibold text-stone-900 pt-1">
                Klucze można wygenerować na:{' '}
                <a
                  href="https://archive.org/account/s3.php"
                  target="_blank"
                  rel="noreferrer"
                  className="underline text-stone-900 font-medium inline-flex items-center gap-0.5 hover:text-amber-800"
                >
                  archive.org/account/s3.php <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                  IAS3 Access Key:
                </label>
                <input
                  type="text"
                  value={iaAccessKey}
                  onChange={(e) => setIaAccessKey(e.target.value)}
                  placeholder={accountStatus?.internetArchive.hasKeys ? `Aktywny (${accountStatus.internetArchive.accessKeyMasked})` : 'np. vaFwHX...'}
                  className="w-full px-3 py-2 bg-white rounded-lg border border-stone-200 focus:outline-none focus:ring-1 focus:ring-stone-900 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                  IAS3 Secret Key:
                </label>
                <input
                  type="password"
                  value={iaSecretKey}
                  onChange={(e) => setIaSecretKey(e.target.value)}
                  placeholder={accountStatus?.internetArchive.hasKeys ? '••••••••••••••••' : 'np. zu2FLL...'}
                  className="w-full px-3 py-2 bg-white rounded-lg border border-stone-200 focus:outline-none focus:ring-1 focus:ring-stone-900 font-mono text-xs"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                  Cookie sesji Internet Archive (opcjonalnie):
                </label>
                <input
                  type="text"
                  value={iaSessionCookie}
                  onChange={(e) => setIaSessionCookie(e.target.value)}
                  placeholder="logged-in-sig=...; logged-in-user=..."
                  className="w-full px-3 py-2 bg-white rounded-lg border border-stone-200 focus:outline-none focus:ring-1 focus:ring-stone-900 font-mono text-xs"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Z-Library */}
          <div className="p-4 sm:p-5 bg-stone-50/70 border border-stone-200 rounded-2xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-base">📖</span>
                <h4 className="font-bold text-stone-900 text-sm">Z-Library (z-library.sk / singlelogin.rs)</h4>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-auto">
                {testResults?.zlibrary && (
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                      testResults.zlibrary.ok
                        ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                        : 'bg-rose-100 text-rose-900 border-rose-300'
                    }`}
                  >
                    {testResults.zlibrary.ok
                      ? `✓ Test OK (${testResults.zlibrary.latencyMs}ms)`
                      : `✗ Test: ${testResults.zlibrary.message}`}
                  </span>
                )}
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${
                    accountStatus?.zlibrary?.isConnected
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-stone-100 text-stone-600 border-stone-200'
                  }`}
                >
                  {accountStatus?.zlibrary?.isConnected
                    ? `✅ Połączono: ${accountStatus.zlibrary.userName || 'Konto'} (${accountStatus.zlibrary.emailMasked || ''}) • Pobrano dziś: ${accountStatus.zlibrary.downloadsToday || 0}/${accountStatus.zlibrary.downloadsLimit || 10}`
                    : '⚪ Niepołączono (brak loginu)'}
                </span>
              </div>
            </div>

            <div className="text-stone-600 space-y-1.5 leading-relaxed bg-white p-3.5 rounded-xl border border-stone-200">
              <p className="font-medium text-stone-800">
                Bezpośredni dostęp do milionów książek w Z-Library:
              </p>
              <p>
                Dzięki połączeniu konta Z-Library, wyszukiwarka pobiera oficjalne wydania e-booków bezpośrednio z serwerów CDN Z-Library bez przechodzenia przez strony pośrednie i bez kolejek.
              </p>
              <p className="font-semibold text-stone-900 pt-1">
                Portal logowania:{' '}
                <a
                  href="https://singlelogin.rs"
                  target="_blank"
                  rel="noreferrer"
                  className="underline text-stone-900 font-medium inline-flex items-center gap-0.5 hover:text-amber-800"
                >
                  singlelogin.rs <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                  Email konta Z-Library:
                </label>
                <input
                  type="email"
                  value={zlibEmail}
                  onChange={(e) => setZlibEmail(e.target.value)}
                  placeholder={accountStatus?.zlibrary?.isConnected ? `Aktywny (${accountStatus.zlibrary.emailMasked})` : 'np. twoj-email@domena.com'}
                  className="w-full px-3 py-2 bg-white rounded-lg border border-stone-200 focus:outline-none focus:ring-1 focus:ring-stone-900 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                  Hasło Z-Library:
                </label>
                <input
                  type="password"
                  value={zlibPassword}
                  onChange={(e) => setZlibPassword(e.target.value)}
                  placeholder={accountStatus?.zlibrary?.isConnected ? '••••••••••••••••' : 'Wpisz hasło do konta'}
                  className="w-full px-3 py-2 bg-white rounded-lg border border-stone-200 focus:outline-none focus:ring-1 focus:ring-stone-900 font-mono text-xs"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Anna's Archive */}
          <div className="p-4 sm:p-5 bg-stone-50/70 border border-stone-200 rounded-2xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-base">⚡</span>
                <h4 className="font-bold text-stone-900 text-sm">Anna's Archive (annas-archive.li)</h4>
              </div>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border self-start sm:self-auto ${
                  accountStatus?.annasArchive.hasKey
                    ? 'bg-purple-50 text-purple-800 border-purple-200'
                    : 'bg-stone-100 text-stone-600 border-stone-200'
                }`}
              >
                {accountStatus?.annasArchive.hasKey
                  ? `✅ Aktywny klucz członkowski (${accountStatus.annasArchive.fastDownloadKeyMasked})`
                  : '⚪ Tryb standardowy (przez publiczne mirrory LibGen)'}
              </span>
            </div>

            <p className="text-stone-600 leading-relaxed">
              Anna's Archive to uniwersalny indeks książek. Podanie klucza członkowskiego (Fast Download Key) umożliwia natychmiastowe pobieranie bez kolejki.
            </p>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold text-stone-700">
                  Klucz Fast Download Key (opcjonalnie):
                </label>
                <a
                  href="https://annas-archive.li/donate"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-stone-700 underline hover:text-stone-900 flex items-center gap-0.5"
                >
                  <span>Pobierz klucz członkowski</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
              <input
                type="password"
                value={annasKey}
                onChange={(e) => setAnnasKey(e.target.value)}
                placeholder={accountStatus?.annasArchive.hasKey ? '••••••••••••••••' : 'Wklej swój klucz API Anna\'s Archive...'}
                className="w-full px-3 py-2 bg-white rounded-lg border border-stone-200 focus:outline-none focus:ring-1 focus:ring-stone-900 font-mono text-xs"
              />
            </div>
          </div>

          {/* Section 4: Chomikuj.pl */}
          <div className="p-4 sm:p-5 bg-amber-50/40 border border-amber-200/80 rounded-2xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-base">🐹</span>
                <div>
                  <h4 className="font-bold text-stone-900 text-sm">Chomikuj.pl (Polskie książki & materiały)</h4>
                  <p className="text-[11px] text-stone-500">Przeszukiwanie bazy e-booków, lektur i dokumentów</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-auto">
                {testResults?.chomikuj && (
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                      testResults.chomikuj.ok
                        ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                        : 'bg-rose-100 text-rose-900 border-rose-300'
                    }`}
                  >
                    {testResults.chomikuj.ok
                      ? `✓ Test OK (${testResults.chomikuj.latencyMs}ms)`
                      : `✗ Test: ${testResults.chomikuj.message}`}
                  </span>
                )}
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${
                    accountStatus?.chomikuj?.isConnected
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-stone-100 text-stone-600 border-stone-200'
                  }`}
                >
                  {accountStatus?.chomikuj?.isConnected
                    ? `✅ Konto aktywne: ${accountStatus.chomikuj.accountName || 'waxap40816'}`
                    : '⚪ Wpisz dane konta Chomikuj'}
                </span>
              </div>
            </div>

            <p className="text-stone-600 leading-relaxed text-xs">
              Chomikuj.pl to bogata polska baza książek, lektur, podręczników i dokumentów (.epub, .pdf, .mobi, .doc, .txt). Wyszukiwarka automatycznie indeksuje zbiory, a podgląd dokumentów jest natychmiast konwertowany na e-booki.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                  Nazwa konta (Login):
                </label>
                <input
                  type="text"
                  value={chomikAccount}
                  onChange={(e) => setChomikAccount(e.target.value)}
                  placeholder={accountStatus?.chomikuj?.accountName || 'diweg68665'}
                  className="w-full px-3 py-2 bg-white rounded-lg border border-stone-200 focus:outline-none focus:ring-1 focus:ring-stone-900 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                  Adres e-mail:
                </label>
                <input
                  type="email"
                  value={chomikEmail}
                  onChange={(e) => setChomikEmail(e.target.value)}
                  placeholder={accountStatus?.chomikuj?.emailMasked || 'diweg68665@flakeian.com'}
                  className="w-full px-3 py-2 bg-white rounded-lg border border-stone-200 focus:outline-none focus:ring-1 focus:ring-stone-900 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                  Hasło:
                </label>
                <input
                  type="password"
                  value={chomikPassword}
                  onChange={(e) => setChomikPassword(e.target.value)}
                  placeholder={accountStatus?.chomikuj?.hasPassword ? '••••••••••••' : 'Wpisz hasło'}
                  className="w-full px-3 py-2 bg-white rounded-lg border border-stone-200 focus:outline-none focus:ring-1 focus:ring-stone-900 font-mono text-xs"
                />
              </div>
            </div>

            <div className="pt-1 flex items-center justify-between text-[11px] text-stone-500">
              <span>Profil użytkownika: <a href={`https://chomikuj.pl/${accountStatus?.chomikuj?.accountName || 'diweg68665'}`} target="_blank" rel="noreferrer" className="underline font-medium text-stone-800 hover:text-amber-800">chomikuj.pl/{accountStatus?.chomikuj?.accountName || 'diweg68665'}</a></span>
              <a href="https://chomikuj.pl" target="_blank" rel="noreferrer" className="underline hover:text-stone-800 flex items-center gap-1">
                Otwórz Chomikuj.pl <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>

          {/* Section 5: Docer.pl & Doci.pl */}
          <div className="p-4 sm:p-5 bg-sky-50/40 border border-sky-200/80 rounded-2xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-base">📄</span>
                <div>
                  <h4 className="font-bold text-stone-900 text-sm">Docer.pl & Doci.pl</h4>
                  <p className="text-[11px] text-stone-500">Polska baza dokumentów, e-booków i publikacji</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-auto">
                {testResults?.docer && (
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                      testResults.docer.ok
                        ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                        : 'bg-rose-100 text-rose-900 border-rose-300'
                    }`}
                  >
                    {testResults.docer.ok
                      ? `✓ Test OK (${testResults.docer.latencyMs}ms)`
                      : `✗ Test: ${testResults.docer.message}`}
                  </span>
                )}
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${
                    accountStatus?.docer?.isConnected
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-stone-100 text-stone-600 border-stone-200'
                  }`}
                >
                  {accountStatus?.docer?.isConnected
                    ? `✅ Konto aktywne: ${accountStatus.docer.emailMasked || 'diw***@flakeian.com'}`
                    : '⚪ Wpisz dane konta Docer'}
                </span>
              </div>
            </div>

            <p className="text-stone-600 leading-relaxed text-xs">
              Połączone konto umożliwia logowanie i pobieranie dokumentów PDF, EPUB oraz MOBI z Docer.pl i Doci.pl bez ograniczeń pobierania.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                  Adres e-mail:
                </label>
                <input
                  type="email"
                  value={docerEmail}
                  onChange={(e) => setDocerEmail(e.target.value)}
                  placeholder={accountStatus?.docer?.emailMasked || 'diweg68665@flakeian.com'}
                  className="w-full px-3 py-2 bg-white rounded-lg border border-stone-200 focus:outline-none focus:ring-1 focus:ring-stone-900 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                  Hasło:
                </label>
                <input
                  type="password"
                  value={docerPassword}
                  onChange={(e) => setDocerPassword(e.target.value)}
                  placeholder={accountStatus?.docer?.hasPassword ? '••••••••••••' : 'Wpisz hasło'}
                  className="w-full px-3 py-2 bg-white rounded-lg border border-stone-200 focus:outline-none focus:ring-1 focus:ring-stone-900 font-mono text-xs"
                />
              </div>
            </div>

            <div className="pt-1 flex items-center justify-between text-[11px] text-stone-500">
              <span>Platforma: Docer.pl / Doci.pl</span>
              <a href="https://docer.pl" target="_blank" rel="noreferrer" className="underline hover:text-stone-800 flex items-center gap-1">
                Otwórz Docer.pl <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>

          {/* Section 6: 4shared.com */}
          <div className="p-4 sm:p-5 bg-stone-50/70 border border-stone-200 rounded-2xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-base">📁</span>
                <div>
                  <h4 className="font-bold text-stone-900 text-sm">4shared.com</h4>
                  <p className="text-[11px] text-stone-500">Globalna baza udostępnionych plików e-booków</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-auto">
                {testResults?.fourShared && (
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                      testResults.fourShared.ok
                        ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                        : 'bg-rose-100 text-rose-900 border-rose-300'
                    }`}
                  >
                    {testResults.fourShared.ok
                      ? `✓ Test OK (${testResults.fourShared.latencyMs}ms)`
                      : `✗ Test: ${testResults.fourShared.message}`}
                  </span>
                )}
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${
                    accountStatus?.fourShared?.isConnected
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-stone-100 text-stone-600 border-stone-200'
                  }`}
                >
                  {accountStatus?.fourShared?.isConnected
                    ? `✅ Konto aktywne: ${accountStatus.fourShared.emailMasked || 'diw***@flakeian.com'}`
                    : '⚪ Wpisz dane konta 4shared'}
                </span>
              </div>
            </div>

            <p className="text-stone-600 leading-relaxed text-xs">
              Logowanie do 4shared pozwala na wyszukiwanie plików i natychmiastowe pobieranie bez odliczania sekund oczekiwania.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                  Adres e-mail:
                </label>
                <input
                  type="email"
                  value={fourSharedEmail}
                  onChange={(e) => setFourSharedEmail(e.target.value)}
                  placeholder={accountStatus?.fourShared?.emailMasked || 'diweg68665@flakeian.com'}
                  className="w-full px-3 py-2 bg-white rounded-lg border border-stone-200 focus:outline-none focus:ring-1 focus:ring-stone-900 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                  Hasło:
                </label>
                <input
                  type="password"
                  value={fourSharedPassword}
                  onChange={(e) => setFourSharedPassword(e.target.value)}
                  placeholder={accountStatus?.fourShared?.hasPassword ? '••••••••••••' : 'Wpisz hasło'}
                  className="w-full px-3 py-2 bg-white rounded-lg border border-stone-200 focus:outline-none focus:ring-1 focus:ring-stone-900 font-mono text-xs"
                />
              </div>
            </div>

            <div className="pt-1 flex items-center justify-between text-[11px] text-stone-500">
              <span>Platforma: 4shared.com</span>
              <a href="https://www.4shared.com" target="_blank" rel="noreferrer" className="underline hover:text-stone-800 flex items-center gap-1">
                Otwórz 4shared.com <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-stone-200 bg-stone-50/50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-stone-600 hover:bg-stone-200 transition cursor-pointer"
            >
              Zamknij
            </button>

            <button
              type="button"
              disabled={isTesting || saving}
              onClick={handleTestAccounts}
              className="px-3.5 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-900 border border-amber-300 font-semibold text-xs flex items-center gap-1.5 transition active:scale-95 cursor-pointer disabled:opacity-50"
            >
              {isTesting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-700" />
              ) : (
                <span>🧪</span>
              )}
              <span>{isTesting ? 'Testowanie kont...' : 'Przetestuj wszystkie konta'}</span>
            </button>
          </div>

          <button
            type="button"
            disabled={saving || isTesting}
            onClick={handleSave}
            className="px-5 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-semibold text-xs flex items-center gap-2 shadow-xs transition active:scale-95 cursor-pointer disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>Zapisz ustawienia kont</span>
          </button>
        </div>
      </div>
    </div>
  );
};
