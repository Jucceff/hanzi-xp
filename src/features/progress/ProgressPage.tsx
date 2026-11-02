import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { repo, useDaily, useMastery, useSettings, type Mastery } from '../../app/progress';
import { LEVELS, chars, charWordLevel, meta, viewOf, words } from '../../content';
import { STAGE_LABEL, type Stage } from '../../core/mastery';
import { addDays, daysToReady, streak, weekStart, xpInRange } from '../../core/stats';
import { charItem, itemKey, itemKind, wordItem, type ItemId } from '../../core/skills';
import type { ThemePref } from '../../db/db';
import { localDate, serializeBackup } from '../../db/repo';
import { SyncCard } from './SyncCard';

const STAGES: Stage[] = ['nuevo', 'visto', 'aprendiendo', 'familiar', 'dominado'];
const DAY = 86_400_000;

export function ProgressPage() {
  const { mastery } = useMastery();
  const daily = useDaily();
  const today = localDate(Date.now());
  const recent = useLiveQuery(
    async () => new Set((await repo.db.reviewLog.where('ts').above(Date.now() - 14 * DAY).toArray()).filter((l) => l.direct).map((l) => l.itemId)),
    [],
    new Set<ItemId>(),
  );

  return (
    <>
      <h1 className="page-title" style={{ marginTop: 20 }}>
        Progreso
      </h1>
      <div className="card stats-row" style={{ marginTop: 8 }}>
        <div className="stat">
          <b className="num">{streak(daily, today)}</b>
          <span>días de racha</span>
        </div>
        <div className="stat">
          <b className="num">{daily.find((d) => d.date === today)?.xp ?? 0}</b>
          <span>XP hoy</span>
        </div>
        <div className="stat">
          <b className="num">{xpInRange(daily, weekStart(today), today)}</b>
          <span>XP semana</span>
        </div>
      </div>

      <h2 className="section-title">
        Preparación por nivel <small>≥ Familiar = listo</small>
      </h2>
      <div className="card">
        {LEVELS.map((l) => (
          <LevelRow key={l} level={l} mastery={mastery} recent={recent} />
        ))}
      </div>

      <Calendar daily={daily} today={today} />
      <Rankings mastery={mastery} />
      <SyncCard />
      <SettingsCard />
      <BackupCard />

      <p className="faint" style={{ fontSize: 13, marginTop: 24 }}>
        Contenido {meta.version} · <Link to="/fuentes">Fuentes y licencias</Link>
      </p>
    </>
  );
}

function stageCounts(ids: ItemId[], mastery: Map<ItemId, Mastery> | null) {
  const c: Record<Stage, number> = { nuevo: 0, visto: 0, aprendiendo: 0, familiar: 0, dominado: 0 };
  for (const id of ids) c[mastery?.get(id)?.stage ?? 'nuevo']++;
  return c;
}

function Stacked({ counts, total, label }: { counts: Record<Stage, number>; total: number; label: string }) {
  return (
    <div className="stacked" role="img" aria-label={`${label}: ${STAGES.map((s) => `${counts[s]} ${STAGE_LABEL[s]}`).join(', ')}`}>
      {STAGES.slice(1).map((s) => (
        <span key={s} style={{ width: `${(counts[s] / total) * 100}%`, background: `var(--st-${s})` }} />
      ))}
    </div>
  );
}

function LevelRow({ level, mastery, recent }: { level: 1 | 2 | 3; mastery: Map<ItemId, Mastery> | null; recent: Set<ItemId> }) {
  const wIds = words.filter((w) => w.level === level).map((w) => wordItem(w.id));
  const cIds = chars.filter((c) => charWordLevel.get(c.char) === level).map((c) => charItem(c.char));
  const wc = stageCounts(wIds, mastery);
  const cc = stageCounts(cIds, mastery);
  const ready = wc.familiar + wc.dominado;
  const pct = Math.round((ready / wIds.length) * 100);
  const gained = wIds.filter((id) => recent.has(id) && ['familiar', 'dominado'].includes(mastery?.get(id)?.stage ?? '')).length;
  const eta = daysToReady(wIds.length, ready, gained);
  return (
    <div className="level-row">
      <b>HSK {level}</b>
      <div className="stack" style={{ gap: 6 }}>
        <Stacked counts={wc} total={wIds.length} label={`Palabras HSK ${level}`} />
        <Stacked counts={cc} total={cIds.length} label={`Caracteres HSK ${level}`} />
        <span className="faint" style={{ fontSize: 12 }}>
          {wIds.length} palabras · {cIds.length} caracteres ·{' '}
          {eta === 0 ? '¡listo!' : eta === null ? 'sin ritmo aún' : `≈ ${eta} días al ritmo actual`}
        </span>
      </div>
      <span className="display num" style={{ fontSize: 20, fontWeight: 600 }}>
        {pct}%
      </span>
    </div>
  );
}

