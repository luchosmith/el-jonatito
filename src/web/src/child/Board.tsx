// Sentence strip + fixed-position picture grid + always-on core words.
import { GRID_COLS, GRID_ROWS, personToken, symbolToken, type Board as BoardData, type StripToken } from '../common/board.ts';
import { TokenCard, kindClass } from '../common/Token.tsx';
import { Face } from '../common/Face.tsx';
import type { Person } from '../../../shared/types.ts';

interface Props {
  board: BoardData;
  me: Person | undefined;
  page: string;
  onPage: (p: string) => void;
  tokens: StripToken[];
  onAdd: (t: StripToken) => void;
  onClear: () => void;
  onSay: () => void;
  onSend: () => void;
  sending: boolean;
  /** the sentence row is drawn by the tablet above the time row */
  showStrip?: boolean;
}

/** The sentence being built, with say / clear / send. Shared by the board and the orbit. */
export function Strip({ me, tokens, onClear, onSay, onSend, sending }: Pick<Props, 'me' | 'tokens' | 'onClear' | 'onSay' | 'onSend' | 'sending'>) {
  return (
    <div className="strip">
      <div className="tokens" data-testid="strip">
        {tokens.length === 0 ? (
          <span className="hint">👆</span>
        ) : (
          <>
            {me && <TokenCard t={personToken(me)} testId="strip-me" />}
            {tokens.map((t, i) => (
              <TokenCard key={i} t={t} testId="strip-token" />
            ))}
          </>
        )}
      </div>
      <button className="sbtn speak" data-testid="say" onClick={onSay} aria-label="Say">🔊</button>
      <button className="sbtn clear" data-testid="clear" onClick={onClear} aria-label="Clear">✖</button>
      <button className="sbtn send" data-testid="send" onClick={onSend} disabled={!tokens.length || sending} aria-label="Send">➤</button>
    </div>
  );
}

export function BoardView({ board, me, page, onPage, tokens, onAdd, onClear, onSay, onSend, sending, showStrip = true }: Props) {
  const itemOf = (id: string) => board.items.find((i) => i.id === id);
  const cells: (StripToken | null)[] = Array.from({ length: GRID_ROWS * GRID_COLS }, () => null);
  const hidden = new Set<number>();

  if (page === 'people') {
    // People page: everyone except Jonatito, in their fixed order.
    board.people
      .filter((p) => !p.is_self)
      .forEach((p, i) => {
        if (i >= cells.length) return;
        if (p.is_visible) cells[i] = personToken(p, itemOf(p.id));
        else hidden.add(i);
      });
  } else {
    for (const s of board.symbols.filter((x) => x.grid_page === page)) {
      const idx = s.grid_row * GRID_COLS + s.grid_col;
      if (idx >= cells.length) continue;
      if (s.is_hidden) hidden.add(idx);
      else cells[idx] = symbolToken(s, 'en', itemOf(s.id));
    }
  }
  const core = board.symbols.filter((s) => s.grid_page === 'core' && !s.is_hidden).sort((a, b) => a.grid_row - b.grid_row);

  return (
    <>
      {showStrip && <Strip me={me} tokens={tokens} onClear={onClear} onSay={onSay} onSend={onSend} sending={sending} />}

      <div className="main">
        <nav className="cats">
          <button className={`cat ${page === 'people' ? 'on' : ''}`} data-testid="page-people" onClick={() => onPage('people')}>
            👪<span>People</span>
          </button>
          {board.pages.map((p) => (
            <button key={p.id} className={`cat ${page === p.id ? 'on' : ''}`} data-testid={`page-${p.id}`} onClick={() => onPage(p.id)}>
              {p.emoji}
              <span>{p.label.en}</span>
            </button>
          ))}
        </nav>

        <div className="grid" data-testid="grid">
          {cells.map((c, i) =>
            c ? (
              <button key={i} className={`sym ${kindClass(c.kind)}`} data-testid={`sym-${c.id}`} data-slot={i} onClick={() => onAdd(c)}>
                {c.photo_url ? (
                  c.kind === 'person' || c.kind === 'pet' ? <Face person={{ photo_url: c.photo_url, emoji: c.emoji, short_label: c.label }} className="sym-face" /> : <img src={c.photo_url} alt="" />
                ) : (
                  <b>{c.emoji}</b>
                )}
                {c.badge_color && <i className="badge" style={{ background: c.badge_color }} />}
                <span>{c.label}</span>
              </button>
            ) : (
              <div key={i} className={`sym empty ${hidden.has(i) ? 'hidden-slot' : ''}`} data-testid={`slot-${i}`} data-slot={i} />
            ),
          )}
        </div>

        <div className="core" data-testid="core">
          {core.map((s) => {
            const t = symbolToken(s, 'en', itemOf(s.id));
            return (
              <button key={s.id} className={`sym ${kindClass(s.kind)}`} data-testid={`sym-${s.id}`} onClick={() => onAdd(t)}>
                <b>{s.emoji}</b>
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
