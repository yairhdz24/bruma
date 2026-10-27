import { useState } from 'react';
import { MagnifyingGlassIcon } from '@phosphor-icons/react';
import { clearHistory, errorMessage } from '../lib/bridge';
import type { History, Settings } from '../lib/types';
import HistoryList from './HistoryList';

interface Props { history: History; settings: Settings; onSave: (settings: Settings) => Promise<void>; onNotice: (text: string) => void }

export default function HistoryView({ history, settings, onSave, onNotice }: Props) {
  const [query, setQuery] = useState('');
  const [confirming, setConfirming] = useState(false);
  const needle = query.trim().toLocaleLowerCase('es');
  const items = needle ? history.items.filter(item => `${item.text} ${item.app}`.toLocaleLowerCase('es').includes(needle)) : history.items;
  async function clear() {
    try { await clearHistory(); setConfirming(false); onNotice('Historial borrado. Tus estadísticas se conservan.'); } catch (error) { onNotice(errorMessage(error)); }
  }
  async function toggle(saveHistory: boolean) {
    try { await onSave({ ...settings, saveHistory }); onNotice(saveHistory ? 'Bruma guardará tus próximos dictados.' : 'Los próximos dictados ya no se guardarán.'); } catch (error) { onNotice(errorMessage(error)); }
  }
  return <div className="page">
    <header className="page-header"><h1>Historial</h1><p>Todo lo que has dictado, guardado solo en este Mac. Copia cualquier texto otra vez.</p></header>
    <div className="toolbar">
      <label className="search"><MagnifyingGlassIcon size={15} aria-hidden="true" /><span className="sr-only">Buscar en el historial</span><input type="search" placeholder="Buscar" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <label className="inline-toggle"><input type="checkbox" checked={settings.saveHistory} onChange={event => void toggle(event.target.checked)} /><span className="switch" aria-hidden="true" />Guardar dictados</label>
      {history.items.length > 0 && (confirming
        ? <span className="confirm-row">¿Borrar {history.items.length} dictados?<button type="button" className="button-danger" onClick={() => void clear()}>Borrar</button><button type="button" className="button-secondary" onClick={() => setConfirming(false)}>Cancelar</button></span>
        : <button type="button" className="button-secondary" onClick={() => setConfirming(true)}>Borrar historial</button>)}
    </div>
    {items.length ? <HistoryList items={items} onNotice={onNotice} showRaw />
      : <p className="empty">{needle ? 'Ningún dictado coincide con tu búsqueda.' : 'Aún no hay dictados guardados.'}</p>}
  </div>;
}
