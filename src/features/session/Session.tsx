import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { audioReady, say } from '../../app/audio';
import { specFor, type ExerciseSpec } from '../../app/exercises';
import { planSession, type SessionMode } from '../../app/plan';
import { answer, readExposure, repo, useSettings } from '../../app/progress';
import { IdentifyExercise, OrderExercise } from './SentenceExercises';
import { requestSync } from '../../sync/sync';
import { viewOf, wordById } from '../../content';
import type { ReviewOutcome } from '../../core/engine';
import { levelFromXp } from '../../core/mastery';
import type { QueueItem } from '../../core/queue';
import { getScheduler } from '../../core/scheduler';
import { SKILL_LABEL, itemKey, itemKind } from '../../core/skills';
import type { Grade } from '../../core/xp';
import { Empty, Icon, Seal, SpeakButton } from '../../ui/components';

interface Step {
  q: QueueItem;
  spec: ExerciseSpec;
  retry?: boolean;
}

interface Result {
  q: QueueItem;
  correct: boolean;
  outcome: ReviewOutcome;
}

const PROMPT_LABEL: Record<string, string> = {
  'flash-hanzi': '¿Qué significa?',
  'flash-meaning': '¿Cómo se escribe?',
  'hanzi-meaning': 'Elige el significado',
  'hanzi-pinyin': 'Elige el pinyin con su tono',
  'meaning-hanzi': 'Elige el hanzi',
  'audio-hanzi': 'Escucha y elige el hanzi',
  'audio-pinyin-pinyin': 'Escucha y elige los tonos',
};

export function Session() {
  const { mode = 'hoy' } = useParams();
  const navigate = useNavigate();
  const settings = useSettings();
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [toast, setToast] = useState<{ key: number; outcome: ReviewOutcome } | null>(null);
  const [audio, setAudio] = useState(false);
  const sessionId = useMemo(() => crypto.randomUUID(), []);

  // La cola se calcula una sola vez al entrar (no se re-planifica a mitad de sesión).
  useEffect(() => {
    let alive = true;
    (async () => {
      const [states, s, daily, scheduler, hasAudio] = await Promise.all([repo.allStates(), repo.getSettings(), repo.daily(), getScheduler(), audioReady()]);
      const queue = planSession(mode as SessionMode, states, s, daily, scheduler, { audio: hasAudio });
      if (!alive) return;
      setAudio(hasAudio);
      setSteps(queue.map((q) => ({ q, spec: specFor(q, { audio: hasAudio }) })));
    })();
    return () => {
      alive = false;
    };
  }, [mode]);

  const onAnswer = useCallback(
    async (grade: Grade) => {
      if (!steps) return;
      const step = steps[index];
      const outcome = await answer(step.q, step.spec.xpKind, grade, sessionId);
      // leer la frase completa también cuenta: +1 de reconocimiento a los demás caracteres
      if (grade > 1 && (step.spec.type === 'order' || step.spec.type === 'identify')) {
        const target = itemKey(step.q.itemId);
        const others = step.spec.sentence.tokens.filter((t) => t.w && t.w !== target).flatMap((t) => [...t.t]);
        if (others.length) void readExposure(others, sessionId);
      }
      setResults((r) => [...r, { q: step.q, correct: grade > 1, outcome }]);
      setToast({ key: Date.now(), outcome });
      if (grade === 1 && !step.retry) {
        // un fallo vuelve a aparecer unas tarjetas más tarde (una sola vez)
        setSteps((s) => {
          const copy = [...s!];
          copy.splice(Math.min(copy.length, index + 4), 0, { q: step.q, spec: specFor(step.q, { audio }), retry: true });
          return copy;
        });
      }
      setIndex((i) => i + 1);
    },
    [steps, index, sessionId, audio],
  );

  if (!steps) return <div className="session" aria-busy="true" />;

  const done = index >= steps.length;
  const step = steps[index];

  return (
    <div className="session">
      <div className="session-top">
        <button type="button" className="icon-btn" aria-label="Salir de la sesión" onClick={() => navigate('/')}>
          <Icon name="close" />
        </button>
        <div
          className="xpbar"
          role="progressbar"
          aria-label="Progreso de la sesión"
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={index}
        >
          <span className="now" style={{ width: `${steps.length ? (index / steps.length) * 100 : 100}%` }} />
        </div>
        <span className="faint num" style={{ fontSize: 13, fontWeight: 700 }}>
          {Math.min(index + 1, steps.length)}/{steps.length}
        </span>
      </div>

      {toast && <XpToast key={toast.key} outcome={toast.outcome} />}

      {steps.length === 0 ? (
        <div className="prompt">
          <Empty han="闲">
            {mode === 'debilidades'
              ? 'Aún no hay nada practicado que reforzar.'
              : mode === 'tonos' && !audio
                ? 'El entrenamiento de tonos necesita una voz china en el dispositivo.'
                : 'No hay nada pendiente ahora mismo.'}
          </Empty>
          <Link className="btn" to="/">
            Volver
          </Link>
        </div>
      ) : done ? (
        <Summary results={results} />
      ) : (
        <Exercise key={`${index}-${step.q.itemId}-${step.q.skill}`} step={step} showPinyin={settings.showPinyin} rate={settings.speechRate} onAnswer={onAnswer} />
      )}
    </div>
  );
}

