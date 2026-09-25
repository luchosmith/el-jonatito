// One screen per person: where they are compared with him (left), what he can hear from them,
// and how he sends to them (right). Messages visibly travel along the path between the pins.
import { useRef, useState } from 'react';
import { api } from '../api.ts';
import { Clock12 } from '../common/Clock12.tsx';
import { Face, SoundWave } from '../common/Face.tsx';
import { speak } from '../common/hooks.ts';
import { playClip } from '../common/sound.ts';
import { flushTaps, logTap } from '../common/taplog.ts';
import { startRecording, type Recording } from '../common/recorder.ts';
import { Globe, type GlobeHandle } from './Globe.tsx';
import { differentTime, flagOf, reachOf, sleepsUntil, timeIn } from '../../../shared/geo.ts';
import { fmt12 } from '../../../shared/time.ts';
import type { Locations, Person, VoiceNote } from '../../../shared/types.ts';

const RECORD_MS = 4000;

interface Props {
  person: Person;
  me: Person | undefined;
  notes: VoiceNote[];
  locations: Locations | null;
  now: Date;
  /** sends COME SEE / HELP / LOVE; resolves once the server has it */
  onSocial: (symbolId: string) => Promise<void>;
  onHeard: (note: VoiceNote) => void;
}

export function PersonScreen({ person, me, notes, locations, now, onSocial, onHeard }: Props) {
  const globe = useRef<GlobeHandle>(null);
  const rec = useRef<Recording | null>(null);
  const [talk, setTalk] = useState<'idle' | 'recording' | 'sent' | 'error'>('idle');
  const [playing, setPlaying] = useState<number | 'hello' | null>(null);
  const [sent, setSent] = useState(false);
  const isPet = person.kind === 'pet';
  const loc = locations?.people.find((l) => l.person_id === person.id) ?? null;
  const home = locations?.home;
  const reach = home ? reachOf(home, loc) : 'unknown';
  const theirTime = home && loc && differentTime(home.tz, loc.tz, now) ? timeIn(loc.tz, now) : null;
  const sleeps = loc?.until ? sleepsUntil(new Date(loc.until), now) : 0;
  const ordered = [...notes.filter((n) => n.pinned), ...notes.filter((n) => !n.pinned)];

  const landed = () => {
    setSent(true);
    setTimeout(() => setSent(false), 2500);
  };

  // TALK: his voice goes into their ear, then travels to their pin.
  const onTalk = async () => {
    if (talk === 'recording') return finishTalk();
    logTap('talk', 'person', { person_id: person.id });
    try {
      rec.current = await startRecording(RECORD_MS + 1000);
      setTalk('recording');
      setTimeout(() => void finishTalk(), RECORD_MS);
    } catch {
      setTalk('error');
    }
  };
  const finishTalk = async () => {
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    const blob = await r.stop();
    try {
      await flushTaps();
      await api.upload('POST', `/api/messages/voice?to=${encodeURIComponent(person.id)}`, blob);
      setTalk('sent');
      await globe.current?.fly('〰️');
      landed();
    } catch {
      setTalk('error');
    }
  };

  const social = async (symbolId: string, icon: string) => {
    logTap('social', 'person', { item_id: symbolId, person_id: person.id });
    await onSocial(symbolId);
    await globe.current?.fly(icon);
    landed();
  };

  const hear = (n: VoiceNote) => {
    logTap('hear', 'person', { person_id: person.id }, { note_id: n.id });
    setPlaying(n.id);
    void globe.current?.fly('〰️', true);
    playClip(n.audio_url, () => setPlaying(null));
    if (!n.heard_at) onHeard(n);
  };
  const hello = () => {
    logTap('hear', 'person', { person_id: person.id }, { hello: true });
    setPlaying('hello');
    void globe.current?.fly('〰️', true);
    speak('¡Hola, Jonatito!', 'es');
    setTimeout(() => setPlaying(null), 1800);
  };

  const ring = person.status === 'busy' ? 'busy' : person.status === 'away' ? 'away' : '';

  return (
    <div className="pscreen" data-testid={`person-${person.id}`}>
      <section className="ps-where" data-testid="person-where" data-reach={reach}>
        {home && (
          <Globe
            ref={globe}
            home={home}
            homePhoto={me?.photo_url ?? null}
            other={isPet ? undefined : { place: loc, photo: person.photo_url, emoji: person.emoji }}
            size={380}
          />
        )}
        {theirTime && (
          <div className="their-time" data-testid="their-time" data-time={fmt12(theirTime)}>
            <span className="mini"><Face person={person} /></span>
            <Clock12 at={theirTime} size={54} />
            <b>{fmt12(theirTime)}</b>
            <span>{theirTime.getHours() >= 19 || theirTime.getHours() < 7 ? '🌙' : '☀️'}</span>
          </div>
        )}
        {!isPet && (
          <div className="gchip" data-testid="where-chip">
            {loc ? (
              <>
                <span className="big-emoji">{reach === 'same_city' ? '📍' : flagOf(loc.country_code)}</span>
                <b data-testid="where-place">{loc.place_label}</b>
                <span className="big-emoji" data-testid="where-how">{reach === 'abroad' ? '✈️' : '🚗'}</span>
              </>
            ) : (
              <span className="big-emoji">❔</span>
            )}
            {sleeps > 0 && (
              <span className="sleeps" data-testid="back-sleeps" data-n={sleeps}>
                {'🌙'.repeat(Math.min(sleeps, 7))} → 🏠
              </span>
            )}
          </div>
        )}
      </section>

      <section className="ps-right">
        <div className="ps-head">
          <span className={`ps-face ${ring}`}><Face person={person} /></span>
          <h2>{person.short_label}</h2>
          {person.status === 'busy' && person.status_until && (
            <span className="ps-status" data-testid="person-status">
              <Clock12 at={new Date(person.status_until)} from={now} size={64} />
              <b className="time">{fmt12(new Date(person.status_until))}</b>
            </span>
          )}
          {person.status === 'away' && <span className="ps-status big-emoji" data-testid="person-status">🚫</span>}
        </div>

        {!isPet && (
          <>
            <div className="ps-sec">
              <div className="ps-lbl">
                <span className="mini"><Face person={person} /></span>
                <SoundWave width={34} color="#8a96a3" />➜
                {me && <span className="mini"><Face person={me} /></span>}
              </div>
              <div className="shelf" data-testid="voice-shelf">
                {ordered.map((n) => (
                  <button
                    key={n.id}
                    className={`vtile ${n.pinned ? 'pin' : ''} ${playing === n.id ? 'playing' : ''}`}
                    data-testid="voice-tile"
                    data-id={n.id}
                    data-heard={n.heard_at ? 'yes' : 'no'}
                    data-pinned={n.pinned ? 'yes' : 'no'}
                    onClick={() => hear(n)}
                  >
                    {n.pinned && <span className="star">⭐</span>}
                    {!n.heard_at && <i className="new" />}
                    <SoundWave playing={playing === n.id} width={60} color={n.pinned ? '#c98a00' : undefined} />
                    <small>{n.pinned ? '' : fmt12(new Date(n.created_at))}</small>
                  </button>
                ))}
                {ordered.length === 0 && (
                  <button className={`vtile ${playing === 'hello' ? 'playing' : ''}`} data-testid="voice-hello" onClick={hello}>
                    <SoundWave playing={playing === 'hello'} width={60} />
                    <small>👋</small>
                  </button>
                )}
              </div>
            </div>

            <div className="ps-sec">
              <div className="ps-lbl">
                {me && <span className="mini"><Face person={me} /></span>}➜
                <span className="mini"><Face person={person} /></span>
                <span className="sent-ok" data-testid="sent-ok">{sent ? '📬✔' : ''}</span>
              </div>
              <div className="sendrow">
                <button className={`sbig talk ${talk === 'recording' ? 'rec' : ''}`} data-testid="zone-talk" data-state={talk} onClick={onTalk}>
                  {talk === 'recording' ? <SoundWave playing width={70} color="#e45757" /> : '👂'}
                  <span>TALK</span>
                </button>
                <button className="sbig" data-testid="zone-come-see" onClick={() => social('come_see', '👀')}>👀<span>COME SEE</span></button>
                <button className="sbig" data-testid="zone-help" onClick={() => social('help_me', '✋')}>✋<span>HELP</span></button>
                <button className="sbig love" data-testid="zone-love" onClick={() => social('love', '❤️')}>❤️<span>LOVE</span></button>
              </div>
              <div className="talk-state" data-testid="talk-state">
                {talk === 'sent' && <span data-testid="voice-sent">👂 📬✔</span>}
                {talk === 'error' && <span>🎤✖</span>}
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
