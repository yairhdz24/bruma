import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const sections = ['Inicio', 'Historial', 'Diccionario', 'Atajos de voz', 'Conexiones', 'Ajustes'];
async function open(page: Page, settings: Record<string, unknown> = { onboardingVersion: 3 }) {
  await page.addInitScript(value => {
    if (!localStorage.getItem('bruma-preview-settings-v1')) localStorage.setItem('bruma-preview-settings-v1', JSON.stringify(value));
    if (navigator.mediaDevices) Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: () => Promise.reject(new Error('Tests never use the microphone.')) });
  }, settings);
  await page.goto('/');
}
const nav = (page: Page, name: string) => page.getByRole('navigation', { name: 'Secciones' }).getByRole('button', { name, exact: true });
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('bruma-preview-settings-v1') || '{}'));

test('welcome tour walks permissions, engine, fn key, practice and speed, and can be skipped', async ({ page }) => {
  await open(page, {});
  await expect(page.getByText('Bruma escribe.')).toBeVisible();
  await page.getByRole('button', { name: 'Empezar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Dos permisos y listo' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByRole('heading', { name: '¿Quién escucha?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guarda una clave para continuar' })).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Consigue tu clave gratis en un minuto' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Abrir Groq' })).toBeVisible();
  await page.getByRole('button', { name: 'Hacerlo después', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Modo dictado' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Prueba dictando' })).toBeVisible();
  await page.getByRole('button', { name: 'Saltar', exact: true }).click();
  await page.getByRole('button', { name: 'Saltar', exact: true }).click();
  await expect(page.getByText('3× más rápido')).toBeVisible();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Empezar a dictar', exact: true }).click();
  await expect(page.getByRole('heading', { name: /^Buen/ })).toBeVisible();
  expect((await stored(page)).onboardingVersion).toBe(3);
});

test('on a Mac the tour lights the fn key before continuing', async ({ browser }) => {
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36' });
  const page = await context.newPage();
  await open(page, {});
  await page.getByRole('button', { name: 'Empezar', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Hacerlo después', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByRole('heading', { name: /se ilumina la tecla/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sí', exact: true })).toBeDisabled();
  await page.keyboard.down('Shift');
  await expect(page.locator('.big-key')).toHaveAttribute('data-down', 'true');
  await page.keyboard.up('Shift');
  await expect(page.getByRole('button', { name: 'Sí', exact: true })).toBeEnabled();
  await context.close();
});

test('demonstration listens, writes and lands in the history without a microphone', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Ver demostración' }).click();
  await expect(page.getByRole('button', { name: 'Terminar', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Terminar', exact: true }).click();
  await expect(page.getByText('Pegado en Notas.')).toBeVisible();
  await expect(page.locator('.history-text').first()).toContainText('revisamos el diseño de Bruma');
  await nav(page, 'Historial').click();
  await page.getByRole('button', { name: 'Ver lo que dijiste' }).first().click();
  await expect(page.locator('.history-raw')).toContainText('eh, y luego');
});

test('cancel discards a demonstration', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Ver demostración' }).click();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ver demostración' })).toBeVisible();
  await expect(page.locator('.history-item')).toHaveCount(0);
});

test('connections choose an engine and never accept keys in the browser preview', async ({ page }) => {
  await open(page);
  await nav(page, 'Conexiones').click();
  await expect(page.locator('#groq-key')).toBeDisabled();
  await page.getByText('Tu servidor', { exact: true }).click();
  await expect(page.getByPlaceholder('https://whisper.mi-vps.com/v1')).toHaveValue('http://localhost:8000/v1');
  expect((await stored(page)).sttProvider).toBe('custom');
  await page.getByText('Deepgram', { exact: true }).click();
  expect((await stored(page)).sttProvider).toBe('deepgram');
});

test('voice shortcuts and settings persist across reloads', async ({ page }) => {
  await open(page);
  await nav(page, 'Atajos de voz').click();
  await page.getByPlaceholder('mi correo').fill('mi correo');
  await page.getByPlaceholder('tu@correo.com').fill('ana@example.com');
  await page.getByRole('button', { name: 'Añadir atajo' }).click();
  await expect(page.locator('.row-trigger')).toHaveText('«mi correo»');
  await nav(page, 'Ajustes').click();
  await page.getByRole('checkbox', { name: 'Revisar antes de pegar' }).click();
  await page.getByRole('button', { name: 'Oscuro', exact: true }).click();
  await page.reload();
  const saved = await stored(page);
  expect(saved.snippets).toEqual([{ trigger: 'mi correo', text: 'ana@example.com' }]);
  expect(saved.confirmBeforeInsert).toBe(true);
  await expect(page.locator('.app')).toHaveAttribute('data-theme', 'dark');
});

for (const scheme of ['light', 'dark'] as const) {
  test(`every section passes automated WCAG A/AA checks (${scheme})`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ colorScheme: scheme });
    await open(page);
    for (const name of sections) {
      await nav(page, name).click();
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect.soft(results.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), `${scheme} ${name}`).toEqual([]);
    }
  });
}

test('layout reflows at 390px without horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await open(page);
  for (const name of sections) {
    await nav(page, name).click();
    const overflow = await page.locator('.content').evaluate(el => el.scrollWidth - el.clientWidth);
    expect(overflow, name).toBeLessThanOrEqual(1);
  }
});

test('the pill rests as a line, shows the shortcut on hover and morphs while recording', async ({ page }) => {
  await page.goto('/?view=overlay&state=idle');
  await expect(page.locator('.pill-stage')).toHaveAttribute('data-mode', 'idle');
  await page.goto('/?view=overlay&state=hover');
  await expect(page.locator('.pill-tip')).toContainText('Dictar');
  await expect(page.getByRole('button', { name: 'Empezar a dictar' })).toBeVisible();
  await page.goto('/?view=overlay&state=listening');
  await page.locator('.capsule').hover();
  await expect(page.getByRole('button', { name: 'Terminar y pegar' })).toBeVisible();
  await expect(page.locator('.wave span')).toHaveCount(7);
});
