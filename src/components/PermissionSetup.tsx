import { useCallback, useEffect, useState } from 'react';
import { CheckIcon, MicrophoneIcon, CursorClickIcon, ArrowUpRightIcon, ArrowsClockwiseIcon, LockKeyIcon } from '@phosphor-icons/react';
import { errorMessage, isNative } from '../lib/bridge';
import { getPermissions, openPermissionSettings, previewPermissions, requestPermission, type PermissionStatus } from '../lib/onboarding';
import SystemIcon from './SystemIcon';

export default function PermissionSetup() {
  const [status, setStatus] = useState<PermissionStatus>(previewPermissions);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try { setStatus(await getPermissions()); setError(''); }
    catch (err) { setError(errorMessage(err)); }
  }, []);
  useEffect(() => {
    let disposed = false;
    const check = () => { if (!document.hidden) void getPermissions().then(value => { if (!disposed) setStatus(value); }).catch(err => { if (!disposed) setError(errorMessage(err)); }); };
    check();
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => { disposed = true; window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); };
  }, []);
  async function allow(permission: 'microphone' | 'accessibility') {
    if (busy || !isNative) return;
    setBusy(permission); setError('');
    try {
      if (permission === 'accessibility' && status.platform === 'macos') {
        const next = await requestPermission(permission);
        setStatus(next);
        if (next.accessibility !== 'authorized') await openPermissionSettings(permission);
      } else if (status[permission] === 'denied' || status[permission] === 'restricted' || status.platform === 'windows') {
        await openPermissionSettings(permission);
      } else setStatus(await requestPermission(permission));
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(''); }
  }
  const rows = [
    { id: 'microphone' as const, title: 'Tu micrófono', text: 'Para convertir lo que dices en texto. Se activa cuando tú empiezas a dictar.', symbol: 'mic.fill', icon: MicrophoneIcon },
    { id: 'accessibility' as const, title: 'Escribir en tus apps', text: 'Permite pegar el texto donde está tu cursor, como si lo escribieras con el teclado.', symbol: 'accessibility', icon: CursorClickIcon },
  ];
  return <div className="permission-setup">
    <div className="permission-list">{rows.map(row => {
      const granted = status[row.id] === 'authorized';
      const notRequired = status[row.id] === 'notRequired';
      return <section className="permission-row" key={row.id} aria-labelledby={`permission-${row.id}`}>
        <span className={`permission-icon ${granted ? 'is-granted' : ''}`}><SystemIcon name={row.symbol} fallback={row.icon} size={25} /></span>
        <div><h2 id={`permission-${row.id}`}>{row.title}</h2><p>{row.text}</p>
          <div className="permission-action">{granted || notRequired ? <span className="permission-success"><CheckIcon size={17} />{granted ? 'Permiso concedido' : 'No requiere un permiso adicional'}</span> : <button type="button" className="button-secondary" disabled={!isNative || Boolean(busy)} onClick={() => void allow(row.id)}>{busy === row.id ? 'Comprobando…' : !isNative ? 'En la app de escritorio' : status[row.id] === 'denied' || status.platform === 'windows' ? 'Abrir ajustes' : 'Permitir'}<ArrowUpRightIcon size={14} aria-hidden="true" /></button>}</div>
          {status.platform === 'windows' && row.id === 'microphone' && <p className="permission-note">Windows permite comprobar el acceso al empezar a grabar. Revisa que las apps de escritorio puedan usar el micrófono.</p>}
        </div>
        {granted && <span className="permission-check" aria-hidden="true"><CheckIcon weight="bold" size={20} /></span>}
      </section>;
    })}</div>
    {error && <p className="error-banner" role="alert">{error}</p>}
    <div className="permission-footer"><span><LockKeyIcon size={16} aria-hidden="true" />Bruma no necesita grabar tu pantalla.</span>{isNative && <button type="button" className="quiet-button" disabled={Boolean(busy)} onClick={() => void refresh()}><ArrowsClockwiseIcon size={15} aria-hidden="true" />Comprobar permisos</button>}</div>
  </div>;
}
