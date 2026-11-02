// Cliente mínimo de la API de GitHub para gists.

export const GIST_DESCRIPTION = 'Hanzi XP · progreso (sincronización, no editar)';

export interface GistFile {
  filename: string;
  content?: string;
  truncated?: boolean;
  raw_url?: string;
}

export interface Gist {
  id: string;
  description: string | null;
  files: Record<string, GistFile>;
  updated_at: string;
}

export class GistError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export class GistClient {
  constructor(
    private readonly token: string,
    private readonly fetchFn: typeof fetch = (...a) => fetch(...a),
    private readonly api = 'https://api.github.com',
  ) {}

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.fetchFn(`${this.api}${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    if (!res.ok) {
      const msg =
        res.status === 401
          ? 'El token no es válido o ha caducado.'
          : res.status === 403 || res.status === 404
            ? 'El token no tiene permiso para gists.'
            : `GitHub respondió ${res.status}.`;
      throw new GistError(msg, res.status);
    }
    return (await res.json()) as T;
  }

  user() {
    return this.call<{ login: string }>('/user');
  }

  /** Busca el gist de sincronización entre los gists del usuario. */
  async find(): Promise<Gist | null> {
    for (let page = 1; page <= 10; page++) {
      const list = await this.call<Gist[]>(`/gists?per_page=100&page=${page}`);
      const hit = list.find((g) => g.description === GIST_DESCRIPTION);
      if (hit) return this.get(hit.id);
      if (list.length < 100) return null;
    }
    return null;
  }

  get(id: string) {
    return this.call<Gist>(`/gists/${id}`);
  }

  create(files: Record<string, string>) {
    return this.call<Gist>('/gists', {
      method: 'POST',
      body: JSON.stringify({
        description: GIST_DESCRIPTION,
        public: false,
        files: Object.fromEntries(Object.entries(files).map(([k, content]) => [k, { content }])),
      }),
    });
  }

  update(id: string, files: Record<string, string>) {
    return this.call<Gist>(`/gists/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ files: Object.fromEntries(Object.entries(files).map(([k, content]) => [k, { content }])) }),
    });
  }

  /** Contenido completo de un archivo (la API recorta los de más de 1 MB). */
  async content(file: GistFile): Promise<string> {
    if (!file.truncated && file.content !== undefined) return file.content;
    if (!file.raw_url) throw new GistError(`Archivo ${file.filename} sin contenido.`, 0);
    const res = await this.fetchFn(file.raw_url);
    if (!res.ok) throw new GistError(`No se pudo descargar ${file.filename}.`, res.status);
    return res.text();
  }
}
