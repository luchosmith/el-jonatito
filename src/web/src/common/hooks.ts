import { useEffect, useRef, useState } from 'react';
import type { ServerEvent } from '../../../shared/types.ts';

/** Current time, re-rendered every `ms` (the clock on every screen). */
export function useNow(ms = 15_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Live updates from the server (server-sent events, authenticated by the session cookie). */
export function useEvents(onEvent: (e: ServerEvent) => void) {
  const handler = useRef(onEvent);
  handler.current = onEvent;
  useEffect(() => {
    const es = new EventSource('/api/events');
    es.onmessage = (m) => {
      try {
        handler.current(JSON.parse(m.data) as ServerEvent);
      } catch {
        /* ignore malformed */
      }
    };
    return () => es.close();
  }, []);
}

/** Press-and-hold (used for the hidden parent-mode corner). */
export function useLongPress(ms: number, onDone: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = () => {
    timer.current = setTimeout(onDone, ms);
  };
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return { onPointerDown: start, onPointerUp: cancel, onPointerLeave: cancel, onPointerCancel: cancel };
}

/** Speaks text aloud (never throws — speech may be unavailable). */
export function speak(text: string, lang: 'en' | 'es' = 'en') {
  try {
    if (!('speechSynthesis' in window) || !text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === 'es' ? 'es-US' : 'en-US';
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  } catch {
    /* no speech on this device */
  }
}

export function deviceLang(): 'en' | 'es' {
  try {
    return localStorage.getItem('jt.lang') === 'es' ? 'es' : 'en';
  } catch {
    return 'en';
  }
}
