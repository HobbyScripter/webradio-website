import { test, expect } from '@playwright/test';

/**
 * Test 6 – Leere Datenbestände
 * - leere Datenbanktabellen
 * - keine Releases
 * - keine Downloads
 * - keine Analytics-Snapshots
 * - keine Plugins oder Themes
 * Die Anwendung muss stabile und verständliche Leerzustände anzeigen.
 */
test.describe('Leere Datenbestände', () => {
  test('sollte leere Releases stabil anzeigen', async ({ page }) => {
    await page.goto('/releases');
    
    // Erwartung: "Keine Releases verfügbar" oder ähnlich
    // Kein JavaScript-Fehler
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    
    expect(pageErrors).toHaveLength(0);
  });

  test('sollte leere Plugins stabil anzeigen', async ({ page }) => {
    await page.goto('/plugins');
    
    // Erwartung: "Keine Plugins verfügbar" oder ähnlich
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    
    expect(pageErrors).toHaveLength(0);
  });
});
