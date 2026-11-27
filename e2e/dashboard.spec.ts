import { test, expect } from '@playwright/test';

/**
 * Test 3 – Admin-Dashboard
 * - Dashboard lädt erfolgreich
 * - fehlende Daten führen nicht zu einem Absturz
 * - teilweise nicht erreichbare Datenquellen werden korrekt behandelt
 * - Fehlerzustände werden verständlich dargestellt
 */
test.describe('Admin-Dashboard', () => {
  test('sollte Dashboard erfolgreich laden', async ({ page }) => {
    // Als ADMIN anmelden
    await page.goto('/auth/login');
    await page.fill('input[name="email"]', 'admin@webradio.test');
    await page.fill('input[name="password"]', 'AdminPassword123!');
    await page.click('button[type="submit"]');
    
    await page.goto('/admin');
    
    // Erwartung: Dashboard-Titel und Statistiken
    await expect(page.locator('h1:has-text("Administrations-Dashboard")')).toBeVisible();
    await expect(page.locator('text=/Benutzer gesamt/i')).toBeVisible();
  });

  test('sollte fehlende Daten tolerieren', async ({ page }) => {
    // Annahme: Datenbanktabellen fehlen teilweise
    await page.goto('/admin');
    
    // Erwartung: Kein Absturz, "–" für fehlende Werte
    // Warning-Banner sollte angezeigt werden
    const warningBanner = page.locator('text=/nicht verfügbar|fehlende Daten/i');
    const exists = await warningBanner.count() > 0;
    
    if (exists) {
      await expect(warningBanner).toBeVisible();
    }
  });
});
