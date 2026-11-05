import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRightIcon, CheckCircleIcon, ClipboardTextIcon } from '@phosphor-icons/react';
import { command, errorMessage, isNative } from '../lib/bridge';
import { isWindows } from '../lib/platform';

const GROQ_KEYS = 'https://console.groq.com/keys';
const openGroq = () => { if (isNative) void command('open_url', { url: GROQ_KEYS }).catch(() => {}); else window.open(GROQ_KEYS, '_blank', 'noopener'); };

type Phase = 'idle' | 'waiting' | 'found' | 'saving' | 'done';

/**
 * The fastest way to a free Groq key: open Groq, copy the key, come back.
 * The key is read and stored by Rust only; this window learns at most a masked "gsk_…9fZ2".
 * Windows: after you tap "Abrir Groq", Bruma notices the copied key on its own.
 * macOS shows a privacy prompt when an app reads the clipboard by itself, so there the
 * clipboard is read only when you tap "Usar la clave que copié".
 */
export default function GroqQuickKey({ onSaved, compact = false }: { onSaved: () => Promise<void> | void; compact?: boolean }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [masked, setMasked] = useState('');
  const [error, setError] = useState('');
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  const autoDetect = isNative && isWindows;

  const look = useCallback(async () => {
    if (phaseRef.current !== 'waiting') return;
    const found = await command<string | null>('detect_clipboard_key', { provider: 'groq' }).catch(() => null);
    if (found && phaseRef.current === 'waiting') { setMasked(found); setPhase('found'); setError(''); }
  }, []);

  // Only while you are getting the key (you tapped "Abrir Groq"), and for ten minutes at most.
  useEffect(() => {
    if (!autoDetect || phase !== 'waiting') return;
    const timer = window.setInterval(() => void look(), 1200);
    const stop = window.setTimeout(() => window.clearInterval(timer), 10 * 60_000);
    window.addEventListener('focus', look);
    return () => { window.clearInterval(timer); window.clearTimeout(stop); window.removeEventListener('focus', look); };
  }, [autoDetect, look, phase]);

  async function saveCopied() {
    setPhase('saving'); setError('');
    try {
      await command('save_clipboard_key', { provider: 'groq', expected: masked || null });
      await onSaved();
    } catch (cause) { setError(errorMessage(cause)); setPhase('waiting'); return; }
    try { await command('verify_api_key', { provider: 'groq' }); setPhase('done'); }
    catch (cause) { setError(`Se guardó, pero: ${errorMessage(cause)}`); setPhase('waiting'); }
  }

  if (phase === 'done') return <section className="key-guide is-done" role="status">
    <p className="key-guide-success"><CheckCircleIcon size={20} weight="fill" aria-hidden="true" /><span><b>¡Listo! Groq aceptó tu clave.</b> Ya puedes dictar gratis.</span></p>
  </section>;

  const lastStep = !isNative ? <>Vuelve aquí, pégala en <b>Clave de Groq</b> y toca <b>Guardar</b>.</>
    : autoDetect ? <>Vuelve aquí: Bruma la detecta sola y la guarda con un clic.</>
    : <>Vuelve aquí y toca <b>Usar la clave que copié</b>.</>;

  return <section className="key-guide" aria-labelledby="key-guide-title">
    <div className="key-guide-head">
      <h2 id="key-guide-title">{compact ? 'Clave gratis de Groq en un minuto' : 'Consigue tu clave gratis en un minuto'}</h2>
      <span className="key-guide-free">Gratis · sin tarjeta</span>
    </div>
    {phase === 'found' || (phase === 'saving' && masked) ? <div className="key-guide-found" role="status">
      <ClipboardTextIcon size={20} aria-hidden="true" />
      <span>Copiaste una clave de Groq: <code>{masked}</code></span>
      <button type="button" className="button-primary" disabled={phase === 'saving'} onClick={() => void saveCopied()}>{phase === 'saving' ? 'Comprobando…' : 'Usar esta clave'}</button>
    </div> : <ol>
      <li><span><b>Abre Groq</b> y entra con Google o con tu correo.</span><button type="button" className="button-primary key-guide-open" onClick={() => { openGroq(); setPhase('waiting'); }}>Abrir Groq<ArrowUpRightIcon size={13} weight="bold" aria-hidden="true" /></button></li>
      <li><span>Toca <b>Create API Key</b>, ponle de nombre <i>Bruma</i> y toca <b>Copy</b> (empieza con <code>gsk_</code>).</span></li>
      <li><span>{lastStep}</span>{isNative && !autoDetect && <button type="button" className="button-secondary key-guide-open" disabled={phase === 'saving'} onClick={() => void saveCopied()}>{phase === 'saving' ? 'Comprobando…' : 'Usar la clave que copié'}</button>}</li>
    </ol>}
    {autoDetect && phase === 'waiting' && !error && <p className="key-guide-note" aria-live="polite">Esperando a que copies la clave…</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <p className="key-guide-note">La clave se guarda solo en tu computadora y Bruma borra el portapapeles al guardarla. El plan gratis de Groq alcanza para horas de dictado al día.</p>
  </section>;
}
