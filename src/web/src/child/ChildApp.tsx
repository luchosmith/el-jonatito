// Jonatito's tablet (child mode). The orbit is home; parent mode opens on top of it behind the
// hidden corner + PIN.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, setElevatedToken } from '../api.ts';
import { deviceLang, speak, useEvents, useLongPress, useNow } from '../common/hooks.ts';
import { sayToken } from '../common/sound.ts';
import { flushTaps, logTap } from '../common/taplog.ts';
import { itemToken, personToken, type Board, type StripToken } from '../common/board.ts';
import { TimeBar, PAST_DAYS, FUTURE_DAYS } from './TimeBar.tsx';
import { EntryCard } from './EntryCard.tsx';
import { VoiceArrival } from './VoiceArrival.tsx';
import { weatherOf } from './Sky.tsx';
import { BoardView, Strip } from './Board.tsx';
import { OrbitView } from './OrbitView.tsx';
import { FlyAway } from './FlyAway.tsx';
import { MusicView } from './MusicView.tsx';
import { useMusic } from './useMusic.ts';
import { Dock } from './Dock.tsx';
import { DispatchCard, type SentState } from './DispatchCard.tsx';
import { ReplyToast } from './ReplyToast.tsx';
import { PersonScreen } from './PersonScreen.tsx';
import { BodyView } from './BodyView.tsx';
import { MediaPlayer } from './MediaPlayer.tsx';
import { DayView } from './DayView.tsx';
import { MediaView, type MediaState } from './MediaView.tsx';
import { ParentGate } from './ParentGate.tsx';
import { FamilyApp } from '../family/FamilyApp.tsx';
import type { DispatchNote, Item, Locations, LogEntry, Message, NowInfo, Reply, ScheduleItem, TimelineEntry, User, VoiceNote } from '../../../shared/types.ts';
import { inWindow, minutesOfDay, seasonOf } from '../../../shared/time.ts';
import { renderSentence } from '../../../shared/grammar.ts';

type View =
  | { name: 'orbit'; parent: string | null }
  | { name: 'board' }
  | { name: 'person'; id: string }
  | { name: 'body' }
  | { name: 'player'; itemId: string }
  | { name: 'day' }
  | { name: 'media' }
  | { name: 'music' };

const HOME: View = { name: 'orbit', parent: null };
const SPRING_BACK_MS = 8000;

