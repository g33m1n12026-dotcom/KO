import fs from 'fs';
import path from 'path';

export interface AccountSettingsData {
  internetArchive: {
    accessKey?: string;
    secretKey?: string;
    sessionCookie?: string;
  };
  zlibrary: {
    email?: string;
    password?: string;
    userId?: string;
    userKey?: string;
    userName?: string;
    downloadsToday?: number;
    downloadsLimit?: number;
  };
  annasArchive: {
    fastDownloadKey?: string;
  };
  chomikuj: {
    accountName?: string;
    email?: string;
    password?: string;
    sessionCookie?: string;
  };
  docer: {
    email?: string;
    password?: string;
    sessionCookie?: string;
    isConnected?: boolean;
  };
  fourShared: {
    email?: string;
    password?: string;
    sessionCookie?: string;
    isConnected?: boolean;
  };
  elevenlabs?: {
    apiKey?: string;
  };
}

const DATA_DIR = process.env.VERCEL ? '/tmp/data' : path.join(process.cwd(), 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch {}

let cachedSettings: AccountSettingsData = {
  internetArchive: {
    accessKey: process.env.IAS3_ACCESS_KEY || '',
    secretKey: process.env.IAS3_SECRET_KEY || '',
    sessionCookie: process.env.IA_SESSION_COOKIE || '',
  },
  zlibrary: {
    email: process.env.ZLIB_EMAIL || '',
    password: process.env.ZLIB_PASSWORD || '',
    userId: process.env.ZLIB_USERID || '',
    userKey: process.env.ZLIB_USERKEY || '',
    userName: '',
    downloadsToday: 0,
    downloadsLimit: 10,
  },
  annasArchive: {
    fastDownloadKey: process.env.ANNAS_FAST_KEY || '',
  },
  chomikuj: {
    accountName: process.env.CHOMIKUJ_ACCOUNT || 'diweg68665',
    email: process.env.CHOMIKUJ_EMAIL || 'diweg68665@flakeian.com',
    password: process.env.CHOMIKUJ_PASSWORD || 'QAZxsw321',
    sessionCookie: process.env.CHOMIKUJ_COOKIE || '',
  },
  docer: {
    email: process.env.DOCER_EMAIL || 'diweg68665@flakeian.com',
    password: process.env.DOCER_PASSWORD || 'QazXsw321',
    sessionCookie: process.env.DOCER_COOKIE || '',
    isConnected: true,
  },
  fourShared: {
    email: process.env.FOURSHARED_EMAIL || 'diweg68665@flakeian.com',
    password: process.env.FOURSHARED_PASSWORD || 'QazXsw321',
    sessionCookie: process.env.FOURSHARED_COOKIE || '',
    isConnected: true,
  },
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_LABS_API_KEY || '',
  },
};

