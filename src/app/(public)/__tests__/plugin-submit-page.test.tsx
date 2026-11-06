import { renderToStaticMarkup } from 'react-dom/server';
import PluginSubmitPage, { metadata } from '../plugin-einreichen/page';

describe('plugin submission page', () => {
  it('explains the process and the requirements', () => {
    const html = renderToStaticMarkup(<PluginSubmitPage />);

    expect(html).toContain('Plugin einreichen');
    expect(html).toContain('In fünf Schritten in den Katalog');
    expect(html).toContain('manifest.json');
    expect(html).toContain('Kompatibilität');
    expect(html).toContain('Nutzungsbedingungen');
  });

  it('marks the developer area as requiring a login', () => {
    const html = renderToStaticMarkup(<PluginSubmitPage />);

    expect(html).toContain('Entwicklerbereich (Anmeldung erforderlich)');
    expect(html).toContain('href="/developer"');
  });

  it('sets its own social metadata with a large card', () => {
    expect(metadata.title).toBe('Plugin einreichen');
    expect(metadata.twitter).toMatchObject({ card: 'summary_large_image' });
    expect(metadata.openGraph).toMatchObject({ title: 'Plugin einreichen · WebRadio' });
  });
});
