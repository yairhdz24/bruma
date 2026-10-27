import { useEffect, useState } from 'react';
import { command, isNative } from './bridge';

/** The signature color of an app, taken from its own icon: the most common vivid hue. */
const cache = new Map<string, string>();

function hsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

export function brandColorFromPixels(data: Uint8ClampedArray): string | null {
  // 24 hue buckets weighted by saturation; the winning bucket's average is the brand color.
  const buckets = Array.from({ length: 24 }, () => ({ weight: 0, r: 0, g: 0, b: 0 }));
  let gray = { weight: 0, r: 0, g: 0, b: 0 };
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255;
    if (a < 0.6) continue;
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    const [h, s, l] = hsl(r, g, b);
    if (s < 0.28 || l < 0.12 || l > 0.9) { gray = { weight: gray.weight + a, r: gray.r + r * a, g: gray.g + g * a, b: gray.b + b * a }; continue; }
    const w = a * s * (1 - Math.abs(l - 0.5));
    const bucket = buckets[Math.floor(h / 15) % 24];
    bucket.weight += w; bucket.r += r * w; bucket.g += g * w; bucket.b += b * w;
  }
  const best = buckets.reduce((a, b) => (b.weight > a.weight ? b : a));
  const pick = best.weight > 2 ? best : gray.weight > 0 ? gray : null;
  if (!pick) return null;
  const [r, g, b] = [pick.r / pick.weight, pick.g / pick.weight, pick.b / pick.weight].map(v => Math.round(v));
  return `rgb(${r}, ${g}, ${b})`;
}

export function brandColor(icon: string | undefined): Promise<string | null> {
  if (!icon) return Promise.resolve(null);
  const hit = cache.get(icon);
  if (hit) return Promise.resolve(hit);
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 32; canvas.height = 32;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return resolve(null);
        context.drawImage(image, 0, 0, 32, 32);
        const color = brandColorFromPixels(context.getImageData(0, 0, 32, 32).data);
        if (color) cache.set(icon, color);
        resolve(color);
      } catch { resolve(null); }
    };
    image.onerror = () => resolve(null);
    image.src = icon;
  });
}

export function useBrandColor(icon: string | undefined, fallback = 'rgb(120, 160, 255)') {
  const [color, setColor] = useState(fallback);
  useEffect(() => {
    let live = true;
    void brandColor(icon).then(value => { if (live) setColor(value || fallback); });
    return () => { live = false; };
  }, [icon, fallback]);
  return color;
}

const icons = new Map<string, Promise<string | null>>();
/** Real icon of an installed app (history rows), fetched once per bundle. */
export function useAppIcon(bundleId: string | null | undefined) {
  const [icon, setIcon] = useState<string | undefined>();
  useEffect(() => {
    if (!isNative || !bundleId) return;
    let live = true;
    let request = icons.get(bundleId);
    if (!request) { request = command<string | null>('get_app_icon', { bundleId }).catch(() => null); icons.set(bundleId, request); }
    void request.then(value => { if (live && value) setIcon(value); });
    return () => { live = false; };
  }, [bundleId]);
  return icon;
}
