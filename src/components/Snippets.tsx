import { useState, type FormEvent } from 'react';
import { TrashIcon } from '@phosphor-icons/react';
import { errorMessage } from '../lib/bridge';
import type { Settings, Snippet } from '../lib/types';

interface Props { settings: Settings; onSave: (settings: Settings) => Promise<void>; onNotice: (text: string) => void }

const examples: Snippet[] = [
  { trigger: 'mi correo', text: 'tu@correo.com' },
  { trigger: 'mi agenda', text: 'Puedes agendar una llamada conmigo aquí: https://cal.com/tu-usuario' },
];

export default function Snippets({ settings, onSave, onNotice }: Props) {
  const [trigger, setTrigger] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const list = settings.snippets;
  async function save(next: Snippet[], message: string) {
    setBusy(true); setError('');
    try { await onSave({ ...settings, snippets: next }); onNotice(message); return true; }
    catch (cause) { setError(errorMessage(cause)); return false; }
    finally { setBusy(false); }
  }
  async function add(event: FormEvent) {
    event.preventDefault();
    const t = trigger.trim().replace(/\s+/g, ' '); const body = text.trim();
    if (t.length < 2 || !body) { setError('Escribe la frase que dirás y el texto que debe aparecer.'); return; }
    if (list.some(s => s.trigger.toLocaleLowerCase('es') === t.toLocaleLowerCase('es'))) { setError('Ya tienes un atajo con esa frase.'); return; }
    if (await save([...list, { trigger: t, text: body }], `Listo. Di «${t}» y Bruma escribirá el texto.`)) { setTrigger(''); setText(''); }
  }
  return <div className="page">
    <header className="page-header"><h1>Atajos de voz</h1><p>Di una frase corta y Bruma escribe un texto largo: tu correo, una dirección, una respuesta que repites cada día.</p></header>
    <form className="panel form-grid" onSubmit={add}>
      <label><span className="field-label">Cuando diga</span><input className="input-field" value={trigger} maxLength={60} onChange={e => { setTrigger(e.target.value); setError(''); }} placeholder="mi correo" /></label>
      <label className="span-2"><span className="field-label">Escribe</span><textarea className="input-field textarea" value={text} maxLength={4000} rows={3} onChange={e => { setText(e.target.value); setError(''); }} placeholder="tu@correo.com" /></label>
      <div className="form-actions span-2">
        {error ? <p className="form-error" role="alert">{error}</p> : <p className="form-help">Funciona en medio de una frase: «escríbeme a mi correo» también se reemplaza.</p>}
        <button type="submit" className="button-primary" disabled={busy || list.length >= 100}>Añadir atajo</button>
      </div>
    </form>
    {list.length ? <ul className="rows">{list.map((snippet, index) => <li key={snippet.trigger} className="row">
      <span className="row-trigger">«{snippet.trigger}»</span>
      <span className="row-text">{snippet.text}</span>
      <button type="button" className="icon-button" aria-label={`Eliminar «${snippet.trigger}»`} disabled={busy} onClick={() => void save(list.filter((_, i) => i !== index), `«${snippet.trigger}» eliminado.`)}><TrashIcon size={16} /></button>
    </li>)}</ul>
      : <div className="empty">
        <p>Algunas ideas para empezar:</p>
        <ul className="rows">{examples.map(example => <li key={example.trigger} className="row is-example"><span className="row-trigger">«{example.trigger}»</span><span className="row-text">{example.text}</span><button type="button" className="link-button" onClick={() => { setTrigger(example.trigger); setText(example.text); }}>Usar</button></li>)}</ul>
      </div>}
  </div>;
}
