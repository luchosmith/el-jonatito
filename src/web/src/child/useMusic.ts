// His 🎧 Music: one audio player that lives on every screen. His songs play in a random order; when the
// list ends, a new random order starts. A recorded clip (a voice note) pauses it for a moment.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.ts';
import { CLIP_END, CLIP_START } from '../common/sound.ts';
import type { Song, SongList } from '../../../shared/types.ts';

const shuffle = (n: number) => {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export interface Music {
  playing: boolean;
  /** the songs in play order */
  list: Song[];
  /** where in `list` we are */
  cur: number;
  current: Song | null;
  /** 0..1 through the current song */
  progress: number;
  /** after bedtime: when music wakes up again */
  sleepingUntil: string | null;
  /** starts a new random order; 'locked' after bedtime, 'empty' with no songs */
  start: () => Promise<'playing' | 'locked' | 'empty'>;
  stop: () => void;
  /** plays the song at this place in the list; the list goes on from there */
  playAt: (k: number) => void;
}

export function useMusic(): Music {
  const audio = useMemo(() => new Audio(), []);
  const [songs, setSongs] = useState<Song[]>([]);
  const [order, setOrder] = useState<number[]>([]);
  const [cur, setCur] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sleepingUntil, setSleepingUntil] = useState<string | null>(null);
  // The audio events need the latest list without re-subscribing.
  const state = useRef({ songs, order, cur, playing, pausedForClip: false });
  state.current = { ...state.current, songs, order, cur, playing };

  const playAtIn = useCallback((k: number, ord: number[], list: Song[]) => {
    const song = list[ord[k]];
    if (!song) return;
    audio.src = song.audio_url;
    void audio.play().catch(() => undefined);
    setCur(k);
    setProgress(0);
    setPlaying(true);
  }, [audio]);

  const stop = useCallback(() => {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    state.current.pausedForClip = false;
    setPlaying(false);
    setProgress(0);
  }, [audio]);

  const start = useCallback(async () => {
    const r = await api.get<SongList>('/api/songs');
    if (r.locked) {
      setSleepingUntil(r.unlock_at);
      return 'locked' as const;
    }
    setSleepingUntil(null);
    if (!r.songs.length) return 'empty' as const;
    const ord = shuffle(r.songs.length);
    setSongs(r.songs);
    setOrder(ord);
    playAtIn(0, ord, r.songs);
    return 'playing' as const;
  }, [playAtIn]);

  const playAt = useCallback((k: number) => playAtIn(k, state.current.order, state.current.songs), [playAtIn]);

  useEffect(() => {
    const next = () => {
      const { order: ord, cur: k, songs: list } = state.current;
      if (k + 1 < ord.length) return playAtIn(k + 1, ord, list);
      const fresh = shuffle(list.length); // the end of the list: a new random order
      setOrder(fresh);
      playAtIn(0, fresh, list);
    };
    const tick = () => setProgress(audio.duration ? audio.currentTime / audio.duration : 0);
    const failed = () => { if (state.current.playing && audio.getAttribute('src')) stop(); }; // e.g. bedtime: the file is locked
    // A voice note (or a recorded word) pauses the music, then it goes on.
    const clipStart = () => {
      if (!state.current.playing || audio.paused) return;
      state.current.pausedForClip = true;
      audio.pause();
    };
    const clipEnd = () => {
      if (!state.current.pausedForClip) return;
      state.current.pausedForClip = false;
      if (state.current.playing) void audio.play().catch(() => undefined);
    };
    audio.addEventListener('ended', next);
    audio.addEventListener('timeupdate', tick);
    audio.addEventListener('error', failed);
    window.addEventListener(CLIP_START, clipStart);
    window.addEventListener(CLIP_END, clipEnd);
    return () => {
      audio.removeEventListener('ended', next);
      audio.removeEventListener('timeupdate', tick);
      audio.removeEventListener('error', failed);
      window.removeEventListener(CLIP_START, clipStart);
      window.removeEventListener(CLIP_END, clipEnd);
    };
  }, [audio, playAtIn, stop]);

  useEffect(() => () => audio.pause(), [audio]);

  const list = order.map((i) => songs[i]).filter((s): s is Song => !!s);
  return { playing, list, cur, current: playing ? list[cur] ?? null : null, progress, sleepingUntil, start, stop, playAt };
}
