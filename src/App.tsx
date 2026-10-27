import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpenTextIcon, ClockCounterClockwiseIcon, GearSixIcon, HouseIcon, LightningIcon, PlugsConnectedIcon, XIcon } from '@phosphor-icons/react';
import { AUTHOR, REPO_URL } from './lib/project';
import { command, deleteApiKey, errorMessage, getProviderStatus, getSettings, isNative, saveApiKey, saveSettings } from './lib/bridge';
import { defaultSettings, emptyProviders, engineNames, engineReady, fnKeys, type KeyProvider, type ProviderStatus, type Settings } from './lib/types';
import { ONBOARDING_VERSION } from './lib/onboarding';
import { shortcutKeycaps } from './lib/shortcut';
import { useAppearance } from './lib/useAppearance';
import { useHistory } from './lib/useHistory';
import { useVoice } from './lib/useVoice';
import BrandMark from './components/BrandMark';
import Connections from './components/Connections';
import Dictionary from './components/Dictionary';
import HistoryView from './components/HistoryView';
import Home from './components/Home';
import Onboarding from './components/Onboarding';
import Overlay from './components/Overlay';
import SettingsView from './components/SettingsView';
import Snippets from './components/Snippets';
import SystemIcon from './components/SystemIcon';

type View = 'home' | 'history' | 'dictionary' | 'snippets' | 'connections' | 'settings';
const nav = [
  { id: 'home', label: 'Inicio', icon: HouseIcon, symbol: 'house' },
  { id: 'history', label: 'Historial', icon: ClockCounterClockwiseIcon, symbol: 'clock.arrow.circlepath' },
  { id: 'dictionary', label: 'Diccionario', icon: BookOpenTextIcon, symbol: 'book.closed' },
  { id: 'snippets', label: 'Atajos de voz', icon: LightningIcon, symbol: 'bolt' },
  { id: 'connections', label: 'Conexiones', icon: PlugsConnectedIcon, symbol: 'network' },
  { id: 'settings', label: 'Ajustes', icon: GearSixIcon, symbol: 'gearshape' },
] as const;

function MainApp() {
  const [view, setView] = useState<View>('home');
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [providers, setProviders] = useState<ProviderStatus>(emptyProviders);
  const [loaded, setLoaded] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const [notice, setNotice] = useState('');
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const theme = useAppearance(settings.theme);
  const [history] = useHistory();
  const { voice, levelRef, isDemo, start, stop, cancel, startDemo } = useVoice();
  const mac = /Mac/i.test(navigator.userAgent);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 5000);
  }, []);
  useEffect(() => {
    let disposed = false;
    void getSettings().then(saved => { if (!disposed) { setSettings(saved); setOnboarding(saved.onboardingVersion < ONBOARDING_VERSION); setLoaded(true); } })
      .catch(error => { if (!disposed) { showNotice(errorMessage(error)); setLoaded(true); } });
    void getProviderStatus().then(status => { if (!disposed) setProviders(status); }).catch(() => {});
    if (isNative) document.documentElement.classList.add('native-app');
    return () => { disposed = true; };
  }, [showNotice]);

  const save = useCallback(async (next: Settings) => { await saveSettings(next); setSettings(next); }, []);
  const saveKey = useCallback(async (provider: KeyProvider, key: string) => { await saveApiKey(provider, key); setProviders(await getProviderStatus()); }, []);
  const deleteKey = useCallback(async (provider: KeyProvider) => { await deleteApiKey(provider); setProviders(await getProviderStatus()); }, []);
  const ready = engineReady(settings, providers);
  const connections = { settings, providers, onSave: save, onSaveKey: saveKey, onDeleteKey: deleteKey, onNotice: showNotice };
  const keys = shortcutKeycaps(settings.shortcut, mac ? 'mac' : 'windows');

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && isDemo) { event.preventDefault(); void cancel(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isDemo, cancel]);

  return <div className="app" data-theme={theme} data-reduced-motion={settings.reducedMotion || undefined} data-reduce-transparency={settings.reduceTransparency || undefined} data-high-contrast={settings.highContrast || undefined}>
    <a className="skip-link" href="#content">Saltar al contenido</a>
    <aside className="sidebar" data-tauri-drag-region>
      <div className="sidebar-top" data-tauri-drag-region>
        {/* The window uses macOS's own traffic lights (close, minimize, zoom); the preview draws stand-ins. */}
        {!isNative && <div className="traffic" aria-hidden="true"><span className="traffic-dot is-close" /><span className="traffic-dot is-min" /><span className="traffic-dot is-max" /></div>}
      </div>
      <div className="brand" data-tauri-drag-region><BrandMark className="brand-mark" /><span>{settings.brand}</span></div>
      {!onboarding && <nav aria-label="Secciones">{nav.map(item => <button key={item.id} type="button" className="nav-item" aria-current={view === item.id ? 'page' : undefined} onClick={() => setView(item.id)}>
        <SystemIcon name={item.symbol} fallback={item.icon} size={16} />{item.label}
      </button>)}</nav>}
      <div className="sidebar-foot">
        <button type="button" className="engine-status" onClick={() => setView('connections')} disabled={onboarding}>
          <span className={`dot ${ready ? 'is-ready' : ''}`} aria-hidden="true" />
          <span>{ready ? `Voz con ${engineNames[settings.sttProvider]}` : 'Conecta un motor de voz'}</span>
        </button>
        <p className="credit"><button type="button" className="credit-link" onClick={() => isNative ? void command('open_url', { url: REPO_URL }).catch(() => {}) : window.open(REPO_URL, '_blank', 'noopener')}><span>Creada por <b>{AUTHOR}</b></span><span className="credit-star">★ Estrella en GitHub</span></button></p>
        <p className="sidebar-shortcut">{(fnKeys(settings, mac) ?? keys.map(k => k.label === 'espacio' ? 'Espacio' : k.label)).map((k, i) => <kbd key={i}>{k}</kbd>)}<span>para dictar</span></p>
      </div>
    </aside>
    <main id="content" className="content" tabIndex={-1}>
      <div className="content-drag" data-tauri-drag-region aria-hidden="true" />
      {!loaded ? <div className="loading" role="status">Cargando…</div>
        : <>
          {view === 'home' && <Home settings={settings} voice={voice} levelRef={levelRef} history={history} ready={ready} isDemo={isDemo} onStart={ready ? () => void start() : startDemo} onStop={() => void stop()} onCancel={() => void cancel()} onConnect={() => setView('connections')} onOpenHistory={() => setView('history')} onNotice={showNotice} />}
          {view === 'history' && <HistoryView history={history} settings={settings} onSave={save} onNotice={showNotice} />}
          {view === 'dictionary' && <Dictionary entries={settings.dictionary} onSave={entries => save({ ...settings, dictionary: entries })} />}
          {view === 'snippets' && <Snippets settings={settings} onSave={save} onNotice={showNotice} />}
          {view === 'connections' && <Connections {...connections} />}
          {view === 'settings' && <SettingsView settings={settings} onSave={save} onNotice={showNotice} onOpenGuide={() => setOnboarding(true)} />}
        </>}
    </main>
    {loaded && onboarding && <Onboarding {...connections} voice={voice} onDone={() => { setOnboarding(false); setView('home'); }} />}
    {notice && <div role="status" className="toast"><span>{notice}</span><button type="button" aria-label="Cerrar aviso" className="icon-button" onClick={() => setNotice('')}><XIcon size={14} /></button></div>}
  </div>;
}

export default function App() { return new URLSearchParams(window.location.search).get('view') === 'overlay' ? <Overlay /> : <MainApp />; }
