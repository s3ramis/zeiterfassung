import * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import TimePilotApp from './TimePilotApp';
import type { AppData } from './types';
import {
  ApiError,
  BrowserDataStore,
  defaultServerUrl,
  loadCurrentUser,
  loginAccount,
  logoutAccount,
  registerAccount,
  ServerDataStore,
  type AuthSession,
  type AuthUser,
  type DataStore,
  type StorageMode,
} from './lib/data-store';

const MODE_KEY = 'timepilot.storage-mode.v1';
const SERVER_URL_KEY = 'timepilot.server-url.v1';
const SERVER_TOKEN_KEY = 'timepilot.server-token.v1';

function selectedMode(): StorageMode | null {
  const value = sessionStorage.getItem(MODE_KEY) ?? localStorage.getItem(MODE_KEY);
  return value === 'browser' || value === 'server' ? value : null;
}

export default function App() {
  const [mode, setMode] = useState<StorageMode | null>(() => selectedMode());
  const [serverUrl, setServerUrl] = useState(() => localStorage.getItem(SERVER_URL_KEY) ?? defaultServerUrl());
  const [session, setSession] = useState<AuthSession | null>(null);
  const [checkingSession, setCheckingSession] = useState(mode === 'server');

  useEffect(() => {
    if (mode !== 'server') {
      setCheckingSession(false);
      return;
    }
    const token = localStorage.getItem(SERVER_TOKEN_KEY);
    if (!token) {
      setCheckingSession(false);
      return;
    }
    let cancelled = false;
    setCheckingSession(true);
    void loadCurrentUser(serverUrl, token)
      .then((user) => {
        if (!cancelled) setSession({ token, user });
      })
      .catch(() => {
        localStorage.removeItem(SERVER_TOKEN_KEY);
        if (!cancelled) setSession(null);
      })
      .finally(() => {
        if (!cancelled) setCheckingSession(false);
      });
    return () => { cancelled = true; };
  }, [mode, serverUrl]);

  const store = useMemo<DataStore | null>(() => {
    if (mode === 'browser') return new BrowserDataStore();
    if (mode === 'server' && session) return new ServerDataStore(serverUrl, session.token);
    return null;
  }, [mode, serverUrl, session]);

  function chooseMode(nextMode: StorageMode, nextServerUrl = serverUrl, remember = false): void {
    sessionStorage.setItem(MODE_KEY, nextMode);
    if (remember) localStorage.setItem(MODE_KEY, nextMode);
    else localStorage.removeItem(MODE_KEY);
    setMode(nextMode);
    if (nextMode === 'server') {
      const normalized = nextServerUrl.trim().replace(/\/+$/, '');
      localStorage.setItem(SERVER_URL_KEY, normalized);
      setServerUrl(normalized);
    }
  }

  function changeMode(): void {
    sessionStorage.removeItem(MODE_KEY);
    localStorage.removeItem(MODE_KEY);
    setMode(null);
    setSession(null);
  }

  async function handleLogout(): Promise<void> {
    if (session) {
      try {
        await logoutAccount(serverUrl, session.token);
      } catch {
        // Lokales Abmelden funktioniert auch, wenn der Server gerade nicht erreichbar ist.
      }
    }
    localStorage.removeItem(SERVER_TOKEN_KEY);
    setSession(null);
  }

  if (!mode) {
    return <ModeChooser serverUrl={serverUrl} setServerUrl={setServerUrl} onChoose={chooseMode} />;
  }

  if (mode === 'server' && checkingSession) {
    return <FullPageMessage title="Server-Sitzung wird geprüft" text="Verbindung und Anmeldung werden validiert …" />;
  }

  if (mode === 'server' && !session) {
    return (
      <AuthScreen
        serverUrl={serverUrl}
        onBack={changeMode}
        onAuthenticated={(nextSession, nextUrl) => {
          const normalized = nextUrl.trim().replace(/\/+$/, '');
          localStorage.setItem(SERVER_URL_KEY, normalized);
          localStorage.setItem(SERVER_TOKEN_KEY, nextSession.token);
          setServerUrl(normalized);
          setSession(nextSession);
        }}
      />
    );
  }

  if (!store) return null;

  return (
    <DataBackedApp
      key={`${mode}:${mode === 'server' ? session!.user.id : 'local'}`}
      store={store}
      user={session?.user ?? null}
      serverUrl={mode === 'server' ? serverUrl : undefined}
      onChangeMode={changeMode}
      onLogout={mode === 'server' ? handleLogout : undefined}
    />
  );
}

