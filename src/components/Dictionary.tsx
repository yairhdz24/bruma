import { useRef, useState, type FormEvent } from 'react';
import { ArrowCounterClockwise, BookOpenText, MagnifyingGlass, Plus, Trash, X } from '@phosphor-icons/react';
import type { DictionaryEntry } from '../lib/types';
import SystemIcon from './SystemIcon';

interface DictionaryProps {
  entries: DictionaryEntry[];
  onSave: (entries: DictionaryEntry[]) => Promise<void>;
}

const normalize = (value: string) => value.trim().replace(/\s+/g, ' ');
const sameTerm = (first: string, second: string) => normalize(first).toLocaleLowerCase('es') === normalize(second).toLocaleLowerCase('es');

export default function Dictionary({ entries, onSave }: DictionaryProps) {
  const termInput = useRef<HTMLInputElement>(null);
  const [term, setTerm] = useState('');
  const [query, setQuery] = useState('');
  const [aliases, setAliases] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');
  const [removed, setRemoved] = useState<{ entry: DictionaryEntry; index: number } | null>(null);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const nextTerm = normalize(term);
    const nextAliases = normalize(aliases);
    if (!nextTerm) { setFormError('Escribe la palabra como quieres que aparezca.'); return; }
    if (nextTerm.length > 80 || nextAliases.length > 160) { setFormError('Usa hasta 80 caracteres para la palabra y 160 para su pronunciación.'); return; }
    if (entries.length >= 50) { setFormError('Puedes guardar hasta 50 términos. Elimina uno para añadir otro.'); return; }
    if (entries.some((entry) => sameTerm(entry.term, nextTerm))) { setFormError('Esta palabra ya está en tu vocabulario.'); termInput.current?.focus(); return; }
    setBusy(true);
    setFormError('');
    setActionError('');
    try {
      await onSave([...entries, { term: nextTerm, aliases: nextAliases }]);
      setTerm('');
      setAliases('');
      setMessage(`“${nextTerm}” se añadió a tu vocabulario.`);
    } catch {
      setFormError('No se pudo guardar la palabra. Tu texto sigue aquí para intentarlo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(index: number) {
    if (busy || !entries[index]) return;
    const entry = entries[index];
    setBusy(true);
    setActionError('');
    try {
      await onSave(entries.filter((_, itemIndex) => itemIndex !== index));
      setRemoved({ entry, index });
      setMessage(`“${entry.term}” se eliminó. Puedes deshacerlo.`);
      requestAnimationFrame(() => termInput.current?.focus());
    } catch {
      setActionError('No se pudo eliminar la palabra. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    if (!removed || busy) return;
    if (entries.length >= 50) { setActionError('El vocabulario está lleno. Libera un lugar para recuperar esta palabra.'); return; }
    if (entries.some((entry) => sameTerm(entry.term, removed.entry.term))) {
      setRemoved(null);
      setMessage('La palabra ya está en tu vocabulario.');
      return;
    }
    const restored = [...entries];
    restored.splice(Math.min(removed.index, restored.length), 0, removed.entry);
    setBusy(true);
    setActionError('');
    try {
      await onSave(restored);
      setMessage(`“${removed.entry.term}” se recuperó.`);
      requestAnimationFrame(() => termInput.current?.focus());
      setRemoved(null);
    } catch {
      setActionError('No se pudo recuperar la palabra. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  const filtered = entries.map((entry, index) => ({ entry, index })).filter(({ entry }) => `${entry.term} ${entry.aliases}`.toLocaleLowerCase('es').includes(query.trim().toLocaleLowerCase('es')));

  return (
    <div className="page">
      <header className="page-header">
        <h1>Diccionario</h1>
        <p>Nombres, marcas y términos que quieres ver bien escritos: Supabase, Next.js, Guadalajara. Bruma se los pasa al motor de voz como pista.</p>
      </header>

      <div className="glass-panel overflow-hidden">
        <form className="p-5 sm:p-7" onSubmit={add} aria-busy={busy} aria-labelledby="dictionary-add-heading">
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 id="dictionary-add-heading" className="text-[16px] font-semibold tracking-[-.025em] text-ink">Una palabra nueva</h2>
            <span aria-label={`${entries.length} de 50 palabras guardadas`} className="text-[12px] tabular-nums text-muted">{entries.length} / 50</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><span className="field-label">Escríbela así</span>
              <input ref={termInput} className="input-field w-full" value={term} onChange={event => { setTerm(event.target.value); setFormError(''); }} maxLength={80} disabled={busy || entries.length >= 50} placeholder="Por ejemplo, GSAP" autoComplete="off" spellCheck={false} aria-invalid={Boolean(formError)} aria-describedby={formError ? 'dictionary-form-error' : undefined} />
            </label>
            <label className="block"><span className="field-label">Cómo suele sonar <span className="font-normal text-muted">· opcional</span></span>
              <input className="input-field w-full" value={aliases} onChange={event => setAliases(event.target.value)} maxLength={160} disabled={busy || entries.length >= 50} placeholder="Por ejemplo, yi sap" autoComplete="off" aria-describedby="dictionary-alias-help" />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p id="dictionary-alias-help" className="max-w-[320px] text-[12px] leading-relaxed text-muted">Opcional: cómo suele escucharse, para que el editor lo corrija.</p>
            <button type="submit" className="button-primary" disabled={busy || !term.trim() || entries.length >= 50}><SystemIcon name="plus" fallback={Plus} size={17} />{busy ? 'Guardando…' : 'Añadir palabra'}</button>
          </div>
          {formError && <p id="dictionary-form-error" role="alert" className="mt-4 text-[13px] leading-relaxed text-[var(--danger,var(--color-ink))]">{formError}</p>}
          {entries.length >= 50 && !formError && <p className="mt-4 text-[13px] leading-relaxed text-muted">Tu diccionario está lleno. Elimina una palabra para añadir otra.</p>}
        </form>

        <section className="border-t border-[var(--line)]" aria-labelledby="dictionary-saved-heading">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--surface-hover)] px-5 py-4 sm:px-7">
            <h2 id="dictionary-saved-heading" className="flex items-center gap-2 text-[13px] font-medium text-muted"><SystemIcon name="book.closed.fill" fallback={BookOpenText} size={17} />Tus palabras</h2>
            {entries.length > 0 && <div className="relative w-full sm:w-[220px]"><SystemIcon name="magnifyingglass" fallback={MagnifyingGlass} size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" /><input type="text" role="searchbox" aria-label="Buscar en tu diccionario" placeholder="Buscar palabra" value={query} onChange={event => setQuery(event.target.value)} className="input-field !min-h-11 !pl-10 !pr-10 !text-[12px]" />{query && <button type="button" aria-label="Borrar búsqueda" className="absolute right-0 top-0 grid h-11 w-11 place-items-center rounded-xl text-muted" onClick={() => setQuery('')}><SystemIcon name="xmark" fallback={X} size={15} /></button>}</div>}
          </div>
          {entries.length ? filtered.length ? <ul className="divide-y divide-[var(--line)]">
            {filtered.map(({ entry, index }) => <li key={entry.term} className="flex items-center gap-4 px-5 py-3 sm:px-7">
              <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px] bg-[var(--surface-hover)] text-[15px] font-medium text-muted">{entry.term.slice(0, 1).toLocaleUpperCase('es')}</span>
              <span className="min-w-0 flex-1"><span className="block break-words text-[14px] font-medium text-ink">{entry.term}</span><span className="mt-0.5 block break-words text-[12px] leading-relaxed text-muted">{entry.aliases || 'Sin pista de pronunciación'}</span></span>
              <button type="button" onClick={() => void remove(index)} disabled={busy} aria-label={`Eliminar ${entry.term}`} className="icon-button !h-11 !w-11 hover:text-[var(--danger,var(--color-ink))]"><SystemIcon name="trash" fallback={Trash} size={18} /></button>
            </li>)}
          </ul> : <div className="px-6 py-10 text-center"><p className="text-[14px] font-medium text-ink">No encontramos esa palabra.</p><p className="mt-1.5 text-[12px] text-muted">Prueba con su nombre o pronunciación.</p><button type="button" className="quiet-button mt-3" onClick={() => setQuery('')}>Ver todas las palabras</button></div> : <div className="flex items-center justify-center gap-5 px-6 py-10 sm:py-12">
            <div aria-hidden="true" className="relative hidden h-20 w-20 shrink-0 sm:block"><span className="absolute inset-2 rotate-[-12deg] rounded-[19px] border border-[var(--line)] bg-[var(--surface-hover)]" /><span className="absolute inset-2 grid rotate-[6deg] place-items-center rounded-[19px] border border-[var(--line)] bg-[var(--surface)] text-[27px] font-light tracking-[-.06em] text-muted">Aa</span></div>
            <div className="max-w-[330px]"><h3 className="text-[16px] font-medium tracking-[-.025em] text-ink">Tus palabras, bien escritas.</h3><p className="mt-2 text-[13px] leading-relaxed text-muted">Añade ese nombre o proyecto que el dictado suele escribir distinto.</p></div>
          </div>}
        </section>
      </div>
      <div className="mt-4 flex min-h-11 flex-wrap items-center justify-between gap-3 px-1">
        <p aria-live="polite" aria-atomic="true" className="text-[12px] leading-relaxed text-muted">{message || 'Se guarda automáticamente para tu próximo dictado.'}</p>
        {removed && <button type="button" onClick={() => void restore()} disabled={busy} className="button-secondary !text-[12px]"><SystemIcon name="arrow.uturn.backward" fallback={ArrowCounterClockwise} size={15} />Deshacer eliminación</button>}
      </div>
      {actionError && <p role="alert" className="mt-3 text-[13px] leading-relaxed text-[var(--danger,var(--color-ink))]">{actionError}</p>}
    </div>
  );
}
