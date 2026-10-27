export type Phase = 'idle' | 'connecting' | 'listening' | 'paused' | 'processing' | 'ready' | 'inserted' | 'error';
export type Tone = 'natural' | 'formal' | 'literal';
export type Category = 'ai' | 'mail' | 'messaging' | 'code' | 'docs' | 'general';
export type SttProvider = 'groq' | 'openai' | 'custom' | 'deepgram';
export type PolishProvider = 'auto' | 'claude' | 'groq' | 'none';
export type KeyProvider = 'groq' | 'openai' | 'custom' | 'deepgram' | 'claude';
export interface AppContext { name: string; bundleId?: string; iconDataUrl?: string; category: Category; canInsert: boolean }
export interface DictionaryEntry { term: string; aliases: string }
export interface Snippet { trigger: string; text: string }
export interface Settings {
  brand: string;
  language: 'es' | 'en' | 'pt' | 'fr' | 'de' | 'it' | 'multi';
  targetLanguage: 'original' | 'es' | 'en' | 'pt' | 'fr' | 'de' | 'it';
  theme: 'system' | 'light' | 'dark';
  uiLanguage: 'es' | 'en';
  profileName: string;
  onboardingVersion: number;
  settingsVersion: number;
  tone: Tone;
  pauseMs: number;
  autoFinish: boolean;
  shortcut: string;
  dictionary: DictionaryEntry[];
  claudeModel: string;
  useClaude: boolean;
  confirmBeforeInsert: boolean;
  reducedMotion: boolean;
  reduceTransparency: boolean;
  highContrast: boolean;
  sttProvider: SttProvider;
  sttBaseUrl: string;
  sttModel: string;
  polishProvider: PolishProvider;
  groqPolishModel: string;
  saveHistory: boolean;
  playSounds: boolean;
  snippets: Snippet[];
  showPill: boolean;
  fnKey: boolean;
  fnCombo: 'fn' | 'fn+space';
  useCursorContext: boolean;
  personalRules: string;
}
export type ProviderStatus = Record<KeyProvider, boolean>;
export interface VoiceState {
  sessionId: string;
  phase: Phase;
  transcript: string;
  interim: string;
  result: string;
  context: AppContext;
  error: string | null;
  elapsedMs: number;
  live: boolean;
  copied: boolean;
  hold: boolean;
}
export interface VoiceLevel { rms: number; dbfs: number; voiced: boolean }
export interface HistoryEntry { id: string; createdAt: number; text: string; raw: string; app: string; bundleId?: string | null; words: number; durationMs: number; inserted: boolean }
export interface HistoryTotals { dictations: number; words: number; speakingMs: number; activeDays: number[] }
export interface History { totals: HistoryTotals; items: HistoryEntry[] }

export const emptyProviders: ProviderStatus = { groq: false, openai: false, custom: false, deepgram: false, claude: false };
export const emptyHistory: History = { totals: { dictations: 0, words: 0, speakingMs: 0, activeDays: [] }, items: [] };
export const defaultSettings: Settings = {
  brand: 'Bruma', language: 'es', targetLanguage: 'original', tone: 'natural',
  theme: 'system', uiLanguage: 'es', profileName: '', onboardingVersion: 0, settingsVersion: 6,
  pauseMs: 1400, autoFinish: false, shortcut: 'Control+Space',
  dictionary: [], claudeModel: 'claude-haiku-5-5', useClaude: true,
  confirmBeforeInsert: false, reducedMotion: false, reduceTransparency: false, highContrast: false,
  sttProvider: 'groq', sttBaseUrl: '', sttModel: '', polishProvider: 'auto', groqPolishModel: 'openai/gpt-oss-120b',
  saveHistory: true, playSounds: true, snippets: [], showPill: true, fnKey: true, fnCombo: 'fn', useCursorContext: true, personalRules: '',
};
export const initialVoiceState: VoiceState = {
  sessionId: '', phase: 'idle', transcript: '', interim: '', result: '',
  context: { name: 'General', category: 'general', canInsert: false }, error: null, elapsedMs: 0, live: false, copied: false, hold: false,
};

/** Which key the selected speech engine needs (the custom server may not need one). */
export function engineReady(settings: Settings, providers: ProviderStatus) {
  if (settings.sttProvider === 'custom') return Boolean(settings.sttBaseUrl);
  return providers[settings.sttProvider];
}
export const engineNames: Record<SttProvider, string> = { groq: 'Groq', openai: 'OpenAI', custom: 'Tu servidor', deepgram: 'Deepgram' };

/** The fn keys that dictate on a Mac (["fn"] or ["fn", "Espacio"]), or null when fn is off. */
export function fnKeys(settings: Settings, mac: boolean): string[] | null {
  if (!mac || !settings.fnKey) return null;
  return settings.fnCombo === 'fn+space' ? ['fn', 'Espacio'] : ['fn'];
}
