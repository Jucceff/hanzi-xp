import HanziWriter from 'hanzi-writer';
import { useEffect, useRef, useState } from 'react';

/** Carga los trazos desde /strokes/<char>.json (precacheados para uso offline). */
export const loadStrokes = (char: string, onLoad: (data: never) => void, onError: (e: unknown) => void) => {
  fetch(`${import.meta.env.BASE_URL}strokes/${encodeURIComponent(char)}.json`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Sin trazos para ${char}`))))
    .then((data) => onLoad(data as never), onError);
};

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function StrokeOrder({ char, size = 180 }: { char: string; size?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const writer = useRef<HanziWriter | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!el.current) return;
    el.current.innerHTML = '';
    setError(false);
    writer.current = HanziWriter.create(el.current, char, {
      width: size,
      height: size,
      padding: 8,
      showOutline: true,
      strokeColor: cssVar('--ink') || '#1d1a16',
      radicalColor: cssVar('--seal') || '#b8322a',
      outlineColor: cssVar('--line') || '#d9cfbd',
      strokeAnimationSpeed: 1.1,
      delayBetweenStrokes: 220,
      charDataLoader: loadStrokes,
      onLoadCharDataError: () => setError(true),
    });
    writer.current.animateCharacter();
    return () => {
      writer.current = null;
    };
  }, [char, size]);

  return (
    <div className="stack" style={{ justifyItems: 'center' }}>
      <div ref={el} className="mizige writer" style={{ width: size }} aria-label={`Orden de trazos de ${char}`} role="img" />
      {error ? (
        <p className="faint">No hay datos de trazos para este carácter.</p>
      ) : (
        <button type="button" className="btn ghost" onClick={() => writer.current?.animateCharacter()}>
          Repetir animación
        </button>
      )}
    </div>
  );
}
