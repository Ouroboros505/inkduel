import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMsg, ServerMsg, View } from '../../shared/protocol';

export type Status = 'connecting' | 'open' | 'retrying' | 'gone';

/**
 * A live connection to one game room. Reconnects on its own (Chromebooks sleep, school Wi-Fi
 * drops), and calls `greet` on every (re)connect so the page can say who it is again.
 */
export function useRoom<V extends View>(pin: string, greet: (send: (m: ClientMsg) => void) => void, onMessage?: (m: ServerMsg) => void) {
  const [view, setView] = useState<V | null>(null);
  const [status, setStatus] = useState<Status>('connecting');
  // Server clock minus ours, so every screen counts down to the same second.
  const [offset, setOffset] = useState(0);
  const ws = useRef<WebSocket | null>(null);
  const greetRef = useRef(greet);
  const msgRef = useRef(onMessage);
  greetRef.current = greet;
  msgRef.current = onMessage;

  const send = useCallback((m: ClientMsg) => {
    const s = ws.current;
    if (s && s.readyState === WebSocket.OPEN) s.send(JSON.stringify(m));
  }, []);

  useEffect(() => {
    let stopped = false;
    let tries = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const sock = new WebSocket(`${proto}://${location.host}/api/rooms/${pin}/ws`);
      ws.current = sock;
      sock.onopen = () => {
        tries = 0;
        setStatus('open');
        greetRef.current(send);
      };
      sock.onmessage = (ev) => {
        let msg: ServerMsg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.t === 'view') {
          setView(msg.view as V);
          setOffset(msg.now - Date.now());
        }
        msgRef.current?.(msg);
      };
      sock.onclose = (ev) => {
        if (stopped || ws.current !== sock) return;
        // 4403: removed by the teacher; 4404: the game no longer exists. Don't keep knocking.
        if (ev.code === 4403 || ev.code === 4404) {
          setStatus('gone');
          return;
        }
        setStatus('retrying');
        retry = setTimeout(connect, Math.min(8000, 400 * 2 ** tries++));
      };
    };

    connect();
    // Some school proxies cut WebSockets that stay quiet for a minute. The room answers this
    // without waking up (see the auto-response in room.ts).
    const ping = setInterval(() => {
      if (ws.current?.readyState === WebSocket.OPEN) ws.current.send('ping');
    }, 25_000);
    // A laptop waking from sleep: reconnect straight away instead of waiting out the backoff.
    const wake = () => {
      if (document.visibilityState === 'visible' && ws.current?.readyState === WebSocket.CLOSED && !stopped) {
        clearTimeout(retry);
        tries = 0;
        connect();
      }
    };
    document.addEventListener('visibilitychange', wake);

    return () => {
      stopped = true;
      clearTimeout(retry);
      clearInterval(ping);
      document.removeEventListener('visibilitychange', wake);
      ws.current?.close();
    };
  }, [pin, send]);

  return { view, status, offset, send };
}

export async function roomExists(pin: string): Promise<{ ok: boolean; locked?: boolean; phase?: string }> {
  try {
    const res = await fetch(`/api/rooms/${pin}`);
    if (!res.ok) return { ok: false };
    return await res.json();
  } catch {
    return { ok: false };
  }
}
