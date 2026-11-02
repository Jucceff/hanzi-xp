import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { say } from '../../app/audio';
import { readExposure, repo, useMastery, useSettings } from '../../app/progress';
import { readingById, wordById, type Reading } from '../../content';
import type { SentenceToken } from '../../content/types';
import { wordItem } from '../../core/skills';
import { READING_SESSION } from '../../db/repo';
import { Empty, Icon, Seal, SpeakButton } from '../../ui/components';

export function ReaderPage() {
  const { id = '' } = useParams();
  const r = readingById.get(id);
  if (!r) return <Empty han="无">No existe esta lectura.</Empty>;
  return <Reader key={id} r={r} />;
}

type Phase = 'reading' | 'questions' | 'done';

/** Agrupa cada palabra con la puntuación que la sigue (y las comillas de apertura con la siguiente). */
function groups(tokens: SentenceToken[]) {
  const out: { t: SentenceToken; k: number }[][] = [];
  let opening = false;
  tokens.forEach((t, k) => {
    if (!t.p && /^[“‘《（「]+$/.test(t.t)) {
      out.push([{ t, k }]);
      opening = true;
    } else if ((!t.p || opening) && out.length) {
      out[out.length - 1].push({ t, k });
      opening = false;
    } else out.push([{ t, k }]);
  });
  return out;
}

