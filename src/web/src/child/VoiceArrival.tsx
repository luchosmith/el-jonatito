// A new voice message from the family: their face pops up and the message plays once, by itself.
// It stays a few seconds after it ends, then fades; the message stays on their page for replay.
// If the tablet refuses to play sound on its own (browser autoplay rules), it pulses: tap to hear.
import { useEffect, useRef, useState } from 'react';
import { Face, SoundWave } from '../common/Face.tsx';
import { stopSound } from '../common/sound.ts';
import type { Person, VoiceNote } from '../../../shared/types.ts';

const STAY_AFTER_MS = 6000;
const WAIT_FOR_TAP_MS = 30_000;

export function VoiceArrival({ note, person, onHeard, onOpen, onDone }: {
  note: VoiceNote;
  person: Person | undefined;
  onHeard: (n: VoiceNote) => void;
  /** tap on the face: go to their page */
  onOpen: () => void;
  onDone: () => void;
}) {
  const [state, setState] = useState<'playing' | 'blocked' | 'done'>('playing');
  const audio = useRef<HTMLAudioElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const later = (ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(onDone, ms);
  };

  const play = () => {
    stopSound();
    audio.current?.pause();
    const a = new Audio(note.audio_url);
    audio.current = a;
    setState('playing');
    a.onended = () => {
      setState('done');
      onHeard(note);
      later(STAY_AFTER_MS);
    };
    a.onerror = () => {
      setState('blocked');
      later(WAIT_FOR_TAP_MS);
    };
    a.play().catch(() => {
      setState('blocked');
      later(WAIT_FOR_TAP_MS);
    });
  };

  useEffect(() => {
    play();
    return () => {
      audio.current?.pause();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [note.id]);

  return (
    <div className={`voice-arrival ${state}`} data-testid="voice-arrival" data-state={state} data-note={note.id}>
      <button className="va-face" data-testid="voice-arrival-face" onClick={() => { audio.current?.pause(); onOpen(); }} aria-label={person?.short_label}>
        {person && <Face person={person} />}
      </button>
      <button className="va-wave" data-testid="voice-arrival-play" onClick={play} aria-label="Play">
        <SoundWave playing={state === 'playing'} width={110} />
        {state === 'blocked' && <span className="va-tap">👆</span>}
      </button>
    </div>
  );
}
