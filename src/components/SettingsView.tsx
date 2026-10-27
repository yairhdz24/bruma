import { useEffect, useId, useState, type ReactNode } from 'react';
import { StarIcon } from '@phosphor-icons/react';
import { command, errorMessage, isNative } from '../lib/bridge';
import { AUTHOR, AUTHOR_URL, ISSUES_URL, RELEASES_URL, REPO_URL } from '../lib/project';

const openExternal = (url: string) => { if (isNative) void command('open_url', { url }).catch(() => {}); else window.open(url, '_blank', 'noopener'); };
import type { Settings } from '../lib/types';
import ShortcutSetup from './ShortcutSetup';
import PermissionSetup from './PermissionSetup';

interface Props { settings: Settings; onSave: (settings: Settings) => Promise<void>; onNotice: (text: string) => void; onOpenGuide: () => void }

export function Toggle({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (value: boolean) => void }) {
  const id = useId();
  return <label className="setting">
    <span className="setting-text"><span className="setting-label">{label}</span>{description && <span id={id} className="setting-description">{description}</span>}</span>
    <input type="checkbox" className="switch-input" aria-label={label} checked={checked} aria-describedby={description ? id : undefined} onChange={e => onChange(e.target.checked)} />
    <span className="switch" aria-hidden="true" />
  </label>;
}

function Row({ label, description, children }: { label: string; description?: string; children: ReactNode }) {
  return <div className="setting"><span className="setting-text"><span className="setting-label">{label}</span>{description && <span className="setting-description">{description}</span>}</span>{children}</div>;
}

const languages = [['es', 'Español'], ['en', 'Inglés'], ['pt', 'Portugués'], ['fr', 'Francés'], ['de', 'Alemán'], ['it', 'Italiano']] as const;

