// Sincronización del progreso con un gist secreto de GitHub del propio usuario.
import type { ReviewLogEntry } from '../core/engine';
import type { DexieProgressRepo } from '../db/repo';
import {
  LOG_PREFIX,
  LOG_SUFFIX,
  README_FILE,
  STATE_FILE,
  SYNC_FORMAT,
  decodeLogs,
  decodeState,
  encodeLogs,
  encodeState,
  logFile,
  logsByMonth,
} from './codec';
import { GistClient, GistError, type Gist } from './gist';
import { mergeSnapshots, type Snapshot } from './merge';

export interface SyncConfig {
  token: string;
  login?: string;
  gistId?: string;
  lastSyncAt?: number;
}

const README = `# Hanzi XP · progreso

Este gist lo crea y actualiza la app Hanzi XP para sincronizar tu progreso entre dispositivos.
No lo edites a mano. Los archivos son JSON comprimido (gzip + base64).
`;

export async function getSyncConfig(repo: DexieProgressRepo): Promise<SyncConfig | null> {
  const row = await repo.db.kv.get('sync');
  return (row?.value as SyncConfig | undefined) ?? null;
}

export async function saveSyncConfig(repo: DexieProgressRepo, cfg: SyncConfig | null) {
  if (cfg) await repo.db.kv.put({ key: 'sync', value: cfg });
  else await repo.db.kv.delete('sync');
}

async function readRemote(client: GistClient, gist: Gist, fallbackSettings: Snapshot['settings']): Promise<{ snap: Snapshot; months: Map<string, number> }> {
  const months = new Map<string, number>();
  let logs: ReviewLogEntry[] = [];
  for (const [name, file] of Object.entries(gist.files)) {
    if (!name.startsWith(LOG_PREFIX) || !name.endsWith(LOG_SUFFIX)) continue;
    const month = name.slice(LOG_PREFIX.length, -LOG_SUFFIX.length);
    const list = await decodeLogs(await client.content(file));
    months.set(month, list.length);
    logs = logs.concat(list);
  }
  const stateFile = gist.files[STATE_FILE];
  if (!stateFile) return { snap: { states: [], logs, settings: fallbackSettings }, months };
  const doc = await decodeState(await client.content(stateFile));
  return { snap: { states: doc.states, logs, settings: doc.settings }, months };
}

export interface SyncResult {
  pulled: { states: number; logs: number };
  pushed: boolean;
  gistId: string;
}

/** Descarga, fusiona, guarda en local y sube lo que falte. */
export async function syncOnce(repo: DexieProgressRepo, cfg: SyncConfig, fetchFn?: typeof fetch): Promise<SyncResult> {
  const client = new GistClient(cfg.token, fetchFn);
  let gist: Gist | null = null;
  if (cfg.gistId) {
    try {
      gist = await client.get(cfg.gistId);
    } catch (e) {
      if (!(e instanceof GistError && e.status === 404)) throw e;
    }
  }
  gist ??= await client.find();

  const local: Snapshot = { states: await repo.allStates(), logs: await repo.allLogs(), settings: await repo.getSettings() };
  const remote = gist ? await readRemote(client, gist, local.settings) : { snap: { states: [], logs: [], settings: local.settings }, months: new Map<string, number>() };
  const res = mergeSnapshots(local, remote.snap);

  await repo.writeMerged({ states: res.localChanges.states, logs: res.localChanges.logs, daily: res.daily, settings: res.merged.settings });

  // Archivos a subir: el estado y los meses del registro que crecieron.
  const files: Record<string, string> = {};
  if (!gist || res.remoteOutdated) {
    files[STATE_FILE] = await encodeState({
      format: SYNC_FORMAT,
      updatedAt: Date.now(),
      deviceId: await repo.deviceId(),
      settings: res.merged.settings,
      states: res.merged.states,
    });
    for (const [month, list] of logsByMonth(res.merged.logs)) {
      if ((remote.months.get(month) ?? 0) !== list.length) files[logFile(month)] = await encodeLogs(list);
    }
  }
  let pushed = false;
  if (!gist) {
    gist = await client.create({ ...files, [README_FILE]: README });
    pushed = true;
  } else if (Object.keys(files).length) {
    await client.update(gist.id, files);
    pushed = true;
  }
  return { pulled: { states: res.localChanges.states.length, logs: res.localChanges.logs.length }, pushed, gistId: gist.id };
}

// ───────────── estado observable para la UI ─────────────

export type SyncPhase = 'off' | 'idle' | 'syncing' | 'ok' | 'error';
export interface SyncStatus {
  phase: SyncPhase;
  lastSyncAt?: number;
  message?: string;
  login?: string;
}

let status: SyncStatus = { phase: 'off' };
const listeners = new Set<() => void>();
const setStatus = (s: SyncStatus) => {
  status = s;
  listeners.forEach((l) => l());
};
export const syncStatus = {
  get: () => status,
  subscribe: (cb: () => void) => {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  },
};

let running: Promise<void> | null = null;

/** Sincroniza si está configurado; las llamadas simultáneas se agrupan en una. */
export function requestSync(repo: DexieProgressRepo): Promise<void> {
  running ??= (async () => {
    const cfg = await getSyncConfig(repo);
    if (!cfg) return setStatus({ phase: 'off' });
    if (typeof navigator !== 'undefined' && navigator.onLine === false)
      return setStatus({ ...status, phase: 'error', message: 'Sin conexión: se sincronizará al volver.', login: cfg.login });
    setStatus({ ...status, phase: 'syncing', login: cfg.login });
    try {
      const r = await syncOnce(repo, cfg);
      const next = { ...cfg, gistId: r.gistId, lastSyncAt: Date.now() };
      await saveSyncConfig(repo, next);
      setStatus({ phase: 'ok', lastSyncAt: next.lastSyncAt, login: cfg.login, message: r.pulled.logs ? `Recibidos ${r.pulled.logs} repasos de otro dispositivo.` : undefined });
    } catch (e) {
      setStatus({ ...status, phase: 'error', message: (e as Error).message, login: cfg.login });
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Configura el token (comprueba que funciona) y hace la primera sincronización. */
export async function connect(repo: DexieProgressRepo, token: string, fetchFn?: typeof fetch) {
  const client = new GistClient(token.trim(), fetchFn);
  const { login } = await client.user();
  await saveSyncConfig(repo, { token: token.trim(), login });
  await requestSync(repo);
  return login;
}

export async function disconnect(repo: DexieProgressRepo) {
  await saveSyncConfig(repo, null);
  setStatus({ phase: 'off' });
}

/** Sincronización automática: al abrir, al volver la conexión, al salir de la app y cada 10 min. */
export function startAutoSync(repo: DexieProgressRepo) {
  const run = () => void requestSync(repo);
  getSyncConfig(repo).then((cfg) => {
    if (cfg) {
      setStatus({ phase: 'idle', lastSyncAt: cfg.lastSyncAt, login: cfg.login });
      run();
    }
  });
  window.addEventListener('online', run);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' || document.visibilityState === 'visible') run();
  });
  setInterval(() => document.visibilityState === 'visible' && run(), 10 * 60_000);
}
