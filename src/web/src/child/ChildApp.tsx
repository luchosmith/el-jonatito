// Jonatito's tablet (child mode). The orbit is home; parent mode opens on top of it behind the
// hidden corner + PIN.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, setElevatedToken } from '../api.ts';
import { deviceLang, speak, useEvents, useLongPress, useNow } from '../common/hooks.ts';
import { playClip, sayToken } from '../common/sound.ts';
import { itemToken, personToken, type Board, type StripToken } from '../common/board.ts';
import { HereNow } from './HereNow.tsx';
import { BoardView, Strip } from './Board.tsx';
import { OrbitView } from './OrbitView.tsx';
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
import type { DispatchNote, Item, Locations, LogEntry, Message, NowInfo, Reply, ScheduleItem, User, VoiceNote } from '../../../shared/types.ts';
import { renderSentence } from '../../../shared/grammar.ts';

type View =
  | { name: 'orbit'; parent: string | null }
  | { name: 'board' }
  | { name: 'person'; id: string }
  | { name: 'body' }
  | { name: 'player'; itemId: string }
  | { name: 'day' }
  | { name: 'media' };

const HOME: View = { name: 'orbit', parent: null };

export function ChildApp({ user: _user }: { user: User }) {
  const now = useNow();
  const [board, setBoard] = useState<Board | null>(null);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
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
  const lang = deviceLang();

  const loadBoard = useCallback(() => api.get<Board>('/api/board').then(setBoard), []);
  const loadLogs = useCallback(() => api.get<LogEntry[]>('/api/logs').then(setLogs), []);
  const loadMedia = useCallback(() => api.get<MediaState>('/api/media').then(setMedia), []);
  const loadVoice = useCallback(() => api.get<VoiceNote[]>('/api/voice-notes').then(setVoice), []);
  const loadLocations = useCallback(() => api.get<Locations>('/api/locations').then(setLocations), []);

  useEffect(() => {
    void loadBoard();
    void loadLogs();
    void loadMedia();
    void loadVoice();
    void loadLocations();
    api.get<ScheduleItem[]>('/api/schedule').then(setSchedule).catch(() => undefined);
    api.get<NowInfo>('/api/now').then(setInfo).catch(() => undefined);
  }, [loadBoard, loadLogs, loadMedia, loadVoice, loadLocations]);

  useEvents((e) => {
    if (e.type === 'people' || e.type === 'symbols' || e.type === 'items') void loadBoard();
    if (e.type === 'log') {
      void loadLogs();
      void loadBoard(); // a logged food can close it (limits, intervals)
    }
    if (e.type === 'availability') {
      setBoard((b) => b && { ...b, people: b.people.map((p) => (p.id === e.person_id ? { ...p, status: e.status, status_until: e.until } : p)) });
    }
    if (e.type === 'reply') setReply(e.reply);
    if (e.type === 'voice_note') {
      setVoice((vs) => {
        const rest = vs.filter((v) => v.id !== e.note.id);
        return e.note.hidden ? rest : [e.note, ...rest];
      });
    }
    if (e.type === 'location') void loadLocations();
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

  const unheard = useMemo(() => {
    const out: Record<string, number> = {};
    for (const v of voice) if (!v.heard_at && v.from_person_id) out[v.from_person_id] = (out[v.from_person_id] ?? 0) + 1;
    return out;
  }, [voice]);

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

  const add = (t: StripToken) => {
    if (tokens.length >= 6) return;
    setTokens((ts) => [...ts, t]);
    sayToken(t, lang);
  };

  const sentence = () =>
    renderSentence(
      tokens.map((t) => {
        const s = board.items.find((x) => x.id === t.id);
        return { kind: t.kind === 'person' || t.kind === 'pet' ? t.kind : s?.kind ?? 'thing', en: s?.labels.en ?? t.label, es: s?.labels.es ?? t.label };
      }),
      lang,
    );

  const post = (list: StripToken[], toPersonId?: string) =>
    api.post<{ message: Message; notes: DispatchNote[] }>('/api/messages', {
      tokens: list.map((t) => ({ kind: t.kind, id: t.id })),
      ...(toPersonId ? { to_person_id: toPersonId } : {}),
    });

  const send = async (toPersonId?: string, override?: StripToken[]) => {
    const list = override ?? tokens;
    if (!list.length) return;
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

  const hearNewest = (personId: string) => {
    const mine = voice.filter((v) => v.from_person_id === personId);
    const n = mine.filter((v) => !v.heard_at).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? mine[0];
    if (!n) return;
    playClip(n.audio_url);
    if (!n.heard_at) markHeard(n);
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
          onExit={() => setView(HOME)}
        />
      </div>
    );
  }

  const strip = (
    <Strip me={me} tokens={tokens} onClear={() => setTokens([])} onSay={() => speak(sentence(), lang)} onSend={() => void send()} sending={sending} />
  );

  return (
    <div className="tablet" data-testid="child-app">
      <HereNow now={now} schedule={schedule} info={info} cornerProps={corner} />

      {view.name === 'orbit' && (
        <>
          {strip}
          <OrbitView
            board={board}
            me={me}
            parentId={view.parent}
            now={now}
            lang={lang}
            unheard={unheard}
            locations={locations}
            onAdd={add}
            onOpen={(item: Item) => setView({ name: 'orbit', parent: item.id })}
            onPlay={(item: Item) => {
              sayToken(itemToken(item, lang), lang);
              void loadMedia();
              setView({ name: 'player', itemId: item.id });
            }}
            onBody={() => setView({ name: 'body' })}
            onBack={() => setView(HOME)}
            onPerson={(id) => setView({ name: 'person', id })}
            onHearNewest={hearNewest}
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
          onAdd={add}
          onClear={() => setTokens([])}
          onSay={() => speak(sentence(), lang)}
          onSend={() => void send()}
          sending={sending}
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
      {view.name === 'media' && (
        <MediaView media={media} now={now} onLocked={(unlock_at) => setMedia((m) => ({ ...m, locked: true, unlock_at }))} />
      )}

      <Dock
        people={board.people}
        unheard={unheard}
        meActive={view.name === 'orbit' && !view.parent}
        boardActive={view.name === 'board'}
        onMe={() => setView(HOME)}
        onPerson={(p) => setView({ name: 'person', id: p.id })}
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
      {reply && <ReplyToast reply={reply} person={board.people.find((p) => p.id === reply.from_person_id)} now={now} onClose={() => setReply(null)} />}
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
