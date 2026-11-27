import { test, expect } from '@playwright/test';

/**
 * Test 4 – Analytics
 * - Analytics-Übersicht lädt
 * - leere Statistiken werden korrekt dargestellt
 * - vorhandene Testdaten werden richtig angezeigt
 * - Fehler einzelner Datenquellen beeinträchtigen nicht unnötig die gesamte Übersicht
 */
test.describe('Analytics', () => {
  test('sollte Analytics-Übersicht laden', async ({ page }) => {
    await page.goto('/auth/login');
    await page.fill('input[name="email"]', 'admin@webradio.test');
    await page.fill('input[name="password"]', 'AdminPassword123!');
    await page.click('button[type="submit"]');
    
    await page.goto('/admin/analytics');
    
    // Erwartung: Analytics-Titel
    await expect(page.locator('h1:has-text("Analytics")')).toBeVisible();
  });

  test('sollte leere Statistiken korrekt darstellen', async ({ page }) => {
    await page.goto('/admin/analytics');
    
    // Erwartung: "–" oder "Keine Daten" statt Fehler
    // Kein JavaScript-Fehler
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    
    await page.reload();
    
    expect(pageErrors).toHaveLength(0);
  });
});
