import type { AppData } from '../types';
import { createDefaultData, loadData, saveData, clearData } from './storage';

export type StorageMode = 'browser' | 'server';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}

export interface DataStore {
  readonly mode: StorageMode;
  readonly label: string;
  load(): Promise<AppData>;
  save(data: AppData): Promise<void>;
  reset(): Promise<AppData>;
}

export class BrowserDataStore implements DataStore {
  readonly mode = 'browser' as const;
  readonly label = 'Browser-Daten';

  async load(): Promise<AppData> {
    return loadData();
  }

  async save(data: AppData): Promise<void> {
    saveData(data);
  }

  async reset(): Promise<AppData> {
    clearData();
    const data = createDefaultData();
    saveData(data);
    return data;
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

interface DataResponse {
  data: AppData;
  revision: number;
}

function normalizeApiBase(value: string): string {
  const normalized = value.trim().replace(/\/+$/, '');
  if (/^https?:\/\/[^/]+$/i.test(normalized)) return `${normalized}/api`;
  return normalized || '/api';
}

async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError('Der TimePilot-Server ist unter dieser API-Adresse nicht erreichbar.', 0);
  }

  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json') ? await response.json() : undefined;
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload
      ? String((payload as { error: unknown }).error)
      : `Serveranfrage fehlgeschlagen (${response.status}).`;
    throw new ApiError(message, response.status, payload);
  }
  return payload as T;
}

export class ServerDataStore implements DataStore {
  readonly mode = 'server' as const;
  readonly label = 'PostgreSQL-Server';
  private revision = 0;

  constructor(
    private readonly apiBase: string,
    private readonly token: string,
  ) {}

  private authHeaders(): HeadersInit {
    return { Authorization: `Bearer ${this.token}` };
  }

  async load(): Promise<AppData> {
    const response = await requestJson<DataResponse>(`${normalizeApiBase(this.apiBase)}/data`, {
      headers: this.authHeaders(),
    });
    this.revision = response.revision;
    return response.data;
  }

  async save(data: AppData): Promise<void> {
    const response = await requestJson<DataResponse>(`${normalizeApiBase(this.apiBase)}/data`, {
      method: 'PUT',
      headers: this.authHeaders(),
      body: JSON.stringify({ data, revision: this.revision }),
    });
    this.revision = response.revision;
  }

  async reset(): Promise<AppData> {
    const response = await requestJson<DataResponse>(`${normalizeApiBase(this.apiBase)}/data/reset`, {
      method: 'POST',
      headers: this.authHeaders(),
    });
    this.revision = response.revision;
    return response.data;
  }
}

export function defaultServerUrl(): string {
  const configuredValue = import.meta.env.VITE_DEFAULT_SERVER_URL;
  const configured = typeof configuredValue === 'string' ? configuredValue.trim() : '';
  if (configured) return configured.replace(/\/+$/, '');
  if (window.location.port === '5173') return 'http://localhost:3001/api';
  return `${window.location.origin}/api`;
}

export async function registerAccount(
  apiBase: string,
  input: { email: string; password: string; displayName: string },
): Promise<AuthSession> {
  return requestJson<AuthSession>(`${normalizeApiBase(apiBase)}/auth/register`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function loginAccount(
  apiBase: string,
  input: { email: string; password: string },
): Promise<AuthSession> {
  return requestJson<AuthSession>(`${normalizeApiBase(apiBase)}/auth/login`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function loadCurrentUser(apiBase: string, token: string): Promise<AuthUser> {
  return requestJson<AuthUser>(`${normalizeApiBase(apiBase)}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function logoutAccount(apiBase: string, token: string): Promise<void> {
  await requestJson<{ ok: true }>(`${normalizeApiBase(apiBase)}/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}
