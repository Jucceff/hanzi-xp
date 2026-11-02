// Formato de los archivos en el gist: JSON comprimido con gzip y codificado en base64.
// Un archivo de estado y un archivo de registro por mes (para no reescribir todo cada vez).
import type { ReviewLogEntry, SkillState } from '../core/engine';
import { reviveCard } from '../core/scheduler';
import type { Settings } from '../db/db';

export const SYNC_FORMAT = 1;
export const STATE_FILE = 'hanzi-xp.estado.b64';
export const LOG_PREFIX = 'hanzi-xp.registro.';
export const LOG_SUFFIX = '.b64';
export const README_FILE = 'LEEME.md';

export const logFile = (month: string) => `${LOG_PREFIX}${month}${LOG_SUFFIX}`;
export const monthOf = (ts: number) => new Date(ts).toISOString().slice(0, 7); // UTC: estable entre dispositivos

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64.trim());
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function encode(data: unknown): Promise<string> {
  return toBase64(await gzip(JSON.stringify(data)));
}

export async function decode<T>(b64: string): Promise<T> {
  return JSON.parse(await gunzip(fromBase64(b64))) as T;
}

export interface StateDoc {
  format: number;
  updatedAt: number;
  deviceId: string;
  settings: Settings;
  states: SkillState[];
}

export const encodeState = (doc: StateDoc) => encode(doc);

export async function decodeState(b64: string): Promise<StateDoc> {
  const doc = await decode<StateDoc>(b64);
  if (doc.format > SYNC_FORMAT) throw new Error('El progreso en la nube es de una versión más nueva de la app.');
  return { ...doc, states: doc.states.map((s) => ({ ...s, card: s.card ? reviveCard(s.card) : undefined })) };
}

export const encodeLogs = (logs: ReviewLogEntry[]) => encode(logs);
export const decodeLogs = (b64: string) => decode<ReviewLogEntry[]>(b64);

/** Agrupa el registro por mes (UTC). */
export function logsByMonth(logs: ReviewLogEntry[]): Map<string, ReviewLogEntry[]> {
  const out = new Map<string, ReviewLogEntry[]>();
  for (const l of logs) {
    const m = monthOf(l.ts);
    if (!out.has(m)) out.set(m, []);
    out.get(m)!.push(l);
  }
  return out;
}
