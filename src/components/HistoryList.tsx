import { useState } from 'react';
import { CheckIcon, CopyIcon, TrashIcon } from '@phosphor-icons/react';
import { copyText, deleteHistoryItem, errorMessage } from '../lib/bridge';
import { dayLabel, timeLabel } from '../lib/useHistory';
import type { HistoryEntry } from '../lib/types';
import AppBadge from './AppBadge';
import { useAppIcon } from '../lib/appColor';

function HistoryApp({ item }: { item: HistoryEntry }) {
  const icon = useAppIcon(item.bundleId);
  return <AppBadge context={{ name: item.app, iconDataUrl: icon }} size={16} />;
}

interface Props { items: HistoryEntry[]; onNotice: (text: string) => void; showRaw?: boolean }

export default function HistoryList({ items, onNotice, showRaw = false }: Props) {
  const [copied, setCopied] = useState('');
  const [open, setOpen] = useState('');
  async function copy(item: HistoryEntry) {
    try { await copyText(item.text); setCopied(item.id); setTimeout(() => setCopied(value => value === item.id ? '' : value), 1600); }
    catch (error) { onNotice(errorMessage(error)); }
  }
  async function remove(item: HistoryEntry) {
    try { await deleteHistoryItem(item.id); onNotice('Dictado eliminado.'); } catch (error) { onNotice(errorMessage(error)); }
  }
  const groups: { label: string; items: HistoryEntry[] }[] = [];
  for (const item of items) {
    const label = dayLabel(item.createdAt);
    if (groups.at(-1)?.label === label) groups.at(-1)!.items.push(item); else groups.push({ label, items: [item] });
  }
  return <div className="history">
    {groups.map(group => <section key={group.label} aria-label={group.label}>
      <h3 className="history-day">{group.label}</h3>
      <ul>{group.items.map(item => <li key={item.id} className="history-item">
        <time className="history-time" dateTime={new Date(item.createdAt).toISOString()}>{timeLabel(item.createdAt)}</time>
        <div className="history-body">
          <p className="history-text">{item.text}</p>
          <p className="history-meta"><HistoryApp item={item} />{item.app}<span aria-hidden="true" className="history-sep" />{item.words} {item.words === 1 ? 'palabra' : 'palabras'}
            {showRaw && item.raw && <button type="button" className="link-button" aria-expanded={open === item.id} onClick={() => setOpen(value => value === item.id ? '' : item.id)}>{open === item.id ? 'Ocultar lo que dijiste' : 'Ver lo que dijiste'}</button>}</p>
          {open === item.id && <p className="history-raw">{item.raw}</p>}
        </div>
        <div className="history-actions">
          <button type="button" className="icon-button" aria-label={copied === item.id ? 'Copiado' : 'Copiar texto'} title="Copiar" onClick={() => void copy(item)}>{copied === item.id ? <CheckIcon size={16} weight="bold" /> : <CopyIcon size={16} />}</button>
          <button type="button" className="icon-button" aria-label="Eliminar del historial" title="Eliminar" onClick={() => void remove(item)}><TrashIcon size={16} /></button>
        </div>
      </li>)}</ul>
    </section>)}
  </div>;
}
