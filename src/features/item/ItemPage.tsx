import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useParams } from 'react-router';
import { repo, useMastery, type Mastery } from '../../app/progress';
import { charByChar, charItem, viewOf, wordById, wordItem } from '../../content';
import type { ReviewLogEntry } from '../../core/engine';
import { STAGE_LABEL, levelFromXp } from '../../core/mastery';
import { SKILL_HINT, SKILL_LABEL, skillsFor, type ItemId, type ItemKind } from '../../core/skills';
import { Icon, Seal, SpeakButton, XpBar } from '../../ui/components';
import { StrokeOrder } from '../../ui/StrokeOrder';

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString('es', { day: 'numeric', month: 'short' });
const fmtDue = (ms: number) => {
  const d = ms - Date.now();
  if (d <= 0) return 'pendiente ahora';
  const h = d / 3_600_000;
  if (h < 24) return `en ${Math.max(1, Math.round(h))} h`;
  return `en ${Math.round(h / 24)} días (${fmtDate(ms)})`;
};

export function ItemPage() {
  const { kind = 'w', key = '' } = useParams();
  const navigate = useNavigate();
  const id = (kind === 'c' ? charItem(key) : wordItem(key)) as ItemId;
  const view = viewOf(id);
  const { mastery } = useMastery();
  const logs = useLiveQuery(() => repo.logsFor(id), [id], [] as ReviewLogEntry[]);
  if (!view) return <p>No encontrado.</p>;
  const m = mastery?.get(id);
  const word = kind === 'w' ? wordById.get(key) : undefined;
  const char = kind === 'c' ? charByChar.get(key) : undefined;
  const pinyinNum = word?.pinyinNum;

  return (
    <article>
      <header className="topbar">
        <button type="button" className="icon-btn" aria-label="Volver" onClick={() => navigate(-1)}>
          <Icon name="back" />
        </button>
        <div className="row">
          <span className="tag">HSK {view.level}</span>
          {char?.handwritingLevel && <span className="tag">书写 HSK {char.handwritingLevel}</span>}
          {m?.weak && <span className="tag weak">débil</span>}
        </div>
      </header>

      <section className="item-head">
        <div className={`mizige han${view.hanzi.length > 1 ? ' long' : ''}`} lang="zh-CN">
          {view.hanzi}
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <div className="row">
            <span className="py">{view.pinyin}</span>
            <SpeakButton text={view.hanzi} pinyinNum={pinyinNum} />
          </div>
          <h1 className="display" style={{ fontSize: 21, fontWeight: 600, lineHeight: 1.2 }}>
            {view.meanings.join(' · ')}
          </h1>
          {(word?.trad ?? char?.trad) !== view.hanzi && (
            <span className="faint">
              Tradicional: <span className="han">{word?.trad ?? char?.trad}</span>
            </span>
          )}
          {word && <span className="faint">{word.pos.join(' · ')}</span>}
        </div>
      </section>

      <Overall m={m} kind={kind as ItemKind} />

      <h2 className="section-title">Por habilidad</h2>
      <div className="card stack">
        {skillsFor(kind as ItemKind).map((s) => {
          const sk = m?.skills[s];
          return (
            <div className="skill-row" key={s} title={SKILL_HINT[s]}>
              <span className="label">
                {SKILL_LABEL[s]} {sk?.weak && <span className="tag weak">débil</span>}
              </span>
              <span className="value num">
                {sk ? `nv ${sk.level} · ${Math.round(sk.effective)}/${sk.xp} XP` : '—'}
                {sk && sk.correct + sk.wrong > 0 && ` · ${sk.correct}✓ ${sk.wrong}✗`}
              </span>
              <XpBar xp={sk?.effective ?? 0} peak={sk?.xp} thin label={SKILL_LABEL[s]} />
            </div>
          );
        })}
        {m?.nextDue && <p className="faint" style={{ margin: 0 }}>Próximo repaso: {fmtDue(m.nextDue)}</p>}
        {!m && <p className="faint" style={{ margin: 0 }}>Aún no lo has practicado.</p>}
      </div>

      {logs.length > 0 && (
        <>
          <h2 className="section-title">
            Evolución <small>{logs.length} registros</small>
          </h2>
          <div className="card stack">
            <XpChart logs={logs} />
            <div className="history" aria-label="Historial de aciertos y errores (los tenues vienen de palabras)">
              {logs.slice(-60).map((l) => (
                <i key={l.id} className={`${l.correct ? '' : 'no'} ${l.direct ? '' : 'via'}`} title={`${fmtDate(l.ts)} · ${SKILL_LABEL[l.skill]} · ${l.xpDelta >= 0 ? '+' : ''}${l.xpDelta} XP${l.via ? ` (vía ${viewOf(l.via)?.hanzi})` : ''}`} />
              ))}
            </div>
          </div>
        </>
      )}

      {char && (
        <>
          <h2 className="section-title">Trazos y estructura</h2>
          <div className="card stack">
            <StrokeOrder char={char.char} />
            <dl className="kv">
              <dt>Radical</dt>
              <dd className="han">{char.radical}</dd>
              <dt>Componentes</dt>
              <dd className="han">{char.components.join(' ') || '—'}</dd>
              <dt>Trazos</dt>
              <dd className="num">{char.strokes}</dd>
              <dt>Lecturas</dt>
              <dd className="py">{char.pinyin.join(' · ')}</dd>
              <dt>Frecuencia</dt>
              <dd className="num">#{char.freqRank}</dd>
              {char.etymology && (
                <>
                  <dt>Origen</dt>
                  <dd lang="en">{char.etymology}</dd>
                </>
              )}
            </dl>
          </div>
          <h2 className="section-title">
            Aparece en <small>{char.words.length} palabras HSK</small>
          </h2>
          <RelatedList ids={char.words.map(wordItem)} mastery={mastery} />
        </>
      )}

      {word && (
        <>
          <h2 className="section-title">Caracteres</h2>
          <RelatedList ids={[...new Set(word.chars)].map(charItem)} mastery={mastery} />
          {word.examples.length > 0 && (
            <>
              <h2 className="section-title">Ejemplos</h2>
              <div className="card">
                {word.examples.map((e, i) => (
                  <div className="example" key={i}>
                    <span className="zh han" lang="zh-CN">
                      {e.zh}
                    </span>
                    <span className="py">{e.pinyin}</span>
                    <span className="es">
                      {e.es} <span className="src">· {e.source === 'tatoeba' ? `Tatoeba #${e.ref}` : 'redactado'}</span>
                    </span>
                    <SpeakButton text={e.zh} label="Escuchar la frase" />
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </article>
  );
}

function Overall({ m, kind }: { m: Mastery | undefined; kind: ItemKind }) {
  const level = m?.level ?? 0;
  return (
    <section className="card" style={{ marginTop: 16 }} aria-label="Dominio global">
      <div className="row" style={{ marginBottom: 10 }}>
        <Seal level={level} size={52} />
        <div style={{ flex: 1 }}>
          <div className="display" style={{ fontSize: 20, fontWeight: 600 }}>
            {STAGE_LABEL[m?.stage ?? 'nuevo']}
          </div>
          <div className="faint num" style={{ fontSize: 13 }}>
            Dominio {Math.round(m?.effectiveXp ?? 0)} XP · pico {Math.round(m?.peakXp ?? 0)} XP
            {m && m.peakLevel > level && ` (llegó a nivel ${m.peakLevel})`}
          </div>
        </div>
      </div>
      <XpBar xp={m?.effectiveXp ?? 0} peak={m?.peakXp} label="Dominio global" />
      <p className="faint" style={{ fontSize: 12, margin: '8px 0 0' }}>
        {kind === 'c' ? 'Incluye el XP que llega desde las palabras que lo contienen.' : 'Al practicar esta palabra también suben sus caracteres.'} El dominio baja si no lo repasas.
      </p>
    </section>
  );
}

function RelatedList({ ids, mastery }: { ids: ItemId[]; mastery: Map<ItemId, Mastery> | null }) {
  return (
    <ul className="items">
      {ids.map((id) => {
        const v = viewOf(id);
        if (!v) return null;
        const m = mastery?.get(id);
        return (
          <li key={id}>
            <Link className="item-row" to={`/ficha/${v.kind}/${encodeURIComponent(id.slice(2))}`}>
              <span className="han" lang="zh-CN">
                {v.hanzi}
              </span>
              <span className="meta">
                <div className="py">{v.pinyin}</div>
                <div className="muted">{v.meaning}</div>
              </span>
              <Seal level={m?.level ?? 0} size={34} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** XP acumulado del ítem en el tiempo (directo + propagado). */
function XpChart({ logs }: { logs: ReviewLogEntry[] }) {
  const W = 320;
  const H = 110;
  let acc = 0;
  const pts = logs.map((l) => {
    acc = Math.max(0, acc + l.xpDelta);
    return { t: l.ts, xp: acc };
  });
  const t0 = pts[0].t;
  const t1 = Math.max(pts[pts.length - 1].t, t0 + 1);
  const maxXp = Math.max(10, ...pts.map((p) => p.xp));
  const x = (t: number) => 8 + ((t - t0) / (t1 - t0)) * (W - 16);
  const y = (v: number) => H - 14 - (v / maxXp) * (H - 28);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.xp).toFixed(1)}`).join(' ');
  const lvl = levelFromXp(maxXp);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`XP acumulado: ${Math.round(acc)} XP`}>
      <line x1="8" x2={W - 8} y1={H - 14} y2={H - 14} stroke="var(--line)" />
      <path d={`${d} L${x(pts[pts.length - 1].t)},${H - 14} L${x(t0)},${H - 14} Z`} fill="color-mix(in srgb, var(--seal) 12%, transparent)" />
      <path d={d} fill="none" stroke="var(--seal)" strokeWidth="2" strokeLinejoin="round" />
      <text x="8" y="12" fontSize="11" fill="var(--ink-3)">
        {Math.round(maxXp)} XP (nv {lvl})
      </text>
      <text x={W - 8} y={H - 2} fontSize="11" fill="var(--ink-3)" textAnchor="end">
        {fmtDate(t1)}
      </text>
      <text x="8" y={H - 2} fontSize="11" fill="var(--ink-3)">
        {fmtDate(t0)}
      </text>
    </svg>
  );
}