function Exercise({ step, showPinyin, rate, onAnswer }: { step: Step; showPinyin: boolean; rate: number; onAnswer: (g: Grade) => void }) {
  const view = viewOf(step.q.itemId)!;
  const word = itemKind(step.q.itemId) === 'w' ? wordById.get(itemKey(step.q.itemId)) : undefined;
  const pinyinNum = word?.pinyinNum;
  const spec = step.spec;
  if (spec.type === 'order' || spec.type === 'identify') {
    const kicker = `${spec.type === 'order' ? 'Ordena la frase' : 'Encuentra en la frase'} · ${SKILL_LABEL[step.q.skill]}${step.retry ? ' · otra vez' : ''}`;
    return spec.type === 'order' ? (
      <OrderExercise spec={spec} kicker={kicker} showPinyin={showPinyin} rate={rate} onAnswer={onAnswer} />
    ) : (
      <IdentifyExercise spec={spec} kicker={kicker} showPinyin={showPinyin} rate={rate} onAnswer={onAnswer} />
    );
  }
  const label = spec.type === 'flash' ? PROMPT_LABEL[`flash-${spec.front}`] : PROMPT_LABEL[`${spec.prompt}-${spec.answer}`];
  const promptKind = spec.type === 'flash' ? spec.front : spec.prompt;
  // en ejercicios de pinyin nunca se muestra el pinyin en el enunciado
  const pinyinOnPrompt = showPinyin && step.q.skill !== 'pinyin' && step.q.skill !== 'production';

  const Prompt = (
    <div className="prompt">
      <span className="kicker">
        {label} · {SKILL_LABEL[step.q.skill]}
        {step.q.reason === 'new' && ' · nueva'}
        {step.retry && ' · otra vez'}
      </span>
      {promptKind === 'hanzi' ? (
        <>
          <div className={`mizige big-han han${view.hanzi.length > 2 ? ' long' : ''}`} lang="zh-CN">
            {view.hanzi}
          </div>
          {pinyinOnPrompt && spec.type === 'choice' && <div className="py" style={{ fontSize: 22 }}>{view.pinyin}</div>}
        </>
      ) : promptKind === 'audio' || promptKind === 'audio-pinyin' ? (
        <AudioPrompt text={view.hanzi} pinyinNum={pinyinNum} rate={rate} toneless={spec.type === 'choice' ? spec.toneless : undefined} />
      ) : (
        <div className="meaning-prompt">{view.meanings.slice(0, 2).join(' · ')}</div>
      )}
    </div>
  );

  return spec.type === 'flash' ? (
    <Flash view={view} pinyinNum={pinyinNum} rate={rate} prompt={Prompt} onAnswer={onAnswer} />
  ) : (
    <Choice spec={spec} view={view} pinyinNum={pinyinNum} rate={rate} prompt={Prompt} onAnswer={onAnswer} />
  );
}

type ViewT = NonNullable<ReturnType<typeof viewOf>>;

