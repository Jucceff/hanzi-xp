import { useState } from 'react';
import { charByChar, wordById } from '../../content';
import type { Grade } from '../../core/xp';
import { SpeakButton } from '../../ui/components';
import { WritingQuiz, type WritingOutcome } from '../../ui/WritingQuiz';

/** Una palabra que contiene el carácter, para dar contexto ("_们 · nosotros"). */
function contextWord(char: string) {
  const c = charByChar.get(char);
  const w = c?.words.map((id) => wordById.get(id)!).find((w) => w.chars.length > 1 && w.es.length);
  return w ? { blanked: w.simp.replaceAll(char, '＿'), pinyin: w.pinyin, es: w.es[0] } : null;
}

export function WriteExercise({ char, guided, kicker, rate, onAnswer }: { char: string; guided: boolean; kicker: string; rate: number; onAnswer: (g: Grade) => void }) {
  const c = charByChar.get(char)!;
  const ctx = contextWord(char);
  const [out, setOut] = useState<WritingOutcome | null>(null);
  return (
    <>
      <div className="prompt" style={{ justifyContent: 'flex-start', paddingTop: 18, gap: 10 }}>
        <span className="kicker">{kicker}</span>
        <div className="row" style={{ justifyContent: 'center' }}>
          <span className="py" style={{ fontSize: 24 }}>
            {c.pinyin[0]}
          </span>
          <SpeakButton text={char} rate={rate} />
        </div>
        <div className="meaning-prompt" style={{ fontSize: 24 }}>
          {(c.es.length ? c.es : c.en).slice(0, 2).join(' · ')}
        </div>
        {ctx && (
          <div className="muted" style={{ fontSize: 15 }}>
            como en <span className="han" style={{ fontSize: 20 }}>{ctx.blanked}</span> · {ctx.es}
          </div>
        )}
        <WritingQuiz key={char} char={char} guided={guided} onDone={setOut} />
      </div>
      {out && (
        <button type="button" className="btn primary block" onClick={() => onAnswer(out.grade)} autoFocus>
          {out.grade >= 3 ? '¡Bien escrito! Continuar' : 'Continuar'}
        </button>
      )}
    </>
  );
}
