import localtunnel from 'localtunnel';

let activeTunnel: localtunnel.Tunnel | null = null;
let currentTunnelUrl: string | null = null;
let isStarting = false;
let lastError: string | null = null;

export async function startTunnel(port: number = 3000): Promise<string | null> {
  if (activeTunnel && currentTunnelUrl) {
    return currentTunnelUrl;
  }
  if (isStarting) {
    return null;
  }

  isStarting = true;
  lastError = null;

  try {
    const tunnel = await localtunnel({
      port,
    });

    activeTunnel = tunnel;
    currentTunnelUrl = tunnel.url;
    console.log(`[Tunnel] Publiczny tunel Kindle aktywny: ${tunnel.url}`);

    tunnel.on('close', () => {
      console.log('[Tunnel] Tunel został zamknięty');
      activeTunnel = null;
      currentTunnelUrl = null;
    });

    tunnel.on('error', (err) => {
      console.error('[Tunnel] Błąd tunelu:', err);
      lastError = err?.message || 'Błąd połączenia tunelu';
    });

    isStarting = false;
    return tunnel.url;
  } catch (err: any) {
    console.error('[Tunnel] Nie udało się uruchomić tunelu:', err);
    lastError = err?.message || 'Błąd inicjalizacji tunelu';
    isStarting = false;
    return null;
  }
}

export function stopTunnel() {
  if (activeTunnel) {
    try {
      activeTunnel.close();
    } catch {}
    activeTunnel = null;
    currentTunnelUrl = null;
  }
}

export function getTunnelStatus() {
  return {
    active: Boolean(currentTunnelUrl),
    url: currentTunnelUrl,
    isStarting,
    lastError,
  };
}
