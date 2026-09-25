// The ground under his feet, zoomed out: his pin, their pin, and the way between them
// (🚗 nearby, ✈️ another country). Messages can visibly travel along that path.
import { forwardRef, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { geoInterpolate, geoOrthographic, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import type { FeatureCollection } from 'geojson';
import landTopo from 'world-atlas/land-110m.json';
import { reachOf, type Reach } from '../../../shared/geo.ts';
import type { Place } from '../../../shared/types.ts';

const topo = landTopo as unknown as Topology<{ land: GeometryCollection }>;
const LAND = feature(topo, topo.objects.land) as unknown as FeatureCollection;

const reducedMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

export interface GlobeHandle {
  /** Sends `icon` along the path: from him to them, or back from them to him. */
  fly: (icon: string, back?: boolean) => Promise<void>;
}

interface Props {
  home: Place;
  homePhoto: string | null;
  /** undefined = nobody else on the globe; null = they have not shared where they are */
  other?: { place: Place | null; photo: string | null; emoji: string | null };
  size?: number;
}

const V = 300; // viewBox size
const C = V / 2;

function Pin({ x, y, photo, emoji, color }: { x: number; y: number; photo: string | null; emoji?: string | null; color: string }) {
  const clip = useId().replace(/:/g, '');
  return (
    <g className="pin">
      <line x1={x} y1={y} x2={x} y2={y - 16} stroke={color} strokeWidth="3" />
      <clipPath id={clip}><circle cx={x} cy={y - 34} r="16" /></clipPath>
      <circle cx={x} cy={y - 34} r="19" fill="#fff" stroke={color} strokeWidth="3" />
      {photo ? (
        <image href={photo} x={x - 16} y={y - 50} width="32" height="32" clipPath={`url(#${clip})`} preserveAspectRatio="xMidYMid slice" />
      ) : (
        <text x={x} y={y - 26} fontSize="22" textAnchor="middle">{emoji ?? '🙂'}</text>
      )}
      <circle cx={x} cy={y} r="4" fill={color} />
    </g>
  );
}

/** One message on its way: starts moving once, when it appears. */
function Flyer({ icon, path }: { icon: string; path: string }) {
  const motion = useRef<SVGElement>(null);
  useEffect(() => {
    (motion.current as SVGAnimationElement | null)?.beginElement();
  }, []);
  return (
    <text fontSize="34" textAnchor="middle" dy="12" className="flyer" data-testid="flyer">
      {icon}
      <animateMotion ref={motion} dur="1.8s" fill="freeze" path={path} begin="indefinite" />
    </text>
  );
}

export const Globe = forwardRef<GlobeHandle, Props>(function Globe({ home, homePhoto, other, size = 300 }, ref) {
  const ids = useId().replace(/:/g, '');
  const [flyers, setFlyers] = useState<{ id: number; icon: string; path: string }[]>([]);
  const reach: Reach | 'alone' = other === undefined ? 'alone' : reachOf(home, other.place);

  const geo = useMemo(() => {
    if (reach === 'same_city') {
      // Close-up of the ground: no globe, just the two of them and a road.
      const d = 'M96 206 Q150 150 210 160';
      return { local: true as const, a: [96, 210] as const, b: [212, 164] as const, arc: d, back: 'M210 160 Q150 150 96 206' };
    }
    const A: [number, number] = [home.lon, home.lat];
    const B: [number, number] | null = other?.place ? [other.place.lon, other.place.lat] : null;
    const mid = B ? geoInterpolate(A, B)(0.5) : A;
    const proj = geoOrthographic().rotate([-mid[0], -mid[1]]).translate([C, C]).scale(136).clipAngle(90);
    const path = geoPath(proj);
    const pt = (p: [number, number]) => proj(p) ?? [C, C];
    let arc: string | null = null;
    let back: string | null = null;
    if (B) {
      const along = geoInterpolate(A, B);
      const pts = Array.from({ length: 33 }, (_, i) => pt(along(i / 32)));
      const toD = (list: [number, number][]) => 'M' + list.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L');
      arc = toD(pts);
      back = toD([...pts].reverse());
    }
    return { local: false as const, sphere: path({ type: 'Sphere' }) ?? '', land: path(LAND) ?? '', a: pt(A), b: B ? pt(B) : null, arc, back };
  }, [home.lat, home.lon, other?.place?.lat, other?.place?.lon, reach]);

  useImperativeHandle(ref, () => ({
    fly: (icon, back = false) =>
      new Promise<void>((resolve) => {
        const path = back ? geo.back : geo.arc;
        if (!path || reducedMotion()) {
          setTimeout(resolve, 300);
          return;
        }
        const id = Date.now() + Math.random();
        setFlyers((f) => [...f, { id, icon, path }]);
        setTimeout(() => {
          setFlyers((f) => f.filter((x) => x.id !== id));
          resolve();
        }, 1900);
      }),
  }), [geo]);

  const moving = !reducedMotion() && geo.arc && (reach === 'abroad' || reach === 'same_country' || reach === 'same_city');
  const vehicle = reach === 'abroad' ? '✈️' : '🚗';

  return (
    <svg className="globe" width={size} height={size} viewBox={`0 0 ${V} ${V}`} data-testid="globe" data-reach={reach} role="img">
      <defs>
        <radialGradient id={`oc${ids}`} cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#b5dcf7" />
          <stop offset="1" stopColor="#4f8fcf" />
        </radialGradient>
        <radialGradient id={`ld${ids}`} cx="50%" cy="40%" r="75%">
          <stop offset="0" stopColor="#a8dd96" />
          <stop offset="1" stopColor="#5fae5c" />
        </radialGradient>
      </defs>
      {geo.local ? (
        <>
          <circle cx={C} cy={C} r="140" fill={`url(#ld${ids})`} stroke="#fff" strokeWidth="4" />
          <path d="M30 210 Q150 120 270 170" stroke="#fff" strokeWidth="12" fill="none" opacity=".6" />
        </>
      ) : (
        <>
          <circle cx={C} cy={C} r="143" fill="#dff0ff" opacity=".7" />
          <path d={geo.sphere} fill={`url(#oc${ids})`} />
          <path d={geo.land} fill={`url(#ld${ids})`} stroke="#4f9a4c" strokeWidth="0.8" />
        </>
      )}
      {geo.arc && <path d={geo.arc} stroke="#1f2a37" strokeWidth="3" strokeDasharray="6 7" fill="none" opacity=".7" />}
      {moving && (
        <text fontSize="28" textAnchor="middle" dy="10" data-testid="globe-vehicle">
          {vehicle}
          <animateMotion dur="3.5s" repeatCount="indefinite" path={geo.arc!} />
        </text>
      )}
      <Pin x={geo.a[0]} y={geo.a[1]} photo={homePhoto} color="#e45757" />
      {other && geo.b && <Pin x={geo.b[0]} y={geo.b[1]} photo={other.photo} emoji={other.emoji} color="#1f2a37" />}
      {other && !other.place && <text x={geo.a[0] + 46} y={geo.a[1] - 24} fontSize="44" data-testid="globe-unknown">❔</text>}
      {flyers.map((f) => <Flyer key={f.id} icon={f.icon} path={f.path} />)}
    </svg>
  );
});
