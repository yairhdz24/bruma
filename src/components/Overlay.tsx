import { useCallback, useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { command, getSettings, isNative } from '../lib/bridge';
import { shortcutKeycaps } from '../lib/shortcut';
import { defaultSettings, type Phase, type Settings } from '../lib/types';
import { useVoice } from '../lib/useVoice';
import DictationPill, { pillMode } from './DictationPill';

/** Two soft sine notes; quiet enough for an office, clear enough to know Bruma heard you. */
function chime(context: AudioContext, notes: number[]) {
  const now = context.currentTime;
  notes.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    const start = now + index * 0.07;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.06, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start); oscillator.stop(start + 0.18);
  });
}

export default function Overlay() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const { voice, levelRef, start, stop, cancel, insert } = useVoice();
  const [hovered, setHovered] = useState(false);
  const [suggestion, setSuggestion] = useState<{ heard: string; term: string } | null>(null);
  const [learned, setLearned] = useState(false);
  const suggestionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const previous = useRef<Phase>('idle');
  const mac = /Mac/i.test(navigator.userAgent);
  // Browser preview only: ?view=overlay&state=listening renders a state for design review.
  const query = isNative ? null : new URLSearchParams(window.location.search);
  const forced = query?.get('state') as ReturnType<typeof pillMode> | null ?? null;
  // Preview only (README captures): ?brand=%2325D366 tints the pill, ?live=1 feeds a synthetic voice.
  const previewBrand = query?.get('brand') && /^#[0-9a-f]{6}$/i.test(query.get('brand')!) ? query.get('brand') : null;
  const previewVoice = query?.get('live') === '1';
  useEffect(() => {
    if (!previewVoice) return;
    const started = performance.now();
    const timer = setInterval(() => {
      const t = (performance.now() - started) / 1000;
      levelRef.current = 0.02 + Math.abs(Math.sin(t * 7.3) * Math.cos(t * 2.1)) * 0.11 * (Math.sin(t * 0.9) > -0.6 ? 1 : 0.15);
    }, 40);
    return () => clearInterval(timer);
  }, [previewVoice, levelRef]);

  useEffect(() => {
    document.body.classList.add('overlay-mode');
    let disposed = false;
    const cleanup: (() => void)[] = [];
    void getSettings().then(value => { if (!disposed) setSettings(value); }).catch(() => {});
    const hover = (inside: boolean) => {
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
      if (inside) setHovered(true);
      // A short grace period so the controls don't vanish while the pointer travels to them.
      else leaveTimer.current = setTimeout(() => setHovered(false), 220);
    };
    if (isNative) {
      void listen<Settings>('settings:changed', event => { if (!disposed) setSettings(event.payload); }).then(u => { if (disposed) u(); else cleanup.push(u); });
      void listen<boolean>('overlay:hover', event => { if (!disposed) hover(event.payload); }).then(u => { if (disposed) u(); else cleanup.push(u); });
      void listen<{ heard: string; term: string }>('learn:suggestion', event => {
        if (disposed) return;
        setLearned(false); setSuggestion(event.payload);
        if (suggestionTimer.current) clearTimeout(suggestionTimer.current);
        suggestionTimer.current = setTimeout(() => setSuggestion(null), 12_000);
      }).then(u => { if (disposed) u(); else cleanup.push(u); });
    } else {
      const enter = () => hover(true); const leave = () => hover(false);
      document.addEventListener('mouseover', enter); document.documentElement.addEventListener('mouseleave', leave);
      cleanup.push(() => { document.removeEventListener('mouseover', enter); document.documentElement.removeEventListener('mouseleave', leave); });
    }
    return () => { disposed = true; cleanup.forEach(unlisten => unlisten()); document.body.classList.remove('overlay-mode'); };
  }, []);

  useEffect(() => {
    const before = previous.current;
    previous.current = voice.phase;
    if (!settings.playSounds || before === voice.phase) return;
    try {
      audio.current ??= new AudioContext();
      if (voice.phase === 'listening' && (before === 'connecting' || before === 'idle')) chime(audio.current, [660, 990]);
      else if (voice.phase === 'processing' && (before === 'listening' || before === 'paused')) chime(audio.current, [880, 587]);
      else if (voice.phase === 'error') chime(audio.current, [330]);
    } catch { /* sound is optional */ }
  }, [voice.phase, settings.playSounds]);

  const onHitbox = useCallback((rect: DOMRect | null) => {
    if (!isNative) return;
    void command('set_pill_hitbox', rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : { x: 0, y: 0, width: 0, height: 0 }).catch(() => {});
  }, []);
  // A new dictation replaces any pending suggestion.
  useEffect(() => { if (voice.phase !== 'idle' && voice.phase !== 'inserted') { setSuggestion(null); setLearned(false); } }, [voice.phase]);
  const closeSuggestion = useCallback((after = 0) => {
    if (suggestionTimer.current) clearTimeout(suggestionTimer.current);
    suggestionTimer.current = setTimeout(() => { setSuggestion(null); setLearned(false); if (isNative && !settings.showPill) void command('hide_overlay').catch(() => {}); }, after);
  }, [settings.showPill]);
  const learn = useCallback(async () => {
    if (!suggestion) return;
    try { if (isNative) await command('add_dictionary_term', { term: suggestion.term, heard: suggestion.heard }); setLearned(true); closeSuggestion(1400); }
    catch { closeSuggestion(0); }
  }, [suggestion, closeSuggestion]);
  const dismiss = useCallback(() => { if (suggestion && isNative) void command('dismiss_suggestion', { term: suggestion.term }).catch(() => {}); closeSuggestion(0); }, [suggestion, closeSuggestion]);
  const base = pillMode(voice.phase, hovered);
  const mode = forced || (suggestion && (base === 'idle' || base === 'hover' || base === 'done') ? (learned ? 'learned' : 'learn') : base);
  const keys = shortcutKeycaps(settings.shortcut, mac ? 'mac' : 'windows').map(key => key.label === 'espacio' ? 'Espacio' : key.label);

  return <main className="overlay-stage" aria-label="Bruma">
    <DictationPill mode={mode} context={forced ? { ...voice.context, name: 'Slack' } : voice.context} levelRef={levelRef} shortcut={keys}
      fnKeys={mac && settings.fnKey ? (settings.fnCombo === 'fn+space' ? ['fn', 'Espacio'] : ['fn']) : null} hold={voice.hold} live={forced === 'listening' ? 'Oye, mañana a las diez revisamos el diseño de Bruma' : voice.live ? `${voice.transcript} ${voice.interim}`.trim() : ''}
      error={forced === 'error' ? 'Groq rechazó la clave. Revísala en Conexiones.' : voice.error} copied={voice.copied} result={forced === 'review' ? 'Perfecto, mañana a las 10:30 revisamos el diseño de Bruma.' : voice.result} reducedMotion={settings.reducedMotion}
      onStart={() => { setHovered(false); return start(); }} onStop={stop}
      onCancel={async () => { await cancel(); }} onConfirm={() => insert(voice.result, true)}
      brandOverride={previewBrand} suggestion={forced === 'learn' ? { heard: 'Deep Grip', term: 'Deepgram' } : suggestion} onLearn={learn} onDismissLearn={dismiss}
      onOpen={() => isNative ? command('show_main_window').catch(() => {}) : undefined} onHitbox={onHitbox} />
  </main>;
}
