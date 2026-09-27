// A media item (e.g. Pongo) full screen: nothing to get lost in. His face (bottom-left, where it is in
// the taskbar) brings him back; the media clock shows when media time ends. During the sleep lock it
// shows the moon instead.
// A film (Pongo: 101 Dalmatians) fills the screen and plays until bedtime: a tap anywhere pauses it or
// goes on, it goes on next time from where he left it (remembered on this tablet), and it loops.
import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api.ts';
import { Clock12 } from '../common/Clock12.tsx';
import { Face } from '../common/Face.tsx';
import { fmt12 } from '../../../shared/time.ts';
import type { Item, MediaItem, Person } from '../../../shared/types.ts';

export function MediaPlayer({ item, media, me, now, onExit }: {
  item: Item;
  media: MediaItem | undefined;
  me: Person | undefined;
  now: Date;
  onExit: () => void;
}) {
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'playing'; ends: Date } | { kind: 'locked'; until: Date | null }>({ kind: 'loading' });

  useEffect(() => {
    if (!media) return;
    api
      .post<{ ends_at: string }>(`/api/media/${media.id}/play`)
      .then((r) => setState({ kind: 'playing', ends: new Date(r.ends_at) }))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 423) setState({ kind: 'locked', until: e.data.unlock_at ? new Date(e.data.unlock_at as string) : null });
        else onExit();
      });
  }, [media?.id]);

  // Media time is over: fade back to the orbit.
  useEffect(() => {
    if (state.kind === 'playing' && now >= state.ends) onExit();
  }, [now, state]);

  const poster = media?.cover_url ?? item.photo_url;
  const video = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const posKey = media ? `jt-media-pos-${media.id}` : '';
  const savePos = () => {
    const v = video.current;
    if (!v || !posKey || !v.duration) return;
    try {
      localStorage.setItem(posKey, String(v.currentTime));
    } catch { /* private mode: it just starts from the beginning next time */ }
  };
  // Leaving (home, bedtime) keeps his spot.
  useEffect(() => () => savePos(), [posKey]);
  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => setPaused(true));
    else v.pause();
  };
  const isAudio = media?.file_url && media.kind === 'song';

  return (
    <div className="player" data-testid="player" data-state={state.kind}>
      {state.kind === 'locked' ? (
        <div className="player-locked" data-testid="player-locked">
          <div className="moon-big">🌙</div>
          {state.until && (
            <>
              <Clock12 at={state.until} size={160} />
              <b className="time big-time">{fmt12(state.until)}</b>
            </>
          )}
        </div>
      ) : media?.file_url && state.kind === 'playing' ? (
        isAudio ? (
          <div className="frame">
            {poster && <img src={poster} alt="" />}
            <audio src={media.file_url} autoPlay onEnded={onExit} data-testid="player-audio" />
          </div>
        ) : (
          <div className="film" data-testid="player-film" data-paused={paused ? 'yes' : 'no'} onClick={toggle}>
            <video ref={video} src={media.file_url} poster={poster ?? undefined} autoPlay loop playsInline data-testid="player-video"
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                let at = 0;
                try { at = Number(localStorage.getItem(posKey)) || 0; } catch { /* no storage */ }
                if (at > 0 && at < v.duration - 5) v.currentTime = at;
                void v.play().catch(() => setPaused(true)); // no sound without a tap: wait for one
              }}
              onPlay={() => setPaused(false)}
              onPause={() => { setPaused(true); savePos(); }}
              onTimeUpdate={(e) => {
                const v = e.currentTarget;
                setProgress(v.duration ? v.currentTime / v.duration : 0);
                if (Math.floor(v.currentTime) % 5 === 0) savePos();
              }} />
            {paused && <div className="film-play" data-testid="player-paused">▶</div>}
            <div className="film-bar"><i style={{ width: `${progress * 100}%` }} /></div>
          </div>
        )
      ) : (
        <div className="frame" data-testid="player-poster">
          {poster ? <img src={poster} alt="" /> : <b className="big-emoji">{item.emoji}</b>}
        </div>
      )}

      <button className="player-exit" data-testid="player-exit" onClick={() => { video.current?.pause(); savePos(); onExit(); }} aria-label="Back to me">
        {me && <Face person={me} />}
      </button>
      {state.kind === 'playing' && (
        <div className="player-clock" data-testid="player-clock">
          🎬 <Clock12 at={state.ends} from={now} size={60} />
          <b>{fmt12(state.ends)}</b>
        </div>
      )}
    </div>
  );
}
