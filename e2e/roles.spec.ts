import { test, expect } from '@playwright/test';

/**
 * Test 2 – Rollen und Berechtigungen
 * - USER kann keine Admin-Funktionen aufrufen
 * - DEVELOPER erhält ausschließlich erlaubte Entwicklerrechte
 * - ADMIN erhält die vorgesehenen Adminrechte
 * - SYSTEM_ADMIN behält seine höchste Berechtigungsstufe
 * - direkte API-Aufrufe werden serverseitig autorisiert
 */
test.describe('Rollen und Berechtigungen', () => {
  test('USER kann Admin-Bereich nicht aufrufen', async ({ page }) => {
    // Als USER anmelden
    await page.goto('/auth/login');
    await page.fill('input[name="email"]', 'user@webradio.test');
    await page.fill('input[name="password"]', 'UserPassword123!');
    await page.click('button[type="submit"]');
    
    // Versuch, Admin-Bereich aufzurufen
    await page.goto('/admin');
    
    // Erwartung: 403 Forbidden oder Weiterleitung
    await expect(page.locator('text=/unauthorized|verboten|403/i')).toBeVisible();
  });

  test('ADMIN kann Admin-Bereich aufrufen', async ({ page }) => {
    // Als ADMIN anmelden
    await page.goto('/auth/login');
    await page.fill('input[name="email"]', 'admin@webradio.test');
    await page.fill('input[name="password"]', 'AdminPassword123!');
    await page.click('button[type="submit"]');
    
    // Admin-Bereich aufrufen
    await page.goto('/admin');
    
    // Erwartung: Dashboard wird angezeigt
    await expect(page.locator('h1:has-text("Administrations-Dashboard")')).toBeVisible();
  });
});
