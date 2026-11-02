import type { CSSProperties, ReactNode } from 'react';
import { say } from '../app/audio';
import { LEVEL_THRESHOLDS, MAX_LEVEL, STAGE_LABEL, levelFromXp, stageOf } from '../core/mastery';

export function Seal({ level, size = 44, title }: { level: number; size?: number; title?: string }) {
  return (
    <span
      className={`seal lvl-${level}`}
      style={{ '--size': `${size}px` } as CSSProperties}
      title={title ?? `Nivel ${level} · ${STAGE_LABEL[stageOf(level)]}`}
      aria-label={title ?? `Nivel ${level}, ${STAGE_LABEL[stageOf(level)]}`}
      role="img"
    >
      {level}
    </span>
  );
}

/** Barra del nivel actual: XP efectivo (relleno) y pico alcanzado (rayado). */
export function XpBar({ xp, peak, thin, label }: { xp: number; peak?: number; thin?: boolean; label?: string }) {
  const lvl = levelFromXp(xp);
  const lo = LEVEL_THRESHOLDS[lvl];
  const hi = lvl >= MAX_LEVEL ? lo : LEVEL_THRESHOLDS[lvl + 1];
  const pct = (v: number) => (lvl >= MAX_LEVEL ? 100 : Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100)));
  const peakPct = peak !== undefined ? (levelFromXp(peak) > lvl ? 100 : pct(peak)) : 0;
  return (
    <div
      className={`xpbar${thin ? ' thin' : ''}`}
      role="progressbar"
      aria-label={label ?? 'Progreso del nivel'}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct(xp))}
    >
      {peak !== undefined && peak > xp && <span className="peak" style={{ width: `${peakPct}%` }} />}
      <span className="now" style={{ width: `${pct(xp)}%` }} />
    </div>
  );
}

export function SpeakButton({ text, pinyinNum, rate, label = 'Escuchar' }: { text: string; pinyinNum?: string; rate?: number; label?: string }) {
  return (
    <button type="button" className="icon-btn" aria-label={label} onClick={() => say(text, pinyinNum, rate)}>
      <Icon name="sound" />
    </button>
  );
}

const PATHS: Record<string, ReactNode> = {
  sound: (
    <>
      <path d="M4 9v6h4l5 4V5L8 9H4z" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  back: <path d="M15 5l-7 7 7 7" />,
  flame: <path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-7 1.5 1 2 2.5 2 4 1-1 1.5-3 1-7z" />,
  eye: (
    <>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  play: <path d="M8 5v14l11-7z" />,
};

export function Icon({ name }: { name: keyof typeof PATHS | string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

export function Empty({ han = '空', children }: { han?: string; children: ReactNode }) {
  return (
    <div className="empty">
      <span className="han" aria-hidden="true">
        {han}
      </span>
      {children}
    </div>
  );
}
