import { useEffect, useId, useState } from 'react';
import { CaretUpDownIcon } from '@phosphor-icons/react';
import { command, isNative } from '../lib/bridge';

export interface ModelOption { id: string; label: string; note: string; recommended: boolean }
type Provider = 'groq' | 'openai' | 'deepgram' | 'custom' | 'claude';

// Shown in the browser preview, where Bruma cannot ask the services.
const preview: Record<string, ModelOption[]> = {
  'groq:stt': [{ id: 'whisper-large-v3-turbo', label: 'Whisper Large v3 Turbo', note: 'Rápido y económico', recommended: true }, { id: 'whisper-large-v3', label: 'Whisper Large v3', note: 'La más precisa de Groq', recommended: false }],
  'openai:stt': [{ id: 'gpt-4o-mini-transcribe', label: 'GPT-4o mini Transcribe', note: 'Precisa y económica', recommended: true }, { id: 'gpt-4o-transcribe', label: 'GPT-4o Transcribe', note: 'La más precisa', recommended: false }],
  'deepgram:stt': [{ id: 'nova-3', label: 'Nova-3', note: 'En vivo y multilingüe', recommended: true }, { id: 'nova-2', label: 'Nova-2', note: 'Generación anterior', recommended: false }],
  'custom:stt': [{ id: 'Systran/faster-whisper-small', label: 'faster-whisper small', note: 'Equilibrio para CPU', recommended: true }],
  'groq:polish': [{ id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B', note: 'La mejor puntuación en Groq', recommended: true }, { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', note: 'Sólida y estable', recommended: false }],
  'claude:polish': [{ id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', note: 'Rápida y económica', recommended: true }, { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', note: 'Mejor redacción', recommended: false }],
};
const OTHER = '__other__';

/** Every model the service offers, read from the service with your key. "Otro…" lets you type one. */
export default function ModelPicker({ provider, purpose, value, fallback, refresh, onChange }: { provider: Provider; purpose: 'stt' | 'polish'; value: string; fallback: string; refresh?: unknown; onChange: (model: string) => void }) {
  const id = useId();
  const [options, setOptions] = useState<ModelOption[]>(preview[`${provider}:${purpose}`] ?? []);
  const [loading, setLoading] = useState(isNative);
  const [typing, setTyping] = useState(false);
  const [custom, setCustom] = useState(value);
  const current = value || fallback;

  useEffect(() => {
    if (!isNative) return;
    let live = true;
    setLoading(true);
    void command<ModelOption[]>('list_models', { provider, purpose }).then(list => { if (live && list.length) setOptions(list); }).catch(() => {}).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [provider, purpose, refresh]);

  const known = options.some(o => o.id === current);
  const list = known || !current ? options : [{ id: current, label: current, note: 'Elegido por ti', recommended: false }, ...options];
  const selected = list.find(o => o.id === current);

  return <div className="model-picker">
    <label htmlFor={id} className="field-label">Modelo</label>
    {typing ? <div className="key-row">
      <input id={id} className="input-field" autoFocus value={custom} spellCheck={false} placeholder="nombre-del-modelo" onChange={e => setCustom(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (custom.trim()) onChange(custom.trim()); setTyping(false); } if (e.key === 'Escape') setTyping(false); }} />
      <button type="button" className="button-primary" disabled={!custom.trim()} onClick={() => { onChange(custom.trim()); setTyping(false); }}>Usar</button>
    </div> : <div className="model-select">
      <select id={id} value={current} aria-busy={loading} onChange={e => { if (e.target.value === OTHER) { setCustom(current); setTyping(true); } else onChange(e.target.value); }}>
        {list.map(o => <option key={o.id} value={o.id}>{o.label}{o.recommended ? ' · Recomendado' : ''}{o.note ? ` — ${o.note}` : ''}</option>)}
        <option value={OTHER}>Otro modelo…</option>
      </select>
      <span className="model-select-face" aria-hidden="true">
        <span className="model-select-label">{selected?.label ?? current}{selected?.recommended && <em>Recomendado</em>}</span>
        <span className="model-select-note">{loading ? 'Buscando modelos…' : selected?.note || current}</span>
      </span>
      <CaretUpDownIcon size={15} aria-hidden="true" className="model-select-caret" />
    </div>}
  </div>;
}
