// Change any person's or pet's picture (camera or gallery), rename, show / hide. One-tap revert.
import { useState } from 'react';
import { api, ApiError } from '../api.ts';
import type { Board } from '../common/board.ts';
import { Face } from '../common/Face.tsx';
import type { Person } from '../../../shared/types.ts';

export function PeopleAdmin({ board, onChange }: { board: Board; onChange: () => void }) {
  return (
    <section className="people-admin" data-testid="people-admin">
      {board.people.map((p) => <PersonRow key={p.id} p={p} onChange={onChange} />)}
    </section>
  );
}

function PersonRow({ p, onChange }: { p: Person; onChange: () => void }) {
  const [label, setLabel] = useState(p.short_label);
  const [error, setError] = useState('');

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    try {
      await api.upload('PUT', `/api/people/${p.id}/photo`, file);
      onChange();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Upload failed');
    }
  };

  return (
    <div className="prow" data-testid={`admin-${p.id}`}>
      <span className="pface"><Face person={p} /></span>
      <input value={label} data-testid={`label-${p.id}`} onChange={(e) => setLabel(e.target.value)} onBlur={async () => {
        if (label !== p.short_label && label.trim()) {
          await api.patch(`/api/people/${p.id}`, { short_label: label.trim() });
          onChange();
        }
      }} />
      <label className="btn">
        📷 Change picture
        <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden data-testid={`photo-${p.id}`} onChange={(e) => upload(e.target.files?.[0])} />
      </label>
      <button className="btn" data-testid={`revert-${p.id}`} onClick={async () => { await api.post(`/api/people/${p.id}/photo/revert`).catch(() => undefined); onChange(); }}>↩ Revert</button>
      {!p.is_self && (
        <button className="btn" data-testid={`visible-${p.id}`} onClick={async () => { await api.patch(`/api/people/${p.id}`, { is_visible: !p.is_visible }); onChange(); }}>
          {p.is_visible ? '🙈 Hide' : '👁 Show'}
        </button>
      )}
      {error && <span className="error">{error}</span>}
    </div>
  );
}
