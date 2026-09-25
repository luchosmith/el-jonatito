// Family phones (friend + caretaker), and parent mode on the tablet (elevated caretaker).
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.ts';
import { useEvents } from '../common/hooks.ts';
import type { Board } from '../common/board.ts';
import type { Message, NotifyBatch, User } from '../../../shared/types.ts';
import { Inbox } from './Inbox.tsx';
import { StatusPanel } from './StatusPanel.tsx';
import { QuickLog } from './QuickLog.tsx';
import { PeopleAdmin } from './PeopleAdmin.tsx';
import { WordsAdmin } from './WordsAdmin.tsx';
import { SettingsPanel } from './SettingsPanel.tsx';
import { ItemsAdmin } from './ItemsAdmin.tsx';
import { VoicesAdmin } from './VoicesAdmin.tsx';
import { VoiceForJonatito } from './VoiceForJonatito.tsx';
import { WhereIAm } from './WhereIAm.tsx';
import { TodayTimeline } from './TodayTimeline.tsx';
import { CalendarAdmin } from './CalendarAdmin.tsx';
import { NotifyBanner, NotifyPrefsPanel } from './Notify.tsx';

type Tab = 'inbox' | 'jonatito' | 'status' | 'today' | 'calendar' | 'log' | 'items' | 'voices' | 'people' | 'words' | 'settings';

export function FamilyApp({ user, elevated, onLogout }: { user: User; elevated?: boolean; onLogout: () => void }) {
  const isCaretaker = user.role === 'caretaker';
  const [tab, setTab] = useState<Tab>(elevated ? 'log' : 'inbox');
  const [board, setBoard] = useState<Board | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [voiceVersion, setVoiceVersion] = useState(0);
  const [timelineVersion, setTimelineVersion] = useState(0);
  const [banner, setBanner] = useState<NotifyBatch | null>(null);

  const loadBoard = useCallback(() => api.get<Board>('/api/board').then(setBoard), []);
  const loadInbox = useCallback(() => api.get<Message[]>('/api/messages').then(setMessages), []);

  useEffect(() => {
    void loadBoard();
    void loadInbox();
    if (!elevated) return;
    // Parent mode on the tablet listens on the child's event stream, so poll the inbox instead.
    const t = setInterval(() => void loadInbox(), 5000);
    return () => clearInterval(t);
  }, [loadBoard, loadInbox, elevated]);

  useEvents((e) => {
    if (e.type === 'message') setMessages((ms) => [e.message, ...ms.filter((m) => m.id !== e.message.id)]);
    if (e.type === 'reply') setMessages((ms) => ms.map((m) => (m.id === e.message_id ? { ...m, replies: [...m.replies.filter((r) => r.id !== e.reply.id), e.reply] } : m)));
    if (e.type === 'people' || e.type === 'symbols' || e.type === 'items' || e.type === 'availability') void loadBoard();
    if (e.type === 'voice_note') setVoiceVersion((v) => v + 1);
    if (e.type === 'timeline' || e.type === 'message' || e.type === 'reply') setTimelineVersion((v) => v + 1);
    if (e.type === 'notify' && !elevated) setBanner(e.batch);
  });

  const tabs: [Tab, string][] = [
    ['inbox', '📨 Inbox'],
    ...(elevated ? [] : ([['jonatito', '🎙️ For Jonatito']] as [Tab, string][])),
    ['status', '🟢 My status'],
    ...(isCaretaker
      ? ([['today', '🕒 Today'], ['calendar', '📅 Calendar'], ['log', '📝 Log'], ['items', '🧩 Items'], ['voices', '〰️ Voices'], ['people', '👪 People'], ['words', '🔤 Words']] as [Tab, string][])
      : []),
    ...(elevated ? ([['settings', '⚙️ Tablet']] as [Tab, string][]) : []),
  ];
  const me = board?.people.find((p) => p.id === user.person_id);

  return (
    <div className={`family ${elevated ? 'elevated' : ''}`} data-testid={elevated ? 'parent-mode' : 'family-app'} data-role={user.role}>
      <header className="fam-top">
        <div className="fam-me">
          {me?.photo_url && <img src={me.photo_url} alt="" />}
          <b data-testid="family-name">{elevated ? '🔒 ' : ''}{user.display_name}</b>
        </div>
        <button className="link" data-testid={elevated ? 'exit-parent' : 'logout'} onClick={onLogout}>
          {elevated ? 'Exit to Jonatito' : 'Sign out'}
        </button>
      </header>
      <nav className="fam-tabs">
        {tabs.map(([id, label]) => (
          <button key={id} className={tab === id ? 'on' : ''} data-testid={`tab-${id}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>
      {banner && (
        <NotifyBanner
          batch={banner}
          onOpen={() => {
            setTab('inbox');
            setBanner(null);
          }}
          onClose={() => setBanner(null)}
        />
      )}
      <main className="fam-body">
        {board && tab === 'inbox' && <Inbox messages={messages} board={board} userId={user.id} onChange={loadInbox} />}
        {tab === 'jonatito' && <VoiceForJonatito user={user} version={voiceVersion} />}
        {board && tab === 'status' && (
          <>
            <StatusPanel board={board} user={user} />
            {user.person_id && <WhereIAm user={user} />}
            {!elevated && <NotifyPrefsPanel />}
          </>
        )}
        {board && tab === 'today' && isCaretaker && <TodayTimeline board={board} version={timelineVersion} />}
        {board && tab === 'calendar' && isCaretaker && <CalendarAdmin board={board} version={timelineVersion} />}
        {board && tab === 'items' && isCaretaker && <ItemsAdmin board={board} onChange={loadBoard} />}
        {board && tab === 'voices' && isCaretaker && <VoicesAdmin board={board} version={voiceVersion} />}
        {board && tab === 'log' && isCaretaker && <QuickLog board={board} />}
        {board && tab === 'people' && isCaretaker && <PeopleAdmin board={board} onChange={loadBoard} />}
        {board && tab === 'words' && isCaretaker && <WordsAdmin board={board} onChange={loadBoard} />}
        {tab === 'settings' && elevated && <SettingsPanel />}
      </main>
    </div>
  );
}
