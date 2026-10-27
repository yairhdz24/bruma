import { memo, useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties, type RefObject } from 'react';
import { ArrowElbowDownLeftIcon, ArrowUpRightIcon, BookOpenTextIcon, CheckIcon, MicrophoneIcon, XIcon } from '@phosphor-icons/react';
import { useBrandColor } from '../lib/appColor';
import type { AppContext, Phase } from '../lib/types';
import './pill.css';

type Action = () => void | Promise<void>;
export type PillMode = 'idle' | 'hover' | 'listening' | 'paused' | 'working' | 'done' | 'review' | 'error' | 'learn' | 'learned';
export interface DictationPillProps {
  mode: PillMode;
  context: AppContext;
  levelRef: RefObject<number>;
  shortcut: string[];
  /** The fn keys that dictate ("fn" or "fn" + "Espacio"), or null. */
  fnKeys?: string[] | null;
  hold?: boolean;
  live?: string;
  error?: string | null;
  copied?: boolean;
  result?: string;
  reducedMotion?: boolean;
  onStart?: Action;
  onStop?: Action;
  onCancel?: Action;
  onConfirm?: Action;
  onOpen?: Action;
  /** A word you just corrected, offered for the dictionary. */
  suggestion?: { heard: string; term: string } | null;
  onLearn?: Action;
  onDismissLearn?: Action;
  /** Browser preview only: a fixed tint instead of the app icon's color. */
  brandOverride?: string | null;
  /** Reports the clickable area (CSS px) so the rest of the window lets clicks through. */
  onHitbox?: (rect: DOMRect | null) => void;
}
const BARS = 7;

export function pillMode(phase: Phase, hovered: boolean): PillMode {
  switch (phase) {
    case 'connecting': case 'listening': return 'listening';
    case 'paused': return 'paused';
    case 'processing': return 'working';
    case 'inserted': return 'done';
    case 'ready': return 'review';
    case 'error': return 'error';
    default: return hovered ? 'hover' : 'idle';
  }
}

/** Words appear one by one out of a soft blur, the way they leave your mouth. */
function LiveWords({ text }: { text: string }) {
  const words = useMemo(() => {
    const all = text.trim().split(/\s+/).filter(Boolean);
    // Keep the bubble to the last couple of lines; indexes stay stable so only new words animate.
    let start = 0; let length = 0;
    for (let i = all.length - 1; i >= 0; i--) { length += all[i].length + 1; if (length > 92) { start = i + 1; break; } }
    return all.map((word, index) => ({ word, index })).slice(start);
  }, [text]);
  if (!words.length) return null;
  return <p className="pill-live" aria-hidden="true">{words.map(({ word, index }) => <span key={index}>{word} </span>)}</p>;
}

