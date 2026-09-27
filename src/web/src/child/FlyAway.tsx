// A transient echo of every tap: the picture pops big in the middle of the screen, then slides off to
// the left (the past) and fades. Nothing is kept; the history strip only shows what really happened.
import { useEffect } from 'react';
import type { StripToken } from '../common/board.ts';

const DURATION_MS = 1400;

export function FlyAway({ token, onDone }: { token: StripToken; onDone: () => void }) {
  // Also when animations are off (reduced motion): it just shows for a moment.
  useEffect(() => {
    const t = setTimeout(onDone, DURATION_MS + 100);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="fly-away" data-testid="fly-away" data-id={token.id} aria-hidden>
      {token.photo_url ? <img src={token.photo_url} alt="" /> : <b>{token.emoji}</b>}
    </div>
  );
}
