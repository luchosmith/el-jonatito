// Parent mode -> Items: one entry for everything Jonatito can touch. Picture (with history and
// revert), words (EN/ES), recorded sound, what a tap does, its fixed slot, and time rules.
import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api.ts';
import type { Board } from '../common/board.ts';
import { shownLabel } from '../common/board.ts';
import { INNER_SLOTS, OUTER_SLOTS, RESERVED_OUTER, SUB_SLOTS } from '../common/orbit.ts';
import { startRecording, type Recording } from '../common/recorder.ts';
import { playClip } from '../common/sound.ts';
import { kindClass } from '../common/Token.tsx';
import { fmtMinutes } from '../../../shared/time.ts';
import type { Item, ItemCategory, ItemImage, ItemRule, Lang, ScheduleItem, TapAction } from '../../../shared/types.ts';

const CATEGORIES: ItemCategory[] = ['person', 'pet', 'food', 'drink', 'action', 'place', 'feeling', 'play', 'media', 'body', 'social', 'urgent', 'core'];
const TAPS: [TapAction, string][] = [
  ['add', 'Add to the sentence'],
  ['open', 'Open its own orbit'],
  ['play', 'Play full screen'],
  ['body', 'Open My body'],
  ['none', 'Nothing'],
];

type Group = { title: string; rows: ({ item: Item } | { gap: string })[] };

function groups(items: Item[]): Group[] {
  const inOrbit = (parent: string | null, orbit: 'inner' | 'outer', n: number, reserved: number[] = []): Group['rows'] =>
    Array.from({ length: n }, (_, s) => {
      if (reserved.includes(s)) return null;
      const it = items.find((i) => (i.parent_id ?? null) === parent && i.orbit === orbit && i.orbit_slot === s);
      return it ? { item: it } : { gap: `slot ${s + 1} · empty` };
    }).filter((r): r is { item: Item } | { gap: string } => !!r);
  const out: Group[] = [
    { title: 'Main orbit · inner', rows: inOrbit(null, 'inner', INNER_SLOTS) },
  ];
  for (const p of items.filter((i) => i.tap === 'open')) out.push({ title: `${p.emoji ?? ''} ${shownLabel(p)} › its orbit`, rows: inOrbit(p.id, 'inner', SUB_SLOTS) });
  out.push({ title: 'My body', rows: items.filter((i) => i.category === 'body').map((item) => ({ item })) });
  const placed = new Set(out.flatMap((g) => g.rows.filter((r): r is { item: Item } => 'item' in r).map((r) => r.item.id)));
  out.push({ title: 'Board only / others', rows: items.filter((i) => !placed.has(i.id)).sort((a, b) => (a.grid_page ?? '~').localeCompare(b.grid_page ?? '~')).map((item) => ({ item })) });
  return out;
}

export function ItemsAdmin({ board, onChange }: { board: Board; onChange: () => void }) {
  const [sel, setSel] = useState<string>(board.items.find((i) => i.orbit === 'inner' && !i.parent_id)?.id ?? board.items[0]?.id);
  const item = board.items.find((i) => i.id === sel);
  return (
    <section className="items-admin" data-testid="items-admin">
      <nav className="item-tree">
        {groups(board.items).map((g) => (
          <div key={g.title}>
            <h4>{g.title}</h4>
            {g.rows.map((r, i) =>
              'gap' in r ? (
                <div key={`gap-${i}`} className="ti gap">{r.gap}</div>
              ) : (
                <button key={r.item.id} className={`ti ${r.item.id === sel ? 'on' : ''} ${r.item.is_hidden ? 'off' : ''}`} data-testid={`item-row-${r.item.id}`} onClick={() => setSel(r.item.id)}>
                  <span className={`th ${kindClass(r.item.kind)}`}>{r.item.photo_url ? <img src={r.item.photo_url} alt="" /> : r.item.emoji}</span>
                  {shownLabel(r.item)}
                  {r.item.rules.length > 0 && <span title="time rule">🕒</span>}
                  {r.item.is_hidden && <small>hidden</small>}
                </button>
              ),
            )}
          </div>
        ))}
      </nav>
      {item && <ItemEditor key={item.id} item={item} board={board} onChange={onChange} />}
    </section>
  );
}

