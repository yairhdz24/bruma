import { test, expect } from '@playwright/test';
import { defaultSettings, initialVoiceState } from '../src/lib/types';

test('a delayed native test cannot close or verify a newer shortcut test', async ({ page }) => {
  await page.addInitScript(({ settings, voice }) => {
    const callbacks = new Map<number, (value: unknown) => void>();
    const listeners = new Map<string, number[]>();
    let callbackId = 0;
    let begins = 0;
    let current: string | null = null;
    let firstResolve: ((value: unknown) => void) | undefined;
    const calls: { command: string; testId?: string }[] = [];
    const status = (testId: string) => ({ shortcut: settings.shortcut, registered: true, testActive: true, testId, testExpiresInMs: 30_000, error: null });
    const bridge = {
      calls,
      resolveFirst: () => firstResolve?.(status('session-a')),
      current: () => current,
      emitTest: (testId: string) => {
        for (const handler of listeners.get('shortcut:test') || []) callbacks.get(handler)?.({ event: 'shortcut:test', id: handler, payload: { shortcut: settings.shortcut, pressedAtMs: Date.now(), testId } });
      },
    };
    Object.assign(window, {
      brumaTestBridge: bridge,
      __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: (event: string, id: number) => listeners.set(event, (listeners.get(event) || []).filter(value => value !== id)) },
      __TAURI_INTERNALS__: {
        metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
        transformCallback: (fn: (value: unknown) => void) => { callbacks.set(++callbackId, fn); return callbackId; },
        invoke: async (command: string, args: Record<string, unknown> = {}) => {
          calls.push({ command, testId: args.testId as string | undefined });
          if (command === 'get_settings') return settings;
          if (command === 'get_voice_state') return voice;
          if (command === 'get_provider_status') return { deepgram: false, claude: false };
          if (command === 'get_system_symbol') return null;
          if (command === 'get_permission_status') return { platform: 'macos', microphone: 'notDetermined', accessibility: 'denied' };
          if (command === 'plugin:event|listen') {
            const event = args.event as string; const handler = args.handler as number;
            listeners.set(event, [...(listeners.get(event) || []), handler]); return handler;
          }
          if (command === 'begin_shortcut_test') {
            begins += 1;
            current = begins === 1 ? 'session-a' : 'session-b';
            if (begins === 1) return new Promise(resolve => { firstResolve = resolve; });
            return status('session-b');
          }
          if (command === 'end_shortcut_test' && args.testId === current) current = null;
          if (command === 'start_dictation') throw new Error('A shortcut test must not start audio capture.');
          return null;
        },
      },
    });
  }, { settings: { ...defaultSettings, onboardingVersion: 3 }, voice: initialVoiceState });
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Secciones' }).getByRole('button', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('button', { name: 'Probar atajo', exact: true }).click();
  await expect(page.locator('.shortcut-capture-label')).toHaveText('Preparando…');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.getByRole('button', { name: 'Probar atajo', exact: true }).click();
  await expect(page.locator('.shortcut-capture')).toBeFocused();
  await page.evaluate(() => (window as unknown as { brumaTestBridge: { resolveFirst: () => void } }).brumaTestBridge.resolveFirst());
  await expect.poll(() => page.evaluate(() => (window as unknown as { brumaTestBridge: { calls: { command: string; testId?: string }[] } }).brumaTestBridge.calls.filter(call => call.command === 'end_shortcut_test').map(call => call.testId))).toEqual(['session-a']);
  expect(await page.evaluate(() => (window as unknown as { brumaTestBridge: { current: () => string } }).brumaTestBridge.current())).toBe('session-b');
  await page.evaluate(() => (window as unknown as { brumaTestBridge: { emitTest: (id: string) => void } }).brumaTestBridge.emitTest('session-a'));
  await expect(page.getByText('Verificado por el sistema', { exact: true })).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { brumaTestBridge: { emitTest: (id: string) => void } }).brumaTestBridge.emitTest('session-b'));
  await expect(page.getByText('Verificado por el sistema', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { brumaTestBridge: { calls: { command: string }[] } }).brumaTestBridge.calls.some(call => call.command === 'start_dictation'))).toBe(false);
});
