// A simple front-view body with Jonatito's own photo as the head, and 12 tap zones.
// Used on the tablet (My body) and, small, on family phones to show where it hurts.
import { useId } from 'react';

type Zone = [part: string, side: 'left' | 'right' | null, shape: 'ellipse' | 'rect' | 'circle', attrs: Record<string, string | number>];

const ZONES: Zone[] = [
  ['head', null, 'ellipse', { cx: 150, cy: 40, rx: 50, ry: 22 }],
  ['eyes', null, 'rect', { x: 112, y: 70, width: 76, height: 22, rx: 11 }],
  ['ear', 'right', 'circle', { cx: 92, cy: 84, r: 14 }],
  ['ear', 'left', 'circle', { cx: 208, cy: 84, r: 14 }],
  ['mouth', null, 'ellipse', { cx: 150, cy: 114, rx: 24, ry: 12 }],
  ['throat', null, 'rect', { x: 130, y: 136, width: 40, height: 18, rx: 6 }],
  ['chest', null, 'rect', { x: 96, y: 156, width: 108, height: 62, rx: 22 }],
  ['tummy', null, 'rect', { x: 96, y: 218, width: 108, height: 56, rx: 16 }],
  ['potty', null, 'rect', { x: 120, y: 278, width: 60, height: 28, rx: 10 }],
  ['arm', 'right', 'rect', { x: 60, y: 156, width: 34, height: 122, rx: 17, transform: 'rotate(14 77 156)' }],
  ['arm', 'left', 'rect', { x: 206, y: 156, width: 34, height: 122, rx: 17, transform: 'rotate(-14 223 156)' }],
  ['hand', 'right', 'circle', { cx: 46, cy: 294, r: 20 }],
  ['hand', 'left', 'circle', { cx: 254, cy: 294, r: 20 }],
  ['leg', 'right', 'rect', { x: 100, y: 312, width: 44, height: 136, rx: 18 }],
  ['leg', 'left', 'rect', { x: 156, y: 312, width: 44, height: 136, rx: 18 }],
  ['foot', 'right', 'ellipse', { cx: 116, cy: 462, rx: 34, ry: 17 }],
  ['foot', 'left', 'ellipse', { cx: 184, cy: 462, rx: 34, ry: 17 }],
];

export function BodySvg({ photoUrl, selected, hiddenParts = [], onPick, height = 490 }: {
  photoUrl: string | null;
  selected?: string | null;
  hiddenParts?: string[];
  onPick?: (part: string, side: 'left' | 'right' | null) => void;
  height?: number;
}) {
  const clip = useId().replace(/:/g, '');
  const sk = '#f1c9a5';
  const sh = '#5aa4e6';
  const pa = '#3d4957';
  return (
    <svg className="body-svg" width={(height * 300) / 490} height={height} viewBox="0 0 300 490" role="img" aria-label="My body">
      <clipPath id={clip}><circle cx="150" cy="78" r="58" /></clipPath>
      <rect x="100" y="290" width="44" height="160" rx="18" fill={pa} />
      <rect x="156" y="290" width="44" height="160" rx="18" fill={pa} />
      <ellipse cx="116" cy="462" rx="32" ry="15" fill="#27313d" />
      <ellipse cx="184" cy="462" rx="32" ry="15" fill="#27313d" />
      <rect x="60" y="156" width="34" height="130" rx="17" transform="rotate(14 77 156)" fill={sh} />
      <rect x="206" y="156" width="34" height="130" rx="17" transform="rotate(-14 223 156)" fill={sh} />
      <circle cx="46" cy="294" r="17" fill={sk} />
      <circle cx="254" cy="294" r="17" fill={sk} />
      <rect x="96" y="268" width="108" height="44" rx="12" fill={pa} />
      <rect x="132" y="126" width="36" height="32" fill={sk} />
      <rect x="92" y="148" width="116" height="136" rx="28" fill={sh} />
      <circle cx="150" cy="78" r="62" fill={sk} />
      {photoUrl ? (
        <image href={photoUrl} x="92" y="20" width="116" height="116" clipPath={`url(#${clip})`} preserveAspectRatio="xMidYMid slice" />
      ) : (
        <text x="150" y="100" fontSize="60" textAnchor="middle">🙂</text>
      )}
      {ZONES.filter(([part]) => !hiddenParts.includes(part)).map(([part, side, shape, attrs], i) => {
        const props = {
          className: `zone ${selected === part ? 'hit' : ''} ${part === 'potty' ? 'potty' : ''}`,
          'data-testid': `body-${part}${side ? `-${side}` : ''}`,
          'data-part': part,
          onClick: onPick ? () => onPick(part, side) : undefined,
          ...attrs,
        };
        if (shape === 'ellipse') return <ellipse key={i} {...props} />;
        if (shape === 'circle') return <circle key={i} {...props} />;
        return <rect key={i} {...props} />;
      })}
    </svg>
  );
}
