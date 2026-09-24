// What happens after SEND: pictures + 12-hour clocks, very little text. Never blocks the message.
import { Clock12 } from '../common/Clock12.tsx';
import { Face } from '../common/Face.tsx';
import { TokenCard } from '../common/Token.tsx';
import { lookupToken, type Board, type StripToken } from '../common/board.ts';
import { fmt12 } from '../../../shared/time.ts';
import type { DispatchNote, Message } from '../../../shared/types.ts';

export interface SentState {
  message: Message;
  notes: DispatchNote[];
  tokens: StripToken[];
}

export function DispatchCard({ sent, board, me, now, onClose, onResend }: {
  sent: SentState;
  board: Board;
  me: StripToken | null;
  now: Date;
  onClose: () => void;
  onResend: (personId: string) => void;
}) {
  const person = (id: string | null) => board.people.find((p) => p.id === id);
  const sym = (id: string | null) => (id ? lookupToken(board, { kind: 'thing', id }) : null);

  return (
    <div className="overlay" data-testid="dispatch-card">
      <div className="card">
        <h2 data-testid="sentence">📤 “{sent.message.sentence_en}”</h2>
        <div className="card-strip">
          {me && <TokenCard t={me} />}
          {sent.tokens.map((t, i) => <TokenCard key={i} t={t} />)}
        </div>

        {sent.notes.map((n, i) => {
          switch (n.kind) {
            case 'delivered': {
              const p = person(n.person_id);
              return (
                <div key={i} className="row ok" data-testid="note-delivered" data-person={n.person_id ?? ''}>
                  {p && <span className="big"><Face person={p} /></span>}
                  <b>{p?.short_label}</b>
                  <span className="push big-emoji">📬✔</span>
                </div>
              );
            }
            case 'busy': {
              const p = person(n.person_id);
              return (
                <div key={i} className="note-busy" data-testid="note-busy">
                  <div className="row warn">
                    {p && <span className="big"><Face person={p} /></span>}
                    <b>{p?.short_label}</b>
                    {n.until && (
                      <>
                        <Clock12 at={new Date(n.until)} from={now} size={60} />
                        <b className="time">{fmt12(new Date(n.until))}</b>
                      </>
                    )}
                    <span className="push big-emoji">📬</span>
                  </div>
                  {n.alternatives.length > 0 && (
                    <div className="pick" data-testid="alternatives">
                      <span className="big-emoji">🟢</span>
                      {n.alternatives.map((id) => {
                        const alt = person(id);
                        return alt ? (
                          <button key={id} className="av" data-testid={`alt-${id}`} onClick={() => onResend(id)}>
                            <Face person={alt} />
                            <span>{alt.short_label}</span>
                          </button>
                        ) : null;
                      })}
                    </div>
                  )}
                </div>
              );
            }
            case 'recent': {
              const s = sym(n.symbol_id);
              const at = new Date(n.at);
              return (
                <div key={i} className="row" data-testid="note-recent" data-symbol={n.symbol_id}>
                  <span className="big-emoji">{s?.emoji}</span>
                  <Clock12 at={at} from={now} size={60} />
                  <b className="time" data-testid="recent-time">{fmt12(at)}</b>
                </div>
              );
            }
            case 'limit': {
              const s = sym(n.symbol_id);
              const alt = sym(n.suggest_symbol_id);
              return (
                <div key={i} className="row" data-testid="note-limit" data-symbol={n.symbol_id}>
                  <span className="big-emoji">{s?.emoji}</span>
                  <span className="dots">{Array.from({ length: n.max }, (_, k) => <i key={k} className={k < n.count ? 'full' : ''} />)}</span>
                  {alt && (
                    <>
                      <span className="big-emoji">→</span>
                      <span className="big-emoji" data-testid="limit-suggest" data-symbol={n.suggest_symbol_id ?? ''}>{alt.emoji}</span>
                    </>
                  )}
                </div>
              );
            }
            case 'upcoming': {
              const s = sym(n.symbol_id);
              const at = new Date(n.at);
              return (
                <div key={i} className="row" data-testid="note-upcoming">
                  <span className="big-emoji">{s?.emoji}</span>
                  <Clock12 at={at} from={now} size={60} />
                  <b className="time">{fmt12(at)}</b>
                </div>
              );
            }
            case 'urgent':
              return (
                <div key={i} className="row urgent" data-testid="note-urgent">
                  <span className="big-emoji">🆘</span>
                  {n.recipient_person_ids.map((id) => {
                    const p = person(id);
                    return p ? <span key={id} className="big" data-testid={`urgent-to-${id}`}><Face person={p} /></span> : null;
                  })}
                </div>
              );
          }
        })}

        <button className="cbtn ok" data-testid="card-ok" onClick={onClose}>👍</button>
      </div>
    </div>
  );
}