function Calendar({ daily, today }: { daily: { date: string; xp: number }[]; today: string }) {
  const settings = useSettings();
  const weeks = 15;
  const start = addDays(weekStart(today), -7 * (weeks - 1));
  const byDate = new Map(daily.map((d) => [d.date, d.xp]));
  const cells = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
  const shade = (xp: number) => {
    if (!xp) return 'var(--paper-2)';
    const r = Math.min(1, xp / settings.dailyGoalXp);
    return r >= 1 ? 'var(--st-familiar)' : r >= 0.5 ? 'var(--st-aprendiendo)' : 'var(--st-visto)';
  };
  return (
    <>
      <h2 className="section-title">
        Actividad <small>meta {settings.dailyGoalXp} XP/día</small>
      </h2>
      <div className="card">
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${weeks}, 1fr)`, gridAutoFlow: 'column', gridTemplateRows: 'repeat(7, 1fr)', gap: 3 }} role="img" aria-label="Calendario de actividad de las últimas semanas">
          {cells.map((d) => (
            <span
              key={d}
              title={`${d}: ${byDate.get(d) ?? 0} XP`}
              style={{ aspectRatio: '1', borderRadius: 3, background: d > today ? 'transparent' : shade(byDate.get(d) ?? 0), outline: d === today ? '1.5px solid var(--ink)' : undefined }}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function Rankings({ mastery }: { mastery: Map<ItemId, Mastery> | null }) {
  const [kind, setKind] = useState<'c' | 'w'>('c');
  const practiced = useMemo(
    () => [...(mastery?.values() ?? [])].filter((m) => itemKind(m.itemId) === kind && m.peakXp > 0),
    [mastery, kind],
  );
  const strong = [...practiced].sort((a, b) => b.effectiveXp - a.effectiveXp).slice(0, 20);
  const weak = [...practiced].sort((a, b) => Number(b.weak) - Number(a.weak) || a.effectiveXp - b.effectiveXp).slice(0, 20);
  return (
    <>
      <h2 className="section-title">Ranking</h2>
      <div className="chips" role="group" aria-label="Tipo" style={{ marginBottom: 10 }}>
        <button type="button" className="chip" aria-pressed={kind === 'c'} onClick={() => setKind('c')}>
          Caracteres
        </button>
        <button type="button" className="chip" aria-pressed={kind === 'w'} onClick={() => setKind('w')}>
          Palabras
        </button>
      </div>
      {practiced.length === 0 ? (
        <p className="muted">Practica unas cuantas palabras y aquí verás tus 20 más fuertes y más débiles.</p>
      ) : (
        <div className="stack">
          <RankGrid title="20 más fuertes" list={strong} />
          <RankGrid title="20 más débiles" list={weak} />
        </div>
      )}
    </>
  );
}

function RankGrid({ title, list }: { title: string; list: Mastery[] }) {
  return (
    <div>
      <h3 style={{ fontSize: 14, margin: '6px 0 8px' }}>{title}</h3>
      <div className="rank">
        {list.map((m) => (
          <Link key={m.itemId} to={`/ficha/${itemKind(m.itemId)}/${encodeURIComponent(itemKey(m.itemId))}`} style={m.weak ? { borderColor: 'var(--seal)' } : undefined}>
            <span className="han" lang="zh-CN">
              {viewOf(m.itemId)?.hanzi}
            </span>
            <small>
              nv {m.level}
              {m.weak ? ' · débil' : ''}
            </small>
          </Link>
        ))}
      </div>
    </div>
  );
}

function SettingsCard() {
  const s = useSettings();
  const save = (patch: Parameters<typeof repo.saveSettings>[0]) => repo.saveSettings(patch);
  const num = (v: string, min: number, max: number) => Math.max(min, Math.min(max, Math.round(Number(v) || min)));
  return (
    <>
      <h2 className="section-title" id="ajustes">
        Ajustes
      </h2>
      <div className="card">
        <div className="field">
          <label htmlFor="goal">
            Meta diaria<small>XP por día</small>
          </label>
          <input id="goal" type="number" min={10} max={1000} step={10} value={s.dailyGoalXp} onChange={(e) => save({ dailyGoalXp: num(e.target.value, 10, 1000) })} />
        </div>
        <div className="field">
          <label htmlFor="new">
            Palabras nuevas<small>por día</small>
          </label>
          <input id="new" type="number" min={0} max={50} value={s.newPerDay} onChange={(e) => save({ newPerDay: num(e.target.value, 0, 50) })} />
        </div>
        <div className="field">
          <span>
            <label>Niveles activos</label>
            <small>de dónde salen las palabras nuevas</small>
          </span>
          <div className="chips">
            {LEVELS.map((l) => {
              const on = s.levels.includes(l);
              const hasEs = words.some((w) => w.level === l && w.es.length);
              return (
                <button
                  key={l}
                  type="button"
                  className="chip"
                  aria-pressed={on}
                  disabled={!hasEs}
                  title={hasEs ? undefined : 'Contenido en español en preparación'}
                  onClick={() => save({ levels: on ? s.levels.filter((x) => x !== l) : [...s.levels, l].sort() })}
                >
                  {l}
                </button>
              );
            })}
          </div>
        </div>
        <div className="field">
          <label htmlFor="pinyin">
            Mostrar pinyin<small>junto al hanzi en las preguntas</small>
          </label>
          <input id="pinyin" type="checkbox" checked={s.showPinyin} onChange={(e) => save({ showPinyin: e.target.checked })} style={{ width: 22, height: 22 }} />
        </div>
        <div className="field">
          <label htmlFor="theme">Tema</label>
          <select id="theme" value={s.theme} onChange={(e) => save({ theme: e.target.value as ThemePref })}>
            <option value="system">Sistema</option>
            <option value="light">Claro</option>
            <option value="dark">Oscuro</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="rate">
            Velocidad de la voz<small>{s.speechRate.toFixed(2)}×</small>
          </label>
          <input id="rate" type="range" min={0.5} max={1.2} step={0.05} value={s.speechRate} onChange={(e) => save({ speechRate: Number(e.target.value) })} style={{ width: 120 }} />
        </div>
      </div>
    </>
  );
}

function BackupCard() {
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const exportNow = async () => {
    const json = serializeBackup(await repo.exportAll(meta.version));
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `hanzi-xp-respaldo-${localDate(Date.now())}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg('Respaldo descargado.');
  };
  const importNow = async (f: File) => {
    if (!confirm('Importar reemplazará TODO tu progreso actual por el del archivo. ¿Continuar?')) return;
    try {
      const r = await repo.importAll(await f.text());
      setMsg(`Importado: ${r.states} estados y ${r.logs} registros.`);
    } catch (e) {
      setMsg(`No se pudo importar: ${(e as Error).message}`);
    }
  };
  return (
    <>
      <h2 className="section-title">Respaldo</h2>
      <div className="card stack">
        <p className="muted" style={{ margin: 0 }}>
          Copia manual de todo tu progreso en un archivo JSON (útil aunque uses la sincronización).
        </p>
        <div className="grid-2">
          <button type="button" className="btn" onClick={exportNow}>
            Exportar
          </button>
          <button type="button" className="btn" onClick={() => file.current?.click()}>
            Importar…
          </button>
        </div>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importNow(e.target.files[0])} />
        {msg && (
          <p className="notice" role="status" style={{ margin: 0 }}>
            {msg}
          </p>
        )}
      </div>
    </>
  );
}
