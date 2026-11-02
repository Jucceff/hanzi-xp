import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useMastery } from '../../app/progress';
import { LEVELS, chars, charWordLevel } from '../../content';
import { STAGE_LABEL, stageOf, type Stage } from '../../core/mastery';
import { toneOf } from '../../core/pinyin';
import { SKILLS, SKILL_LABEL, charItem, type Skill } from '../../core/skills';

const STAGES: Stage[] = ['nuevo', 'visto', 'aprendiendo', 'familiar', 'dominado'];
type LevelFilter = 1 | 2 | 3 | 'all';
type ToneFilter = 1 | 2 | 3 | 4 | 5 | 'all';

export function MapPage() {
  const { mastery } = useMastery();
  const [level, setLevel] = useState<LevelFilter>(1);
  const [skill, setSkill] = useState<Skill | 'all'>('all');
  const [tone, setTone] = useState<ToneFilter>('all');
  const [radical, setRadical] = useState('');

  const list = useMemo(
    () =>
      chars.filter(
        (c) =>
          (level === 'all' || charWordLevel.get(c.char) === level) &&
          (tone === 'all' || toneOf(c.pinyin[0] ?? '') === tone) &&
          (!radical || c.radical === radical),
      ),
    [level, tone, radical],
  );
  const radicals = useMemo(() => {
    const count = new Map<string, number>();
    for (const c of chars) count.set(c.radical, (count.get(c.radical) ?? 0) + 1);
    return [...count.entries()].filter(([, n]) => n >= 4).sort((a, b) => b[1] - a[1]);
  }, []);

  const stageFor = (ch: string): { stage: Stage; weak: boolean; lvl: number } => {
    const m = mastery?.get(charItem(ch));
    if (!m) return { stage: 'nuevo', weak: false, lvl: 0 };
    if (skill === 'all') return { stage: m.stage, weak: m.weak, lvl: m.level };
    const s = m.skills[skill];
    const lvl = s?.level ?? 0;
    return { stage: stageOf(lvl), weak: Boolean(s?.weak), lvl };
  };
  const counts = STAGES.map((s) => list.filter((c) => stageFor(c.char).stage === s).length);

  return (
    <>
      <h1 className="page-title" style={{ marginTop: 20 }}>
        Mapa de caracteres
      </h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {list.length} caracteres · el color indica tu dominio actual{skill !== 'all' && ` en ${SKILL_LABEL[skill].toLowerCase()}`}.
      </p>

      <div className="stack" style={{ gap: 10 }}>
        <div className="chips" role="group" aria-label="Nivel HSK">
          {LEVELS.map((l) => (
            <button key={l} type="button" className="chip" aria-pressed={level === l} onClick={() => setLevel(l)}>
              HSK {l}
            </button>
          ))}
          <button type="button" className="chip" aria-pressed={level === 'all'} onClick={() => setLevel('all')}>
            Todos
          </button>
        </div>
        <div className="chips" role="group" aria-label="Habilidad">
          <button type="button" className="chip" aria-pressed={skill === 'all'} onClick={() => setSkill('all')}>
            Global
          </button>
          {SKILLS.map((s) => (
            <button key={s} type="button" className="chip" aria-pressed={skill === s} onClick={() => setSkill(s)}>
              {SKILL_LABEL[s]}
            </button>
          ))}
        </div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <label className="row" style={{ gap: 6, fontSize: 14, fontWeight: 600 }}>
            Tono
            <select value={tone} onChange={(e) => setTone(e.target.value === 'all' ? 'all' : (Number(e.target.value) as ToneFilter))} className="chip">
              <option value="all">todos</option>
              {[1, 2, 3, 4, 5].map((t) => (
                <option key={t} value={t}>
                  {t === 5 ? 'neutro' : `${t}.º`}
                </option>
              ))}
            </select>
          </label>
          <label className="row" style={{ gap: 6, fontSize: 14, fontWeight: 600 }}>
            Radical
            <select value={radical} onChange={(e) => setRadical(e.target.value)} className="chip han">
              <option value="">todos</option>
              {radicals.map(([r, n]) => (
                <option key={r} value={r}>
                  {r} ({n})
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="legend" aria-label="Leyenda">
        {STAGES.map((s, i) => (
          <span key={s}>
            <i style={{ background: `var(--st-${s})` }} />
            {STAGE_LABEL[s]} <b className="num">{counts[i]}</b>
          </span>
        ))}
        <span>
          <i style={{ background: 'var(--seal)', borderRadius: '50%', width: 8, height: 8 }} /> débil
        </span>
      </div>

      <div className="heat">
        {list.map((c) => {
          const { stage, weak, lvl } = stageFor(c.char);
          return (
            <Link
              key={c.char}
              to={`/ficha/c/${encodeURIComponent(c.char)}`}
              className={`tile${weak ? ' weak' : ''}`}
              data-stage={stage}
              lang="zh-CN"
              aria-label={`${c.char}, ${c.pinyin[0]}, nivel ${lvl} ${STAGE_LABEL[stage]}${weak ? ', débil' : ''}`}
            >
              {c.char}
            </Link>
          );
        })}
      </div>
    </>
  );
}