export function ChildApp({ user: _user }: { user: User }) {
  const now = useNow();
  const [board, setBoard] = useState<Board | null>(null);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [fly, setFly] = useState<{ token: StripToken; n: number } | null>(null);
  const [info, setInfo] = useState<NowInfo | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [media, setMedia] = useState<MediaState>({ items: [], locked: false, unlock_at: null });
  const [voice, setVoice] = useState<VoiceNote[]>([]);
  const [locations, setLocations] = useState<Locations | null>(null);
  const [view, setView] = useState<View>(HOME);
  const [page, setPage] = useState('food');
  const [tokens, setTokens] = useState<StripToken[]>([]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<SentState | null>(null);
  const [reply, setReply] = useState<Reply | null>(null);
  const [gate, setGate] = useState(false);
  const [parent, setParent] = useState<User | null>(null);
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [entry, setEntry] = useState<TimelineEntry | null>(null);
  // New voice messages waiting to pop up and play once (one at a time).
  const [arrivals, setArrivals] = useState<VoiceNote[]>([]);
  const [textReplies, setTextReplies] = useState<Reply[]>([]);
  const [seenText, setSeenText] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem('jt.seenText') ?? '{}') as Record<string, string>;
    } catch {
      return {};
    }
  });
  // Time scrubbing: minutes away from now (negative = past). The sky reads timeRef every frame.
  const [scrub, setScrub] = useState(0);
  const timeRef = useRef(Date.now());
  const springTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const springAnim = useRef(0);
  const lang = deviceLang();

  const loadBoard = useCallback(() => api.get<Board>('/api/board').then(setBoard), []);
  const loadLogs = useCallback(() => api.get<LogEntry[]>('/api/logs').then(setLogs), []);
  // 🎧 his music: plays on every screen; stops when he taps 🎧 again, when a film starts, or at bedtime.
  const music = useMusic();
  const loadMedia = useCallback(() => api.get<MediaState>('/api/media').then(setMedia), []);
  const loadVoice = useCallback(() => api.get<VoiceNote[]>('/api/voice-notes').then(setVoice), []);
  const loadLocations = useCallback(() => api.get<Locations>('/api/locations').then(setLocations), []);
  const loadTimeline = useCallback(() => api.get<TimelineEntry[]>('/api/timeline').then(setEntries).catch(() => undefined), []);

  /** Back to NOW: a short ease, then the orbit wakes up again. */
  const backToNow = useCallback(() => {
    if (springTimer.current) clearTimeout(springTimer.current);
    cancelAnimationFrame(springAnim.current);
    const step = () => {
      setScrub((s) => {
        const next = Math.abs(s) < 1 ? 0 : s * 0.8;
        if (next !== 0) springAnim.current = requestAnimationFrame(step);
        return next;
      });
    };
    springAnim.current = requestAnimationFrame(step);
  }, []);
  const onScrub = useCallback((minutes: number) => {
    if (springTimer.current) clearTimeout(springTimer.current);
    cancelAnimationFrame(springAnim.current);
    setScrub(Math.max(-PAST_DAYS * 1440, Math.min(FUTURE_DAYS * 1440, minutes)));
  }, []);
  const onScrubEnd = useCallback(() => {
    if (springTimer.current) clearTimeout(springTimer.current);
    springTimer.current = setTimeout(backToNow, SPRING_BACK_MS);
  }, [backToNow]);
  useEffect(() => () => {
    if (springTimer.current) clearTimeout(springTimer.current);
    cancelAnimationFrame(springAnim.current);
  }, []);

  useEffect(() => {
    void loadBoard();
    void loadLogs();
    void loadMedia();
    void loadVoice();
    void loadLocations();
    void loadTimeline();
    api.get<Message[]>('/api/messages')
      .then((ms) => setTextReplies(ms.flatMap((m) => m.replies.filter((r) => r.kind === 'text'))))
      .catch(() => undefined);
    api.get<ScheduleItem[]>('/api/schedule').then(setSchedule).catch(() => undefined);
    api.get<NowInfo>('/api/now').then(setInfo).catch(() => undefined);
  }, [loadBoard, loadLogs, loadMedia, loadVoice, loadLocations, loadTimeline]);

  useEvents((e) => {
    if (e.type === 'people' || e.type === 'symbols' || e.type === 'items') void loadBoard();
    if (e.type === 'log') {
      void loadLogs();
      void loadTimeline(); // a logged meal shows on his history strip
      void loadBoard(); // a logged food can close it (limits, intervals)
    }
    if (e.type === 'availability') {
      setBoard((b) => b && { ...b, people: b.people.map((p) => (p.id === e.person_id ? { ...p, status: e.status, status_until: e.until } : p)) });
    }
    if (e.type === 'reply') {
      setReply(e.reply);
      if (e.reply.kind === 'text') setTextReplies((rs) => [...rs.filter((r) => r.id !== e.reply.id), e.reply]);
    }
    if (e.type === 'voice_note') {
      setVoice((vs) => {
        const rest = vs.filter((v) => v.id !== e.note.id);
        return e.note.hidden ? rest : [e.note, ...rest];
      });
      if (e.autoplay && !e.note.heard_at && !e.note.hidden) setArrivals((a) => (a.some((x) => x.id === e.note.id) ? a : [...a, e.note]));
    }
    if (e.type === 'location') void loadLocations();
    if (e.type === 'timeline' || e.type === 'message' || e.type === 'reply' || e.type === 'voice_note') void loadTimeline();
  });

  // A closed item (snack time, limit) opens again by itself: refresh when its time comes.
  const nextChange = useMemo(() => {
    const times = (board?.items ?? []).map((i) => i.closed_until).filter((t): t is string => !!t).map((t) => new Date(t).getTime());
    return times.length ? Math.min(...times) : null;
  }, [board]);
  useEffect(() => {
    if (nextChange && now.getTime() >= nextChange) void loadBoard();
  }, [now, nextChange, loadBoard]);

  const corner = useLongPress(3000, () => setGate(true));

  const unreadText = useMemo(() => {
    const out: Record<string, number> = {};
    for (const r of textReplies) {
      if (!r.from_person_id) continue;
      if (seenText[r.from_person_id] && r.created_at <= seenText[r.from_person_id]) continue;
      out[r.from_person_id] = (out[r.from_person_id] ?? 0) + 1;
    }
    return out;
  }, [textReplies, seenText]);
  // Opening someone's page counts as having seen their typed replies.
  const openPerson = (id: string, screen = 'dock') => {
    logTap('person', screen, { person_id: id }); // a visit: if he sends nothing, they get a 💭
    const next = { ...seenText, [id]: new Date().toISOString() };
    setSeenText(next);
    try {
      localStorage.setItem('jt.seenText', JSON.stringify(next));
    } catch {
      /* private mode */
    }
    setView({ name: 'person', id });
  };

  const unheard = useMemo(() => {
    const out: Record<string, number> = {};
    for (const v of voice) if (!v.heard_at && v.from_person_id) out[v.from_person_id] = (out[v.from_person_id] ?? 0) + 1;
    return out;
  }, [voice]);

  // A film (Pongo, Barney) stops the music; so does bedtime (the same sleep lock as films).
  useEffect(() => {
    if (view.name === 'player') music.stop();
  }, [view.name]);
  useEffect(() => {
    const p = media.policy;
    if (music.playing && p && inWindow(minutesOfDay(now), p.sleep_start_min, p.sleep_end_min)) music.stop();
  }, [now, music.playing, media.policy]);

  if (parent) {
    return (
      <FamilyApp
        user={parent}
        elevated
        onLogout={() => {
          setElevatedToken(null);
          setParent(null);
          void loadBoard();
          void loadLogs();
          void loadVoice();
        }}
      />
    );
  }
  if (!board) return <div className="splash" />;

  const me = board.people.find((p) => p.is_self);

  const add = (t: StripToken, screen: string) => {
    if (tokens.length >= 6) return;
    logTap('add', screen, t.kind === 'person' || t.kind === 'pet' ? { person_id: t.id } : { item_id: t.id });
    setTokens((ts) => [...ts, t]);
    sayToken(t, lang);
    setFly((f) => ({ token: t, n: (f?.n ?? 0) + 1 })); // a transient echo of the tap: big in the middle, then off to the left
  };
  const clear = () => {
    logTap('clear', view.name === 'board' ? 'board' : 'orbit');
    setTokens([]);
  };
  const say = () => {
    logTap('say', view.name === 'board' ? 'board' : 'orbit');
    speak(sentence(), lang);
  };

  const sentence = () =>
    renderSentence(
      tokens.map((t) => {
        const s = board.items.find((x) => x.id === t.id);
        return { kind: t.kind === 'person' || t.kind === 'pet' ? t.kind : s?.kind ?? 'thing', en: s?.labels.en ?? t.label, es: s?.labels.es ?? t.label };
      }),
      lang,
    );

  const post = async (list: StripToken[], toPersonId?: string) => {
    await flushTaps(); // the moment is complete on the server before the message closes it
    return api.post<{ message: Message; notes: DispatchNote[] }>('/api/messages', {
      tokens: list.map((t) => ({ kind: t.kind, id: t.id })),
      ...(toPersonId ? { to_person_id: toPersonId } : {}),
    });
  };

  const send = async (toPersonId?: string, override?: StripToken[]) => {
    const list = override ?? tokens;
    if (!list.length) return;
    if (!override) logTap('send', view.name === 'board' ? 'board' : 'orbit');
    setSending(true);
    try {
      const r = await post(list, toPersonId);
      speak(lang === 'es' ? r.message.sentence_es : r.message.sentence_en, lang);
      setSent({ message: r.message, notes: r.notes, tokens: list });
    } finally {
      setSending(false);
    }
  };

  const markHeard = (n: VoiceNote) => {
    setVoice((vs) => vs.map((v) => (v.id === n.id ? { ...v, heard_at: new Date().toISOString() } : v)));
    api.post<VoiceNote>(`/api/voice-notes/${n.id}/heard`).catch(() => undefined);
  };

  const isMusic = (item: Item) => media.items.find((m) => m.id === item.media_id)?.kind === 'music';
  /** 🎧: starts his songs (a new random order) and opens them; while they play, it stops them. */
  const toggleMusic = async (item?: Item) => {
    const screen = view.name === 'music' ? 'music' : 'orbit';
    // Every music tap goes into his log (what he chose, for later).
    logTap('music', screen, { item_id: 'music' }, { what: music.playing ? 'stop' : 'start', song_id: music.current?.id ?? null });
    if (music.playing) return music.stop();
    setView({ name: 'music' });
    const r = await music.start();
    const mediaId = item?.media_id ?? board.items.find((i) => i.id === 'music')?.media_id;
    if (r === 'playing' && mediaId) api.post(`/api/media/${mediaId}/play`).then(() => void loadTimeline()).catch(() => undefined); // his history: 🎧
  };

  const person = view.name === 'person' ? board.people.find((p) => p.id === view.id) : undefined;
  const playerItem = view.name === 'player' ? board.items.find((i) => i.id === view.itemId) : undefined;

  if (view.name === 'player' && playerItem) {
    return (
      <div className="tablet" data-testid="child-app">
        <MediaPlayer
          item={playerItem}
          media={media.items.find((m) => m.id === playerItem.media_id)}
          me={me}
          now={now}
          onExit={() => {
            setView(HOME);
            void loadTimeline(); // what he watched shows on his history strip
          }}
        />
      </div>
    );
  }

  const strip = <Strip me={me} tokens={tokens} onClear={clear} onSay={say} onSend={() => void send()} sending={sending} />;
  const onOrbit = view.name === 'orbit';
  const viewTime = new Date(now.getTime() + (onOrbit ? scrub : 0) * 60_000);
  timeRef.current = viewTime.getTime();
  const away = onOrbit && Math.abs(scrub) >= 1;
  const timeBar = (
    <TimeBar
      now={now}
      view={viewTime}
      schedule={schedule}
      entries={entries}
      board={board}
      scrubbable={onOrbit}
      onScrub={onScrub}
      onScrubEnd={onScrubEnd}
      onNow={backToNow}
      onEntry={setEntry}
      cornerProps={corner}
    />
  );

  return (
    <div className="tablet" data-testid="child-app">
      {fly && <FlyAway key={fly.n} token={fly.token} onDone={() => setFly(null)} />}
      {(view.name === 'orbit' || view.name === 'board') && strip}
      {view.name !== 'music' && timeBar}

      {view.name === 'orbit' && (
        <>
          <OrbitView
            board={board}
            me={me}
            parentId={view.parent}
            now={now}
            lang={lang}
            locations={locations}
            timeRef={timeRef}
            weather={weatherOf(info?.weather?.code)}
            season={seasonOf(viewTime)}
            view={viewTime}
            away={away}
            onNow={backToNow}
            onAdd={(t) => add(t, view.parent ? `orbit:${view.parent}` : 'orbit')}
            onOpen={(item: Item) => setView({ name: 'orbit', parent: item.id })}
            onPlay={(item: Item) => {
              if (isMusic(item)) return void toggleMusic(item);
              sayToken(itemToken(item, lang), lang);
              void loadMedia();
              setView({ name: 'player', itemId: item.id });
            }}
            music={{ playing: music.playing, current: music.current }}
            onMusicPage={() => {
              logTap('music', 'orbit', { item_id: 'music' }, { what: 'page', song_id: music.current?.id ?? null });
              setView({ name: 'music' });
            }}
            onBody={() => setView({ name: 'body' })}
            onBack={() => setView(HOME)}
            onPerson={(id) => openPerson(id, 'globe')}
          />
        </>
      )}
      {view.name === 'board' && (
        <BoardView
          board={board}
          me={me}
          page={page}
          onPage={setPage}
          tokens={tokens}
          onAdd={(t) => add(t, 'board')}
          onClear={clear}
          onSay={say}
          onSend={() => void send()}
          sending={sending}
          showStrip={false}
        />
      )}
      {view.name === 'person' && person && (
        <PersonScreen
          key={person.id}
          person={person}
          me={me}
          notes={voice.filter((v) => v.from_person_id === person.id)}
          locations={locations}
          now={now}
          onHeard={markHeard}
          onSocial={async (symbolId) => {
            const s = board.items.find((x) => x.id === symbolId);
            if (!s) return;
            const list = [personToken(person, board.items.find((i) => i.id === person.id), lang), itemToken(s, lang)];
            const r = await post(list, person.id);
            speak(lang === 'es' ? r.message.sentence_es : r.message.sentence_en, lang);
            // Busy or urgent: show the usual card (when they're free, who's free now).
            if (r.notes.some((n) => n.kind === 'busy' || n.kind === 'urgent')) setSent({ message: r.message, notes: r.notes, tokens: list });
          }}
        />
      )}
      {view.name === 'body' && <BodyView me={me} items={board.items} people={board.people} lang={lang} />}
      {view.name === 'day' && <DayView logs={logs} board={board} />}
      {view.name === 'music' && (
        <MusicView music={music} me={me} onToggle={() => void toggleMusic()}
          onHome={() => {
            logTap('music', 'music', { item_id: 'music' }, { what: 'home', song_id: music.current?.id ?? null });
            setView(HOME);
          }}
          onPause={() => {
            logTap('music', 'music', { item_id: 'music' }, { what: music.paused ? 'resume' : 'pause', song_id: music.current?.id ?? null });
            music.togglePause();
          }}
          onPick={(k) => {
            const s = music.list[k];
            if (s) logTap('music', 'music', { item_id: 'music' }, { what: 'song', song_id: s.id, title: s.title, artist: s.artist, place: k });
            music.playAt(k);
          }} />
      )}
      {view.name === 'media' && (
        <MediaView media={media} now={now} onLocked={(unlock_at) => setMedia((m) => ({ ...m, locked: true, unlock_at }))} />
      )}

      <Dock
        people={board.people}
        things={board.dock.map((id) => board.items.find((i) => i.id === id)).filter((i): i is Item => !!i && !i.is_hidden)}
        onThing={(item) => {
          if (item.tap === 'play') {
            logTap('media', 'dock', { item_id: item.id });
            sayToken(itemToken(item, lang), lang);
            void loadMedia();
            setView({ name: 'player', itemId: item.id });
          } else add(itemToken(item, lang), 'dock');
        }}
        unheard={unheard}
        unreadText={unreadText}
        meActive={view.name === 'orbit' && !view.parent}
        boardActive={view.name === 'board'}
        onMe={() => setView(HOME)}
        onPerson={(p) => openPerson(p.id)}
        onBoard={() => setView({ name: 'board' })}
        onDay={() => {
          void loadLogs();
          setView({ name: 'day' });
        }}
        onMedia={() => {
          void loadMedia();
          setView({ name: 'media' });
        }}
      />

      {sent && (
        <DispatchCard
          sent={sent}
          board={board}
          me={me ? personToken(me) : null}
          now={now}
          onClose={() => {
            setSent(null);
            setTokens([]);
          }}
          onResend={(id) => void send(id, sent.tokens)}
        />
      )}
      {reply && <ReplyToast reply={reply} person={board.people.find((p) => p.id === reply.from_person_id)} now={now} lang={lang} onClose={() => setReply(null)} />}
      {entry && <EntryCard entry={entry} board={board} lang={lang} onClose={() => setEntry(null)} />}
      {arrivals[0] && (
        <VoiceArrival
          key={arrivals[0].id}
          note={arrivals[0]}
          person={board.people.find((p) => p.id === arrivals[0].from_person_id)}
          onHeard={markHeard}
          onOpen={() => {
            const pid = arrivals[0].from_person_id;
            setArrivals((a) => a.slice(1));
            if (pid) openPerson(pid, 'voice');
          }}
          onDone={() => setArrivals((a) => a.slice(1))}
        />
      )}
      {gate && (
        <ParentGate
          onCancel={() => setGate(false)}
          onOpen={(token, u) => {
            setElevatedToken(token);
            setGate(false);
            setParent(u);
          }}
        />
      )}
    </div>
  );
}
