import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRightIcon, CheckCircleIcon, CursorTextIcon, HardDrivesIcon, MicrophoneIcon, TrashIcon } from '@phosphor-icons/react';
import { command, errorMessage, isNative } from '../lib/bridge';
import ModelPicker from './ModelPicker';
import type { KeyProvider, PolishProvider, ProviderStatus, Settings, SttProvider } from '../lib/types';

export interface ConnectionsProps {
  settings: Settings;
  providers: ProviderStatus;
  onSave: (settings: Settings) => Promise<void>;
  onSaveKey: (provider: KeyProvider, key: string) => Promise<void>;
  onDeleteKey: (provider: KeyProvider) => Promise<void>;
  onNotice: (text: string) => void;
  /** Onboarding shows only the speech engine. */
  engineOnly?: boolean;
}

const engines: { id: SttProvider; name: string; logo?: string; note: string; price: string; keyUrl?: string }[] = [
  { id: 'deepgram', name: 'Deepgram', logo: '/brands/deepgram.svg', note: 'Nova-3 en streaming: ves las palabras mientras hablas y mezcla español e inglés sin traducir.', price: 'US$200 de crédito inicial; después, unos US$0.46 por hora.', keyUrl: 'https://console.deepgram.com/' },
  { id: 'groq', name: 'Groq', logo: '/brands/groq.svg', note: 'Whisper large v3 turbo. Muy rápido y el más económico.', price: 'Gratis para uso personal; después, unos US$0.04 por hora de audio.', keyUrl: 'https://console.groq.com/keys' },
  { id: 'openai', name: 'OpenAI', logo: '/brands/openai.svg', note: 'gpt-4o-mini-transcribe. Buena precisión en varios idiomas.', price: 'Pago por uso con tu cuenta de OpenAI.', keyUrl: 'https://platform.openai.com/api-keys' },
  { id: 'custom', name: 'Tu servidor', note: 'Cualquier servidor compatible con la API de OpenAI, como Whisper en tu VPS.', price: 'Sin costo por uso; la velocidad depende de tu servidor.', keyUrl: 'https://github.com/speaches-ai/speaches' },
];

function Logo({ src, dark }: { src?: string; dark?: boolean }) {
  // Groq's mark is a full square; it fills its tile instead of floating inside it.
  return <span className={`provider-logo ${dark ? 'is-dark' : ''} ${src?.includes('groq') ? 'is-bleed' : ''}`} aria-hidden="true">{src ? <img src={src} alt="" /> : <HardDrivesIcon size={18} />}</span>;
}

function KeyForm({ provider, label, stored, optional = false, onSaveKey, onDeleteKey, onNotice }: { provider: KeyProvider; label: string; stored: boolean; optional?: boolean } & Pick<ConnectionsProps, 'onSaveKey' | 'onDeleteKey' | 'onNotice'>) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!key.trim()) { setError('Pega la clave para guardarla.'); return; }
    setBusy(true); setError('');
    try { await onSaveKey(provider, key.trim()); setKey(''); onNotice(`Clave de ${label} guardada en el llavero.`); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true);
    try { await onDeleteKey(provider); onNotice(`Clave de ${label} eliminada.`); } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  }
  const id = `${provider}-key`;
  return <form className="key-form" onSubmit={save} aria-busy={busy}>
    <label htmlFor={id} className="field-label">{stored ? `Reemplazar clave de ${label}` : `Clave de ${label}${optional ? ' (si tu servidor la pide)' : ''}`}</label>
    <div className="key-row">
      <input id={id} className="input-field" type="password" autoComplete="off" spellCheck={false} value={key} maxLength={512} disabled={!isNative || busy}
        placeholder={isNative ? (stored ? 'Guardada. Pega otra para reemplazarla' : 'Pega tu clave') : 'Disponible en la app de escritorio'} onChange={e => { setKey(e.target.value); setError(''); }} />
      <button type="submit" className="button-primary" disabled={!isNative || busy || !key.trim()}>Guardar</button>
      {stored && <button type="button" className="icon-button is-bordered" aria-label={`Eliminar clave de ${label}`} disabled={busy} onClick={() => void remove()}><TrashIcon size={16} /></button>}
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </form>;
}

function Choice({ name, checked, onSelect, children, title, status }: { name: string; checked: boolean; onSelect: () => void; children?: ReactNode; title: ReactNode; status?: ReactNode }) {
  return <div className={`choice ${checked ? 'is-checked' : ''}`}>
    <label className="choice-head"><input type="radio" name={name} checked={checked} onChange={onSelect} /><span className="radio" aria-hidden="true" />{title}{status}</label>
    {checked && children && <div className="choice-body">{children}</div>}
  </div>;
}

const openExternal = (url: string) => { if (isNative) void command('open_url', { url }).catch(() => {}); else window.open(url, '_blank', 'noopener'); };

