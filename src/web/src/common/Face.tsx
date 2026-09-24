import type { Person } from '../../../shared/types.ts';

/** A person's photo, or their placeholder emoji until a real photo is added. */
export function Face({ person, className }: { person: Pick<Person, 'photo_url' | 'emoji' | 'short_label'>; className?: string }) {
  return person.photo_url ? (
    <img className={`face-img ${className ?? ''}`} src={person.photo_url} alt={person.short_label} draggable={false} />
  ) : (
    <span className={`face-emoji ${className ?? ''}`} aria-label={person.short_label}>{person.emoji ?? '🙂'}</span>
  );
}

/** Sound-signal graphic (LISTEN). Animates while `playing`. */
export function SoundWave({ playing, color = '#2f9e57', width = 62 }: { playing?: boolean; color?: string; width?: number }) {
  const bars = [8, 16, 26, 32, 22, 30, 14, 8, 4];
  return (
    <svg className={`sig ${playing ? 'playing' : ''}`} width={width} height={(width * 34) / 62} viewBox="0 0 62 34" aria-hidden>
      {bars.map((h, i) => (
        <rect key={i} x={2 + i * 7} y={17 - h / 2} width="4" height={h} rx="2" fill={color} style={{ animationDelay: `${i * 0.09}s` }} />
      ))}
    </svg>
  );
}
