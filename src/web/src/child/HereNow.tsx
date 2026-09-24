// Always-visible bar that ties the screen to the real time, day, season, weather and place.
import { Clock12 } from '../common/Clock12.tsx';
import { DAY_COLORS, SEASON_EMOJI, WEATHER_EMOJI } from '../common/board.ts';
import { fmt12, fmtMinutes, minutesOfDay, seasonOf } from '../../../shared/time.ts';
import type { NowInfo, ScheduleItem } from '../../../shared/types.ts';

const DAY_START = 6.5 * 60;
const DAY_END = 21 * 60;

export function HereNow({ now, schedule, info, cornerProps }: {
  now: Date;
  schedule: ScheduleItem[];
  info: NowInfo | null;
  cornerProps?: Record<string, unknown>;
}) {
  const nowMin = minutesOfDay(now);
  const frac = Math.min(1, Math.max(0, (nowMin - DAY_START) / (DAY_END - DAY_START)));
  const nextIdx = schedule.findIndex((s) => s.start_min > nowMin);
  const season = info?.season ?? seasonOf(now);
  const night = now.getHours() >= 19 || now.getHours() < 7;

  return (
    <header className="here" data-testid="here-now">
      <div className="clock">
        <Clock12 at={now} size={84} numbers={false} testId="main-clock" />
        <div className="digital">
          <span data-testid="digital-time">{fmt12(now)} {now.getHours() < 12 ? 'AM' : 'PM'}</span>
          <small>{now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</small>
        </div>
      </div>

      <div className="timeline" data-testid="timeline">
        <div className="sun" style={{ left: `calc(14px + ${frac} * (100% - 28px) - 11px)`, top: 2 + Math.pow(frac * 2 - 1, 2) * 14 }}>
          {night ? '🌙' : '☀️'}
        </div>
        <div className="tl-track">
          {schedule.map((s, i) => {
            const nextStart = schedule[i + 1]?.start_min ?? DAY_END;
            const cls = nextStart <= nowMin ? 'done' : i === nextIdx ? 'next' : '';
            return (
              <div key={s.id} className={`tl-item ${cls}`} data-testid={`tl-${s.label}`}>
                {s.symbol_emoji}
                <span>{fmtMinutes(s.start_min)}</span>
              </div>
            );
          })}
        </div>
        <div className="now-marker" style={{ left: `calc(14px + ${frac} * (100% - 28px))` }} />
      </div>

      <div className="chips">
        <div className="chip" data-testid="chip-day">
          <b className="daydot" style={{ background: DAY_COLORS[now.getDay()] }} />
          {now.toLocaleDateString('en-US', { weekday: 'long' })}
        </div>
        <div className="chip" data-testid="chip-season"><b>{SEASON_EMOJI[season]}</b>{season[0].toUpperCase() + season.slice(1)}</div>
        <div className="chip" data-testid="chip-weather">
          {info?.weather ? <><b>{WEATHER_EMOJI(info.weather.code)}</b>{info.weather.temp_c}°C</> : <b>·</b>}
        </div>
        <div className="chip"><b>🏠</b>{info?.place ?? 'Home'}</div>
      </div>
      <div className="parent-corner" data-testid="parent-corner" {...cornerProps} />
    </header>
  );
}
