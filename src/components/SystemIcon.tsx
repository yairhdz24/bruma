import { useEffect, useState, type CSSProperties } from 'react';
import type { Icon } from '@phosphor-icons/react';
import { command, isNative } from '../lib/bridge';

const symbols = new Map<string, Promise<string | null>>();
/** SF Symbols are rendered by AppKit on Mac, never redistributed to other platforms. */
export default function SystemIcon({ name, fallback: Fallback, size = 20, className = '' }: { name: string; fallback: Icon; size?: number; className?: string }) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false;
    if (!isNative || !/Mac/i.test(navigator.userAgent)) return;
    if (!symbols.has(name)) symbols.set(name, command<string | null>('get_system_symbol', { name }).catch(() => null));
    void symbols.get(name)!.then(value => { if (!disposed) setUri(value); });
    return () => { disposed = true; };
  }, [name]);
  if (!uri) return <Fallback size={size} weight="regular" className={className} aria-hidden="true" />;
  const style: CSSProperties = { width: size, height: size, display: 'inline-block', flexShrink: 0, backgroundColor: 'currentColor', maskImage: `url("${uri}")`, WebkitMaskImage: `url("${uri}")`, maskSize: 'contain', WebkitMaskSize: 'contain', maskPosition: 'center', WebkitMaskPosition: 'center', maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat' };
  return <span className={className} style={style} aria-hidden="true" data-system-symbol={name} />;
}
