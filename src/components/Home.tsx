import type { RefObject } from 'react';
import { MicrophoneIcon, StopIcon, XIcon } from '@phosphor-icons/react';
import { shortcutKeycaps } from '../lib/shortcut';
import { duration, number, stats } from '../lib/useHistory';
import { fnKeys, type History, type Settings, type VoiceState } from '../lib/types';
import HistoryList from './HistoryList';
import SkyDemo from './SkyDemo';

interface Props {
  settings: Settings;
  voice: VoiceState;
  levelRef: RefObject<number>;
  history: History;
  ready: boolean;
  isDemo: boolean;
  onStart: () => void;
  onStop: () => void;
  onCancel: () => void;
  onConnect: () => void;
  onOpenHistory: () => void;
  onNotice: (text: string) => void;
}

function greeting(name: string) {
  const hour = new Date().getHours();
  const part = hour < 6 ? 'Buenas noches' : hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
  return name ? `${part}, ${name.split(' ')[0]}` : part;
}

export default function Home({ settings, voice, history, ready, isDemo, onStart, onStop, onCancel, onConnect, onOpenHistory, onNotice }: Props) {
  const mac = /Mac/i.test(navigator.userAgent);
  const keys = shortcutKeycaps(settings.shortcut, mac ? 'mac' : 'windows');
  const recording = voice.phase === 'listening' || voice.phase === 'paused' || voice.phase === 'connecting';
  const working = voice.phase === 'processing';
  const done = (voice.phase === 'inserted' || voice.phase === 'ready') && Boolean(voice.result);
  const figures = stats(history.totals);
  const recent = history.items.slice(0, 6);
  const words = `${voice.transcript}${voice.interim ? ` ${voice.interim}` : ''}`.trim();
  const fnCaps = fnKeys(settings, mac);
  const fn = Boolean(fnCaps);
  const fnName = fnCaps?.join(' + ') ?? 'fn';

  let status: string | null = null;
  if (recording) status = words || (voice.live || isDemo ? 'Te escucho…' : 'Te escucho. El texto aparece al terminar.');
  else if (working) status = 'Escribiendo…';
  else if (done) status = voice.result;

  return <div className="page home">
    <section className="home-hero" aria-label="Dictado">
      <div>
        <h1>{greeting(settings.profileName)}</h1>
        {ready ? <p>{fn ? `Toca ${fnName} en cualquier app, habla y vuelve a tocarlo. O mantenlo presionado mientras hablas.` : 'Presiona el atajo en cualquier app, habla y vuelve a presionarlo.'} El texto aparece donde está tu cursor.</p>
          : <p>Conecta un motor de voz para empezar. Deepgram muestra las palabras al instante y Groq es gratis para uso personal.</p>}
        <div className="home-keys" aria-label="Atajos">
          {fnCaps && <>{fnCaps.map(k => <kbd key={k} className="keycap">{k}</kbd>)}<span>o</span></>}
          {keys.map((key, i) => <kbd key={i} className="keycap">{key.label === 'espacio' ? 'Espacio' : key.label}</kbd>)}
          <span>dictar</span><kbd className="keycap">esc</kbd><span>cancelar</span>
        </div>
        <div className="home-actions">
          {recording ? <>
            <button type="button" className="button-primary is-ink" onClick={onStop}><StopIcon size={12} weight="fill" aria-hidden="true" />Terminar</button>
            <button type="button" className="button-secondary" onClick={onCancel}><XIcon size={13} weight="bold" aria-hidden="true" />Cancelar</button>
          </> : ready ? <button type="button" className="button-primary" onClick={onStart} disabled={working}><MicrophoneIcon size={15} aria-hidden="true" />Probar aquí</button>
            : <><button type="button" className="button-primary is-ink" onClick={onConnect}>Conectar un motor de voz</button><button type="button" className="button-secondary" onClick={onStart}>Ver demostración</button></>}
        </div>
        {status && <p className={`home-live ${recording && !words ? 'is-muted' : ''}`} aria-live="polite">{status}</p>}
        {done && <p className="tour-small">{voice.copied || voice.phase === 'ready' ? 'Copiado. Pégalo con ⌘V donde lo necesites.' : `Pegado en ${voice.context.name}.`}</p>}
        {voice.error && voice.phase !== 'idle' && <p className="home-error" role="alert">{voice.error}</p>}
      </div>
      <SkyDemo reducedMotion={settings.reducedMotion} />
    </section>

    <dl className="stats">
      <div><dt>Palabras</dt><dd>{number(figures.words)}</dd></div>
      <div><dt>Velocidad</dt><dd>{figures.wpm || '—'}<small>{figures.wpm ? 'ppm' : ''}</small></dd></div>
      <div><dt>Tiempo ahorrado</dt><dd>{figures.savedMinutes ? duration(figures.savedMinutes) : '—'}</dd></div>
      <div><dt>Racha</dt><dd>{figures.streak}<small>{figures.streak === 1 ? 'día' : 'días'}</small></dd></div>
    </dl>

    <section className="section" aria-labelledby="recent-heading">
      <div className="section-head"><h2 id="recent-heading">Recientes</h2>{history.items.length > recent.length && <button type="button" className="link-button" onClick={onOpenHistory}>Ver todo el historial</button>}</div>
      {recent.length ? <HistoryList items={recent} onNotice={onNotice} /> : <p className="empty">{settings.saveHistory ? 'Tus dictados aparecerán aquí, con la app donde los escribiste, para copiarlos otra vez cuando los necesites.' : 'El historial está desactivado. Actívalo en Ajustes si quieres volver a copiar tus dictados.'}</p>}
    </section>
  </div>;
}
