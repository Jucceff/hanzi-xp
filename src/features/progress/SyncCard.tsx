import { useState, useSyncExternalStore } from 'react';
import { repo } from '../../app/progress';
import { connect, disconnect, requestSync, syncStatus } from '../../sync/sync';

// Token clásico con solo el permiso "gist": no da acceso a tus repositorios.
const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=gist&description=Hanzi%20XP%20(sincronizar%20progreso)';

const ago = (ms: number) => {
  const m = Math.round((Date.now() - ms) / 60_000);
  if (m < 1) return 'hace un momento';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  return h < 24 ? `hace ${h} h` : new Date(ms).toLocaleString('es');
};

export function useSyncStatus() {
  return useSyncExternalStore(syncStatus.subscribe, syncStatus.get, syncStatus.get);
}

export function SyncCard() {
  const st = useSyncStatus();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onConnect = async () => {
    setBusy(true);
    setErr(null);
    try {
      await connect(repo, token);
      setToken('');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h2 className="section-title" id="sincronizar">
        Sincronización <small>móvil ⇄ PC</small>
      </h2>
      <div className="card stack">
        {st.phase === 'off' ? (
          <>
            <p className="muted" style={{ margin: 0 }}>
              Guarda tu progreso en un gist secreto de tu cuenta de GitHub y se fusiona automáticamente en todos tus dispositivos.
            </p>
            <ol className="muted" style={{ margin: 0, paddingLeft: 20, fontSize: 14 }}>
              <li>
                <a href={TOKEN_URL} target="_blank" rel="noreferrer">
                  Crea un token en GitHub
                </a>{' '}
                (ya viene marcado solo el permiso <b>gist</b>), elige la caducidad que quieras y pulsa «Generate token».
              </li>
              <li>Cópialo y pégalo aquí. Haz lo mismo en cada dispositivo (puedes reutilizar el mismo token).</li>
            </ol>
            <label className="sr-only" htmlFor="gh-token">
              Token de GitHub
            </label>
            <input
              id="gh-token"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="ghp_…"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="card"
              style={{ padding: '12px 14px', boxShadow: 'none' }}
            />
            <button type="button" className="btn primary" disabled={!token.trim() || busy} onClick={onConnect}>
              {busy ? 'Conectando…' : 'Conectar y sincronizar'}
            </button>
            {err && (
              <p className="notice" role="alert" style={{ margin: 0 }}>
                {err}
              </p>
            )}
          </>
        ) : (
          <>
            <p style={{ margin: 0 }}>
              Conectado como <b>{st.login}</b>.{' '}
              <span className="muted">
                {st.phase === 'syncing'
                  ? 'Sincronizando…'
                  : st.phase === 'error'
                    ? `Error: ${st.message}`
                    : st.lastSyncAt
                      ? `Última sincronización ${ago(st.lastSyncAt)}.`
                      : ''}
              </span>
            </p>
            {st.phase === 'ok' && st.message && (
              <p className="notice" role="status" style={{ margin: 0 }}>
                {st.message}
              </p>
            )}
            <div className="grid-2">
              <button type="button" className="btn" disabled={st.phase === 'syncing'} onClick={() => requestSync(repo)}>
                Sincronizar ahora
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => confirm('¿Desconectar este dispositivo? Tu progreso local y el de la nube se conservan.') && disconnect(repo)}
              >
                Desconectar
              </button>
            </div>
            <p className="faint" style={{ margin: 0, fontSize: 12 }}>
              Se sincroniza al abrir la app, al terminar una sesión, al salir y cada 10 minutos.
            </p>
          </>
        )}
      </div>
    </>
  );
}
