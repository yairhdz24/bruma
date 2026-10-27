export type ShortcutPlatform = 'mac' | 'windows';
export interface ShortcutKeyEvent {
  key: string;
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat?: boolean;
  isComposing?: boolean;
  getModifierState?: (key: string) => boolean;
}
export type ShortcutCapture =
  | { kind: 'ignore' | 'cancel' }
  | { kind: 'invalid'; message: string }
  | { kind: 'valid'; shortcut: string };
export interface ShortcutKeycap { label: string; spoken: string; wide?: boolean }

export const recommendedShortcut = 'Control+Space';

const specialCodes = new Set([
  'Space', 'Enter', 'Backspace', 'Delete', 'Insert', 'Home', 'End', 'PageUp', 'PageDown',
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab',
  'Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Backslash', 'Semicolon', 'Quote',
  'Backquote', 'Comma', 'Period', 'Slash', 'IntlBackslash',
]);
const supportedCode = (code: string) => /^(Key[A-Z]|Digit[0-9]|Numpad[0-9]|F([1-9]|1[0-9]|2[0-4]))$/.test(code) || specialCodes.has(code);

function physicalCode(token: string): string {
  if (/^[a-z]$/i.test(token)) return `Key${token.toUpperCase()}`;
  if (/^key[a-z]$/i.test(token)) return `Key${token.slice(3).toUpperCase()}`;
  if (/^digit[0-9]$/i.test(token)) return `Digit${token.slice(5)}`;
  if (/^f[0-9]{1,2}$/i.test(token)) return token.toUpperCase();
  if (/^\d$/.test(token)) return `Digit${token}`;
  const named = [...specialCodes].find(code => code.toLowerCase() === token.toLowerCase());
  return named || token;
}

function describe(shortcut: string, platform: ShortcutPlatform) {
  const tokens = shortcut.split('+').map(value => value.trim());
  const mods = new Set<string>();
  let code = '';
  for (const token of tokens) {
    if (code || !token) return null;
    switch (token.toLowerCase()) {
      case 'commandorcontrol': case 'commandorctrl': case 'cmdorctrl': case 'cmdorcontrol':
        mods.add(platform === 'mac' ? 'meta' : 'ctrl'); break;
      case 'command': case 'cmd': case 'super': case 'meta': mods.add('meta'); break;
      case 'control': case 'ctrl': mods.add('ctrl'); break;
      case 'option': case 'alt': mods.add('alt'); break;
      case 'shift': mods.add('shift'); break;
      default: code = physicalCode(token);
    }
  }
  if (!code || !supportedCode(code)) return null;
  return { code, meta: mods.has('meta'), ctrl: mods.has('ctrl'), alt: mods.has('alt'), shift: mods.has('shift') };
}

function reserved({ code, meta, ctrl, alt, shift }: NonNullable<ReturnType<typeof describe>>, platform: ShortcutPlatform) {
  if (code === 'Tab' && (meta || alt || ctrl)) return true;
  if (platform === 'windows' && ((alt && code === 'F4') || (ctrl && alt && code === 'Delete') || (meta && !ctrl && !alt))) return true;
  if (platform === 'mac' && meta && code === 'Space' && !shift && !ctrl && !alt) return true;
  const primary = platform === 'mac' ? meta : ctrl;
  if (primary && (platform === 'mac' ? !ctrl : !meta) && !shift && !alt && ['KeyA', 'KeyC', 'KeyV', 'KeyX', 'KeyZ', 'KeyS', 'KeyO', 'KeyN', 'KeyP', 'KeyF', 'KeyR', 'KeyT', 'KeyL', 'KeyW', 'KeyQ', 'KeyH', 'KeyM'].includes(code)) return true;
  return false;
}

export function captureShortcut(event: ShortcutKeyEvent, platform: ShortcutPlatform): ShortcutCapture {
  if (event.repeat || event.isComposing || ['Dead', 'Process', 'Unidentified'].includes(event.key)) return { kind: 'ignore' };
  if (event.key === 'Escape' || event.code === 'Escape') return { kind: 'cancel' };
  if (/^(Meta|Control|Alt|Shift)(Left|Right)?$/.test(event.code) || ['Meta', 'Control', 'Alt', 'Shift', 'AltGraph', 'Fn'].includes(event.key)) return { kind: 'ignore' };
  if (event.getModifierState?.('AltGraph')) return { kind: 'invalid', message: 'AltGr se usa para escribir caracteres. Elige otra combinación.' };
  if (!supportedCode(event.code)) return { kind: 'invalid', message: 'Esa tecla no está disponible como atajo. Prueba con una letra o Espacio.' };
  if (!event.metaKey && !event.ctrlKey && !event.altKey) return { kind: 'invalid', message: platform === 'mac' ? 'Mantén ⌘, Control u Opción y añade otra tecla.' : 'Mantén Ctrl o Alt y añade otra tecla.' };
  const chord = { code: event.code, meta: event.metaKey, ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey };
  if (reserved(chord, platform)) return { kind: 'invalid', message: 'Esa combinación se usa para acciones habituales. Añade otro modificador o elige otra tecla.' };
  const parts: string[] = [];
  if (event.ctrlKey) parts.push(platform === 'windows' ? 'CommandOrControl' : 'Control');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  if (event.metaKey) parts.push(platform === 'mac' ? 'CommandOrControl' : 'Super');
  parts.push(event.code);
  return { kind: 'valid', shortcut: parts.join('+') };
}

