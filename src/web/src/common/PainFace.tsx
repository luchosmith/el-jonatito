// Six faces from smiling (0) to crying (5), green to red. Drawn in-house: published pain
// scales (Wong-Baker FACES®, FPS-R) need permission for use in software.
export const PAIN_COLORS = ['#5cc27a', '#a6d96a', '#f7d64a', '#f6a04d', '#ef6f4f', '#e45757'];

const MOUTH = ['M28 58 Q50 84 72 58', 'M30 62 Q50 76 70 62', 'M32 67 L68 67', 'M32 72 Q50 62 68 72', 'M30 75 Q50 56 70 75', 'M28 79 Q50 52 72 79'];
const ink = '#1f2a37';

export function PainFace({ level, size = 96 }: { level: number; size?: number }) {
  const l = Math.max(0, Math.min(5, level));
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`pain ${l} of 5`} className="pain-face">
      <circle cx="50" cy="50" r="46" fill={PAIN_COLORS[l]} stroke={ink} strokeWidth="3" />
      {l <= 1 && (
        <>
          <circle cx="26" cy="58" r="6" fill="#f4a3a3" opacity=".7" />
          <circle cx="74" cy="58" r="6" fill="#f4a3a3" opacity=".7" />
        </>
      )}
      {l >= 4 ? (
        <>
          <path d="M28 44 Q36 36 44 44" stroke={ink} strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M56 44 Q64 36 72 44" stroke={ink} strokeWidth="4" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="36" cy="42" r="5" fill={ink} />
          <circle cx="64" cy="42" r="5" fill={ink} />
        </>
      )}
      {l >= 3 && (
        <>
          <path d={`M26 30 L42 ${30 - 2 * l}`} stroke={ink} strokeWidth="3.5" strokeLinecap="round" />
          <path d={`M74 30 L58 ${30 - 2 * l}`} stroke={ink} strokeWidth="3.5" strokeLinecap="round" />
        </>
      )}
      <path d={MOUTH[l]} stroke={ink} strokeWidth="5" fill="none" strokeLinecap="round" />
      {l >= 4 && <path d="M30 50 q-6 12 0 16 q6 -4 0 -16Z" fill="#5aa4e6" />}
      {l >= 5 && <path d="M70 50 q-6 12 0 16 q6 -4 0 -16Z" fill="#5aa4e6" />}
    </svg>
  );
}
