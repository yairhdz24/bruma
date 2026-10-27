import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { CheckCircle, Keyboard, PencilSimple, Play } from '@phosphor-icons/react';
import { command, errorMessage, isNative } from '../lib/bridge';
import type { Settings } from '../lib/types';
import { captureShortcut, recommendedShortcut, sameShortcut, shortcutKeycaps, shortcutMatchesEvent, type ShortcutPlatform } from '../lib/shortcut';
import SystemIcon from './SystemIcon';
import './ShortcutSetup.css';

export interface ShortcutSetupProps {
  settings: Settings;
  onSave: (settings: Settings) => Promise<void>;
  compact?: boolean;
  onNotice?: (message: string) => void;
  /** Fires only after a native shortcut:test event, never for a browser keydown. */
  onTested?: () => void;
}
interface NativeShortcutTest {
  shortcut: string;
  registered: boolean;
  testActive: boolean;
  testId: string | null;
  testExpiresInMs: number;
  error: string | null;
}
type Mode = 'idle' | 'arming' | 'capture' | 'testing' | 'saving';
type Verification = 'none' | 'local' | 'native';

export default function ShortcutSetup({ settings, onSave, compact = false, onNotice, onTested }: ShortcutSetupProps) {
  const id = useId();
  const platform: ShortcutPlatform = /Mac/i.test(navigator.userAgent) ? 'mac' : 'windows';
  const [candidate, setCandidate] = useState(settings.shortcut);
  const [mode, setModeState] = useState<Mode>('idle');
  const [verification, setVerification] = useState<Verification>('none');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const captureBox = useRef<HTMLDivElement>(null);
  const modeRef = useRef<Mode>('idle');
  const candidateRef = useRef(candidate);
  const mounted = useRef(true);
  const request = useRef(0);
  const nativeTestId = useRef<string | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listener = useRef<Promise<UnlistenFn> | null>(null);
  const onNativeEvent = useRef<(shortcut: string, testId: string) => void>(() => {});
  const setMode = useCallback((next: Mode) => { modeRef.current = next; if (mounted.current) setModeState(next); }, []);
  const choose = (shortcut: string) => { candidateRef.current = shortcut; setCandidate(shortcut); setVerification('none'); setError(''); };

  useEffect(() => {
    if (!sameShortcut(candidateRef.current, settings.shortcut, platform)) setVerification('none');
    candidateRef.current = settings.shortcut;
    setCandidate(settings.shortcut);
  }, [settings.shortcut, platform]);

  const endNativeTest = useCallback(async () => {
    if (timeout.current) { clearTimeout(timeout.current); timeout.current = null; }
    const testId = nativeTestId.current;
    nativeTestId.current = null;
    if (testId) await command('end_shortcut_test', { testId });
  }, []);

  const stop = useCallback(async (text = '') => {
    request.current += 1;
    setMode('idle');
    if (mounted.current && text) setMessage(text);
    try { await endNativeTest(); }
    catch (cause) { if (mounted.current) setError(errorMessage(cause).slice(0, 280)); }
  }, [endNativeTest, setMode]);

  useEffect(() => {
    mounted.current = true;
    if (isNative) {
      listener.current = listen<{ shortcut: string; pressedAtMs: number; testId: string }>('shortcut:test', event => onNativeEvent.current(event.payload.shortcut, event.payload.testId));
      // The rejection remains available to start(), while this handler prevents an
      // unhandled rejection if the user never opens the recorder.
      void listener.current.catch(() => {});
    }
    const blur = () => {
      if (modeRef.current === 'capture' || modeRef.current === 'testing' || modeRef.current === 'arming') void stop('Prueba detenida. Vuelve a iniciarla cuando quieras.');
    };
    window.addEventListener('blur', blur);
    return () => {
      mounted.current = false; request.current += 1;
      window.removeEventListener('blur', blur);
      void listener.current?.then(unlisten => unlisten()).catch(() => {});
      void endNativeTest().catch(() => {});
    };
  }, [endNativeTest, stop]);

  useLayoutEffect(() => {
    if (mode === 'capture' || mode === 'testing') captureBox.current?.focus();
  }, [mode]);

  onNativeEvent.current = (shortcut, testId) => {
    if (!mounted.current || testId !== nativeTestId.current) return;
    if (modeRef.current === 'capture') {
      choose(shortcut);
      void stop('Combinación capturada. Guárdala para empezar a usarla.');
    } else if (modeRef.current === 'testing' && sameShortcut(shortcut, candidateRef.current, platform)) {
      setVerification('native');
      void stop('El sistema recibió tu atajo. La prueba no activó el micrófono.');
      onTested?.();
    }
  };

  async function start(next: 'capture' | 'testing') {
    if (modeRef.current !== 'idle') return;
    const token = ++request.current;
    setError(''); setMessage(''); setVerification('none'); setMode('arming');
    try {
      let expiresIn = 30_000;
      if (isNative) {
        await listener.current;
        if (!mounted.current || token !== request.current) return;
        // Guard the currently registered shortcut during capture so pressing it
        // cannot start dictation while the user is choosing a replacement.
        const result = await command<NativeShortcutTest>('begin_shortcut_test', { shortcut: next === 'capture' ? settings.shortcut : candidateRef.current });
        // A late begin(A) response must never release the newer begin(B) session.
        if (!mounted.current || token !== request.current) {
          if (result.testId) await command('end_shortcut_test', { testId: result.testId });
          return;
        }
        if (!result.testActive || !result.registered || !result.testId || result.error) throw new Error(result.error || 'No se pudo iniciar la prueba del atajo.');
        nativeTestId.current = result.testId;
        expiresIn = Math.min(30_000, Math.max(1000, result.testExpiresInMs || 30_000));
      }
      if (!mounted.current || token !== request.current) { await endNativeTest(); return; }
      setMode(next);
      setMessage(next === 'capture' ? 'Mantén los modificadores y pulsa una tecla. Esc cancela.' : isNative ? 'Pulsa la combinación mostrada. El micrófono permanece apagado.' : 'Pulsa la combinación en esta ventana. Esto solo comprueba la detección local.');
      timeout.current = setTimeout(() => { void stop(next === 'capture' ? 'Captura terminada. Tu atajo guardado no cambió.' : 'No detectamos la combinación a tiempo. Puedes probar otra vez.'); }, expiresIn);
    } catch (cause) {
      if (mounted.current && token === request.current) { setMode('idle'); setError(errorMessage(cause).slice(0, 280)); }
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (modeRef.current !== 'capture' && modeRef.current !== 'testing') return;
    // Tab remains navigation, including Shift+Tab. Leaving the capture surface
    // ends the interaction instead of turning the control into a keyboard trap.
    if (event.code === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) return;
    event.preventDefault(); event.stopPropagation();
    const result = captureShortcut(event.nativeEvent, platform);
    if (result.kind === 'cancel') { setError(''); void stop('Cancelado. Tu atajo guardado no cambió.'); return; }
    if (modeRef.current === 'testing') {
      if (!isNative && shortcutMatchesEvent(candidateRef.current, event.nativeEvent, platform)) {
        setVerification('local'); void stop('Combinación detectada aquí. El atajo global se comprueba en la app de escritorio.');
      }
      return;
    }
    if (result.kind === 'invalid') { setError(result.message); return; }
    if (result.kind === 'valid') { choose(result.shortcut); void stop('Combinación capturada. Guárdala para empezar a usarla.'); }
  }

  async function save() {
    if (modeRef.current !== 'idle') return;
    setMode('saving'); setError('');
    try {
      await endNativeTest();
      await onSave({ ...settings, shortcut: candidateRef.current });
      if (mounted.current) { setMessage('Atajo guardado.'); onNotice?.('Atajo guardado.'); }
    } catch (cause) { if (mounted.current) setError(errorMessage(cause).slice(0, 280)); }
    finally { setMode('idle'); }
  }

  const keys = shortcutKeycaps(candidate, platform);
  const dirty = !sameShortcut(candidate, settings.shortcut, platform);
  const interacting = mode === 'capture' || mode === 'testing';
  const busy = mode === 'arming' || mode === 'saving';
  return <section className={`shortcut-setup ${compact ? 'is-compact' : ''}`} aria-labelledby={`${id}-title`} aria-busy={busy}>
    <div className="shortcut-heading"><span className="shortcut-heading-icon"><SystemIcon name="keyboard" fallback={Keyboard} size={19} /></span><div><h3 id={`${id}-title`}>Tu atajo de voz</h3><p>{dirty ? 'Cambio sin guardar' : 'La combinación que activa y termina el dictado'}</p></div>{verification !== 'none' && <span className="shortcut-verified"><CheckCircle size={16} aria-hidden="true" />{verification === 'native' ? 'Verificado por el sistema' : 'Detección local'}</span>}</div>
    <div ref={captureBox} role="group" tabIndex={interacting ? 0 : -1} aria-label={`Atajo: ${keys.map(key => key.spoken).join(' + ')}`} aria-describedby={`${id}-help`} className={`shortcut-capture ${interacting ? 'is-listening' : ''} ${verification !== 'none' ? 'is-verified' : ''}`} onKeyDown={onKeyDown} onBlur={() => { if (modeRef.current === 'capture' || modeRef.current === 'testing') void stop('Prueba detenida. Tu atajo guardado no cambió.'); }}>
      <div className="shortcut-keycaps" aria-hidden="true">{keys.map((key, index) => <kbd key={`${key.label}-${index}`} className={`physical-keycap ${key.wide ? 'is-wide' : ''}`}>{key.label}</kbd>)}</div>
      <p className="shortcut-capture-label">{mode === 'arming' ? 'Preparando…' : mode === 'capture' ? 'Pulsa tu nueva combinación' : mode === 'testing' ? 'Ahora, pruébala' : 'Pulsa las teclas al mismo tiempo'}</p>
    </div>
    <div className="shortcut-actions">
      {interacting ? <button type="button" className="button-secondary" onClick={() => void stop('Cancelado. Tu atajo guardado no cambió.')}>Cancelar prueba</button> : <><button type="button" className="button-secondary" disabled={busy} onClick={() => void start('capture')}><PencilSimple size={16} aria-hidden="true" />Cambiar atajo</button><button type="button" className="quiet-button" disabled={busy} onClick={() => void start('testing')}><Play size={15} aria-hidden="true" />Probar atajo</button>{dirty && <button type="button" className="button-primary" disabled={busy} onClick={() => void save()}>{mode === 'saving' ? 'Guardando…' : 'Guardar atajo'}</button>}</>}
    </div>
    <p id={`${id}-help`} className="shortcut-help">Usa {platform === 'mac' ? '⌘, Control u Opción' : 'Ctrl o Alt'} junto con otra tecla. Izquierda y derecha cuentan igual.</p>
    {message && <p className="shortcut-message" role="status">{message}</p>}
    {error && <p className="shortcut-error" role="alert">{error}</p>}
    {!sameShortcut(candidate, recommendedShortcut, platform) && mode === 'idle' && <button type="button" className="shortcut-recommended" onClick={() => { choose(recommendedShortcut); setMessage('Combinación recomendada seleccionada. Falta guardarla.'); }}>Usar la combinación recomendada</button>}
  </section>;
}
