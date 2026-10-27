import { memo, useState } from 'react';
import type { AppContext } from '../lib/types';
import './pill.css';

export interface AppBadgeProps { context: Pick<AppContext, 'name'> & { iconDataUrl?: string }; size?: number; className?: string }

/** The real app icon captured on macOS (a bounded data URL), otherwise the app's initial. */
function AppBadge({ context, size = 28, className = '' }: AppBadgeProps) {
  const [failed, setFailed] = useState('');
  const icon = context.iconDataUrl;
  const usable = icon && icon.length < 700_000 && /^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(icon) && failed !== icon ? icon : '';
  const initial = (context.name || '·').trim().charAt(0).toLocaleUpperCase('es') || '·';
  return <span className={`app-badge ${className}`} data-native={Boolean(usable) || undefined} style={{ width: size, height: size, fontSize: Math.round(size * 0.46) }} aria-hidden="true">
    {usable ? <img src={usable} alt="" draggable={false} onError={() => setFailed(usable)} /> : initial}
  </span>;
}
export default memo(AppBadge);
