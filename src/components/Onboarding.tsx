import { useEffect, useMemo, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { GlobeIcon, InfoIcon } from '@phosphor-icons/react';
import { command, errorMessage, isNative } from '../lib/bridge';
import { ONBOARDING_VERSION, openPermissionSettings } from '../lib/onboarding';
import { shortcutKeycaps } from '../lib/shortcut';
import { engineReady, fnKeys, type Settings, type VoiceState } from '../lib/types';
import Connections, { type ConnectionsProps } from './Connections';
import PermissionSetup from './PermissionSetup';
import SkyDemo from './SkyDemo';

interface Props extends ConnectionsProps { settings: Settings; voice: VoiceState; onDone: () => void }
type Step = 'welcome' | 'permissions' | 'engine' | 'mode' | 'key' | 'messages' | 'mail' | 'speed' | 'ready';
const TYPING_WPM = 40;

const words = (text: string) => text.split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length;

/** Practice box: dictation pastes here (Bruma tells the native side this field is the target). */
function Practice({ kind, settings, voice, onWords }: { kind: 'messages' | 'mail'; settings: Settings; voice: VoiceState; onWords: (words: number, ms: number) => void }) {
  const [text, setText] = useState('');
  const [armed, setArmed] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const counted = useRef('');
  const mac = /Mac/i.test(navigator.userAgent);
  const keys = shortcutKeycaps(settings.shortcut, mac ? 'mac' : 'windows').map(k => k.label === 'espacio' ? 'Espacio' : k.label).join(' ');
  useEffect(() => {
    if (!isNative) return;
    void command('set_practice_field', { active: armed }).catch(() => {});
    return () => { void command('set_practice_field', { active: false }).catch(() => {}); };
  }, [armed]);
  // Count each finished dictation once for the speed comparison.
  useEffect(() => {
    if ((voice.phase === 'inserted' || voice.phase === 'ready') && voice.result && counted.current !== voice.sessionId) {
      counted.current = voice.sessionId;
      onWords(words(voice.result), voice.elapsedMs);
      // Browser preview, or when the system kept the text on the clipboard: show it here anyway.
      if (!isNative || voice.copied || voice.phase === 'ready') setText(value => `${value}${value && !value.endsWith(' ') ? ' ' : ''}${voice.result}`);
    }
  }, [voice, onWords]);
  const fnCaps = fnKeys(settings, mac);
  const hint = fnCaps ? `Mantén ${fnCaps.join(' + ')} y habla. Suelta para pegar.` : `Presiona ${keys}, habla y vuelve a presionarlo.`;
  return <div className="practice">
    <h2>Prueba dictando</h2>
    <p>Es solo un ejemplo. Di lo que quieras.</p>
    <div className="practice-card">
      {kind === 'messages' ? <>
        <div className="practice-app"><i style={{ background: 'linear-gradient(180deg,#5df27a,#1fbf3c)' }} />Mensajes</div>
        <div className="bubble"><b>AN</b><span>¡Hola! ¿Qué haces hoy?</span></div>
      </> : <>
        <div className="practice-app"><i style={{ background: 'linear-gradient(180deg,#5ab0ff,#1667e0)' }} />Correo</div>
        <div className="mail-fields"><span><b>Para:</b> equipo@empresa.com</span><span><b>Asunto:</b> Avance del proyecto</span></div>
      </>}
      <div className="practice-input">
        <textarea ref={area} aria-label="Texto de práctica" value={text} onChange={e => setText(e.target.value)} onFocus={() => setArmed(true)} onBlur={() => setArmed(false)} placeholder={armed ? hint : ''} />
        {!armed && !text && <div className="practice-start"><button type="button" className="button-primary" onClick={() => area.current?.focus()}>Haz clic aquí para empezar</button></div>}
      </div>
    </div>
  </div>;
}

export default function Onboarding({ settings, voice, onDone, ...connections }: Props) {
  const mac = /Mac/i.test(navigator.userAgent);
  const steps = useMemo<Step[]>(() => ['welcome', 'permissions', 'engine', 'mode', ...(mac ? ['key' as Step] : []), 'messages', 'mail', 'speed', 'ready'], [mac]);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fnDown, setFnDown] = useState(false);
  const [fnSeen, setFnSeen] = useState(false);
  const [spoken, setSpoken] = useState({ words: 0, ms: 0 });
  const step = steps[index];
  const keys = shortcutKeycaps(settings.shortcut, mac ? 'mac' : 'windows').map(k => k.label === 'espacio' ? 'Espacio' : k.label);

  useEffect(() => {
    if (!isNative) return;
    let disposed = false; let cleanup: (() => void) | undefined;
    void listen<{ down: boolean }>('fn:key', event => { if (!disposed) { setFnDown(event.payload.down); if (event.payload.down) setFnSeen(true); } })
      .then(unlisten => { if (disposed) unlisten(); else cleanup = unlisten; });
    return () => { disposed = true; cleanup?.(); };
  }, []);
  // Browser preview: the real fn key never reaches a web page, so the Shift key stands in for it.
  useEffect(() => {
    if (isNative) return;
    const down = (e: KeyboardEvent) => { if (e.key === 'Shift') { setFnDown(true); setFnSeen(true); } };
    const up = (e: KeyboardEvent) => { if (e.key === 'Shift') setFnDown(false); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  const next = () => setIndex(i => Math.min(steps.length - 1, i + 1));
  const back = () => setIndex(i => Math.max(0, i - 1));
  async function finish() {
    setBusy(true); setError('');
    try { await connections.onSave({ ...settings, onboardingVersion: ONBOARDING_VERSION }); onDone(); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }
  async function useShortcutInstead() {
    try { await connections.onSave({ ...settings, fnKey: false }); next(); } catch (cause) { setError(errorMessage(cause)); }
  }
  const addWords = (count: number, ms: number) => setSpoken(value => ({ words: value.words + count, ms: value.ms + ms }));
  const wpm = spoken.ms > 1500 && spoken.words > 0 ? Math.round(spoken.words / (spoken.ms / 60_000)) : 0;
  const factor = wpm ? Math.max(1, Math.round((wpm / TYPING_WPM) * 10) / 10) : 0;
  const ready = engineReady(settings, connections.providers);
  const progress = ((index + 1) / steps.length) * 100;
  const fnCaps = fnKeys(settings, mac);
  const startKeys = fnCaps ? <>{fnCaps.map(k => <kbd key={k} className="keycap">{k}</kbd>)}<span>o</span></> : null;

  return <div className="tour" role="dialog" aria-modal="true" aria-label="Bienvenida a Bruma">
    <div className="tour-progress" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={index + 1} aria-label="Progreso"><span style={{ width: `${progress}%` }} /></div>
    <div className="tour-body" data-tauri-drag-region>
      <div className="tour-step" key={step}>
        {step === 'welcome' && <div className="tour-split">
          <div>
            <p className="tour-hero">Habla.<br /><em>Bruma</em> escribe.</p>
            <p className="tour-lead">Dicta en cualquier app de tu Mac y el texto aparece donde está tu cursor, con puntuación, acentos y sin muletillas. Hasta cuatro veces más rápido que teclear.</p>
            <div className="tour-actions"><button type="button" className="button-primary is-ink" onClick={next}>Empezar</button><span className="tour-credit">Creada por <b>Yair Hernández</b></span></div>
          </div>
          <SkyDemo reducedMotion={settings.reducedMotion} />
        </div>}

        {step === 'permissions' && <div className="tour-center">
          <h1>Dos permisos y listo</h1>
          <p className="tour-lead">El micrófono solo se enciende cuando tú empiezas a dictar. Accesibilidad le permite a Bruma pegar el texto y reconocer la tecla fn.</p>
          <div className="tour-panel"><PermissionSetup /></div>
          <div className="tour-actions"><button type="button" className="button-primary" onClick={next}>Continuar</button></div>
        </div>}

        {step === 'engine' && <div className="tour-center">
          <h1>¿Quién escucha?</h1>
          <p className="tour-lead">Un motor convierte tu voz en texto con tu propia clave, sin intermediarios. Deepgram muestra las palabras mientras hablas; Groq es gratis para uso personal.</p>
          <div className="tour-panel"><Connections {...connections} settings={settings} engineOnly /></div>
          <div className="tour-actions"><button type="button" className="button-primary" disabled={!ready} onClick={next}>{ready ? 'Continuar' : 'Guarda una clave para continuar'}</button>{!ready && <button type="button" className="button-secondary" onClick={next}>Hacerlo después</button>}</div>
        </div>}

        {step === 'mode' && <div className="tour-split">
          <div>
            <h1>Modo dictado</h1>
            <p className="tour-lead">Bruma transcribe lo que dices, quita las muletillas, corrige errores y respeta tu forma de escribir en cada app: breve en WhatsApp, en párrafos en Correo, exacta en tu editor de código.</p>
            <p className="tour-lead">{fnCaps ? <>Toca <b>{fnCaps.join(' + ')}</b> para empezar y otra vez para pegar, o mantenlo presionado mientras hablas.</> : <>Presiona {keys.join(' ')} para empezar y otra vez para pegar.</>} <b>Esc</b> cancela.</p>
            <div className="tour-actions"><button type="button" className="button-primary" onClick={next}>Continuar</button></div>
          </div>
          <SkyDemo reducedMotion={settings.reducedMotion} />
        </div>}

        {step === 'key' && <div className="tour-center">
          <h1>Al presionar <span className="keycap" style={{ verticalAlign: 'middle' }}>fn</span>, ¿se ilumina la tecla?</h1>
          <div className="key-test">
            <div className="key-test-well"><span className="big-key" data-down={fnDown || undefined}><span>fn</span><GlobeIcon size={15} aria-hidden="true" /></span></div>
            <p className="key-test-note"><InfoIcon size={18} aria-hidden="true" style={{ flex: 'none' }} /><span>Para que fn no abra los emojis ni el dictado de Apple, ve a Teclado y elige <b>“Al presionar 🌐: No hacer nada”</b>. {isNative && <button type="button" className="link-button" onClick={() => void openPermissionSettings('keyboard').catch(() => {})}>Abrir ajustes de Teclado</button>}</span></p>
            <div className="key-test-row">
              <button type="button" className="button-secondary" onClick={() => void useShortcutInstead()}>No, usar {keys.join(' ')}</button>
              <button type="button" className="button-primary" disabled={!fnSeen} onClick={() => { if (!settings.fnKey) void connections.onSave({ ...settings, fnKey: true }); next(); }}>Sí</button>
            </div>
          </div>
          {!fnSeen && <p className="tour-small" style={{ marginTop: 14 }}>Presiona fn ahora. Si no reacciona, revisa que Accesibilidad esté activada para Bruma.</p>}
        </div>}

        {(step === 'messages' || step === 'mail') && <div className="tour-center">
          <Practice kind={step} settings={settings} voice={voice} onWords={addWords} />
          <div className="practice-actions" style={{ width: 'min(620px, 100%)' }}>
            {!ready && <span className="tour-small">Conecta un motor de voz para probar.</span>}
            <button type="button" className="button-primary" onClick={next}>{spoken.words ? 'Siguiente' : 'Saltar'}</button>
          </div>
        </div>}

        {step === 'speed' && <div className="tour-center">
          <p className="tour-lead" style={{ marginTop: 0 }}>{wpm ? 'Acabas de hablar' : 'Hablando, la mayoría escribe'}</p>
          <p className="tour-hero">{wpm ? `${factor}× más rápido` : '3× más rápido'}</p>
          <p className="tour-lead">que al teclear a una velocidad promedio.</p>
          <dl className="speed">
            <div><dt>Teclado promedio</dt><dd>{TYPING_WPM}<small>palabras/min</small></dd></div>
            <div className="is-you"><dt>{wpm ? 'Tu voz' : 'Voz promedio'}</dt><dd>{wpm || 150}<small>palabras/min</small></dd></div>
          </dl>
          <div className="tour-actions"><button type="button" className="button-primary" onClick={next}>Continuar</button></div>
        </div>}

        {step === 'ready' && <div className="tour-split">
          <div>
            <h1>Todo listo{settings.profileName ? `, ${settings.profileName.split(' ')[0]}` : ''}</h1>
            <p className="tour-lead">La píldora sobre el Dock te dirá cuándo Bruma te escucha y en qué app vas a escribir.</p>
            <div className="home-keys">{startKeys}{keys.map((key, i) => <kbd key={i} className="keycap">{key}</kbd>)}<span>para dictar</span><kbd className="keycap">esc</kbd><span>para cancelar</span></div>
            <div className="tour-actions"><button type="button" className="button-primary is-ink" disabled={busy} onClick={() => void finish()}>Empezar a dictar</button></div>
            {error && <p className="form-error" role="alert">{error}</p>}
          </div>
          <SkyDemo showKey={false} app="Correo" reducedMotion={settings.reducedMotion} />
        </div>}
      </div>
    </div>
    <footer className="tour-foot">
      {index > 0 ? <button type="button" className="button-secondary" onClick={back}>Atrás</button> : <span />}
      {step !== 'ready' && <button type="button" className="button-secondary" disabled={busy} onClick={() => void finish()}>Saltar la bienvenida</button>}
    </footer>
  </div>;
}