/** Enunciado de escucha: suena al aparecer; se puede repetir normal o despacio. */
function AudioPrompt({ text, pinyinNum, rate, toneless }: { text: string; pinyinNum?: string; rate: number; toneless?: string }) {
  useEffect(() => {
    const t = setTimeout(() => say(text, pinyinNum, rate), 250);
    return () => clearTimeout(t);
  }, [text, pinyinNum, rate]);
  return (
    <div className="stack" style={{ justifyItems: 'center', gap: 14 }}>
      <button type="button" className="listen-btn" aria-label="Escuchar otra vez" onClick={() => say(text, pinyinNum, rate)}>
        <Icon name="sound" />
      </button>
      <button type="button" className="btn ghost" onClick={() => say(text, pinyinNum, Math.max(0.5, rate - 0.3))}>
        Más despacio
      </button>
      {toneless && (
        <div className="py" style={{ fontSize: 30, letterSpacing: '0.04em' }} aria-label={`Pinyin sin tonos: ${toneless}`}>
          {toneless}
        </div>
      )}
    </div>
  );
}

function AnswerBlock({ view, pinyinNum, rate }: { view: ViewT; pinyinNum?: string; rate: number }) {
  return (
    <div className="answer-block">
      <div className="row" style={{ justifyContent: 'center' }}>
        <span className="han" style={{ fontSize: 34 }} lang="zh-CN">
          {view.hanzi}
        </span>
        <span className="py">{view.pinyin}</span>
        <SpeakButton text={view.hanzi} pinyinNum={pinyinNum} rate={rate} />
      </div>
      <div className="es">{view.meanings.join(' · ')}</div>
    </div>
  );
}

function useKeys(handler: (k: string) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      ref.current(e.key);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);
}

const GRADES: { g: Grade; label: string; hint: string; cls?: string }[] = [
  { g: 1, label: 'Otra vez', hint: 'no lo sabía', cls: 'again' },
  { g: 2, label: 'Difícil', hint: 'con esfuerzo' },
  { g: 3, label: 'Bien', hint: 'lo sabía', cls: 'good' },
  { g: 4, label: 'Fácil', hint: 'al instante' },
];

function Flash({ view, pinyinNum, rate, prompt, onAnswer }: { view: ViewT; pinyinNum?: string; rate: number; prompt: React.ReactNode; onAnswer: (g: Grade) => void }) {
  const [revealed, setRevealed] = useState(false);
  const reveal = () => {
    setRevealed(true);
    say(view.hanzi, pinyinNum, rate);
  };
  useKeys((k) => {
    if (!revealed && (k === ' ' || k === 'Enter')) reveal();
    else if (revealed && ['1', '2', '3', '4'].includes(k)) onAnswer(Number(k) as Grade);
  });
  return (
    <>
      {prompt}
      <div className="stack">
        {revealed ? (
          <>
            <AnswerBlock view={view} pinyinNum={pinyinNum} rate={rate} />
            <div className="grades" role="group" aria-label="¿Qué tal lo recordaste?">
              {GRADES.map((x) => (
                <button key={x.g} type="button" className={`grade ${x.cls ?? ''}`} onClick={() => onAnswer(x.g)}>
                  {x.label}
                  <small>{x.hint}</small>
                </button>
              ))}
            </div>
          </>
        ) : (
          <button type="button" className="btn primary block" onClick={reveal}>
            <Icon name="eye" /> Mostrar respuesta
          </button>
        )}
      </div>
    </>
  );
}

function Choice({ spec, view, pinyinNum, rate, prompt, onAnswer }: { spec: Extract<ExerciseSpec, { type: 'choice' }>; view: ViewT; pinyinNum?: string; rate: number; prompt: React.ReactNode; onAnswer: (g: Grade) => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  const correct = picked === spec.correct;
  const choose = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    say(view.hanzi, pinyinNum, rate);
  };
  const next = () => onAnswer(correct ? 3 : 1);
  useKeys((k) => {
    if (picked === null && ['1', '2', '3', '4'].includes(k)) choose(Number(k) - 1);
    else if (picked !== null && (k === 'Enter' || k === ' ')) next();
  });
  const cls = spec.answer === 'hanzi' ? 'han-opt han' : spec.answer === 'pinyin' ? 'py-opt' : '';
  // en los ejercicios de escucha el audio ya suena en el enunciado; al elegir se repite
  return (
    <>
      {prompt}
      <div className="stack">
        <div className="options" role="group" aria-label="Opciones">
          {spec.options.map((o, i) => (
            <button
              key={o + i}
              type="button"
              className={`option ${cls}`}
              lang={spec.answer === 'meaning' ? 'es' : 'zh-CN'}
              data-state={picked === null ? undefined : i === spec.correct ? 'correct' : i === picked ? 'wrong' : 'dim'}
              data-correct={import.meta.env.DEV && i === spec.correct ? '' : undefined}
              onClick={() => choose(i)}
              aria-pressed={picked === i}
            >
              <span className="key" aria-hidden="true">
                {i + 1}
              </span>
              {o}
            </button>
          ))}
        </div>
        {picked !== null && (
          <>
            <AnswerBlock view={view} pinyinNum={pinyinNum} rate={rate} />
            <button type="button" className="btn primary block" onClick={next} autoFocus>
              {correct ? '¡Bien! Continuar' : 'Continuar'}
            </button>
          </>
        )}
      </div>
    </>
  );
}

