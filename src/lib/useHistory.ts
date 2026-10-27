import { useEffect, useState } from 'react';
import { getHistory, subscribeHistory } from './bridge';
import { emptyHistory, type History, type HistoryTotals } from './types';

export function useHistory() {
  const [history, setHistory] = useState<History>(emptyHistory);
  useEffect(() => {
    let disposed = false;
    void getHistory().then(value => { if (!disposed) setHistory(value); }).catch(() => {});
    const unsubscribe = subscribeHistory(value => { if (!disposed) setHistory(value); });
    return () => { disposed = true; unsubscribe(); };
  }, []);
  return [history, setHistory] as const;
}

/** Consecutive days with dictation, counting today or yesterday as the latest day. */
export function streak(days: number[]) {
  if (!days.length) return 0;
  const today = Math.floor(Date.now() / 86_400_000);
  const set = new Set(days);
  let day = set.has(today) ? today : set.has(today - 1) ? today - 1 : -1;
  let count = 0;
  while (day >= 0 && set.has(day)) { count++; day--; }
  return count;
}

export function stats(totals: HistoryTotals) {
  const minutes = totals.speakingMs / 60_000;
  const wpm = minutes > 0.05 ? Math.round(totals.words / minutes) : 0;
  // Compared with typing at 40 words per minute, a common average.
  const savedMinutes = Math.max(0, totals.words / 40 - minutes);
  return { words: totals.words, wpm, savedMinutes, streak: streak(totals.activeDays), dictations: totals.dictations };
}

export const number = (value: number) => new Intl.NumberFormat('es-MX').format(Math.round(value));
export function duration(minutes: number) {
  if (minutes < 1) return `${Math.round(minutes * 60)} s`;
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${Math.round(minutes % 60)} min`;
}
export function dayLabel(timestamp: number) {
  const date = new Date(timestamp);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const that = new Date(date); that.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - that.getTime()) / 86_400_000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  return date.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, c => c.toUpperCase());
}
export const timeLabel = (timestamp: number) => new Date(timestamp).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
