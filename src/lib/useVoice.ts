import { useCallback, useEffect, useRef, useState } from 'react';
import { command, errorMessage, getHistory, isNative, savePreviewHistory, subscribeLevel, subscribeVoice } from './bridge';
import { initialVoiceState, type VoiceState } from './types';

const demoWords = ['Oye,', 'Oye, mañana', 'Oye, mañana a las diez', 'Oye, mañana a las diez revisamos', 'Oye, mañana a las diez revisamos el diseño de Bruma', 'Oye, mañana a las diez revisamos el diseño de Bruma, eh, y luego el deploy.'];
const demoResult = 'Oye, mañana a las diez revisamos el diseño de Bruma y luego el deploy.';

function same(a: VoiceState, b: VoiceState) {
  return a.sessionId === b.sessionId && a.phase === b.phase && a.transcript === b.transcript && a.interim === b.interim && a.result === b.result && a.error === b.error
    && a.copied === b.copied && a.live === b.live && a.context.name === b.context.name && a.context.iconDataUrl === b.context.iconDataUrl && a.context.canInsert === b.context.canInsert;
}

/** Live dictation state from the native side, plus an explicit browser-only demonstration. */
export function useVoice() {
  const [voice, setVoice] = useState<VoiceState>(initialVoiceState);
  const [isDemo, setIsDemo] = useState(false);
  const levelRef = useRef(0);
  const demoRef = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);
  const clearDemo = useCallback(() => {
    timers.current.forEach(clearTimeout); timers.current = [];
    if (interval.current) clearInterval(interval.current);
    interval.current = null; levelRef.current = 0;
  }, []);

  useEffect(() => {
    if (!isNative) return;
    let disposed = false;
    const cleanup: (() => void)[] = [];
    void (async () => {
      const unlistenState = await subscribeVoice(state => {
        if (disposed) return;
        if (demoRef.current) { clearDemo(); demoRef.current = false; setIsDemo(false); }
        setVoice(previous => same(previous, state) ? previous : state);
      });
      if (disposed) { unlistenState(); return; }
      cleanup.push(unlistenState);
      const unlistenLevel = await subscribeLevel(level => { if (!demoRef.current) levelRef.current = level.rms; });
      if (disposed) { unlistenLevel(); return; }
      cleanup.push(unlistenLevel);
      const current = await command<VoiceState>('get_voice_state');
      if (!disposed && !demoRef.current) setVoice(current);
    })().catch(error => { if (!disposed) setVoice(v => ({ ...v, error: errorMessage(error) })); });
    return () => { disposed = true; cleanup.forEach(unlisten => unlisten()); };
  }, [clearDemo]);
  useEffect(() => clearDemo, [clearDemo]);

  const finishDemo = useCallback(() => {
    clearDemo();
    setVoice(v => ({ ...v, phase: 'processing', interim: '' }));
    timers.current.push(setTimeout(() => {
      setVoice(v => ({ ...v, phase: 'inserted', result: demoResult }));
      void getHistory().then(history => {
        const words = demoResult.split(/\s+/).length;
        savePreviewHistory({
          totals: { dictations: history.totals.dictations + 1, words: history.totals.words + words, speakingMs: history.totals.speakingMs + 5200, activeDays: Array.from(new Set([...history.totals.activeDays, Math.floor(Date.now() / 86_400_000)])) },
          items: [{ id: `demo-${Date.now()}`, createdAt: Date.now(), text: demoResult, raw: demoWords[demoWords.length - 1], app: 'Notas', words, durationMs: 5200, inserted: true }, ...history.items],
        });
      });
      timers.current.push(setTimeout(() => { demoRef.current = false; setIsDemo(false); setVoice(initialVoiceState); }, 1600));
    }, 650));
  }, [clearDemo]);

  const startDemo = useCallback(() => {
    clearDemo(); demoRef.current = true; setIsDemo(true);
    const started = performance.now();
    setVoice({ ...initialVoiceState, sessionId: `demo-${started}`, phase: 'listening', live: true, context: { name: 'Notas', category: 'docs', canInsert: true } });
    let last = -1;
    interval.current = setInterval(() => {
      const elapsed = performance.now() - started;
      const paused = elapsed > 3300 && elapsed < 4100;
      levelRef.current = paused ? 0 : 0.02 + Math.abs(Math.sin(elapsed / 120) * Math.cos(elapsed / 470)) * 0.12;
      const index = Math.min(demoWords.length - 1, Math.floor(elapsed / 900));
      if (index !== last) { last = index; setVoice(v => ({ ...v, transcript: demoWords[index], phase: paused ? 'paused' : 'listening', elapsedMs: elapsed })); }
      if (elapsed > 6200) finishDemo();
    }, 60);
  }, [clearDemo, finishDemo]);

  const start = useCallback(async () => {
    if (!isNative) { startDemo(); return; }
    try { await command('start_dictation'); } catch (error) { setVoice(v => ({ ...v, phase: 'error', error: errorMessage(error) })); }
  }, [startDemo]);
  const stop = useCallback(async () => {
    if (demoRef.current) { finishDemo(); return; }
    try { await command('stop_dictation'); } catch (error) { setVoice(v => ({ ...v, error: errorMessage(error) })); }
  }, [finishDemo]);
  const cancel = useCallback(async () => {
    if (demoRef.current) { clearDemo(); demoRef.current = false; setIsDemo(false); setVoice(initialVoiceState); return; }
    try { await command('cancel_dictation', { deferOverlayHide: true }); } catch (error) { setVoice(v => ({ ...v, error: errorMessage(error) })); }
  }, [clearDemo]);
  const insert = useCallback(async (text: string, deferOverlayHide = false) => {
    if (demoRef.current) { setVoice(v => ({ ...v, phase: 'inserted', result: text })); return; }
    try { await command('insert_text', { text, deferOverlayHide }); } catch (error) { setVoice(v => ({ ...v, error: errorMessage(error) })); }
  }, []);
  const editResult = useCallback((result: string) => setVoice(v => ({ ...v, result })), []);
  return { voice, levelRef, isDemo, start, stop, cancel, insert, startDemo, editResult };
}
