// Ejercicios con frases: ordenar palabras e identificar una palabra dentro de la frase.
import { useEffect, useState } from 'react';
import { say } from '../../app/audio';
import type { ExerciseSpec } from '../../app/exercises';
import { wordById, type Sentence } from '../../content';
import type { Grade } from '../../core/xp';
import { Icon, SpeakButton } from '../../ui/components';

type OrderSpec = Extract<ExerciseSpec, { type: 'order' }>;
type IdentifySpec = Extract<ExerciseSpec, { type: 'identify' }>;

const isFinalPunct = (t: string) => /^[。？！]+$/.test(t);

/** Frase completa con pinyin, traducción y audio (se muestra al resolver). */
export function SentenceReveal({ s, rate, highlight }: { s: Sentence; rate: number; highlight?: string }) {
  return (
    <div className="sentence-reveal">
      <div className="row" style={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <p className="ruby-line han" lang="zh-CN">
          {s.tokens.map((t, i) => (
            <span key={i} className={`ruby${t.w && t.w === highlight ? ' hl' : ''}`}>
              <small className="py">{t.p}</small>
              {t.t}
            </span>
          ))}
        </p>
        <SpeakButton text={s.zh} rate={rate} label="Escuchar la frase" />
      </div>
      <p className="es-line">{s.es}</p>
    </div>
  );
}

export function OrderExercise({ spec, kicker, showPinyin, rate, onAnswer }: { spec: OrderSpec; kicker: string; showPinyin: boolean; rate: number; onAnswer: (g: Grade) => void }) {
  const s = spec.sentence;
  const [placed, setPlaced] = useState<number[]>([]);
  const [checked, setChecked] = useState<null | boolean>(null);
  const bank = spec.tiles.filter((i) => !placed.includes(i));
  const target = s.tokens.map((t, i) => ({ t, i })).filter(({ t }) => t.p && !isFinalPunct(t.t));
  const finalPunct = s.tokens.filter((t) => isFinalPunct(t.t)).map((t) => t.t).join('');
  // se compara el texto, así dos palabras iguales intercambiadas cuentan como correctas
  const isRight = placed.map((i) => s.tokens[i].t).join('') === target.map(({ t }) => t.t).join('');

  const check = () => {
    const ok = isRight;
    setChecked(ok);
    say(s.zh, undefined, rate);
  };

  const Tile = ({ i, onClick }: { i: number; onClick?: () => void }) => (
    <button type="button" className="tile-word" onClick={onClick} disabled={checked !== null} lang="zh-CN">
      {showPinyin && s.tokens[i].p && <small className="py">{s.tokens[i].p}</small>}
      <span className="han">{s.tokens[i].t}</span>
    </button>
  );

  return (
    <>
      <div className="prompt" style={{ justifyContent: 'flex-start', paddingTop: 28 }}>
        <span className="kicker">{kicker}</span>
        <div className="meaning-prompt" style={{ maxWidth: '24ch' }}>
          {s.es}
        </div>
        <div className={`build-line${checked === null ? '' : checked ? ' ok' : ' bad'}`} aria-label="Tu frase" aria-live="polite">
          {placed.length === 0 && <span className="faint">Toca las palabras en orden</span>}
          {placed.map((i) => (
            <Tile key={i} i={i} onClick={() => setPlaced((p) => p.filter((x) => x !== i))} />
          ))}
          {placed.length > 0 && finalPunct && <span className="han punct">{finalPunct}</span>}
        </div>
        <div className="bank" aria-label="Palabras disponibles">
          {bank.map((i) => (
            <Tile key={i} i={i} onClick={() => setPlaced((p) => [...p, i])} />
          ))}
        </div>
      </div>
      <div className="stack">
        {checked === null ? (
          <button type="button" className="btn primary block" disabled={bank.length > 0} onClick={check}>
            Comprobar
          </button>
        ) : (
          <>
            <SentenceReveal s={s} rate={rate} />
            {checked ? (
              <button type="button" className="btn primary block" onClick={() => onAnswer(3)} autoFocus>
                ¡Correcto! Continuar
              </button>
            ) : (
              <div className="grid-2">
                <button type="button" className="btn" onClick={() => onAnswer(3)} title="Si tu orden también es correcto en chino">
                  Mi orden también vale
                </button>
                <button type="button" className="btn primary" onClick={() => onAnswer(1)} autoFocus>
                  Continuar
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

export function IdentifyExercise({ spec, kicker, showPinyin, rate, onAnswer }: { spec: IdentifySpec; kicker: string; showPinyin: boolean; rate: number; onAnswer: (g: Grade) => void }) {
  const s = spec.sentence;
  const w = wordById.get(spec.target)!;
  const [picked, setPicked] = useState<number | null>(null);
  const correct = picked !== null && s.tokens[picked].w === spec.target;

  useEffect(() => {
    if (spec.cue !== 'audio') return;
    const t = setTimeout(() => say(w.simp, w.pinyinNum, rate), 250);
    return () => clearTimeout(t);
  }, [spec.cue, w, rate]);

  const question =
    spec.cue === 'meaning' ? (
      <>
        Toca la palabra que significa <b>«{(w.es[0] ?? w.en[0]).split(/[,;(]/)[0].trim()}»</b>
      </>
    ) : spec.cue === 'hanzi' ? (
      <>
        Toca <span className="han" style={{ fontSize: '1.3em' }}>{w.simp}</span> en la frase escrita en pinyin
      </>
    ) : (
      <>Toca la palabra que oyes</>
    );

  const pick = (i: number) => {
    if (picked !== null || !s.tokens[i].p) return;
    setPicked(i);
    if (spec.cue !== 'audio') say(s.zh, undefined, rate);
  };

  return (
    <>
      <div className="prompt" style={{ justifyContent: 'flex-start', paddingTop: 28 }}>
        <span className="kicker">{kicker}</span>
        <div className="meaning-prompt" style={{ fontSize: 22, maxWidth: '26ch' }}>
          {question}
        </div>
        {spec.cue === 'audio' && (
          <button type="button" className="listen-btn small" aria-label="Escuchar otra vez" onClick={() => say(w.simp, w.pinyinNum, rate)}>
            <Icon name="sound" />
          </button>
        )}
        <div className="sentence-tokens" role="group" aria-label="Frase">
          {s.tokens.map((t, i) =>
            t.p ? (
              <button
                key={i}
                type="button"
                className={`tok${spec.show === 'pinyin' ? ' tok-py' : ' han'}`}
                lang="zh-CN"
                data-state={picked === null ? undefined : t.w === spec.target ? 'correct' : i === picked ? 'wrong' : undefined}
                data-correct={import.meta.env.DEV && t.w === spec.target ? '' : undefined}
                onClick={() => pick(i)}
              >
                {spec.show === 'hanzi' && showPinyin && spec.cue !== 'hanzi' && <small className="py">{t.p}</small>}
                {spec.show === 'pinyin' ? t.p : t.t}
              </button>
            ) : (
              <span key={i} className={`punct${spec.show === 'hanzi' ? ' han' : ''}`}>
                {t.t}
              </span>
            ),
          )}
        </div>
      </div>
      {picked !== null && (
        <div className="stack">
          <SentenceReveal s={s} rate={rate} highlight={spec.target} />
          <button type="button" className="btn primary block" onClick={() => onAnswer(correct ? 3 : 1)} autoFocus>
            {correct ? '¡Bien! Continuar' : 'Continuar'}
          </button>
        </div>
      )}
    </>
  );
}
