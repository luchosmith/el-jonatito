// Caretakers: every voice note on Jonatito's shelf. Pin comfort clips (first on the shelf, never
// expire) or hide a note.
import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import type { Board } from '../common/board.ts';
import { Face } from '../common/Face.tsx';
import { fmt12ampm } from '../../../shared/time.ts';
import type { VoiceNote } from '../../../shared/types.ts';

export function VoicesAdmin({ board, version }: { board: Board; version: number }) {
  const [notes, setNotes] = useState<VoiceNote[]>([]);
  const load = () => api.get<VoiceNote[]>('/api/voice-notes?all=1').then(setNotes);
  useEffect(() => void load(), [version]);

  const set = async (n: VoiceNote, body: { pinned?: boolean; hidden?: boolean }) => {
    await api.patch(`/api/voice-notes/${n.id}`, body);
    await load();
  };
  const people = board.people.filter((p) => notes.some((n) => n.from_person_id === p.id));

  return (
    <section className="voices-admin" data-testid="voices-admin">
      {notes.length === 0 && <p className="muted">No voice notes yet. Family members record them from “🎙️ For Jonatito”.</p>}
      {people.map((p) => (
        <div key={p.id} className="panel">
          <h3 className="who"><span className="pface"><Face person={p} /></span>{p.short_label}</h3>
          {notes.filter((n) => n.from_person_id === p.id).map((n) => (
            <div key={n.id} className={`voice-row ${n.hidden ? 'off' : ''}`} data-testid={`voice-row-${n.id}`}>
              <audio controls preload="none" src={n.audio_url} />
              <span className="muted">{fmt12ampm(new Date(n.created_at))}{n.heard_at ? ' · heard ✔' : ''}</span>
              <button className={`btn ${n.pinned ? 'sel' : ''}`} data-testid={`voice-pin-${n.id}`} onClick={() => set(n, { pinned: !n.pinned })}>
                {n.pinned ? '⭐ Pinned' : '☆ Pin'}
              </button>
              <button className="btn" data-testid={`voice-hide-${n.id}`} onClick={() => set(n, { hidden: !n.hidden })}>{n.hidden ? '👁 Show' : '🙈 Hide'}</button>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