export function shortcutMatchesEvent(shortcut: string, event: ShortcutKeyEvent, platform: ShortcutPlatform): boolean {
  const chord = describe(shortcut, platform);
  return Boolean(chord && !event.repeat && !event.isComposing && !event.getModifierState?.('AltGraph') && chord.code === event.code && chord.meta === event.metaKey && chord.ctrl === event.ctrlKey && chord.alt === event.altKey && chord.shift === event.shiftKey);
}

export function sameShortcut(first: string, second: string, platform: ShortcutPlatform): boolean {
  const a = describe(first, platform); const b = describe(second, platform);
  return Boolean(a && b && a.code === b.code && a.meta === b.meta && a.ctrl === b.ctrl && a.alt === b.alt && a.shift === b.shift);
}

export function shortcutKeycaps(shortcut: string, platform: ShortcutPlatform = 'mac'): ShortcutKeycap[] {
  const special: Record<string, ShortcutKeycap> = {
    Space: { label: 'espacio', spoken: 'Espacio', wide: true }, Enter: { label: '↩', spoken: 'Enter' },
    Backspace: { label: '⌫', spoken: 'Retroceso' }, Delete: { label: '⌦', spoken: 'Suprimir' },
    ArrowLeft: { label: '←', spoken: 'Flecha izquierda' }, ArrowRight: { label: '→', spoken: 'Flecha derecha' },
    ArrowUp: { label: '↑', spoken: 'Flecha arriba' }, ArrowDown: { label: '↓', spoken: 'Flecha abajo' },
    PageUp: { label: '⇞', spoken: 'Página arriba' }, PageDown: { label: '⇟', spoken: 'Página abajo' },
    Home: { label: '↖', spoken: 'Inicio' }, End: { label: '↘', spoken: 'Fin' }, Tab: { label: '⇥', spoken: 'Tabulador' },
    Minus: { label: '−', spoken: 'Menos' }, Equal: { label: '=', spoken: 'Igual' },
    BracketLeft: { label: '[', spoken: 'Corchete izquierdo' }, BracketRight: { label: ']', spoken: 'Corchete derecho' },
    Backslash: { label: '\\', spoken: 'Barra inversa' }, Semicolon: { label: ';', spoken: 'Punto y coma' },
    Quote: { label: "'", spoken: 'Comilla' }, Backquote: { label: '`', spoken: 'Acento grave' },
    Comma: { label: ',', spoken: 'Coma' }, Period: { label: '.', spoken: 'Punto' }, Slash: { label: '/', spoken: 'Barra' },
  };
  return shortcut.split('+').map(raw => {
    const token = raw.trim();
    switch (token.toLowerCase()) {
      case 'commandorcontrol': case 'commandorctrl': case 'cmdorctrl': case 'cmdorcontrol':
        return platform === 'mac' ? { label: '⌘', spoken: 'Comando' } : { label: 'Ctrl', spoken: 'Control' };
      case 'command': case 'cmd': case 'super': case 'meta':
        return platform === 'mac' ? { label: '⌘', spoken: 'Comando' } : { label: 'Win', spoken: 'Windows' };
      case 'control': case 'ctrl': return { label: platform === 'mac' ? '⌃' : 'Ctrl', spoken: 'Control' };
      case 'option': case 'alt': return { label: platform === 'mac' ? '⌥' : 'Alt', spoken: 'Opción' };
      case 'shift': return { label: '⇧', spoken: 'Mayúsculas' };
      default: {
        const code = physicalCode(token);
        return special[code] || { label: code.replace(/^Key|^Digit/, '').replace(/^Numpad/, 'Num '), spoken: code.replace(/^Key|^Digit/, '').replace(/^Numpad/, 'Teclado numérico ') };
      }
    }
  });
}
