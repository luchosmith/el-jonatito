// Jonatito's tablet (child mode). Parent mode opens on top of it behind the hidden corner + PIN.
import { useCallback, useEffect, useState } from 'react';
import { api, setElevatedToken } from '../api.ts';
import { deviceLang, speak, useEvents, useLongPress, useNow } from '../common/hooks.ts';
import { personToken, type Board, type StripToken } from '../common/board.ts';
import { HereNow } from './HereNow.tsx';
import { BoardView } from './Board.tsx';
import { Dock } from './Dock.tsx';
import { DispatchCard, type SentState } from './DispatchCard.tsx';
import { ReplyToast } from './ReplyToast.tsx';
import { PersonView } from './PersonView.tsx';
import { DayView } from './DayView.tsx';
import { MediaView, type MediaState } from './MediaView.tsx';
import { ParentGate } from './ParentGate.tsx';
import { FamilyApp } from '../family/FamilyApp.tsx';
import type { DispatchNote, LogEntry, Message, NowInfo, Reply, ScheduleItem, User } from '../../../shared/types.ts';
import { renderSentence } from '../../../shared/grammar.ts';

type View = { name: 'home' } | { name: 'person'; id: string } | { name: 'day' } | { name: 'media' };

export function ChildApp({ user }: { user: User }) {
  const now = useNow();
  const [board, setBoard] = useState<Board | null>(null);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [info, setInfo] = useState<NowInfo | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [media, setMedia] = useState<MediaState>({ items: [], locked: false, unlock_at: null });
  const [view, setView] = useState<View>({ name: 'home' });
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

  useEffect(() => {
    void loadBoard();
    void loadLogs();
    void loadMedia();
    api.get<ScheduleItem[]>('/api/schedule').then(setSchedule).catch(() => undefined);
    api.get<NowInfo>('/api/now').then(setInfo).catch(() => undefined);
  }, [loadBoard, loadLogs, loadMedia]);

  useEvents((e) => {
    if (e.type === 'people' || e.type === 'symbols') void loadBoard();
    if (e.type === 'log') void loadLogs();
    if (e.type === 'availability') {
      setBoard((b) => b && { ...b, people: b.people.map((p) => (p.id === e.person_id ? { ...p, status: e.status, status_until: e.until } : p)) });
    }
    if (e.type === 'reply') setReply(e.reply);
  });

  const corner = useLongPress(3000, () => setGate(true));

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
        }}
      />
    );
  }
  if (!board) return <div className="splash" />;

  const me = board.people.find((p) => p.is_self);

  const add = (t: StripToken) => {
    if (tokens.length >= 6) return;
    setTokens((ts) => [...ts, t]);
    speak(t.label, lang);
  };

  const sentence = () =>
    renderSentence(
      tokens.map((t) => {
        const s = board.symbols.find((x) => x.id === t.id);
        return { kind: t.kind === 'person' || t.kind === 'pet' ? t.kind : s?.kind ?? 'thing', en: s?.labels.en ?? t.label, es: s?.labels.es ?? t.label };
      }),
      lang,
    );

  const send = async (toPersonId?: string, override?: StripToken[]) => {
    const list = override ?? tokens;
    if (!list.length) return;
    setSending(true);
    try {
      const r = await api.post<{ message: Message; notes: DispatchNote[] }>('/api/messages', {
        tokens: list.map((t) => ({ kind: t.kind, id: t.id })),
        ...(toPersonId ? { to_person_id: toPersonId } : {}),
      });
      speak(lang === 'es' ? r.message.sentence_es : r.message.sentence_en, lang);
      setSent({ message: r.message, notes: r.notes, tokens: list });
    } finally {
      setSending(false);
    }
  };

  const person = view.name === 'person' ? board.people.find((p) => p.id === view.id) : undefined;

  return (
    <div className="tablet" data-testid="child-app">
      <HereNow now={now} schedule={schedule} info={info} cornerProps={corner} />

      {view.name === 'home' && (
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
        <PersonView
          person={person}
          now={now}
          onBack={() => setView({ name: 'home' })}
          onSocial={(symbolId) => {
            const s = board.symbols.find((x) => x.id === symbolId);
            if (!s) return;
            void send(person.id, [personToken(person), { kind: s.kind, id: s.id, label: s.labels.en ?? '', emoji: s.emoji, photo_url: null }]);
          }}
        />
      )}
      {view.name === 'day' && <DayView logs={logs} board={board} />}
      {view.name === 'media' && (
        <MediaView media={media} now={now} onLocked={(unlock_at) => setMedia((m) => ({ ...m, locked: true, unlock_at }))} />
      )}

      <Dock
        people={board.people}
        onMe={() => setView({ name: 'home' })}
        onPerson={(p) => setView({ name: 'person', id: p.id })}
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
