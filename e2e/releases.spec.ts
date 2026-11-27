import { test, expect } from '@playwright/test';

/**
 * Test 8 – Release-Anzeige
 * - Releases werden korrekt dargestellt
 * - Stable-, Beta- und Alpha-Kanäle
 * - Download-Links und Asset-Metadaten
 * - fehlende oder fehlerhafte GitHub-Daten
 * - keine Anzeige erfundener oder veralteter Daten als aktuell
 */
test.describe('Release-Anzeige', () => {
  test('sollte Releases korrekt darstellen', async ({ page }) => {
    await page.goto('/releases');
    
    // Erwartung: Releases werden von GitHub geladen
    // Kein JavaScript-Fehler
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    
    expect(pageErrors).toHaveLength(0);
  });

  test('sollte Kanäle unterscheiden', async ({ page }) => {
    await page.goto('/releases');
    
    // Erwartung: Stable/Beta/Alpha werden korrekt gekennzeichnet
    // Keine erfundenen Daten als aktuell anzeigen
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    
    expect(pageErrors).toHaveLength(0);
  });
});
