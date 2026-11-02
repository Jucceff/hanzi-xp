import { useNavigate } from 'react-router';
import { meta } from '../../content';
import { Icon } from '../../ui/components';

export function SourcesPage() {
  const navigate = useNavigate();
  return (
    <>
      <header className="topbar">
        <button type="button" className="icon-btn" aria-label="Volver" onClick={() => navigate(-1)}>
          <Icon name="back" />
        </button>
      </header>
      <h1 className="page-title">Fuentes y licencias</h1>
      <p className="muted">
        Temario: {meta.syllabus}. Palabras HSK 1/2/3: {meta.counts.words1}/{meta.counts.words2}/{meta.counts.words3}. Caracteres: {meta.counts.chars1}/{meta.counts.chars2}/
        {meta.counts.chars3}.
      </p>
      <div className="card stack">
        {meta.sources.map((s) => (
          <div key={s.name}>
            <a href={s.url} target="_blank" rel="noreferrer" style={{ fontWeight: 700 }}>
              {s.name}
            </a>{' '}
            <span className="tag">{s.license}</span>
            <div className="faint" style={{ fontSize: 14 }}>
              {s.use}
            </div>
          </div>
        ))}
        <div>
          <b>LXGW WenKai</b> <span className="tag">SIL OFL 1.1</span>
          <div className="faint" style={{ fontSize: 14 }}>
            Tipografía de los hanzi
          </div>
        </div>
      </div>
      <p className="notice" style={{ marginTop: 16 }}>
        Los significados en español, parte de los ejemplos y las explicaciones se redactaron con ayuda de IA a partir de CC-CEDICT y están marcados como pendientes de revisión. Los ejemplos de Tatoeba indican su número de frase.
      </p>
    </>
  );
}
