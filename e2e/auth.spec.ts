import { test, expect } from '@playwright/test';

/**
 * Test 1 – Anmeldung
 * - Login mit gültigen Zugangsdaten
 * - Login mit ungültigen Zugangsdaten
 * - korrekte Session-Verwaltung
 * - Logout und Session-Invalidierung
 */
test.describe('Anmeldung', () => {
  test('sollte sich mit gültigen Daten anmelden können', async ({ page }) => {
    await page.goto('/auth/login');
    
    // Eingabe gültiger Daten (Mock oder Test-User)
    await page.fill('input[name="email"]', 'test@webradio.test');
    await page.fill('input[name="password"]', 'TestPassword123!');
    await page.click('button[type="submit"]');
    
    // Erwartung: Weiterleitung zur Dashboard- oder Home-Seite
    await expect(page).toHaveURL(/\/(admin|developer)?$/);
  });

  test('sollte ungültige Anmeldedaten ablehnen', async ({ page }) => {
    await page.goto('/auth/login');
    
    await page.fill('input[name="email"]', 'invalid@test.com');
    await page.fill('input[name="password"]', 'WrongPassword');
    await page.click('button[type="submit"]');
    
    // Erwartung: Fehlermeldung oder auf Login-Seite bleiben
    await expect(page.locator('text=/ungültig|invalid|falsch/i')).toBeVisible();
  });

  test('sollte sich abmelden können', async ({ page }) => {
    // Zuerst anmelden (Voraussetzung)
    await page.goto('/auth/login');
    await page.fill('input[name="email"]', 'test@webradio.test');
    await page.fill('input[name="password"]', 'TestPassword123!');
    await page.click('button[type="submit"]');
    
    // Logout
    await page.click('a[href*="logout"], button:has-text("Abmelden")');
    
    // Erwartung: Weiterleitung zur Login-Seite oder Home
    await expect(page).toHaveURL(/\/(auth\/login)?$/);
  });
});
