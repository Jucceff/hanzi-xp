import { useDeferredValue, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useMastery } from '../../app/progress';
import { LEVELS, phrases, phraseSentence, words } from '../../content';
import { SentenceReveal } from '../session/SentenceExercises';
import { plainKey } from '../../core/pinyin';
import { wordItem } from '../../core/skills';
import { Seal } from '../../ui/components';

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function WordsPage() {
  const { mastery } = useMastery();
  const [level, setLevel] = useState<1 | 2 | 3>(1);
  const [tab, setTab] = useState<'palabras' | 'frases'>('palabras');
  const [q, setQ] = useState('');
  const query = useDeferredValue(q.trim());

  const list = useMemo(() => {
    const nq = norm(query);
    const pq = plainKey(query);
    return words.filter((w) => {
      if (!query) return w.level === level;
      return (
        w.simp.includes(query) ||
        (pq && plainKey(w.pinyin).includes(pq)) ||
        w.es.some((m) => norm(m).includes(nq)) ||
        w.en.some((m) => m.toLowerCase().includes(nq))
      );
    });
  }, [level, query]);

  return (
    <>
      <h1 className="page-title" style={{ marginTop: 20 }}>
        {tab === 'palabras' ? 'Palabras' : 'Frases útiles'}
      </h1>
      <div className="chips" role="tablist" aria-label="Ver" style={{ marginBottom: 12 }}>
        <button type="button" role="tab" className="chip" aria-pressed={tab === 'palabras'} aria-selected={tab === 'palabras'} onClick={() => setTab('palabras')}>
          Palabras
        </button>
        <button type="button" role="tab" className="chip" aria-pressed={tab === 'frases'} aria-selected={tab === 'frases'} onClick={() => setTab('frases')}>
          Frases útiles · {phrases.length}
        </button>
      </div>
      {tab === 'frases' ? (
        <PhraseBook />
      ) : (
      <>
      <div className="stack" style={{ gap: 10, marginBottom: 14 }}>
        <input
          type="search"
          className="card"
          style={{ padding: '12px 14px', boxShadow: 'none' }}
          placeholder="Buscar: 我们, women, nosotros…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar palabra por hanzi, pinyin o significado"
        />
        {!query && (
          <div className="chips" role="group" aria-label="Nivel HSK">
            {LEVELS.map((l) => (
              <button key={l} type="button" className="chip" aria-pressed={level === l} onClick={() => setLevel(l)}>
                HSK {l} · {words.filter((w) => w.level === l).length}
              </button>
            ))}
          </div>
        )}
      </div>
      <ul className="items">
        {list.slice(0, 400).map((w) => {
          const m = mastery?.get(wordItem(w.id));
          return (
            <li key={w.id}>
              <Link className="item-row" to={`/ficha/w/${encodeURIComponent(w.id)}`}>
                <span className="han" lang="zh-CN">
                  {w.simp}
                </span>
                <span className="meta">
                  <div className="py">{w.pinyin}</div>
                  <div className="muted">{(w.es.length ? w.es : w.en).join(' · ') || '—'}</div>
                </span>
                <Seal level={m?.level ?? 0} size={34} />
              </Link>
            </li>
          );
        })}
      </ul>
      {query && list.length === 0 && <p className="muted">Sin resultados.</p>}
      </>
      )}
    </>
  );
}

function PhraseBook() {
  const temas = [...new Set(phrases.map((p) => p.tema))];
  return (
    <div className="stack">
      <p className="muted" style={{ margin: 0 }}>
        Frases cotidianas con vocabulario HSK 1–3. Practícalas con «Frases útiles» en Hoy.
      </p>
      {temas.map((t) => (
        <section key={t}>
          <h2 className="section-title" style={{ marginTop: 14 }}>
            {t}
          </h2>
          <div className="stack" style={{ gap: 8 }}>
            {phrases
              .filter((p) => p.tema === t)
              .map((p) => (
                <div key={p.id} style={{ position: 'relative' }}>
                  <SentenceReveal s={phraseSentence(p)} rate={0.85} />
                  <span className="tag" style={{ position: 'absolute', right: 8, bottom: 8 }}>
                    HSK {p.level}
                  </span>
                </div>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
