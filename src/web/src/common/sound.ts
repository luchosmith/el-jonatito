// Every tap gives feedback: a family-recorded word when there is one, text-to-speech otherwise.
import { speak } from './hooks.ts';

let current: HTMLAudioElement | null = null;

export function stopSound() {
  current?.pause();
  current = null;
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* no speech */
  }
}

/** Fired around every recorded clip (voice notes, recorded words) so his music can pause for it. */
export const CLIP_START = 'jt-clip-start';
export const CLIP_END = 'jt-clip-end';

/** Plays a recorded clip; calls `onEnd` when it finishes (or fails). */
export function playClip(url: string, onEnd?: () => void) {
  stopSound();
  const a = new Audio(url);
  current = a;
  let done = false;
  window.dispatchEvent(new Event(CLIP_START));
  const finish = () => {
    if (done) return;
    done = true;
    if (current === a) current = null;
    window.dispatchEvent(new Event(CLIP_END));
    onEnd?.();
  };
  a.onended = finish;
  a.onerror = finish;
  a.play().catch(finish);
}

/** Says a picture's word: the recorded clip if there is one, else the label out loud. */
export function sayToken(t: { label: string; audio_url?: string | null }, lang: 'en' | 'es') {
  if (t.audio_url) playClip(t.audio_url);
  else speak(t.label, lang);
}
