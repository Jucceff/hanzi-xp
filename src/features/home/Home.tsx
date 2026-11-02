import { useMemo } from 'react';
import { Link } from 'react-router';
import { useVoiceAvailable } from '../../app/audio';
import { planSession, newLeftToday } from '../../app/plan';
import { useDaily, useMastery, useSettings } from '../../app/progress';
import { viewOf } from '../../content';
import { streak, weekStart, xpInRange } from '../../core/stats';
import { itemKind, itemKey } from '../../core/skills';
import { localDate } from '../../db/repo';
import { Empty, Icon, Seal } from '../../ui/components';
import { useSyncStatus } from '../progress/SyncCard';

export function Home() {
  const settings = useSettings();
  const voice = useVoiceAvailable();
  const daily = useDaily();
  const { states, scheduler, mastery } = useMastery();
  const today = localDate(Date.now());
  const todayXp = daily.find((d) => d.date === today)?.xp ?? 0;
  const goalPct = Math.min(100, Math.round((todayXp / settings.dailyGoalXp) * 100));

  const queue = useMemo(
    () => (states && scheduler ? planSession('hoy', states, settings, daily, scheduler, { audio: voice }) : []),
    [states, scheduler, settings, daily, voice],
  );
  const dueCount = queue.filter((q) => q.reason !== 'new').length;
  const newCount = new Set(queue.filter((q) => q.reason === 'new').map((q) => q.itemId)).size;
  const practicedAny = states?.some((s) => s.card) ?? false;
  const loading = !states || !scheduler;

  const weakest = useMemo(() => {
    if (!mastery) return [];
    return [...mastery.values()]
      .filter((m) => m.weak && itemKind(m.itemId) === 'w')
      .sort((a, b) => a.effectiveXp - b.effectiveXp)
      .slice(0, 5);
  }, [mastery]);

  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="han" aria-hidden="true">
            汉
          </span>
          <span className="display">Hanzi XP</span>
        </Link>
        <span className="row" style={{ gap: 6 }}>
          <SyncBadge />
          <span className="tag" title="Niveles activos">
            HSK {settings.levels.join(' · ')}
          </span>
        </span>
      </header>

      <section className="card hero" aria-labelledby="hoy">
        <span className="hero-bg han" aria-hidden="true">
          今
        </span>
        <div className="goal">
          <div className="ring" style={{ ['--p' as string]: goalPct }} role="img" aria-label={`Meta diaria: ${todayXp} de ${settings.dailyGoalXp} XP`}>
            <div>
              <div>
                <strong className="num">{todayXp}</strong>
                <br />
                <span>/ {settings.dailyGoalXp} XP</span>
              </div>
            </div>
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <h1 id="hoy" className="page-title" style={{ margin: 0 }}>
              {goalPct >= 100 ? '¡Meta cumplida!' : todayXp ? 'Sigue así' : 'Hoy toca'}
            </h1>
            <p className="muted" style={{ margin: 0 }}>
              {loading ? 'Cargando…' : `${dueCount} repasos · ${newCount} nuevas`}
            </p>
          </div>
        </div>
        <div className="stats-row">
          <div className="stat">
            <b className="num">
              {streak(daily, today)} <span aria-hidden="true">🔥</span>
            </b>
            <span>días de racha</span>
          </div>
          <div className="stat">
            <b className="num">{xpInRange(daily, weekStart(today), today)}</b>
            <span>XP esta semana</span>
          </div>
          <div className="stat">
            <b className="num">{mastery ? [...mastery.values()].filter((m) => m.stage === 'familiar' || m.stage === 'dominado').length : 0}</b>
            <span>familiares+</span>
          </div>
        </div>
      </section>

      <div className="stack" style={{ marginTop: 16 }}>
        <Link className="btn primary block" to="/sesion/hoy" aria-disabled={queue.length === 0} onClick={(e) => queue.length === 0 && e.preventDefault()}>
          <Icon name="play" />
          {loading ? 'Cargando…' : queue.length ? `Empezar sesión (${queue.length})` : 'Nada pendiente por hoy'}
        </Link>
        <div className="grid-2">
          <Link className="btn" to="/sesion/debilidades" aria-disabled={!practicedAny} onClick={(e) => !practicedAny && e.preventDefault()}>
            Debilidades
          </Link>
          <Link className="btn" to="/sesion/tonos" aria-disabled={!voice} onClick={(e) => !voice && e.preventDefault()} title={voice ? 'Pares mínimos y tonos' : 'Necesita voz china'}>
            Tonos <span className="han" aria-hidden="true">ā á ǎ à</span>
          </Link>
        </div>
        {!loading && !queue.length && newLeftToday(settings, daily) === 0 && (
          <p className="notice">Ya presentaste {settings.newPerDay} palabras nuevas hoy. Puedes subir el límite en Progreso → Ajustes.</p>
        )}
        {!voice && (
          <p className="notice">
            No hay voz china (zh-CN) en este dispositivo: el audio puede no sonar. En Windows: Configuración → Hora e idioma → Voz → agregar voz «Chino (simplificado)».
          </p>
        )}
      </div>

      <h2 className="section-title">
        Para reforzar <small>marcadas como débiles</small>
      </h2>
      {weakest.length ? (
        <ul className="items">
          {weakest.map((m) => {
            const v = viewOf(m.itemId)!;
            return (
              <li key={m.itemId}>
                <Link className="item-row" to={`/ficha/${itemKind(m.itemId)}/${encodeURIComponent(itemKey(m.itemId))}`}>
                  <span className="han">{v.hanzi}</span>
                  <span className="meta">
                    <div className="py">{v.pinyin}</div>
                    <div className="muted">{v.meaning}</div>
                  </span>
                  <Seal level={m.level} size={36} />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="card">
          <Empty han="好">Nada débil por ahora. Los fallos aparecerán aquí para que los repases.</Empty>
        </div>
      )}
    </>
  );
}

function SyncBadge() {
  const st = useSyncStatus();
  if (st.phase === 'off') return null;
  const label = st.phase === 'syncing' ? 'Sincronizando…' : st.phase === 'error' ? 'Sin sincronizar' : 'Sincronizado';
  return (
    <Link to="/progreso" className={`tag${st.phase === 'error' ? ' weak' : ''}`} title={st.message ?? label} style={{ textDecoration: 'none' }}>
      {st.phase === 'syncing' ? '⟳' : st.phase === 'error' ? '!' : '☁'} {label}
    </Link>
  );
}
