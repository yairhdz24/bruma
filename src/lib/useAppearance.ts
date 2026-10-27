import { useEffect, useState } from 'react';
import type { Settings } from './types';

export function useAppearance(theme: Settings['theme']) {
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const query = matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemDark(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const resolved = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
  }, [resolved]);
  return resolved;
}
