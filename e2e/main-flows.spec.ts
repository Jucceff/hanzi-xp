import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * Responde la tarjeta actual: en flashcards "Bien", en opción múltiple la opción correcta.
 * Devuelve false si la sesión ya terminó.
 */
async function answerCurrent(page: Page): Promise<boolean> {
  const reveal = page.getByRole('button', { name: 'Mostrar respuesta' });
  const summary = page.getByRole('heading', { name: 'Sesión terminada' });
  // esperar a que haya algo pintado: flashcard, opciones o el resumen
  await reveal.or(page.locator('.option[data-correct]')).or(summary).first().waitFor();
  if (await summary.isVisible()) return false;
  if (await reveal.isVisible()) {
    await reveal.click();
    await page.getByRole('button', { name: /^Bien/ }).click();
    await page.locator('.grade').first().waitFor({ state: 'detached' });
    return true;
  }
  // en desarrollo la opción correcta lleva data-correct (gancho solo para pruebas)
  await page.locator('.option[data-correct]').click();
  await page.getByRole('button', { name: /Continuar/ }).click();
  await expect(page.locator('.option[data-state]')).toHaveCount(0); // la tarjeta respondida ya no está
  return true;
}

test('sesión diaria: responder sube el XP de la palabra y de sus caracteres', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /Empezar sesión/ }).click();

  const hanzi = (await page.locator('.big-han').textContent())!.trim();
  await expect(page.getByText(/Reconocimiento · nueva/)).toBeVisible();
  await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  await page.getByRole('button', { name: /^Bien/ }).click();
  await expect(page.locator('.toast')).toContainText('+6 XP');

  await page.getByRole('button', { name: 'Salir de la sesión' }).click();
  await expect(page.getByRole('heading', { name: /Sigue así|Meta cumplida/ })).toBeVisible();

  // ficha del primer carácter: recibió XP de reconocimiento por la palabra
  await page.goto(`/#/ficha/c/${encodeURIComponent([...hanzi][0])}`);
  const recog = page.locator('.skill-row', { hasText: 'Reconocimiento' });
  await expect(recog).toContainText('/2 XP');
  await expect(page.getByText('Evolución')).toBeVisible();
});

test('la sesión se puede completar y muestra el resumen', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /Empezar sesión/ }).click();
  for (let i = 0; i < 80 && (await answerCurrent(page)); i++);
  await expect(page.getByRole('heading', { name: 'Sesión terminada' })).toBeVisible();
  await expect(page.locator('.stats-row')).toContainText('100%');
});

test('mapa de caracteres de HSK 1 y filtros', async ({ page }) => {
  await page.goto('/#/mapa');
  await expect(page.locator('.tile')).toHaveCount(248);
  await page.getByRole('button', { name: 'HSK 3' }).click();
  await expect(page.locator('.tile')).toHaveCount(284);
  await page.getByRole('button', { name: 'Todos' }).click();
  await expect(page.locator('.tile')).toHaveCount(655);
});

test('exportar e importar el progreso', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /Empezar sesión/ }).click();
  await answerCurrent(page);
  await page.getByRole('button', { name: 'Salir de la sesión' }).click();

  await page.goto('/#/progreso');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar' }).click()]);
  const path = await download.path();
  const backup = JSON.parse(readFileSync(path, 'utf8'));
  expect(backup.app).toBe('hanzi-xp');
  expect(backup.skillStates.length).toBeGreaterThan(0);

  // nuevo navegador "vacío": se borra la base de datos y se importa
  await page.evaluate(() => new Promise((r) => { const q = indexedDB.deleteDatabase('hanzi-xp'); q.onsuccess = q.onblocked = () => r(null); }));
  const fresh = await context.newPage();
  await fresh.goto('/#/progreso');
  fresh.on('dialog', (d) => d.accept());
  await fresh.locator('input[type=file]').setInputFiles(path);
  await expect(fresh.getByRole('status')).toContainText(`Importado: ${backup.skillStates.length} estados`);
});

test('sesión de frases útiles: ordenar y encontrar palabras', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /Frases útiles/ }).click();
  const summary = page.getByRole('heading', { name: 'Sesión terminada' });
  let ordered = 0;
  let identified = 0;
  for (let i = 0; i < 30; i++) {
    await page.locator('.bank .tile-word').or(page.locator('.tok[data-correct]')).or(summary).first().waitFor();
    if (await summary.isVisible()) break;
    if (await page.locator('.bank .tile-word').count()) {
      while (await page.locator('.bank .tile-word').count()) await page.locator('.bank .tile-word').first().click();
      await page.getByRole('button', { name: 'Comprobar' }).click();
      await page.getByRole('button', { name: /Continuar/ }).click();
      ordered++;
    } else {
      await page.locator('.tok[data-correct]').first().click();
      await expect(page.locator('.sentence-reveal')).toBeVisible();
      await page.getByRole('button', { name: /Continuar/ }).click();
      identified++;
    }
    await page.waitForTimeout(150);
  }
  await expect(summary).toBeVisible();
  expect(ordered).toBeGreaterThan(0);
  expect(identified).toBeGreaterThan(0);
});
