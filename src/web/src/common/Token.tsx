import type { StripToken } from './board.ts';

const CLASS: Record<string, string> = {
  person: 'k-people', pet: 'k-people', action: 'k-action', thing: 'k-thing', desc: 'k-desc', social: 'k-social', urgent: 'k-urgent',
};

/** A small picture card in the sentence strip, inbox or dispatch card. */
export function TokenCard({ t, testId }: { t: StripToken; testId?: string }) {
  return (
    <div className={`tok ${CLASS[t.kind] ?? ''}`} data-testid={testId} data-token={t.id}>
      {t.photo_url ? <img src={t.photo_url} alt="" draggable={false} /> : <b>{t.emoji}</b>}
      {t.badge_color && <i className="badge" style={{ background: t.badge_color }} />}
      <span>{t.label}</span>
    </div>
  );
}

export const kindClass = (k: string) => CLASS[k] ?? '';