interface DataBackedAppProps {
  store: DataStore;
  user: AuthUser | null;
  serverUrl?: string;
  onChangeMode: () => void;
  onLogout?: () => Promise<void>;
}

function DataBackedApp({ store, user, serverUrl, onChangeMode, onLogout }: DataBackedAppProps) {
  const [data, setData] = useState<AppData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [syncState, setSyncState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = useState('');
  const latestStore = useRef(store);
  const lastSaved = useRef('');
  const saveQueue = useRef(Promise.resolve());

  useEffect(() => { latestStore.current = store; }, [store]);

  useEffect(() => {
    let cancelled = false;
    setLoadError('');
    void store.load()
      .then((loaded) => {
        if (cancelled) return;
        lastSaved.current = JSON.stringify(loaded);
        setData(loaded);
        setSyncState('saved');
        setSyncMessage(store.mode === 'server' ? 'Mit Server synchronisiert' : 'Im Browser gespeichert');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : 'Daten konnten nicht geladen werden.');
      });
    return () => { cancelled = true; };
  }, [store]);

  function queueSave(snapshot: AppData): Promise<void> {
    const serialized = JSON.stringify(snapshot);
    if (serialized === lastSaved.current) return saveQueue.current;

    setSyncState('saving');
    setSyncMessage(store.mode === 'server' ? 'Wird zum Server übertragen …' : 'Wird gespeichert …');
    const task = saveQueue.current
      .catch(() => undefined)
      .then(async () => {
        if (serialized === lastSaved.current) return;
        await latestStore.current.save(snapshot);
        lastSaved.current = serialized;
        setSyncState('saved');
        setSyncMessage(store.mode === 'server' ? 'Mit Server synchronisiert' : 'Im Browser gespeichert');
      })
      .catch((error: unknown) => {
        const message = error instanceof ApiError && error.status === 409
          ? 'Die Serverdaten wurden an anderer Stelle geändert. Bitte Seite neu laden.'
          : error instanceof Error ? error.message : 'Speichern fehlgeschlagen.';
        setSyncState('error');
        setSyncMessage(message);
        throw error;
      });
    saveQueue.current = task;
    return task;
  }

  useEffect(() => {
    if (!data || JSON.stringify(data) === lastSaved.current) return;
    const timer = window.setTimeout(() => {
      void queueSave(data).catch(() => undefined);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [data, store.mode]);

  async function saveBefore(action: () => void | Promise<void>): Promise<void> {
    if (!data) return;
    try {
      await queueSave(data);
      await action();
    } catch {
      const continueAnyway = window.confirm('Die letzten Änderungen konnten nicht gespeichert werden. Trotzdem fortfahren?');
      if (continueAnyway) await action();
    }
  }

  const storageInfo = useMemo(() => ({
    mode: store.mode,
    label: store.label,
    user,
    serverUrl,
    syncState,
    syncMessage,
  }), [serverUrl, store.label, store.mode, syncMessage, syncState, user]);

  if (loadError) {
    return (
      <FullPageMessage
        title="Daten konnten nicht geladen werden"
        text={loadError}
        actions={<><button className="small-btn primary" onClick={() => window.location.reload()}>Erneut versuchen</button><button className="small-btn" onClick={onChangeMode}>Speichermodus wechseln</button></>}
      />
    );
  }

  if (!data) {
    return <FullPageMessage title="TimePilot wird geladen" text={store.mode === 'server' ? 'Daten werden vom Server abgerufen …' : 'Browserdaten werden geöffnet …'} />;
  }

  const updateData: React.Dispatch<React.SetStateAction<AppData>> = (next) => {
    setData((previous) => {
      if (!previous) return previous;
      return typeof next === 'function' ? next(previous) : next;
    });
  };

  return (
    <TimePilotApp
      data={data}
      setData={updateData}
      storageInfo={storageInfo}
      onChangeMode={() => { void saveBefore(onChangeMode); }}
      onLogout={onLogout ? () => saveBefore(onLogout) : undefined}
      onReset={async () => {
        await saveQueue.current.catch(() => undefined);
        const reset = await store.reset();
        lastSaved.current = JSON.stringify(reset);
        setData(reset);
        setSyncState('saved');
        setSyncMessage(store.mode === 'server' ? 'Serverdaten wurden zurückgesetzt' : 'Browserdaten wurden zurückgesetzt');
      }}
    />
  );
}

interface ModeChooserProps {
  serverUrl: string;
  setServerUrl: React.Dispatch<React.SetStateAction<string>>;
  onChoose: (mode: StorageMode, serverUrl?: string, remember?: boolean) => void;
}

function ModeChooser({ serverUrl, setServerUrl, onChoose }: ModeChooserProps) {
  const [remember, setRemember] = useState(false);
  return (
    <div className="gateway-page">
      <div className="gateway-card wide">
        <div className="gateway-brand"><div className="brandmark">◷</div><div><strong>TimePilot</strong><span>Speichermodus auswählen</span></div></div>
        <h1>Wie soll die App gestartet werden?</h1>
        <p className="gateway-lead">Beide Modi enthalten dieselben Funktionen. Die Auswahl kann später in den Einstellungen geändert werden.</p>
        <div className="mode-grid">
          <button className="mode-card" onClick={() => onChoose('browser', undefined, remember)}>
            <span className="mode-icon">▣</span><strong>Browser-Daten</strong>
            <span>Ohne Server testen. Alle Daten verbleiben in diesem Browserprofil.</span>
            <em>Ideal für Einzelplatz und schnelle Tests</em>
          </button>
          <div className="mode-card static">
            <span className="mode-icon">⌘</span><strong>Datenbank-Server</strong>
            <span>Konto mit E-Mail und Passwort. Daten werden in PostgreSQL gespeichert.</span>
            <label>API-Adresse<input value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} placeholder="http://localhost:3001/api" /></label>
            <button className="small-btn primary" onClick={() => onChoose('server', serverUrl, remember)}>Server-Modus öffnen</button>
          </div>
        </div>
        <label className="remember-choice"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /> Auswahl auf diesem Gerät merken</label>
      </div>
    </div>
  );
}

interface AuthScreenProps {
  serverUrl: string;
  onBack: () => void;
  onAuthenticated: (session: AuthSession, serverUrl: string) => void;
}

function AuthScreen({ serverUrl: initialServerUrl, onBack, onAuthenticated }: AuthScreenProps) {
  const [serverUrl, setServerUrl] = useState(initialServerUrl);
  const [view, setView] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const session = view === 'register'
        ? await registerAccount(serverUrl, { email, password, displayName })
        : await loginAccount(serverUrl, { email, password });
      onAuthenticated(session, serverUrl);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Anmeldung fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gateway-page">
      <form className="gateway-card auth-card" onSubmit={(event) => void submit(event)}>
        <div className="gateway-brand"><div className="brandmark">◷</div><div><strong>TimePilot Server</strong><span>Eigenes Benutzerkonto</span></div></div>
        <div className="auth-tabs"><button type="button" className={view === 'login' ? 'active' : ''} onClick={() => setView('login')}>Anmelden</button><button type="button" className={view === 'register' ? 'active' : ''} onClick={() => setView('register')}>Konto anlegen</button></div>
        <div className="field"><label>Server-API</label><input value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} /></div>
        {view === 'register' && <div className="field"><label>Anzeigename</label><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required minLength={2} autoComplete="name" /></div>}
        <div className="field"><label>E-Mail-Adresse</label><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></div>
        <div className="field"><label>Passwort</label><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={10} autoComplete={view === 'register' ? 'new-password' : 'current-password'} /><small>Mindestens 10 Zeichen.</small></div>
        {error && <div className="notice warning">{error}</div>}
        <button className="small-btn primary auth-submit" disabled={busy}>{busy ? 'Bitte warten …' : view === 'register' ? 'Konto anlegen und starten' : 'Anmelden'}</button>
        <button type="button" className="link-button" onClick={onBack}>Zurück zur Modusauswahl</button>
      </form>
    </div>
  );
}

function FullPageMessage({ title, text, actions }: { title: string; text: string; actions?: React.ReactNode }) {
  return <div className="gateway-page"><div className="gateway-card message-card"><div className="gateway-brand"><div className="brandmark">◷</div><strong>TimePilot</strong></div><h1>{title}</h1><p className="gateway-lead">{text}</p>{actions && <div className="split-actions">{actions}</div>}</div></div>;
}
