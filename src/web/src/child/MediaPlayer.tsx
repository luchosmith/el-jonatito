// A media item (e.g. Pongo) full screen: nothing to get lost in. His face (top-left) brings him
// back; the media clock shows when media time ends. During the sleep lock it shows the moon instead.
import { useEffect, useState } from 'react';
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
          <video className="frame" src={media.file_url} poster={poster ?? undefined} autoPlay playsInline onEnded={onExit} data-testid="player-video" />
        )
      ) : (
        <div className="frame" data-testid="player-poster">
          {poster ? <img src={poster} alt="" /> : <b className="big-emoji">{item.emoji}</b>}
        </div>
      )}

      <button className="player-exit" data-testid="player-exit" onClick={onExit} aria-label="Back to me">
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