function ItemEditor({ item, board, onChange }: { item: Item; board: Board; onChange: () => void }) {
  const [images, setImages] = useState<ItemImage[]>([]);
  const [words, setWords] = useState({ short: item.short_label ?? '', en: item.labels.en, es: item.labels.es, emoji: item.emoji ?? '' });
  const [msg, setMsg] = useState('');
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const isPerson = item.category === 'person' || item.category === 'pet';
  const person = isPerson ? board.people.find((p) => p.id === item.id) : undefined;
  const media = item.media_id != null;

  const loadImages = () => api.get<Item & { images: ItemImage[] }>(`/api/items/${item.id}`).then((r) => setImages(r.images));
  useEffect(() => {
    void loadImages();
    api.get<ScheduleItem[]>('/api/schedule').then(setSchedule).catch(() => undefined);
  }, [item.id, item.photo_url]);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setMsg('');
    try {
      await fn();
      onChange();
      if (ok) setMsg(ok);
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : 'Something went wrong');
    }
  };
  const patch = (body: object, ok?: string) => run(() => api.patch(`/api/items/${item.id}`, body), ok);

  return (
    <div className="item-editor" data-testid="item-editor" data-id={item.id}>
      <div className="panel">
        <h3>Picture</h3>
        <div className="pic-row">
          <div className={`pic ${kindClass(item.kind)}`} data-testid="item-pic">{item.photo_url ? <img src={item.photo_url} alt="" /> : item.emoji}</div>
          <div>
            <label className="btn">
              📷 Change picture
              <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden data-testid="item-photo"
                onChange={(e) => e.target.files?.[0] && run(() => api.upload('PUT', `/api/items/${item.id}/image`, e.target.files![0]), 'Picture changed.')} />
            </label>
            <div className="hist" data-testid="item-history">
              {images.slice(0, 6).map((im) => (
                <span key={im.id} className={im.is_active ? 'cur' : 'old'}><img src={im.url} alt="" /></span>
              ))}
              {item.photo_url && (
                <button className="btn" data-testid="item-revert" onClick={() => run(() => api.post(`/api/items/${item.id}/image/revert`), 'Previous picture restored.')}>↩ Revert</button>
              )}
            </div>
            <p className="muted small">A new picture changes only the image. The place, colour and sound stay the same.</p>
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>Words</h3>
        <label>Under the picture<input data-testid="item-short" value={words.short} placeholder={item.labels.en} onChange={(e) => setWords({ ...words, short: e.target.value })} /></label>
        <div className="two">
          <label>Spoken · English<input data-testid="item-label-en" value={words.en} onChange={(e) => setWords({ ...words, en: e.target.value })} /></label>
          <label>Spoken · Español<input data-testid="item-label-es" value={words.es} onChange={(e) => setWords({ ...words, es: e.target.value })} /></label>
        </div>
        {!item.photo_url && <label>Emoji (until there is a picture)<input data-testid="item-emoji" value={words.emoji} onChange={(e) => setWords({ ...words, emoji: e.target.value })} /></label>}
        <button className="save" data-testid="item-save-words" onClick={() => patch({ short_label: words.short.trim() || null, label_en: words.en, label_es: words.es, ...(words.emoji ? { emoji: words.emoji } : {}) }, 'Words saved.')}>
          Save words
        </button>
      </div>

      <div className="panel wide">
        <h3>Sound</h3>
        {(['en', 'es'] as Lang[]).map((l) => <SoundRow key={l} item={item} lang={l} onDone={onChange} setMsg={setMsg} />)}
      </div>

      <div className="panel">
        <h3>Kind & tap</h3>
        <label>
          Category
          <select data-testid="item-category" value={item.category} onChange={(e) => patch({ category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label>
          When he taps it
          <select data-testid="item-tap" value={item.tap} onChange={(e) => patch({ tap: e.target.value })}>
            {TAPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <p className="linked" data-testid="item-linked">
          {person ? `👤 ${person.display_name}${person.role ? ` · signs in as ${person.role}` : ' · no account'}` : media ? `🎬 media #${item.media_id}` : '—'}
        </p>
        {media && (
          <label className="btn">
            🎬 Upload video / song
            <input type="file" accept="video/mp4,video/webm,audio/mpeg,audio/mp4" hidden data-testid="item-media-file"
              onChange={(e) => e.target.files?.[0] && run(() => api.upload('PUT', `/api/media/${item.media_id}/file`, e.target.files![0]), 'Media file uploaded.')} />
          </label>
        )}
        <label className="check">
          <input type="checkbox" data-testid="item-hidden" checked={item.is_hidden} onChange={(e) => patch({ is_hidden: e.target.checked })} />
          Hidden from Jonatito (keeps its place)
        </label>
      </div>

      <Placement item={item} board={board} onMove={(body) => patch(body, 'Moved.')} />
      <Rules item={item} board={board} schedule={schedule} run={run} />

      {msg && <p className="muted item-msg" data-testid="item-msg">{msg}</p>}
    </div>
  );
}

function SoundRow({ item, lang, onDone, setMsg }: { item: Item; lang: Lang; onDone: () => void; setMsg: (m: string) => void }) {
  const [recording, setRecording] = useState(false);
  const rec = useRef<Recording | null>(null);
  const url = item.audio[lang];
  const upload = async (blob: Blob) => {
    try {
      await api.upload('PUT', `/api/items/${item.id}/audio?lang=${lang}`, blob);
      setMsg('Sound saved.');
      onDone();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : 'Could not save the sound');
    }
  };
  const toggle = async () => {
    if (recording) {
      setRecording(false);
      await upload(await rec.current!.stop());
      return;
    }
    try {
      rec.current = await startRecording(10_000);
      setRecording(true);
    } catch {
      setMsg('The microphone is not available.');
    }
  };
  return (
    <div className="aud" data-testid={`item-audio-${lang}`} data-state={url ? 'recorded' : 'tts'}>
      <b>{lang.toUpperCase()}</b>
      <span>{url ? '〰️ recorded' : '🗣️ text-to-speech'}</span>
      {url && <button className="btn" onClick={() => playClip(url)}>▶</button>}
      <button className={`btn ${recording ? 'rec' : ''}`} data-testid={`item-audio-${lang}-record`} onClick={toggle}>{recording ? '⏹ Stop' : '🎙️ Record'}</button>
      <label className="btn">
        ⬆ Upload
        <input type="file" accept="audio/*" hidden data-testid={`item-audio-${lang}-upload`} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </label>
      {url && (
        <button className="btn" data-testid={`item-audio-${lang}-tts`}
          onClick={async () => { await api.del(`/api/items/${item.id}/audio?lang=${lang}`); onDone(); }}>
          ↩ Text-to-speech
        </button>
      )}
    </div>
  );
}

function Placement({ item, board, onMove }: { item: Item; board: Board; onMove: (body: object) => void }) {
  const [orbit, setOrbit] = useState<'' | 'inner' | 'outer'>(item.orbit ?? '');
  const [parent, setParent] = useState(item.parent_id ?? '');
  const [slot, setSlot] = useState<number | ''>(item.orbit_slot ?? '');
  const openers = board.items.filter((i) => i.tap === 'open' && i.id !== item.id);
  const n = orbit === 'outer' ? OUTER_SLOTS : parent ? SUB_SLOTS : INNER_SLOTS;
  const takenBy = (s: number) =>
    board.items.find((i) => i.id !== item.id && i.orbit === orbit && (i.parent_id ?? '') === (orbit === 'outer' ? '' : parent) && i.orbit_slot === s);
  const changed = orbit !== (item.orbit ?? '') || parent !== (item.parent_id ?? '') || slot !== (item.orbit_slot ?? '');

  const move = () => {
    // Motor planning: he has learned where things are.
    if (item.orbit && !window.confirm('He has learned where this is. Move it anyway?')) return;
    onMove(orbit ? { orbit, orbit_slot: Number(slot), parent_id: orbit === 'inner' && parent ? parent : null } : { orbit: null });
  };

  return (
    <div className="panel">
      <h3>Place</h3>
      <p className="muted small" data-testid="item-place">
        {item.orbit
          ? `${item.orbit === 'inner' ? 'Inner' : 'Outer'} orbit · slot ${item.orbit_slot! + 1}${item.parent_id ? ` · inside ${item.parent_id}` : ''}`
          : 'Not in an orbit'}
        {item.grid_page ? ` · Board: ${item.grid_page}, row ${item.grid_row! + 1}, col ${item.grid_col! + 1}` : ''}
      </p>
      <div className="two">
        <label>
          Orbit
          <select data-testid="item-orbit" value={orbit} onChange={(e) => { setOrbit(e.target.value as typeof orbit); setSlot(''); }}>
            <option value="">none</option>
            <option value="inner">inner</option>
          </select>
        </label>
        {orbit === 'inner' && (
          <label>
            In
            <select data-testid="item-parent" value={parent} onChange={(e) => { setParent(e.target.value); setSlot(''); }}>
              <option value="">the main orbit</option>
              {openers.map((o) => <option key={o.id} value={o.id}>{shownLabel(o)}'s orbit</option>)}
            </select>
          </label>
        )}
      </div>
      {orbit && (
        <div className="slots" data-testid="item-slots">
          {Array.from({ length: n }, (_, s) => {
            const reserved = orbit === 'outer' && RESERVED_OUTER.includes(s);
            const other = takenBy(s);
            return (
              <button key={s} className={`slot ${slot === s ? 'sel' : ''} ${other ? 'taken' : ''}`} data-testid={`item-slot-${s}`}
                disabled={reserved || !!other} title={other ? `taken by ${shownLabel(other)}` : reserved ? 'always empty' : 'free'} onClick={() => setSlot(s)}>
                {reserved ? '·' : other ? other.emoji ?? '•' : s + 1}
              </button>
            );
          })}
        </div>
      )}
      <button className="btn" data-testid="item-move" disabled={!changed || (!!orbit && slot === '')} onClick={move}>Move here</button>
    </div>
  );
}

function Rules({ item, board, schedule, run }: { item: Item; board: Board; schedule: ScheduleItem[]; run: (fn: () => Promise<unknown>, ok?: string) => Promise<void> }) {
  const [kind, setKind] = useState<ItemRule['kind']>('window');
  const [blocks, setBlocks] = useState(true);
  const [start, setStart] = useState('07:00');
  const [end, setEnd] = useState('10:00');
  const [routine, setRoutine] = useState('');
  const [openMin, setOpenMin] = useState(45);
  const [max, setMax] = useState(2);
  const [interval, setIntervalMin] = useState(60);
  const [suggest, setSuggest] = useState('');
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const describe = (r: ItemRule) => {
    if (r.kind === 'window') {
      const s = r.routine_item_id ? schedule.find((x) => x.id === r.routine_item_id) : undefined;
      return s ? `Open with ${s.symbol_emoji} ${s.label} (${fmtMinutes(s.start_min)}) for ${r.routine_open_min} min` : `Open ${fmtMinutes(r.start_min ?? 0)}–${fmtMinutes(r.end_min ?? 0)}`;
    }
    const sug = r.suggest_item_id ? board.items.find((i) => i.id === r.suggest_item_id) : undefined;
    const tail = sug ? ` → suggest ${sug.emoji ?? ''} ${shownLabel(sug)}` : '';
    return r.kind === 'limit' ? `At most ${r.max_per_day} a day${tail}` : `At least ${r.min_interval_min} min apart${tail}`;
  };
  const add = () => {
    const body: Record<string, unknown> = { kind, blocks };
    if (kind === 'window') Object.assign(body, routine ? { routine_item_id: Number(routine), routine_open_min: openMin } : { start_min: toMin(start), end_min: toMin(end) });
    if (kind === 'limit') body.max_per_day = max;
    if (kind === 'interval') body.min_interval_min = interval;
    if (suggest && kind !== 'window') body.suggest_item_id = suggest;
    return run(() => api.post(`/api/items/${item.id}/rules`, body), 'Rule added.');
  };

  return (
    <div className="panel wide">
      <h3>Time rules</h3>
      {item.rules.length === 0 && <p className="muted small">Always open.</p>}
      {item.rules.map((r) => (
        <div key={r.id} className="rule" data-testid={`rule-${r.id}`} data-kind={r.kind}>
          <span>{describe(r)}</span>
          <label className="check">
            <input type="checkbox" checked={r.blocks} data-testid={`rule-blocks-${r.id}`}
              onChange={(e) => run(() => api.patch(`/api/items/${item.id}/rules/${r.id}`, { blocks: e.target.checked }))} />
            {r.blocks ? 'closed with a clock' : 'reminder only'}
          </label>
          <button className="link" data-testid={`rule-delete-${r.id}`} onClick={() => run(() => api.del(`/api/items/${item.id}/rules/${r.id}`), 'Rule removed.')}>✖</button>
        </div>
      ))}
      {item.closed_until && <p className="muted small" data-testid="item-closed">Closed right now, opens {new Date(item.closed_until).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}.</p>}
      <div className="rule-add">
        <select data-testid="rule-kind" value={kind} onChange={(e) => setKind(e.target.value as ItemRule['kind'])}>
          <option value="window">Only at certain times</option>
          <option value="limit">At most N a day</option>
          <option value="interval">Minimum time between</option>
        </select>
        {kind === 'window' && (
          <>
            <select data-testid="rule-routine" value={routine} onChange={(e) => setRoutine(e.target.value)}>
              <option value="">set times</option>
              {schedule.map((s) => <option key={s.id} value={s.id}>with {s.symbol_emoji} {s.label}</option>)}
            </select>
            {routine ? (
              <label>for <input type="number" min={5} max={600} value={openMin} onChange={(e) => setOpenMin(Number(e.target.value))} /> min</label>
            ) : (
              <>
                <input type="time" data-testid="rule-start" value={start} onChange={(e) => setStart(e.target.value)} />–
                <input type="time" data-testid="rule-end" value={end} onChange={(e) => setEnd(e.target.value)} />
              </>
            )}
          </>
        )}
        {kind === 'limit' && <input type="number" min={1} max={50} data-testid="rule-max" value={max} onChange={(e) => setMax(Number(e.target.value))} />}
        {kind === 'interval' && <label><input type="number" min={5} max={1440} data-testid="rule-interval" value={interval} onChange={(e) => setIntervalMin(Number(e.target.value))} /> min</label>}
        {kind !== 'window' && (
          <select value={suggest} onChange={(e) => setSuggest(e.target.value)}>
            <option value="">no suggestion</option>
            {board.items.filter((i) => i.category === 'food' || i.category === 'drink').map((i) => <option key={i.id} value={i.id}>suggest {i.emoji} {shownLabel(i)}</option>)}
          </select>
        )}
        <label className="check"><input type="checkbox" checked={blocks} onChange={(e) => setBlocks(e.target.checked)} /> close it (clock)</label>
        <button className="btn" data-testid="rule-add" onClick={add}>＋ Add rule</button>
      </div>
    </div>
  );
}