export function loadSettings(): AccountSettingsData {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        cachedSettings = {
          internetArchive: {
            accessKey: parsed.internetArchive?.accessKey ?? cachedSettings.internetArchive.accessKey ?? '',
            secretKey: parsed.internetArchive?.secretKey ?? cachedSettings.internetArchive.secretKey ?? '',
            sessionCookie: parsed.internetArchive?.sessionCookie ?? cachedSettings.internetArchive.sessionCookie ?? '',
          },
          zlibrary: {
            email: parsed.zlibrary?.email ?? cachedSettings.zlibrary.email ?? '',
            password: parsed.zlibrary?.password ?? cachedSettings.zlibrary.password ?? '',
            userId: parsed.zlibrary?.userId ?? cachedSettings.zlibrary.userId ?? '',
            userKey: parsed.zlibrary?.userKey ?? cachedSettings.zlibrary.userKey ?? '',
            userName: parsed.zlibrary?.userName ?? cachedSettings.zlibrary.userName ?? '',
            downloadsToday: parsed.zlibrary?.downloadsToday ?? cachedSettings.zlibrary.downloadsToday ?? 0,
            downloadsLimit: parsed.zlibrary?.downloadsLimit ?? cachedSettings.zlibrary.downloadsLimit ?? 10,
          },
          annasArchive: {
            fastDownloadKey: parsed.annasArchive?.fastDownloadKey ?? cachedSettings.annasArchive.fastDownloadKey ?? '',
          },
          chomikuj: {
            accountName: parsed.chomikuj?.accountName ?? cachedSettings.chomikuj.accountName ?? 'diweg68665',
            email: parsed.chomikuj?.email ?? cachedSettings.chomikuj.email ?? 'diweg68665@flakeian.com',
            password: parsed.chomikuj?.password ?? cachedSettings.chomikuj.password ?? 'QAZxsw321',
            sessionCookie: parsed.chomikuj?.sessionCookie ?? cachedSettings.chomikuj.sessionCookie ?? '',
          },
          docer: {
            email: parsed.docer?.email ?? cachedSettings.docer.email ?? 'diweg68665@flakeian.com',
            password: parsed.docer?.password ?? cachedSettings.docer.password ?? 'QazXsw321',
            sessionCookie: parsed.docer?.sessionCookie ?? cachedSettings.docer.sessionCookie ?? '',
            isConnected: Boolean(parsed.docer?.sessionCookie || parsed.docer?.email),
          },
          fourShared: {
            email: parsed.fourShared?.email ?? cachedSettings.fourShared.email ?? 'diweg68665@flakeian.com',
            password: parsed.fourShared?.password ?? cachedSettings.fourShared.password ?? 'QazXsw321',
            sessionCookie: parsed.fourShared?.sessionCookie ?? cachedSettings.fourShared.sessionCookie ?? '',
            isConnected: Boolean(parsed.fourShared?.sessionCookie || parsed.fourShared?.email),
          },
          elevenlabs: {
            apiKey: parsed.elevenlabs?.apiKey ?? cachedSettings.elevenlabs?.apiKey ?? process.env.ELEVENLABS_API_KEY ?? '',
          },
        };
      }
    }
  } catch (err) {
    console.warn('Błąd odczytu data/settings.json:', err);
  }
  return cachedSettings;
}

