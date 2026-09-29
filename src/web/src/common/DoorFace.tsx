// Not available (busy / away): the face peeks out from behind a door that is ajar (hinged on the left,
// knob on the right), on the taskbar and on the person screen.
import type { CSSProperties } from 'react';
import { Face } from './Face.tsx';
import type { Person } from '../../../shared/types.ts';

export function DoorFace({ person, size, testId }: { person: Person; size: number; testId?: string }) {
  return (
    <span className={`door ${person.status ?? ''}`} style={{ '--s': `${size}px` } as CSSProperties} data-testid={testId}>
      <span className="door-way"><Face person={person} /></span>
      <span className="door-panel"><i /></span>
    </span>
  );
}
