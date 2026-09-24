// Hide / show words without ever moving them (motor planning).
import { useState } from 'react';
import { api } from '../api.ts';
import type { Board } from '../common/board.ts';

export function WordsAdmin({ board, onChange }: { board: Board; onChange: () => void }) {
  const [page, setPage] = useState(board.pages[0]?.id ?? 'food');
  const syms = board.symbols.filter((s) => s.grid_page === page);
  return (
    <section className="words-admin" data-testid="words-admin">
      <div className="fam-tabs small">
        {[...board.pages, { id: 'core', emoji: '⭐', label: { en: 'Always on', es: '' } }].map((p) => (
          <button key={p.id} className={p.id === page ? 'on' : ''} data-testid={`words-page-${p.id}`} onClick={() => setPage(p.id)}>{p.emoji} {p.label.en}</button>
        ))}
      </div>
      <div className="qbtns">
        {syms.map((s) => (
          <button key={s.id} className={`qb ${s.is_hidden ? 'off' : ''}`} data-testid={`word-${s.id}`} data-hidden={s.is_hidden}
            onClick={async () => { await api.patch(`/api/symbols/${s.id}`, { is_hidden: !s.is_hidden }); onChange(); }}>
            {s.emoji}<span>{s.labels.en}</span><small>{s.is_hidden ? 'hidden' : 'shown'}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
