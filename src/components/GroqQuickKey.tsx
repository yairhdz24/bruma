import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRightIcon, CheckCircleIcon, ClipboardTextIcon } from '@phosphor-icons/react';
import { command, errorMessage, isNative } from '../lib/bridge';

const GROQ_KEYS = 'https://console.groq.com/keys';
const openGroq = () => { if (isNative) void command('open_url', { url: GROQ_KEYS }).catch(() => {}); else window.open(GROQ_KEYS, '_blank', 'noopener'); };

type Phase = 'idle' | 'waiting' | 'found' | 'saving' | 'done';

/**
 * The fastest way to a free Groq key: open Groq, copy the key, come back.
 * Bruma notices a copied key (it only learns that one is there, shown masked as "gsk_…9fZ2"),
 * saves it with one click and checks that Groq accepts it.
 */
export default function GroqQuickKey({ onSaved, compact = false }: { onSaved: () => Promise<void> | void; compact?: boolean }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [masked, setMasked] = useState('');
  const [error, setError] = useState('');
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const look = useCallback(async () => {
    if (!isNative || !['idle', 'waiting'].includes(phaseRef.current)) return;
    const found = await command<string | null>('detect_clipboard_key', { provider: 'groq' }).catch(() => null);
    if (found && ['idle', 'waiting'].includes(phaseRef.current)) { setMasked(found); setPhase('found'); setError(''); }
  }, []);

  // Look when you come back to Bruma, and every moment while you are on Groq's page.
  useEffect(() => {
    void look();
    window.addEventListener('focus', look);
    const timer = phase === 'waiting' ? window.setInterval(() => void look(), 1200) : undefined;
    return () => { window.removeEventListener('focus', look); if (timer) window.clearInterval(timer); };
  }, [look, phase]);

  async function saveFound() {
    setPhase('saving'); setError('');
    try {
      await command('save_clipboard_key', { provider: 'groq' });
      await onSaved();
      try { await command('verify_api_key', { provider: 'groq' }); setPhase('done'); }
      catch (cause) { setError(errorMessage(cause)); setPhase('waiting'); }
    } catch (cause) { setError(errorMessage(cause)); setPhase('waiting'); }
  }

  if (phase === 'done') return <section className="key-guide is-done" role="status">
    <p className="key-guide-success"><CheckCircleIcon size={20} weight="fill" aria-hidden="true" /><span><b>¡Listo! Groq aceptó tu clave.</b> Ya puedes dictar gratis.</span></p>
  </section>;

  return <section className="key-guide" aria-labelledby="key-guide-title">
    <div className="key-guide-head">
      <h2 id="key-guide-title">{compact ? 'Clave gratis de Groq en un minuto' : 'Consigue tu clave gratis en un minuto'}</h2>
      <span className="key-guide-free">Gratis · sin tarjeta</span>
    </div>
    {phase === 'found' || phase === 'saving' ? <div className="key-guide-found" role="status">
      <ClipboardTextIcon size={20} aria-hidden="true" />
      <span>Copiaste una clave de Groq: <code>{masked}</code></span>
      <button type="button" className="button-primary" disabled={phase === 'saving'} onClick={() => void saveFound()}>{phase === 'saving' ? 'Comprobando…' : 'Usar esta clave'}</button>
    </div> : <ol>
      <li><span><b>Abre Groq</b> y entra con Google o con tu correo.</span><button type="button" className="button-primary key-guide-open" onClick={() => { openGroq(); setPhase('waiting'); }}>Abrir Groq<ArrowUpRightIcon size={13} weight="bold" aria-hidden="true" /></button></li>
      <li><span>Toca <b>Create API Key</b>, ponle de nombre <i>Bruma</i> y toca <b>Copy</b> (empieza con <code>gsk_</code>).</span></li>
      <li><span>{isNative ? <>Vuelve aquí: Bruma la detecta sola y la guarda con un clic.</> : <>Vuelve aquí, pégala en <b>Clave de Groq</b> y toca <b>Guardar</b>.</>}</span></li>
    </ol>}
    {phase === 'waiting' && !error && <p className="key-guide-note" aria-live="polite">Esperando a que copies la clave…</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <p className="key-guide-note">La clave se guarda solo en tu computadora. El plan gratis de Groq alcanza para horas de dictado al día.</p>
  </section>;
}