export default function Connections({ settings, providers, onSave, onSaveKey, onDeleteKey, onNotice, engineOnly = false }: ConnectionsProps) {
  const [baseUrl, setBaseUrl] = useState(settings.sttBaseUrl);
  const [error, setError] = useState('');
  useEffect(() => { setBaseUrl(settings.sttBaseUrl); }, [settings.sttBaseUrl]);
  const keyProps = { onSaveKey, onDeleteKey, onNotice };

  async function update(patch: Partial<Settings>, message?: string) {
    setError('');
    try { await onSave({ ...settings, ...patch }); if (message) onNotice(message); }
    catch (cause) { setError(errorMessage(cause)); }
  }
  async function chooseEngine(id: SttProvider) {
    if (id === 'custom' && !settings.sttBaseUrl) { await update({ sttProvider: id, sttBaseUrl: 'http://localhost:8000/v1', sttModel: settings.sttModel || 'Systran/faster-whisper-small' }); return; }
    await update({ sttProvider: id, sttModel: id === settings.sttProvider ? settings.sttModel : '' }, `Motor de voz: ${engines.find(e => e.id === id)?.name}.`);
  }
  const polishNames: Record<PolishProvider, string> = { auto: 'Automático', claude: 'Claude', groq: 'Groq', none: 'Sin pulir' };
  const polishActive = settings.polishProvider === 'auto' ? (providers.claude ? 'Claude' : providers.groq ? 'Groq' : 'ninguno todavía') : polishNames[settings.polishProvider];

  const engineList = <fieldset className="choices">
    <legend className="sr-only">Motor de voz</legend>
    {(engineOnly ? [...engines].sort((a, b) => Number(b.id === 'groq') - Number(a.id === 'groq')) : engines).map(engine => {
      const stored = engine.id === 'custom' ? Boolean(settings.sttBaseUrl) : providers[engine.id];
      return <Choice key={engine.id} name="engine" checked={settings.sttProvider === engine.id} onSelect={() => void chooseEngine(engine.id)}
        title={<><Logo src={engine.logo} dark={engine.id === 'openai' || engine.id === 'deepgram'} /><span className="choice-text"><strong>{engine.name}</strong><span>{engine.note}</span></span></>}
        status={stored && engine.id !== 'custom' ? <span className="choice-status"><CheckCircleIcon size={15} weight="fill" aria-hidden="true" />Clave guardada</span> : undefined}>
        <p className="choice-price">{engine.price}</p>
        {engine.id === 'custom' ? <>
          <div className="form-grid">
            <label><span className="field-label">Dirección del servidor</span><input className="input-field" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} onBlur={() => baseUrl !== settings.sttBaseUrl && void update({ sttBaseUrl: baseUrl.trim() }, 'Dirección guardada.')} placeholder="https://whisper.mi-vps.com/v1" spellCheck={false} /></label>
            <ModelPicker provider="custom" purpose="stt" value={settings.sttModel} fallback="Systran/faster-whisper-small" refresh={settings.sttBaseUrl} onChange={value => void update({ sttModel: value }, 'Modelo guardado.')} />
          </div>
          <p className="form-help">Bruma envía el audio a <code>{'{dirección}'}/audio/transcriptions</code>. Usa https si el servidor está fuera de tu red. <button type="button" className="link-button" onClick={() => openExternal(engine.keyUrl!)}>Cómo montar Speaches en un VPS</button></p>
          <KeyForm provider="custom" label="tu servidor" stored={providers.custom} optional {...keyProps} />
        </> : <>
          <KeyForm provider={engine.id as KeyProvider} label={engine.name} stored={providers[engine.id as KeyProvider]} {...keyProps} />
          <ModelPicker provider={engine.id as 'groq' | 'openai' | 'deepgram'} purpose="stt" value={settings.sttModel} fallback={engine.id === 'groq' ? 'whisper-large-v3-turbo' : engine.id === 'openai' ? 'gpt-4o-mini-transcribe' : 'nova-3'} refresh={providers[engine.id as KeyProvider]} onChange={value => void update({ sttModel: value }, 'Modelo guardado.')} />
          {engine.keyUrl && <button type="button" className="link-button" onClick={() => openExternal(engine.keyUrl!)}>Crear una clave en {new URL(engine.keyUrl).hostname}</button>}
        </>}
      </Choice>;
    })}
  </fieldset>;

  if (engineOnly) return <div>{engineList}{error && <p className="form-error" role="alert">{error}</p>}</div>;

  const engine = engines.find(e => e.id === settings.sttProvider) ?? engines[0];
  const engineReadyNow = engine.id === 'custom' ? Boolean(settings.sttBaseUrl) : providers[engine.id];
  const polishLogo = polishActive === 'Claude' ? '/brands/claude.svg' : polishActive === 'Groq' ? '/brands/groq.svg' : undefined;
  return <div className="page">
    <header className="page-header"><h1>Conexiones</h1><p>Elige quién convierte tu voz en texto y quién lo deja impecable. Tus claves viven en el llavero de tu Mac y el audio nunca se guarda.</p></header>
    <ol className="pipeline" aria-label="Cómo viaja tu voz">
      <li><span className="pipeline-icon"><MicrophoneIcon size={18} weight="fill" aria-hidden="true" /></span><span><b>Tu voz</b><small>En memoria</small></span></li>
      <li aria-hidden="true" className="pipeline-arrow"><ArrowRightIcon size={14} /></li>
      <li data-ready={engineReadyNow || undefined}><Logo src={engine.logo} dark={engine.id === 'openai' || engine.id === 'deepgram'} /><span><b>{engine.name}</b><small>{engineReadyNow ? (engine.id === 'deepgram' ? 'En vivo' : 'Listo') : 'Falta clave'}</small></span></li>
      <li aria-hidden="true" className="pipeline-arrow"><ArrowRightIcon size={14} /></li>
      <li data-ready={Boolean(polishLogo) || settings.polishProvider === 'none' || undefined}><Logo src={polishLogo} /><span><b>{settings.polishProvider === 'none' ? 'Sin pulir' : polishActive === 'ninguno todavía' ? 'Pulido' : polishActive}</b><small>{settings.polishProvider === 'none' ? 'Tal cual' : polishLogo ? 'Puntuación' : 'Sin conectar'}</small></span></li>
      <li aria-hidden="true" className="pipeline-arrow"><ArrowRightIcon size={14} /></li>
      <li data-ready><span className="pipeline-icon"><CursorTextIcon size={18} aria-hidden="true" /></span><span><b>Tu cursor</b><small>Cualquier app</small></span></li>
    </ol>
    <section className="section" aria-labelledby="engine-heading">
      <div className="section-head"><h2 id="engine-heading">Voz a texto</h2></div>
      {engineList}
    </section>
    <section className="section" aria-labelledby="polish-heading">
      <div className="section-head"><h2 id="polish-heading">Pulir el texto</h2><span className="section-note">Ahora: {polishActive}</span></div>
      <p className="section-intro">Quita muletillas, aplica tus correcciones («el martes, no, el viernes») y ajusta el tono a cada app. Los dictados de hasta tres palabras se pegan tal cual, al instante.</p>
      <fieldset className="choices">
        <legend className="sr-only">Pulir el texto</legend>
        <Choice name="polish" checked={settings.polishProvider === 'auto'} onSelect={() => void update({ polishProvider: 'auto', useClaude: true })} title={<span className="choice-text"><strong>Automático</strong><span>Claude si tienes su clave; si no, Groq con la misma clave del dictado.</span></span>} />
        <Choice name="polish" checked={settings.polishProvider === 'claude'} onSelect={() => void update({ polishProvider: 'claude', useClaude: true })}
          title={<><Logo src="/brands/claude.svg" /><span className="choice-text"><strong>Claude</strong><span>La mejor redacción. Usa tus créditos de la API de Anthropic.</span></span></>}
          status={providers.claude ? <span className="choice-status"><CheckCircleIcon size={15} weight="fill" aria-hidden="true" />Clave guardada</span> : undefined}>
          <KeyForm provider="claude" label="Claude" stored={providers.claude} {...keyProps} />
          <button type="button" className="link-button" onClick={() => openExternal('https://console.anthropic.com/settings/keys')}>Crear una clave en console.anthropic.com</button>
          <ModelPicker provider="claude" purpose="polish" value={settings.claudeModel} fallback="claude-haiku-5-5" refresh={providers.claude} onChange={value => void update({ claudeModel: value }, 'Modelo de Claude guardado.')} />
        </Choice>
        <Choice name="polish" checked={settings.polishProvider === 'groq'} onSelect={() => void update({ polishProvider: 'groq', useClaude: true })}
          title={<><Logo src="/brands/groq.svg" /><span className="choice-text"><strong>Groq</strong><span>Gratis y muy rápido, con la misma clave que el dictado.</span></span></>}>
          {!providers.groq && <KeyForm provider="groq" label="Groq" stored={false} {...keyProps} />}
          <ModelPicker provider="groq" purpose="polish" value={settings.groqPolishModel} fallback="openai/gpt-oss-120b" refresh={providers.groq} onChange={value => void update({ groqPolishModel: value }, 'Modelo de Groq guardado.')} />
        </Choice>
        <Choice name="polish" checked={settings.polishProvider === 'none'} onSelect={() => void update({ polishProvider: 'none' })} title={<span className="choice-text"><strong>Sin pulir</strong><span>Pega exactamente lo que reconoció el motor de voz.</span></span>} />
      </fieldset>
    </section>
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