export default function SettingsView({ settings, onSave, onNotice, onOpenGuide }: Props) {
  const [name, setName] = useState(settings.profileName);
  const [rules, setRules] = useState(settings.personalRules);
  useEffect(() => setRules(settings.personalRules), [settings.personalRules]);
  const [error, setError] = useState('');
  useEffect(() => setName(settings.profileName), [settings.profileName]);
  async function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setError('');
    try { await onSave({ ...settings, [key]: value }); } catch (cause) { setError(errorMessage(cause)); }
  }
  return <div className="page">
    <header className="page-header"><h1>Ajustes</h1></header>
    {error && <p className="form-error" role="alert">{error}</p>}

    <section className="section" aria-labelledby="s-shortcut"><div className="section-head"><h2 id="s-shortcut">Atajo</h2></div>
      {/Mac/i.test(navigator.userAgent) && <div className="panel settings-list" style={{ marginBottom: 10 }}>
        <Row label="Tecla para dictar" description="Tócala para empezar y otra vez para pegar, o mantenla presionada mientras hablas y suéltala para pegar. Para que fn no abra los emojis, en Ajustes del Sistema → Teclado elige «Al presionar 🌐: No hacer nada».">
          <div className="segmented" role="group" aria-label="Tecla para dictar">
            {([['fn', 'fn'], ['fn+space', 'fn + Espacio'], ['off', 'Solo el atajo']] as const).map(([value, label]) => {
              const pressed = value === 'off' ? !settings.fnKey : settings.fnKey && settings.fnCombo === value;
              return <button key={value} type="button" aria-pressed={pressed} onClick={() => void onSave(value === 'off' ? { ...settings, fnKey: false } : { ...settings, fnKey: true, fnCombo: value }).catch(cause => setError(errorMessage(cause)))}>{label}</button>;
            })}
          </div>
        </Row>
      </div>}
      <div className="panel"><ShortcutSetup settings={settings} onSave={onSave} onNotice={onNotice} compact /></div>
      <p className="section-intro">La tecla fn no se puede grabar como atajo normal: elígela arriba (sola o con Espacio). Si ⌃ Espacio cambia la fuente de entrada de tu teclado, desactívalo en Ajustes del Sistema → Teclado → Funciones rápidas, o elige otra combinación aquí.</p>
    </section>

    <section className="section" aria-labelledby="s-dictation"><div className="section-head"><h2 id="s-dictation">Dictado</h2></div>
      <div className="panel settings-list">
        <Toggle label="Revisar antes de pegar" description="Muestra el texto en la píldora y espera a que lo confirmes. Apagado, se pega solo, como un teclado." checked={settings.confirmBeforeInsert} onChange={v => void set('confirmBeforeInsert', v)} />
        <Toggle label="Terminar al quedarte en silencio" description="Si haces una pausa larga, Bruma termina y pega sin que vuelvas a presionar el atajo." checked={settings.autoFinish} onChange={v => void set('autoFinish', v)} />
        {settings.autoFinish && <Row label="Duración de la pausa" description={`${(settings.pauseMs / 1000).toFixed(1)} segundos de silencio`}><input type="range" className="range" min={1000} max={5000} step={100} value={settings.pauseMs} aria-label="Duración de la pausa" onChange={e => void set('pauseMs', Number(e.target.value))} /></Row>}
        <Toggle label="Píldora flotante siempre visible" description="Una línea discreta sobre el Dock. Pasa el puntero para ver el atajo o dictar con un clic." checked={settings.showPill} onChange={v => void set('showPill', v)} />
        <Toggle label="Leer el texto junto al cursor" description="Bruma mira las últimas palabras antes del cursor para poner bien los espacios y las mayúsculas. Nunca lee campos de contraseña." checked={settings.useCursorContext} onChange={v => void set('useCursorContext', v)} />
        <Toggle label="Sonidos" description="Un tono suave al empezar y al terminar." checked={settings.playSounds} onChange={v => void set('playSounds', v)} />
      </div>
    </section>

    <section className="section" aria-labelledby="s-language"><div className="section-head"><h2 id="s-language">Idioma y estilo</h2></div>
      <div className="panel settings-list">
        <Row label="Idioma en que hablas" description="Detectar automáticamente permite mezclar idiomas en una misma frase."><select className="select" aria-label="Idioma en que hablas" value={settings.language} onChange={e => void set('language', e.target.value as Settings['language'])}><option value="multi">Detectar automáticamente</option>{languages.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Row>
        <Row label="Escribir en" description="Bruma puede traducir mientras pega. Necesita Claude o Groq en Conexiones."><select className="select" aria-label="Escribir en" value={settings.targetLanguage} onChange={e => void set('targetLanguage', e.target.value as Settings['targetLanguage'])}><option value="original">El mismo idioma</option>{languages.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Row>
        <Row label="Tono" description="Natural limpia lo justo. Profesional pule la redacción. Literal solo pone puntuación."><select className="select" aria-label="Tono" value={settings.tone} onChange={e => void set('tone', e.target.value as Settings['tone'])}><option value="natural">Natural</option><option value="formal">Profesional</option><option value="literal">Literal</option></select></Row>
      </div>
      <p className="section-intro">Bruma ajusta el estilo a la app: breve en WhatsApp y Slack, en párrafos en Mail, exacto con comandos y nombres en Cursor o la Terminal.</p>
    </section>

    <section className="section" aria-labelledby="s-rules"><div className="section-head"><h2 id="s-rules">Tus reglas</h2><span className="section-note">{rules.length}/2000</span></div>
      <div className="panel">
        <label htmlFor="personal-rules" className="field-label">Instrucciones que Bruma sigue en cada dictado</label>
        <textarea id="personal-rules" className="input-field textarea" rows={5} maxLength={2000} value={rules} onChange={e => setRules(e.target.value)} onBlur={() => rules !== settings.personalRules && void set('personalRules', rules)}
          placeholder={'Ejemplos:\n- Tutea siempre.\n- Supabase, n8n y Next.js se escriben así.\n- En correos, termina con "Saludos, Ana".\n- Nada de emojis.'} />
        <p className="form-help">Se aplican al pulir el texto con Claude o Groq. Bruma nunca responde lo que dictas ni inventa datos.</p>
      </div>
    </section>

    <section className="section" aria-labelledby="s-permissions"><div className="section-head"><h2 id="s-permissions">Permisos</h2><button type="button" className="link-button" onClick={onOpenGuide}>Abrir la guía de inicio</button></div>
      <PermissionSetup />
    </section>

    <section className="section" aria-labelledby="s-appearance"><div className="section-head"><h2 id="s-appearance">Apariencia</h2></div>
      <div className="panel settings-list">
        <Row label="Tema"><div className="segmented" role="group" aria-label="Tema">{(['light', 'dark', 'system'] as const).map(theme => <button key={theme} type="button" aria-pressed={settings.theme === theme} onClick={() => void set('theme', theme)}>{theme === 'light' ? 'Claro' : theme === 'dark' ? 'Oscuro' : 'Sistema'}</button>)}</div></Row>
        <Row label="Tu nombre" description="Para saludarte en Inicio."><input className="input-field compact" aria-label="Tu nombre" value={name} maxLength={80} onChange={e => setName(e.target.value)} onBlur={() => name !== settings.profileName && void set('profileName', name.trim())} placeholder="Yair" /></Row>
        <Toggle label="Reducir movimiento" checked={settings.reducedMotion} onChange={v => void set('reducedMotion', v)} />
        <Toggle label="Reducir transparencia" checked={settings.reduceTransparency} onChange={v => void set('reduceTransparency', v)} />
        <Toggle label="Aumentar contraste" checked={settings.highContrast} onChange={v => void set('highContrast', v)} />
      </div>
    </section>

    <section className="section" aria-labelledby="s-about"><div className="section-head"><h2 id="s-about">Acerca de</h2></div>
      <div className="panel about">
        <img src="/bruma-icon-256.png" alt="" width={52} height={52} />
        <div className="about-body">
          <p className="about-name">Bruma <span>{__APP_VERSION__}</span></p>
          <p className="about-by">Creada por <button type="button" className="link-button" onClick={() => openExternal(AUTHOR_URL)}>{AUTHOR}</button>. Código abierto con licencia MIT.</p>
          <div className="about-actions">
            <button type="button" className="button-primary is-ink star-button" onClick={() => openExternal(REPO_URL)}><StarIcon size={15} weight="fill" aria-hidden="true" />Dale una estrella en GitHub</button>
            <button type="button" className="button-secondary" onClick={() => openExternal(RELEASES_URL)}>Novedades</button>
            <button type="button" className="button-secondary" onClick={() => openExternal(ISSUES_URL)}>Reportar un problema</button>
          </div>
        </div>
      </div>
    </section>
  </div>;
}