function XpToast({ outcome }: { outcome: ReviewOutcome }) {
  const main = outcome.logs.find((l) => l.direct)!;
  const chars = outcome.logs.filter((l) => !l.direct);
  const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  return (
    <div className="toast" role="status" aria-live="polite">
      <span className={main.xpDelta >= 0 ? 'plus' : 'minus'}>{fmt(main.xpDelta)} XP</span>
      {chars.map((l) => (
        <span key={l.id}>
          <span className="han">{itemKey(l.itemId)}</span> <span className={l.xpDelta >= 0 ? 'plus' : 'minus'}>{fmt(l.xpDelta)}</span>
        </span>
      ))}
    </div>
  );
}

function Summary({ results }: { results: Result[] }) {
  useEffect(() => {
    void requestSync(repo); // subir la sesión recién terminada
  }, []);
  const xp = results.reduce((a, r) => a + r.outcome.xpGained, 0);
  const correct = results.filter((r) => r.correct).length;
  // nivel final de cada habilidad practicada (último estado guardado)
  const finals = new Map<string, { q: QueueItem; xp: number; before: number }>();
  for (const r of results) {
    const s = r.outcome.states[0];
    const k = `${s.itemId}|${s.skill}`;
    const before = finals.get(k)?.before ?? s.xp - r.outcome.logs[0].xpDelta;
    finals.set(k, { q: r.q, xp: s.xp, before });
  }
  const levelUps = [...finals.values()].filter((f) => levelFromXp(f.xp) > levelFromXp(f.before));
  const items = [...new Set(results.map((r) => r.q.itemId))];
  return (
    <div className="prompt" style={{ justifyContent: 'flex-start', paddingTop: 30 }}>
      <span className="han" style={{ fontSize: 64, color: 'var(--seal)' }} aria-hidden="true">
        完
      </span>
      <h1 className="page-title">Sesión terminada</h1>
      <div className="stats-row" style={{ width: '100%' }}>
        <div className="stat">
          <b className="num">+{xp}</b>
          <span>XP</span>
        </div>
        <div className="stat">
          <b className="num">{results.length ? Math.round((correct / results.length) * 100) : 0}%</b>
          <span>aciertos</span>
        </div>
        <div className="stat">
          <b className="num">{levelUps.length}</b>
          <span>subidas de nivel</span>
        </div>
      </div>
      <ul className="items" style={{ width: '100%', textAlign: 'left' }}>
        {items.map((id) => {
          const v = viewOf(id)!;
          const ok = results.filter((r) => r.q.itemId === id && r.correct).length;
          const total = results.filter((r) => r.q.itemId === id).length;
          const best = Math.max(...[...finals.values()].filter((f) => f.q.itemId === id).map((f) => levelFromXp(f.xp)));
          return (
            <li key={id}>
              <Link className="item-row" to={`/ficha/${itemKind(id)}/${encodeURIComponent(itemKey(id))}`}>
                <span className="han">{v.hanzi}</span>
                <span className="meta">
                  <div className="py">{v.pinyin}</div>
                  <div className="muted">
                    {ok}/{total} · {v.meaning}
                  </div>
                </span>
                <Seal level={best} size={34} title={`Mejor habilidad: nivel ${best}`} />
              </Link>
            </li>
          );
        })}
      </ul>
      <Link className="btn primary block" to="/">
        Volver al inicio
      </Link>
    </div>
  );
}
