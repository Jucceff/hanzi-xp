import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import { repo, useAllStates, useSettings } from '../../app/progress';
import { LEVELS, readings, type Reading } from '../../content';
import { wordItem } from '../../core/skills';
import { Icon } from '../../ui/components';

/** Proporción de palabras de la lectura que aún no has practicado. */
export function unknownShare(r: Reading, practiced: Set<string>) {
  const unknown = r.words.filter((id) => !practiced.has(wordItem(id)));
  return { unknown, share: unknown.length / Math.max(1, r.words.length) };
}

/** Recomendada: como mucho un 10 % de palabras nuevas (lo justo para aprender sin perderse). */
export const RECOMMENDED_UNKNOWN = 0.1;

export function ReadingsPage() {
  const navigate = useNavigate();
  const states = useAllStates();
  const settings = useSettings();
  const history = useLiveQuery(() => repo.readingHistory(), [], new Map());
  const practiced = useMemo(() => new Set((states ?? []).filter((s) => s.card).map((s) => s.itemId)), [states]);
  const maxLevel = Math.max(...settings.levels);

  return (
    <>
      <header className="topbar">
        <button type="button" className="icon-btn" aria-label="Volver" onClick={() => navigate(-1)}>
          <Icon name="back" />
        </button>
      </header>
      <h1 className="page-title">Lecturas</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Textos cortos con vocabulario HSK. Toca cualquier palabra para ver su pinyin y significado. Leer da XP de reconocimiento a los caracteres que lees sin consultar.
      </p>
      {LEVELS.map((lvl) => (
        <section key={lvl}>
          <h2 className="section-title">
            HSK {lvl} {lvl > maxLevel && <small>nivel aún no activo</small>}
          </h2>
          <ul className="items">
            {readings
              .filter((r) => r.level === lvl)
              .map((r) => {
                const { unknown, share } = unknownShare(r, practiced);
                const done = history.get(r.id);
                const recommended = share <= RECOMMENDED_UNKNOWN;
                return (
                  <li key={r.id}>
                    <Link className="item-row" to={`/lectura/${r.id}`}>
                      <span className="han" style={{ fontSize: 22, minWidth: '3.4em' }} lang="zh-CN">
                        {r.titleZh}
                      </span>
                      <span className="meta">
                        <div style={{ fontWeight: 650 }}>{r.title}</div>
                        <div className="faint" style={{ fontSize: 13 }}>
                          {r.length} caracteres · {Math.round((1 - share) * 100)}% conocidas{unknown.length ? ` · ${unknown.length} nuevas` : ''}
                        </div>
                      </span>
                      <span className="stack" style={{ gap: 4, justifyItems: 'end' }}>
                        {recommended && <span className="tag" style={{ background: 'var(--jade-bg)', color: 'var(--jade)' }}>recomendada</span>}
                        {done && <span className="tag">✓ {done.count}×</span>}
                      </span>
                    </Link>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </>
  );
}
