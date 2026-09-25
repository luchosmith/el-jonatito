// My body: he points to where it hurts (his own photo is the head), then picks a face from
// smiling to crying. Low levels are logged, higher ones go to the caretaker, the highest are urgent.
import { useState } from 'react';
import { api } from '../api.ts';
import { BodySvg } from '../common/BodySvg.tsx';
import { PainFace } from '../common/PainFace.tsx';
import { Face } from '../common/Face.tsx';
import { speak } from '../common/hooks.ts';
import { bodyItemId, PAIN_LEVELS } from '../../../shared/body.ts';
import type { DispatchNote, Item, Lang, Message, Person } from '../../../shared/types.ts';

interface PainResult {
  sentence: { en: string; es: string };
  level: number;
  message: Message | null;
  notes: DispatchNote[];
}

export function BodyView({ me, items, people, lang }: { me: Person | undefined; items: Item[]; people: Person[]; lang: Lang }) {
  const [part, setPart] = useState<{ id: string; side: 'left' | 'right' | null } | null>(null);
  const [result, setResult] = useState<PainResult | null>(null);
  const [sending, setSending] = useState(false);
  const bodyItem = (id: string) => items.find((i) => i.id === bodyItemId(id));
  const hidden = items.filter((i) => i.category === 'body' && i.is_hidden).map((i) => i.id.replace(/^body_/, ''));

  const pick = (id: string, side: 'left' | 'right' | null) => {
    setPart({ id, side });
    const it = bodyItem(id);
    speak(it ? it.labels[lang] || it.labels.en : id, lang);
  };

  const report = async (level: number) => {
    if (!part || sending) return;
    setSending(true);
    try {
      const r = await api.post<PainResult>('/api/pain', { part: part.id, level, ...(part.side ? { side: part.side } : {}) });
      speak(r.sentence[lang], lang);
      setResult(r);
    } finally {
      setSending(false);
    }
  };

  const urgent = result?.notes.find((n) => n.kind === 'urgent');
  const delivered = result?.notes.find((n) => n.kind === 'delivered');
  const who = (id: string | null | undefined) => people.find((p) => p.id === id);
  const partItem = part ? bodyItem(part.id) : undefined;

  return (
    <div className="bodyv" data-testid="body-view">
      <BodySvg photoUrl={me?.photo_url ?? null} selected={part?.id} hiddenParts={hidden} onPick={pick} height={470} />
      <div className="painp">
        <div className="which" data-testid="body-which">
          {partItem ? (
            <>
              <span className="dot">●</span>
              {partItem.labels[lang] || partItem.labels.en}
            </>
          ) : (
            '👆 🩹'
          )}
        </div>
        <div className={`pfaces ${part ? 'on' : ''}`} data-testid="pain-faces">
          {PAIN_LEVELS.map((l) => (
            <button key={l} className="painbtn" data-testid={`pain-${l}`} disabled={!part || sending} onClick={() => report(l)}>
              <PainFace level={l} />
            </button>
          ))}
        </div>
      </div>

      {result && (
        <div className="overlay" data-testid="pain-card" data-kind={urgent ? 'urgent' : result.message ? 'sent' : 'logged'}>
          <div className="card">
            <h2>🩹 “{result.sentence[lang]}”</h2>
            <div className="row">
              <PainFace level={result.level} size={84} />
              <b>● {partItem?.labels[lang]}</b>
            </div>
            {urgent && urgent.kind === 'urgent' ? (
              <div className="row urgent" data-testid="pain-urgent">
                <span className="big-emoji">🆘</span>
                {urgent.recipient_person_ids.map((id) => {
                  const p = who(id);
                  return p ? <span key={id} className="big"><Face person={p} /></span> : null;
                })}
              </div>
            ) : delivered && delivered.kind === 'delivered' ? (
              <div className="row ok" data-testid="pain-sent">
                {who(delivered.person_id) && <span className="big"><Face person={who(delivered.person_id)!} /></span>}
                <b>{who(delivered.person_id)?.short_label}</b>
                <span className="push big-emoji">📬✔</span>
              </div>
            ) : (
              <div className="row ok" data-testid="pain-logged"><span className="big-emoji">📝✔</span></div>
            )}
            <button
              className="cbtn ok"
              data-testid="pain-ok"
              onClick={() => {
                setResult(null);
                setPart(null);
              }}
            >
              👍
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