/** One capsule that morphs between states, like a Dynamic Island: resting line, hover controls, live waveform, result. */
function DictationPill({ mode, context, levelRef, shortcut, fnKeys = null, hold = false, live = '', error, copied = false, result = '', reducedMotion = false, suggestion = null, brandOverride = null, onStart, onStop, onCancel, onConfirm, onOpen, onLearn, onDismissLearn, onHitbox }: DictationPillProps) {
  const capsule = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const bars = useRef<HTMLSpanElement[]>([]);
  const recording = mode === 'listening' || mode === 'paused';
  const iconBrand = useBrandColor(context.iconDataUrl);
  const brand = brandOverride || iconBrand;

  // Waveform driven by the real microphone level, sampled ~22 times per second.
  useEffect(() => {
    const element = capsule.current;
    if (!element || !recording) { element?.style.setProperty('--level', '0'); return; }
    const history = new Array(BARS).fill(0);
    let frame = 0; let last = 0; let smooth = 0;
    const draw = (time: number) => {
      frame = requestAnimationFrame(draw);
      if (time - last < (reducedMotion ? 120 : 45)) return;
      last = time;
      const raw = Number.isFinite(levelRef.current) ? levelRef.current : 0;
      const level = mode === 'paused' ? 0 : Math.min(1, Math.max(0, raw - 0.008) * 7.5);
      smooth += (level - smooth) * 0.4;
      history.shift(); history.push(Math.pow(level, 0.65));
      element.style.setProperty('--level', smooth.toFixed(3));
      // Newest sound in the middle, rippling outwards; a gentle breath when you pause.
      const mid = (BARS - 1) / 2;
      bars.current.forEach((bar, i) => {
        const distance = Math.abs(i - mid);
        const center = 1 - distance / mid * 0.45;
        const value = reducedMotion ? smooth : history[BARS - 1 - Math.round(distance)];
        // A resting silhouette (tall in the middle) that breathes, lifted by your voice.
        const rest = 0.3 + (1 - distance / mid) * 0.32;
        const breath = reducedMotion ? 0 : Math.sin(time / 240 + i * 1.1) * 0.08;
        bar.style.transform = `scaleY(${Math.max(0.18, Math.min(1, rest + breath + value * center * 0.75)).toFixed(3)})`;
      });
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [recording, mode, levelRef, reducedMotion]);

  // Keep the native click-through region in sync while the capsule animates.
  useLayoutEffect(() => {
    if (!onHitbox || !capsule.current) return;
    let frame = 0;
    const report = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = capsule.current?.getBoundingClientRect();
        if (!box) return;
        const pad = mode === 'idle' ? 16 : 10;
        let top = box.top - pad; let left = box.left - pad; let right = box.right + pad; const bottom = box.bottom + pad;
        const hint = tip.current?.getBoundingClientRect();
        if (mode === 'hover' && hint && hint.width) { top = Math.min(top, hint.top - 4); left = Math.min(left, hint.left - 4); right = Math.max(right, hint.right + 4); }
        onHitbox(new DOMRect(left, top, right - left, bottom - top));
      });
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(capsule.current);
    const node = capsule.current;
    node.addEventListener('transitionend', report);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); node.removeEventListener('transitionend', report); };
  }, [mode, onHitbox]);

  const message = mode === 'error' ? (error || 'No se pudo completar el dictado') : '';
  const style = { '--brand': brand } as CSSProperties;
  return <div className="pill-stage" style={style} data-mode={mode} data-copied={copied || undefined} data-hold={hold || undefined} data-reduced-motion={reducedMotion || undefined}>
    <div className="pill-above">
      <div ref={tip} className="pill-tip" aria-hidden={mode !== 'hover'}>
        {fnKeys ? <>Toca {fnKeys.map(k => <kbd key={k}>{k}</kbd>)} o mantenlo para dictar</> : <>Dictar {shortcut.map((key, i) => <kbd key={i}>{key}</kbd>)}</>}
      </div>
      {recording && <LiveWords text={live} />}
      {recording && hold && !live && <p className="pill-hint" aria-hidden="true">Suelta {fnKeys && fnKeys.length > 1 ? 'las teclas' : <kbd>fn</kbd>} para pegar</p>}
    </div>
    <div ref={capsule} className="capsule" role="group" aria-label={`Dictado${context.name && mode !== 'idle' && mode !== 'hover' ? ` en ${context.name}` : ''}`}>
      <span className="capsule-glow" aria-hidden="true" />

      <div className="face face-hover" aria-hidden={mode !== 'hover'}>
        <button type="button" className="pill-btn is-wide" tabIndex={mode === 'hover' ? 0 : -1} aria-label="Empezar a dictar" onClick={() => void onStart?.()}><MicrophoneIcon size={15} weight="fill" aria-hidden="true" /></button>
        <button type="button" className="pill-btn" tabIndex={mode === 'hover' ? 0 : -1} aria-label="Abrir Bruma" onClick={() => void onOpen?.()}><ArrowUpRightIcon size={13} weight="bold" aria-hidden="true" /></button>
      </div>

      <div className="face face-record" aria-hidden={!recording}>
        <button type="button" className="pill-btn is-side" tabIndex={recording ? 0 : -1} aria-label="Cancelar dictado" title="Cancelar (Esc)" onClick={() => void onCancel?.()}><XIcon size={11} weight="bold" aria-hidden="true" /></button>
        <span className="wave" aria-hidden="true">{Array.from({ length: BARS }, (_, i) => <span key={i} ref={el => { if (el) bars.current[i] = el; }} />)}</span>
        <button type="button" className="pill-btn is-stop is-side" tabIndex={recording ? 0 : -1} aria-label="Terminar y pegar" title="Terminar y pegar" onClick={() => void onStop?.()}><span className="stop-square" aria-hidden="true" /></button>
      </div>

      <div className="face face-working" aria-hidden={mode !== 'working'}><span className="dots" aria-hidden="true"><i /><i /><i /></span></div>

      <div className="face face-done" aria-hidden={mode !== 'done'}><CheckIcon size={13} weight="bold" aria-hidden="true" /><span>{copied ? 'Copiado · ⌘V para pegar' : 'Listo'}</span></div>

      <div className="face face-review" aria-hidden={mode !== 'review'}>
        <span className="review-text">{result}</span>
        <button type="button" className="pill-btn" tabIndex={mode === 'review' ? 0 : -1} aria-label="Descartar" onClick={() => void onCancel?.()}><XIcon size={12} weight="bold" aria-hidden="true" /></button>
        <button type="button" className="pill-btn is-stop" tabIndex={mode === 'review' ? 0 : -1} aria-label={`Pegar en ${context.name}`} onClick={() => void onConfirm?.()}><ArrowElbowDownLeftIcon size={13} weight="bold" aria-hidden="true" /></button>
      </div>

      <div className="face face-error" aria-hidden={mode !== 'error'}><span>{message}</span></div>

      <div className="face face-learn" aria-hidden={mode !== 'learn'}>
        <BookOpenTextIcon size={15} aria-hidden="true" />
        <span className="learn-text">¿Agregar <b>«{suggestion?.term}»</b> al diccionario?</span>
        <button type="button" className="pill-btn" tabIndex={mode === 'learn' ? 0 : -1} aria-label="No, gracias" onClick={() => void onDismissLearn?.()}><XIcon size={12} weight="bold" aria-hidden="true" /></button>
        <button type="button" className="pill-btn is-stop is-text" tabIndex={mode === 'learn' ? 0 : -1} onClick={() => void onLearn?.()}>Agregar</button>
      </div>

      <div className="face face-learned" aria-hidden={mode !== 'learned'}><CheckIcon size={13} weight="bold" aria-hidden="true" /><span>Agregada al diccionario</span></div>
    </div>
    <span className="sr-only" role="status" aria-live="polite">{recording ? `Escuchando en ${context.name}` : mode === 'working' ? 'Escribiendo' : mode === 'done' ? (copied ? 'Copiado' : 'Texto pegado') : mode === 'learn' ? `¿Agregar ${suggestion?.term} al diccionario?` : message}</span>
  </div>;
}
export default memo(DictationPill);
