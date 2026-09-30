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
}

const SETTINGS_FILE = path.join(process.cwd(), 'data', 'settings.json');

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
  };
}

// Initial load
loadSettings();
