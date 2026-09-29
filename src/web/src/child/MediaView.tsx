// Media corner: approved items only, the same 12-hour clock for media time, and a sleeping moon at night.
import { useState } from 'react';
import { api, ApiError } from '../api.ts';
import { Clock12 } from '../common/Clock12.tsx';
import { fmt12 } from '../../../shared/time.ts';
import type { MediaItem, MediaPolicy } from '../../../shared/types.ts';

export interface MediaState {
  items: MediaItem[];
  locked: boolean;
  unlock_at: string | null;
  policy?: MediaPolicy;
}

export function MediaView({ media, now, onLocked }: { media: MediaState; now: Date; onLocked: (unlockAt: string | null) => void }) {
  const [playing, setPlaying] = useState<{ item: MediaItem; ends_at: string } | null>(null);

  const play = async (item: MediaItem) => {
    try {
      const r = await api.post<{ ends_at: string }>(`/api/media/${item.id}/play`);
      setPlaying({ item, ends_at: r.ends_at });
    } catch (e) {
      if (e instanceof ApiError && e.status === 423) {
        setPlaying(null);
        onLocked((e.data.unlock_at as string) ?? null);
      }
    }
  };

  return (
    <div className="mediav" data-testid="media-view">
      <div className="mgrid">
        {media.items.filter((m) => m.kind !== 'music').map((m) => { /* his music plays from 🎧, not from here */
          const sleeping = media.locked && !m.bedtime_ok;
          return (
            <button key={m.id} className={`tile ${sleeping ? 'sleeping' : ''}`} data-testid={`media-${m.id}`} onClick={() => play(m)}>
              {m.cover_url ? <img src={m.cover_url} alt="" /> : <b>{m.emoji}</b>}
              <span>{m.title}</span>
              {sleeping && <i className="moon">🌙</i>}
            </button>
          );
        })}
      </div>
      <div className="panel side">
        {playing ? (
          <div className="now-playing" data-testid="media-playing">
            <div className="np-title">{playing.item.cover_url ? <img src={playing.item.cover_url} alt="" /> : playing.item.emoji} ▶</div>
            <Clock12 at={new Date(playing.ends_at)} from={now} size={170} testId="media-clock" />
            <b className="time big-time" data-testid="media-ends">{fmt12(new Date(playing.ends_at))}</b>
          </div>
        ) : media.locked && media.unlock_at ? (
          <div className="locked" data-testid="media-locked">
            <div className="moon-big">🌙</div>
            <Clock12 at={new Date(media.unlock_at)} size={150} />
            <b className="time big-time">{fmt12(new Date(media.unlock_at))}</b>
          </div>
        ) : (
          <div className="big-emoji">🎬</div>
        )}
      </div>
    </div>
  );
}