function Reader({ r }: { r: Reading }) {
  const navigate = useNavigate();
  const settings = useSettings();
  const { mastery } = useMastery();
  const [pinyin, setPinyin] = useState(settings.showPinyin);
  const [shownEs, setShownEs] = useState<Set<number>>(new Set());
  const [consulted, setConsulted] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState<SentenceToken | null>(null);
  const [phase, setPhase] = useState<Phase>('reading');
  const [answers, setAnswers] = useState<number[]>([]);
  const [xp, setXp] = useState(0);
  const sessionId = useMemo(() => `${READING_SESSION}${r.id}:${crypto.randomUUID()}`, [r.id]);

  const open = (t: SentenceToken) => {
    setSheet(t);
    if (t.w) setConsulted((c) => new Set(c).add(t.w!));
    say(t.t, t.w ? wordById.get(t.w)?.pinyinNum : undefined, settings.speechRate);
  };

  const finish = async () => {
    // caracteres leídos sin consultar → +1 de reconocimiento; lo consultado se adelanta para repasarlo
    const chars = r.paragraphs.flatMap((p) => p.tokens).filter((t) => t.w && !consulted.has(t.w)).flatMap((t) => [...t.t]);
    const out = await readExposure(chars, sessionId);
    await repo.bringForward([...consulted].map(wordItem), 'recognition');
    setXp(out.xpGained);
    setPhase(r.questions.length ? 'questions' : 'done');
    window.scrollTo({ top: 0 });
  };

  return (
    <article className="reader">
      <header className="topbar">
        <button type="button" className="icon-btn" aria-label="Volver" onClick={() => navigate(-1)}>
          <Icon name="back" />
        </button>
        {phase === 'reading' && (
          <div className="row" style={{ gap: 6 }}>
            <button type="button" className="chip" aria-pressed={pinyin} onClick={() => setPinyin(!pinyin)}>
              Pinyin
            </button>
            <button type="button" className="chip" onClick={() => say(r.paragraphs.map((p) => p.zh).join(''), undefined, settings.speechRate)}>
              ▶ Todo
            </button>
          </div>
        )}
      </header>
      <span className="tag">HSK {r.level}</span>
      <h1 className="page-title han" lang="zh-CN" style={{ fontFamily: 'var(--font-han)', fontWeight: 400 }}>
        {r.titleZh}
      </h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {r.title}
      </p>

      {phase === 'reading' && (
        <>
          <div className="stack" style={{ gap: 18 }}>
            {r.paragraphs.map((p, i) => (
              <div key={i} className="para">
                <p className={`reading-text${pinyin ? ' with-py' : ''}`} lang="zh-CN">
                  {groups(p.tokens).map((g, j) => (
                    // la puntuación va pegada a la palabra anterior: nunca empieza una línea
                    <span key={j} className="rg">
                      {g.map(({ t, k }) =>
                        t.p ? (
                          <button
                            key={k}
                            type="button"
                            className={`rt${t.w && consulted.has(t.w) ? ' consulted' : ''}${t.w && !mastery?.get(wordItem(t.w)) ? ' unseen' : ''}`}
                            onClick={() => open(t)}
                          >
                            {pinyin && <small className="py">{t.p}</small>}
                            <span className="han">{t.t}</span>
                          </button>
                        ) : (
                          <span key={k} className="han rp">
                            {t.t}
                          </span>
                        ),
                      )}
                    </span>
                  ))}
                </p>
                <div className="row" style={{ gap: 6 }}>
                  <SpeakButton text={p.zh} rate={settings.speechRate} label="Escuchar el párrafo" />
                  <button type="button" className="chip" aria-pressed={shownEs.has(i)} onClick={() => setShownEs((s) => (s.has(i) ? new Set([...s].filter((x) => x !== i)) : new Set(s).add(i)))}>
                    Traducción
                  </button>
                </div>
                {shownEs.has(i) && <p className="es-line muted">{p.es}</p>}
              </div>
            ))}
          </div>
          <p className="faint" style={{ fontSize: 13 }}>
            Subrayadas: palabras que aún no has practicado. Consultadas: {consulted.size}.
          </p>
          <button type="button" className="btn primary block" onClick={finish}>
            Terminé de leer
          </button>
        </>
      )}

      {phase === 'questions' && (
        <Questions r={r} answers={answers} setAnswers={setAnswers} onDone={() => setPhase('done')} />
      )}

      {phase === 'done' && (
        <div className="stack">
          <div className="card stats-row">
            <div className="stat">
              <b className="num">+{xp}</b>
              <span>XP de lectura</span>
            </div>
            <div className="stat">
              <b className="num">{consulted.size}</b>
              <span>consultadas</span>
            </div>
            <div className="stat">
              <b className="num">
                {r.questions.length ? `${answers.filter((a, i) => a === r.questions[i].answer).length}/${r.questions.length}` : '—'}
              </b>
              <span>comprensión</span>
            </div>
          </div>
          {consulted.size > 0 && (
            <>
              <h2 className="section-title">Para repasar pronto</h2>
              <ul className="items">
                {[...consulted].map((wid) => {
                  const w = wordById.get(wid)!;
                  return (
                    <li key={wid}>
                      <Link className="item-row" to={`/ficha/w/${encodeURIComponent(wid)}`}>
                        <span className="han">{w.simp}</span>
                        <span className="meta">
                          <div className="py">{w.pinyin}</div>
                          <div className="muted">{w.es[0]}</div>
                        </span>
                        <Seal level={mastery?.get(wordItem(wid))?.level ?? 0} size={34} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          <Link className="btn primary block" to="/lecturas">
            Más lecturas
          </Link>
        </div>
      )}

      {sheet && <WordSheet t={sheet} onClose={() => setSheet(null)} rate={settings.speechRate} level={sheet.w ? mastery?.get(wordItem(sheet.w))?.level ?? 0 : 0} />}
    </article>
  );
}

function Questions({ r, answers, setAnswers, onDone }: { r: Reading; answers: number[]; setAnswers: React.Dispatch<React.SetStateAction<number[]>>; onDone: () => void }) {
  // (every() se salta los huecos de un array disperso: se comprueba índice a índice)
  const all = r.questions.every((_, i) => answers[i] !== undefined);
  return (
    <div className="stack">
      <h2 className="section-title" style={{ marginTop: 6 }}>
        Comprensión
      </h2>
      {r.questions.map((q, i) => {
        const picked = answers[i];
        return (
          <div key={i} className="card stack" style={{ gap: 8 }}>
            <b>{q.q}</b>
            <div className="options">
              {q.options.map((o, j) => (
                <button
                  key={j}
                  type="button"
                  className="option"
                  style={{ minHeight: 48, fontSize: 16 }}
                  data-state={picked === undefined ? undefined : j === q.answer ? 'correct' : j === picked ? 'wrong' : 'dim'}
                  disabled={picked !== undefined}
                  onClick={() =>
                    setAnswers((prev) => {
                      const next = [...prev];
                      next[i] = j;
                      return next;
                    })
                  }
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      <button type="button" className="btn primary block" disabled={!all} onClick={onDone}>
        Ver resultado
      </button>
    </div>
  );
}

/** Ficha rápida de una palabra tocada en el texto. */
function WordSheet({ t, onClose, rate, level }: { t: SentenceToken; onClose: () => void; rate: number; level: number }) {
  const w = t.w ? wordById.get(t.w) : undefined;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={`Palabra ${t.t}`} onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ alignItems: 'center' }}>
          <span className="han" style={{ fontSize: 44 }} lang="zh-CN">
            {t.t}
          </span>
          <div style={{ flex: 1 }}>
            <div className="py" style={{ fontSize: 20 }}>
              {t.p}
            </div>
            <div style={{ fontWeight: 650 }}>{w ? (w.es.length ? w.es : w.en).join(' · ') : t.g}</div>
          </div>
          {w && <Seal level={level} size={40} />}
        </div>
        <div className="row" style={{ marginTop: 10, gap: 8 }}>
          <SpeakButton text={t.t} pinyinNum={w?.pinyinNum} rate={rate} />
          {w && (
            <>
              <span className="tag">HSK {w.level}</span>
              <Link className="btn ghost" to={`/ficha/w/${encodeURIComponent(w.id)}`} style={{ marginLeft: 'auto' }}>
                Ver ficha
              </Link>
            </>
          )}
          <button type="button" className="btn" onClick={onClose} style={w ? undefined : { marginLeft: 'auto' }}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
