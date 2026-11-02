// Escritura de un carácter trazo a trazo con Hanzi Writer (modo quiz).
import HanziWriter from 'hanzi-writer';
import { useEffect, useRef, useState } from 'react';
import { writingGrade, type Grade, type WritingResult } from '../core/xp';
import { loadStrokes } from './StrokeOrder';

const cssVar = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

export interface WritingOutcome extends WritingResult {
  grade: Grade;
}

type Phase = 'demo' | 'quiz' | 'done';

/**
 * - Guiado (primera vez): se anima el carácter y luego se escribe sobre el contorno.
 * - Recuerdo: se escribe sin contorno; "Pista" ilumina el siguiente trazo (cuenta como 2 errores)
 *   y "No lo sé" muestra la animación (cuenta como fallo).
 */
export function WritingQuiz({ char, guided, onDone }: { char: string; guided: boolean; onDone: (r: WritingOutcome) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const writer = useRef<HanziWriter | null>(null);
  const strokeNum = useRef(0);
  const strokes = useRef(0);
  const extra = useRef(0);
  const [phase, setPhase] = useState<Phase>(guided ? 'demo' : 'quiz');
  const [mistakes, setMistakes] = useState(0);
  const [outline, setOutline] = useState(guided);
  const [result, setResult] = useState<WritingOutcome | null>(null);
  const [error, setError] = useState(false);
  const size = Math.min(typeof window === 'undefined' ? 280 : window.innerWidth - 64, 300);

  const finish = (r: WritingResult) => {
    const out = { ...r, grade: writingGrade(r) };
    setResult(out);
    setPhase('done');
    onDone(out);
  };

  const startQuiz = (w: HanziWriter, withOutline: boolean) => {
    setPhase('quiz');
    strokeNum.current = 0;
    w.hideCharacter();
    if (withOutline) w.showOutline();
    else w.hideOutline();
    void w.quiz({
      showHintAfterMisses: 3,
      leniency: 1.1,
      onMistake: (d) => setMistakes(d.totalMistakes + extra.current),
      onCorrectStroke: (d) => {
        strokeNum.current = d.strokeNum + 1;
      },
      onComplete: ({ totalMistakes }) =>
        finish({ mistakes: totalMistakes + extra.current, strokes: strokes.current, guided: withOutline, gaveUp: false }),
    });
  };

  const startQuizRef = useRef(startQuiz);
  startQuizRef.current = startQuiz;

  useEffect(() => {
    if (!el.current) return;
    el.current.innerHTML = '';
    const w = HanziWriter.create(el.current, char, {
      width: size,
      height: size,
      padding: 10,
      showCharacter: guided,
      showOutline: guided,
      strokeColor: cssVar('--ink', '#1d1a16'),
      radicalColor: cssVar('--seal', '#b8322a'),
      outlineColor: cssVar('--line', '#d9cfbd'),
      drawingColor: cssVar('--ink-2', '#5b544a'),
      highlightColor: cssVar('--seal', '#b8322a'),
      drawingWidth: 22,
      strokeAnimationSpeed: 1.2,
      delayBetweenStrokes: 180,
      charDataLoader: loadStrokes,
      onLoadCharDataSuccess: (data) => {
        strokes.current = (data as { strokes: string[] }).strokes.length;
      },
      onLoadCharDataError: () => setError(true),
    });
    writer.current = w;
    if (guided) {
      void w.animateCharacter({ onComplete: () => startQuizRef.current(w, true) });
    } else {
      startQuizRef.current(w, false);
    }
    return () => {
      w.cancelQuiz();
      writer.current = null;
    };
    // el componente se monta una vez por carácter (key en el padre)
  }, [char]);

  const hint = () => {
    const w = writer.current;
    if (!w || phase === 'done') return;
    extra.current += 2;
    setMistakes((m) => m + 2);
    void w.highlightStroke(strokeNum.current);
  };

  const toggleOutline = () => {
    const w = writer.current;
    if (!w) return;
    if (outline) w.hideOutline();
    else {
      w.showOutline();
      extra.current += 1; // ver el contorno es una ayuda
      setMistakes((m) => m + 1);
    }
    setOutline(!outline);
  };

  const giveUp = () => {
    const w = writer.current;
    if (!w || phase === 'done') return;
    w.cancelQuiz();
    w.showOutline();
    void w.animateCharacter();
    finish({ mistakes: mistakes, strokes: strokes.current, guided: outline, gaveUp: true });
  };

  if (error) return <p className="notice">No hay datos de trazos para {char}.</p>;

  return (
    <div className="stack" style={{ justifyItems: 'center' }}>
      <div ref={el} className="mizige writer-pad" style={{ width: size, height: size }} role="img" aria-label={`Zona para escribir ${char}`} />
      <div className="row faint num" style={{ fontSize: 13, fontWeight: 700, gap: 14 }} aria-live="polite">
        {phase === 'demo' ? 'Mira el orden de los trazos…' : phase === 'quiz' ? `Errores: ${mistakes}` : null}
        {result && <span>{result.gaveUp ? 'Repásalo con la animación' : `${result.mistakes} errores · ${['', 'Otra vez', 'Difícil', 'Bien', 'Fácil'][result.grade]}`}</span>}
      </div>
      {phase === 'quiz' && (
        <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
          <button type="button" className="chip" onClick={hint}>
            Pista
          </button>
          {!guided && (
            <button type="button" className="chip" aria-pressed={outline} onClick={toggleOutline}>
              Contorno
            </button>
          )}
          <button type="button" className="chip" onClick={giveUp}>
            No lo sé
          </button>
        </div>
      )}
    </div>
  );
}
