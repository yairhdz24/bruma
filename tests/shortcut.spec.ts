import { test, expect } from '@playwright/test';
import { captureShortcut, recommendedShortcut, sameShortcut, shortcutKeycaps, shortcutMatchesEvent, type ShortcutKeyEvent } from '../src/lib/shortcut';

const legacy = 'CommandOrControl+Shift+Space';
const key = (overrides: Partial<ShortcutKeyEvent> = {}): ShortcutKeyEvent => ({
  key: ' ', code: 'Space', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false,
  repeat: false, isComposing: false, ...overrides,
});

test('shortcut capture uses physical key codes and portable primary modifiers', () => {
  expect(captureShortcut(key({ metaKey: true, shiftKey: true }), 'mac')).toEqual({ kind: 'valid', shortcut: 'Shift+CommandOrControl+Space' });
  expect(captureShortcut(key({ ctrlKey: true, shiftKey: true }), 'windows')).toEqual({ kind: 'valid', shortcut: 'CommandOrControl+Shift+Space' });
  expect(captureShortcut(key({ key: 'å', code: 'KeyA', altKey: true }), 'mac')).toEqual({ kind: 'valid', shortcut: 'Alt+KeyA' });
  expect(captureShortcut(key({ key: 'F8', code: 'F8', ctrlKey: true }), 'mac')).toEqual({ kind: 'valid', shortcut: 'Control+F8' });
});

test('repeats, composition and modifier-only strokes never become shortcuts', () => {
  for (const event of [key({ repeat: true, metaKey: true }), key({ isComposing: true, ctrlKey: true }), key({ key: 'Dead', code: 'Quote', altKey: true }), key({ key: 'Meta', code: 'MetaLeft', metaKey: true }), key({ key: 'Control', code: 'ControlRight', ctrlKey: true }), key({ key: 'Fn', code: 'Fn' })]) {
    expect(captureShortcut(event, 'mac')).toEqual({ kind: 'ignore' });
  }
  expect(captureShortcut(key({ key: 'Escape', code: 'Escape', metaKey: true }), 'mac')).toEqual({ kind: 'cancel' });
});

test('plain typing, Shift-only combinations, AltGr and reserved chords are rejected', () => {
  for (const event of [key({ key: 'a', code: 'KeyA' }), key({ key: 'A', code: 'KeyA', shiftKey: true }), key({ metaKey: true }), key({ key: 'q', code: 'KeyQ', metaKey: true }), key({ key: 'Tab', code: 'Tab', metaKey: true })]) {
    expect(captureShortcut(event, 'mac').kind).toBe('invalid');
  }
  for (const event of [key({ key: 'F4', code: 'F4', altKey: true }), key({ key: 'Delete', code: 'Delete', ctrlKey: true, altKey: true }), key({ key: 'l', code: 'KeyL', metaKey: true }), key({ key: '@', code: 'KeyQ', ctrlKey: true, altKey: true, getModifierState: name => name === 'AltGraph' })]) {
    expect(captureShortcut(event, 'windows').kind).toBe('invalid');
  }
});

test('matching requires the exact chord, not extra or missing modifiers', () => {
  expect(shortcutMatchesEvent(legacy, key({ metaKey: true, shiftKey: true }), 'mac')).toBe(true);
  expect(shortcutMatchesEvent(legacy, key({ ctrlKey: true, shiftKey: true }), 'windows')).toBe(true);
  expect(shortcutMatchesEvent(legacy, key({ metaKey: true }), 'mac')).toBe(false);
  expect(shortcutMatchesEvent(legacy, key({ metaKey: true, shiftKey: true, altKey: true }), 'mac')).toBe(false);
  expect(shortcutMatchesEvent(legacy, key({ metaKey: true, shiftKey: true, repeat: true }), 'mac')).toBe(false);
  expect(shortcutMatchesEvent('Alt+KeyA', key({ key: 'å', code: 'KeyA', altKey: true }), 'mac')).toBe(true);
});

test('native alias and ordering differences cannot invalidate a genuine test event', () => {
  expect(sameShortcut(legacy, 'shift+meta+Space', 'mac')).toBe(true);
  expect(sameShortcut(legacy, 'shift+control+space', 'windows')).toBe(true);
  expect(sameShortcut('Control+Shift+K', 'shift+CTRL+keyk', 'mac')).toBe(true);
  expect(sameShortcut('Alt+KeyA', 'Alt+KeyB', 'mac')).toBe(false);
  expect(sameShortcut('Shift+Control', 'Shift+Control', 'mac')).toBe(false);
  expect(sameShortcut('Control+KeyA+KeyB', 'Control+KeyA', 'mac')).toBe(false);
});

test('keycaps expose readable labels without claiming modifier side support', () => {
  expect(shortcutKeycaps(legacy, 'mac').map(value => value.label)).toEqual(['⌘', '⇧', 'espacio']);
  expect(shortcutKeycaps(legacy, 'windows').map(value => value.label)).toEqual(['Ctrl', '⇧', 'espacio']);
  expect(shortcutKeycaps('Alt+KeyK', 'mac').map(value => value.spoken)).toEqual(['Opción', 'K']);
  expect(shortcutKeycaps('Control+F8', 'windows').map(value => value.label)).toEqual(['Ctrl', 'F8']);
});

test('the recommended shortcut is Control+Space on every platform', () => {
  expect(recommendedShortcut).toBe('Control+Space');
  expect(shortcutKeycaps(recommendedShortcut, 'mac').map(value => value.label)).toEqual(['⌃', 'espacio']);
  expect(captureShortcut(key({ ctrlKey: true }), 'mac')).toEqual({ kind: 'valid', shortcut: 'Control+Space' });
});
