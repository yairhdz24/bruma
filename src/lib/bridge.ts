import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { defaultSettings, emptyHistory, emptyProviders, type History, type KeyProvider, type ProviderStatus, type Settings, type VoiceState, type VoiceLevel } from './types';

export const isNative = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const previewSettingsKey = 'bruma-preview-settings-v1';
const previewHistoryKey = 'bruma-preview-history-v1';

export async function getSettings(): Promise<Settings> {
  if (isNative) return invoke<Settings>('get_settings');
  try {
    const saved = JSON.parse(localStorage.getItem(previewSettingsKey) || '{}') as Partial<Settings>;
    return { ...defaultSettings, ...saved, dictionary: Array.isArray(saved.dictionary) ? saved.dictionary : [], snippets: Array.isArray(saved.snippets) ? saved.snippets : [] };
  } catch { return { ...defaultSettings }; }
}
export async function saveSettings(settings: Settings): Promise<void> {
  if (isNative) await invoke('save_settings', { settings });
  else try { localStorage.setItem(previewSettingsKey, JSON.stringify(settings)); } catch { /* preview only */ }
}
export async function getProviderStatus(): Promise<ProviderStatus> {
  if (isNative) return invoke('get_provider_status');
  // Browser preview: lets screenshots show a connected engine without any real key.
  try { return { ...emptyProviders, ...JSON.parse(localStorage.getItem('bruma-preview-providers') || '{}') }; } catch { return { ...emptyProviders }; }
}
export async function saveApiKey(provider: KeyProvider, key: string): Promise<void> {
  if (!isNative) throw new Error('Guarda tus claves desde la app de escritorio.');
  await invoke('save_api_key', { provider, key });
}
export async function deleteApiKey(provider: KeyProvider): Promise<void> {
  if (!isNative) return;
  await invoke('delete_api_key', { provider });
}
export const command = <T = void>(name: string, args?: Record<string, unknown>): Promise<T> => {
  if (!isNative) return Promise.reject(new Error('Esta función está disponible en la app de escritorio.'));
  return invoke<T>(name, args);
};
export function subscribeVoice(callback: (state: VoiceState) => void) {
  return listen<VoiceState>('voice:state', event => callback(event.payload));
}
export function subscribeLevel(callback: (level: VoiceLevel) => void) {
  return listen<VoiceLevel>('voice:level', event => callback(event.payload));
}
export async function copyText(text: string): Promise<void> {
  if (isNative) await command('copy_text', { text });
  else await navigator.clipboard.writeText(text);
}

function previewHistory(): History {
  try { return { ...emptyHistory, ...JSON.parse(localStorage.getItem(previewHistoryKey) || 'null') }; } catch { return emptyHistory; }
}
export function savePreviewHistory(history: History) {
  try { localStorage.setItem(previewHistoryKey, JSON.stringify(history)); } catch { /* preview only */ }
  window.dispatchEvent(new CustomEvent('bruma-preview-history', { detail: history }));
}
export async function getHistory(): Promise<History> {
  if (!isNative) return previewHistory();
  const value = await invoke<History | null>('get_history');
  return value && Array.isArray(value.items) && value.totals ? value : emptyHistory;
}
export async function deleteHistoryItem(id: string): Promise<History> {
  if (isNative) return invoke<History>('delete_history_item', { id });
  const next = previewHistory(); next.items = next.items.filter(item => item.id !== id); savePreviewHistory(next); return next;
}
export async function clearHistory(): Promise<History> {
  if (isNative) return invoke<History>('clear_history');
  const next = { ...previewHistory(), items: [] }; savePreviewHistory(next); return next;
}
export function subscribeHistory(callback: (history: History) => void): () => void {
  if (!isNative) {
    const listener = (event: Event) => callback((event as CustomEvent<History>).detail);
    window.addEventListener('bruma-preview-history', listener);
    return () => window.removeEventListener('bruma-preview-history', listener);
  }
  let disposed = false; let unlisten: (() => void) | undefined;
  void listen<History>('history:changed', event => callback(event.payload)).then(cleanup => { if (disposed) cleanup(); else unlisten = cleanup; });
  return () => { disposed = true; unlisten?.(); };
}

export const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
