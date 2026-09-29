// 🎧 Music: his songs as square pictures in play order. The one playing has a yellow frame and moving
// bars. Tap any song (played ones too): it plays and the list goes on from there.
// 🎧 at the top stops the music; his face goes home (the music keeps playing).
import { Clock12 } from '../common/Clock12.tsx';
import { Face } from '../common/Face.tsx';
import { fmt12 } from '../../../shared/time.ts';
import type { Person, Song } from '../../../shared/types.ts';
import type { Music } from './useMusic.ts';

/** A song's picture: its cover art, or a coloured tile with 🎵 and its name. */
export function SongPicture({ song }: { song: Song }) {
  if (song.cover_url) return <img src={song.cover_url} alt="" draggable={false} />;
  let h = 0;
  for (const c of song.title) h = (h * 31 + c.charCodeAt(0)) % 360;
  return (
    <span className="song-gen" style={{ background: `hsl(${h} 65% 62%)` }}>
      <b>🎵</b>
      <span>{song.title}</span>
    </span>
  );
}

const Bars = ({ big }: { big?: boolean }) => <i className={`eq ${big ? 'big' : ''}`} aria-hidden><b /><b /><b /><b /></i>;

export function MusicView({ music, me, onToggle, onHome }: { music: Music; me: Person | undefined; onToggle: () => void; onHome: () => void }) {
  const now = music.current;
  return (
    <div className="music" data-testid="music-view" data-playing={music.playing ? 'yes' : 'no'}>
      <div className="music-head">
        <button className={`music-btn ${music.playing ? 'on' : ''}`} data-testid="music-toggle" onClick={onToggle} aria-label={music.playing ? 'Stop the music' : 'Play music'}>
          🎧{music.playing && <Bars />}
        </button>
        {music.sleepingUntil && !music.playing ? (
          <div className="music-sleep" data-testid="music-sleeping">
            <span className="moon-big">🌙</span>
            <Clock12 at={new Date(music.sleepingUntil)} size={96} />
            <b className="time big-time">{fmt12(new Date(music.sleepingUntil))}</b>
          </div>
        ) : now ? (
          <>
            <div className="music-cur" data-testid="music-now" data-song={now.id}><SongPicture song={now} /><Bars big /></div>
            <div className="music-info">
              <b>{now.title}</b>
              {now.artist && <small>{now.artist}</small>}
              <div className="music-bar"><i style={{ width: `${Math.round(music.progress * 100)}%` }} /></div>
            </div>
          </>
        ) : <div className="music-info" />}
        <button className="music-home" data-testid="music-home" onClick={onHome} aria-label="Home (the music keeps playing)">{me && <Face person={me} />}</button>
      </div>
      <div className="music-grid">
        {music.list.map((s, k) => (
          <button key={`${k}-${s.id}`} className={`music-tile ${k === music.cur && music.playing ? 'cur' : ''}`}
            data-testid="music-song" data-song={s.id} onClick={() => music.playAt(k)} aria-label={s.artist ? `${s.title}, ${s.artist}` : s.title}>
            <SongPicture song={s} />
            {k === music.cur && music.playing && <Bars />}
          </button>
        ))}
      </div>
    </div>
  );
}