export async function loginZlibrary(email: string, password: string): Promise<boolean> {
  const domains = ['https://singlelogin.rs', 'https://singlelogin.re', 'https://z-library.sk', 'https://1lib.sk'];
  for (const domain of domains) {
    try {
      const res = await fetch(`${domain}/eapi/user/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        },
        body: new URLSearchParams({ email, password }).toString(),
        signal: AbortSignal.timeout(8000),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.user) {
          cachedSettings.zlibrary.userId = String(data.user.id);
          cachedSettings.zlibrary.userKey = data.user.remix_userkey;
          cachedSettings.zlibrary.userName = data.user.name || 'Z-Library User';
          cachedSettings.zlibrary.downloadsToday = data.user.downloads_today ?? 0;
          cachedSettings.zlibrary.downloadsLimit = data.user.downloads_limit ?? 10;
          saveSettings(cachedSettings);
          return true;
        }
      }
    } catch (err: any) {
      console.warn(`Z-Library login attempt failed on ${domain}:`, err.message || err);
    }
  }
  return false;
}

/**
 * Logs in to Docer.pl / Doci.pl and saves session cookies
 */
export async function loginDocer(email?: string, password?: string): Promise<boolean> {
  const userEmail = email || cachedSettings.docer?.email || 'diweg68665@flakeian.com';
  const userPass = password || cachedSettings.docer?.password || 'QazXsw321';
  if (!userEmail || !userPass) return false;

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Referer': 'https://docer.pl/',
    };

    const getRes = await fetch('https://docer.pl/', { headers, signal: AbortSignal.timeout(10000) });
    const html = await getRes.text();
    const getCookies = getRes.headers.getSetCookie ? getRes.headers.getSetCookie() : [getRes.headers.get('set-cookie') || ''];
    const csrfMatch = html.match(/id=\"csrf_auth_login\"[^>]*value=\"([^\"]+)\"/) || html.match(/name=\"csrf_auth\"[^>]*value=\"([^\"]+)\"/);
    const csrf = csrfMatch ? csrfMatch[1] : '';

    const cookieHeader = getCookies.map((c) => c.split(';')[0]).join('; ');

    const postBody = new URLSearchParams({
      csrf_auth: csrf,
      user_email: userEmail,
      user_password: userPass,
      provider: '',
      user_remember: '1',
    });

    const postRes = await fetch('https://docer.pl/account/signin_check', {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': cookieHeader,
      },
      body: postBody.toString(),
      signal: AbortSignal.timeout(10000),
    });

    if (postRes.ok) {
      const data = await postRes.json();
      if (data && data.success) {
        const postCookies = postRes.headers.getSetCookie ? postRes.headers.getSetCookie() : [postRes.headers.get('set-cookie') || ''];
        const fullCookies = [...getCookies, ...postCookies].map((c) => c.split(';')[0]).join('; ');
        cachedSettings.docer = {
          email: userEmail,
          password: userPass,
          sessionCookie: fullCookies,
          isConnected: true,
        };
        saveSettings(cachedSettings);
        console.log('[Docer] Pomyślnie zalogowano konto Docer.pl:', userEmail);
        return true;
      }
    }
  } catch (err: any) {
    console.warn('[Docer] Błąd logowania do Docer.pl:', err?.message);
  }
  return false;
}

/**
 * Logs in to 4shared.com and saves session cookies
 */
export async function login4shared(email?: string, password?: string): Promise<boolean> {
  const userEmail = email || cachedSettings.fourShared?.email || 'diweg68665@flakeian.com';
  const userPass = password || cachedSettings.fourShared?.password || 'QazXsw321';
  if (!userEmail || !userPass) return false;

  try {
    const loginData = new URLSearchParams({
      returnTo: 'https://www.4shared.com/account/home.jsp',
      ausk: '',
      inviteId: '',
      inviterName: '',
      login: userEmail,
      password: userPass,
      remember: 'true',
    });

    const res = await fetch('https://www.4shared.com/web/login', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://www.4shared.com',
        'Referer': 'https://www.4shared.com/login.jsp',
      },
      body: loginData.toString(),
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
    });

    if (res.ok) {
      const rawCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie') || ''];
      const sessionCookies = rawCookies.map((c) => c.split(';')[0]).join('; ');
      cachedSettings.fourShared = {
        email: userEmail,
        password: userPass,
        sessionCookie: sessionCookies || 'logged_in=1',
        isConnected: true,
      };
      saveSettings(cachedSettings);
      console.log('[4shared] Pomyślnie zalogowano konto 4shared:', userEmail);
      return true;
    }
  } catch (err: any) {
    console.warn('[4shared] Błąd logowania do 4shared.com:', err?.message);
  }
  return false;
}

export function saveSettings(newSettings: Partial<AccountSettingsData>): AccountSettingsData {
  try {
    const dir = path.dirname(SETTINGS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    cachedSettings = {
      internetArchive: {
        accessKey: newSettings.internetArchive?.accessKey !== undefined ? newSettings.internetArchive.accessKey : cachedSettings.internetArchive.accessKey,
        secretKey: newSettings.internetArchive?.secretKey !== undefined ? newSettings.internetArchive.secretKey : cachedSettings.internetArchive.secretKey,
        sessionCookie: newSettings.internetArchive?.sessionCookie !== undefined ? newSettings.internetArchive.sessionCookie : cachedSettings.internetArchive.sessionCookie,
      },
      zlibrary: {
        email: newSettings.zlibrary?.email !== undefined ? newSettings.zlibrary.email : cachedSettings.zlibrary.email,
        password: newSettings.zlibrary?.password !== undefined ? newSettings.zlibrary.password : cachedSettings.zlibrary.password,
        userId: newSettings.zlibrary?.userId !== undefined ? newSettings.zlibrary.userId : cachedSettings.zlibrary.userId,
        userKey: newSettings.zlibrary?.userKey !== undefined ? newSettings.zlibrary.userKey : cachedSettings.zlibrary.userKey,
        userName: newSettings.zlibrary?.userName !== undefined ? newSettings.zlibrary.userName : cachedSettings.zlibrary.userName,
        downloadsToday: newSettings.zlibrary?.downloadsToday !== undefined ? newSettings.zlibrary.downloadsToday : cachedSettings.zlibrary.downloadsToday,
        downloadsLimit: newSettings.zlibrary?.downloadsLimit !== undefined ? newSettings.zlibrary.downloadsLimit : cachedSettings.zlibrary.downloadsLimit,
      },
      annasArchive: {
        fastDownloadKey: newSettings.annasArchive?.fastDownloadKey !== undefined ? newSettings.annasArchive.fastDownloadKey : cachedSettings.annasArchive.fastDownloadKey,
      },
      chomikuj: {
        accountName: newSettings.chomikuj?.accountName !== undefined ? newSettings.chomikuj.accountName : cachedSettings.chomikuj.accountName,
        email: newSettings.chomikuj?.email !== undefined ? newSettings.chomikuj.email : cachedSettings.chomikuj.email,
        password: newSettings.chomikuj?.password !== undefined ? newSettings.chomikuj.password : cachedSettings.chomikuj.password,
        sessionCookie: newSettings.chomikuj?.sessionCookie !== undefined ? newSettings.chomikuj.sessionCookie : cachedSettings.chomikuj.sessionCookie,
      },
      docer: {
        email: newSettings.docer?.email !== undefined ? newSettings.docer.email : cachedSettings.docer.email,
        password: newSettings.docer?.password !== undefined ? newSettings.docer.password : cachedSettings.docer.password,
        sessionCookie: newSettings.docer?.sessionCookie !== undefined ? newSettings.docer.sessionCookie : cachedSettings.docer.sessionCookie,
        isConnected: Boolean(newSettings.docer?.sessionCookie || newSettings.docer?.email || cachedSettings.docer.sessionCookie),
      },
      fourShared: {
        email: newSettings.fourShared?.email !== undefined ? newSettings.fourShared.email : cachedSettings.fourShared.email,
        password: newSettings.fourShared?.password !== undefined ? newSettings.fourShared.password : cachedSettings.fourShared.password,
        sessionCookie: newSettings.fourShared?.sessionCookie !== undefined ? newSettings.fourShared.sessionCookie : cachedSettings.fourShared.sessionCookie,
        isConnected: Boolean(newSettings.fourShared?.sessionCookie || newSettings.fourShared?.email || cachedSettings.fourShared.sessionCookie),
      },
      elevenlabs: {
        apiKey: newSettings.elevenlabs?.apiKey !== undefined ? newSettings.elevenlabs.apiKey : (cachedSettings.elevenlabs?.apiKey || process.env.ELEVENLABS_API_KEY || ''),
      },
    };

    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(cachedSettings, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Błąd zapisu data/settings.json:', err);
  }
  return cachedSettings;
}

export function getPublicAccountStatus() {
  loadSettings();
  const z = cachedSettings.zlibrary;
  const isZlibConnected = Boolean(z.userId && z.userKey) || Boolean(z.email && z.password);
  const ch = cachedSettings.chomikuj;
  const isChomikConnected = Boolean(ch.accountName || ch.email);
  const doc = cachedSettings.docer;
  const isDocerConnected = Boolean(doc.sessionCookie || doc.email);
  const fsAcc = cachedSettings.fourShared;
  const is4sharedConnected = Boolean(fsAcc.sessionCookie || fsAcc.email);
  const elKey = cachedSettings.elevenlabs?.apiKey || process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_LABS_API_KEY || '';

  return {
    internetArchive: {
      hasKeys: Boolean(cachedSettings.internetArchive.accessKey && cachedSettings.internetArchive.secretKey),
      hasCookie: Boolean(cachedSettings.internetArchive.sessionCookie),
      accessKeyMasked: cachedSettings.internetArchive.accessKey
        ? `${cachedSettings.internetArchive.accessKey.slice(0, 4)}...${cachedSettings.internetArchive.accessKey.slice(-4)}`
        : '',
    },
    zlibrary: {
      isConnected: isZlibConnected,
      emailMasked: z.email ? `${z.email.slice(0, 3)}***@${z.email.split('@')[1] || '...'}` : '',
      userName: z.userName || (isZlibConnected ? 'Konto aktywne' : ''),
      downloadsToday: z.downloadsToday ?? 0,
      downloadsLimit: z.downloadsLimit ?? 10,
    },
    annasArchive: {
      hasKey: Boolean(cachedSettings.annasArchive.fastDownloadKey),
      fastDownloadKeyMasked: cachedSettings.annasArchive.fastDownloadKey
        ? `${cachedSettings.annasArchive.fastDownloadKey.slice(0, 4)}...`
        : '',
    },
    chomikuj: {
      isConnected: isChomikConnected,
      accountName: ch.accountName || 'diweg68665',
      emailMasked: ch.email ? `${ch.email.slice(0, 3)}***@${ch.email.split('@')[1] || '...'}` : 'diw***@flakeian.com',
      hasPassword: Boolean(ch.password),
    },
    docer: {
      isConnected: isDocerConnected,
      emailMasked: doc.email ? `${doc.email.slice(0, 3)}***@${doc.email.split('@')[1] || '...'}` : 'diw***@flakeian.com',
      hasPassword: Boolean(doc.password),
    },
    fourShared: {
      isConnected: is4sharedConnected,
      emailMasked: fsAcc.email ? `${fsAcc.email.slice(0, 3)}***@${fsAcc.email.split('@')[1] || '...'}` : 'diw***@flakeian.com',
      hasPassword: Boolean(fsAcc.password),
    },
    elevenlabs: {
      hasKey: Boolean(elKey),
      apiKeyMasked: elKey ? `${elKey.slice(0, 4)}...${elKey.slice(-4)}` : '',
    },
  };
}

export interface AccountTestResult {
  account: 'zlibrary' | 'chomikuj' | 'docer' | 'fourShared' | 'internetArchive' | 'elevenlabs';
  name: string;
  ok: boolean;
  message: string;
  latencyMs?: number;
}

export async function testAllAccounts(): Promise<AccountTestResult[]> {
  loadSettings();
  const results: AccountTestResult[] = [];

  // 1. Test Z-Library
  const zStart = Date.now();
  try {
    const z = cachedSettings.zlibrary;
    if (z.userId && z.userKey) {
      const resp = await fetch('https://singlelogin.re/eapi/book/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: `remix_userid=${z.userId}; remix_userkey=${z.userKey}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36',
        },
        body: new URLSearchParams({ message: 'Lem', limit: '1' }).toString(),
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        results.push({
          account: 'zlibrary',
          name: 'Z-Library (Konto Premium/VIP)',
          ok: true,
          message: 'Połączenie z autoryzacją Z-Library aktywne. Pobieranie działa poprawnie.',
          latencyMs: Date.now() - zStart,
        });
      } else {
        results.push({
          account: 'zlibrary',
          name: 'Z-Library (Konto Premium/VIP)',
          ok: false,
          message: `Serwer Z-Library zwrócił kod HTTP ${resp.status}`,
          latencyMs: Date.now() - zStart,
        });
      }
    } else {
      results.push({
        account: 'zlibrary',
        name: 'Z-Library (Konto Premium/VIP)',
        ok: false,
        message: 'Brak skonfigurowanych kluczy lub danych logowania Z-Library.',
      });
    }
  } catch (err: any) {
    results.push({
      account: 'zlibrary',
      name: 'Z-Library (Konto Premium/VIP)',
      ok: false,
      message: err.message || 'Błąd połączenia z Z-Library',
      latencyMs: Date.now() - zStart,
    });
  }

  // 2. Test Docer.pl
  const docStart = Date.now();
  try {
    const ok = await loginDocer();
    results.push({
      account: 'docer',
      name: 'Docer.pl (Konto)',
      ok,
      message: ok
        ? `Zalogowano pomyślnie do konta Docer.pl (${cachedSettings.docer.email || 'diweg68665@flakeian.com'}).`
        : 'Nie udało się zalogować do Docer.pl. Sprawdź poprawność hasła.',
      latencyMs: Date.now() - docStart,
    });
  } catch (err: any) {
    results.push({
      account: 'docer',
      name: 'Docer.pl (Konto)',
      ok: false,
      message: err.message || 'Błąd połączenia z Docer.pl',
      latencyMs: Date.now() - docStart,
    });
  }

  // 3. Test 4shared
  const fsStart = Date.now();
  try {
    const ok = await login4shared();
    const searchRes = await fetch('https://www.4shared.com/web/rest/v1_2/files?query=robot&limit=1', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000),
    });
    const canSearch = searchRes.ok;
    results.push({
      account: 'fourShared',
      name: '4shared.com (Konto)',
      ok: ok || canSearch,
      message: ok
        ? `Zalogowano do konta 4shared (${cachedSettings.fourShared.email || 'diweg68665@flakeian.com'}) i baza odpowiada.`
        : canSearch
        ? 'Wyszukiwarka 4shared działa poprawnie w trybie chmury.'
        : 'Błąd połączenia z 4shared.',
      latencyMs: Date.now() - fsStart,
    });
  } catch (err: any) {
    results.push({
      account: 'fourShared',
      name: '4shared.com (Konto)',
      ok: false,
      message: err.message || 'Błąd połączenia z 4shared',
      latencyMs: Date.now() - fsStart,
    });
  }

  // 4. Test Chomikuj.pl
  const chStart = Date.now();
  try {
    const { searchChomikujBooks } = await import('./chomikuj');
    const items = await searchChomikujBooks('lektura');
    results.push({
      account: 'chomikuj',
      name: 'Chomikuj.pl (Konto & Szukaj)',
      ok: items.length > 0,
      message: items.length > 0
        ? `Wyszukiwarka Chomikuj.pl działa (zwrócono ${items.length} pozycji testowych).`
        : 'Chomikuj.pl nie zwrócił wyników testowych.',
      latencyMs: Date.now() - chStart,
    });
  } catch (err: any) {
    results.push({
      account: 'chomikuj',
      name: 'Chomikuj.pl (Konto & Szukaj)',
      ok: false,
      message: err.message || 'Błąd połączenia z Chomikuj.pl',
      latencyMs: Date.now() - chStart,
    });
  }

  // 5. Test Internet Archive
  const iaStart = Date.now();
  try {
    const res = await fetch('https://archive.org/advancedsearch.php?q=mediatype:(texts)&rows=1&output=json', {
      signal: AbortSignal.timeout(4000),
      headers: { 'User-Agent': 'KOReader-Cloud/1.0' },
    });
    results.push({
      account: 'internetArchive',
      name: 'Internet Archive (Baza cyfrowa)',
      ok: res.ok,
      message: res.ok ? 'Repozytorium Archive.org odpowiada prawidłowo.' : `HTTP ${res.status}`,
      latencyMs: Date.now() - iaStart,
    });
  } catch (err: any) {
    results.push({
      account: 'internetArchive',
      name: 'Internet Archive (Baza cyfrowa)',
      ok: false,
      message: err.message || 'Timeout połączenia z Archive.org',
      latencyMs: Date.now() - iaStart,
    });
  }

  // 6. Test ElevenLabs
  const elKey = cachedSettings.elevenlabs?.apiKey || process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_LABS_API_KEY || '';
  if (elKey) {
    const elStart = Date.now();
    try {
      const elRes = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
        headers: { 'xi-api-key': elKey },
        signal: AbortSignal.timeout(5000),
      });
      if (elRes.ok) {
        const elData: any = await elRes.json();
        results.push({
          account: 'elevenlabs',
          name: 'ElevenLabs AI (Lektorzy)',
          ok: true,
          message: `Klucz aktywny (Plan: ${elData.tier}, limit: ${elData.character_limit?.toLocaleString()} znaków).`,
          latencyMs: Date.now() - elStart,
        });
      } else {
        results.push({
          account: 'elevenlabs',
          name: 'ElevenLabs AI (Lektorzy)',
          ok: false,
          message: `Błąd autoryzacji ElevenLabs (HTTP ${elRes.status}).`,
          latencyMs: Date.now() - elStart,
        });
      }
    } catch (e: any) {
      results.push({
        account: 'elevenlabs',
        name: 'ElevenLabs AI (Lektorzy)',
        ok: false,
        message: e.message || 'Błąd połączenia z ElevenLabs',
        latencyMs: Date.now() - elStart,
      });
    }
  } else {
    results.push({
      account: 'elevenlabs',
      name: 'ElevenLabs AI (Lektorzy)',
      ok: false,
      message: 'Brak klucza API ElevenLabs (dostępne bezpłatne głosy studyjne Marek/Zofia).',
    });
  }

  return results;
}

// Initial load & background authentication
loadSettings();
setTimeout(() => {
  loginDocer().catch(() => {});
  login4shared().catch(() => {});
}, 1000);

