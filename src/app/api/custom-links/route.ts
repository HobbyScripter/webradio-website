import { connection, NextRequest, NextResponse } from 'next/server';
import { getPublicCustomLinks } from '@/lib/custom-links/service';
import { DEFAULT_LOCALE, parseLocale } from '@/i18n/config';

export async function GET(request: NextRequest) {
  // The response depends on the requested position and language.
  await connection();
  const { searchParams } = new URL(request.url);
  const position = searchParams.get('position');
  const locale = parseLocale(searchParams.get('locale')) ?? DEFAULT_LOCALE;

  if (position !== 'MAIN_NAVIGATION' && position !== 'FOOTER') {
    return NextResponse.json({ error: 'unknown_position' }, { status: 400 });
  }

  try {
    const links = await getPublicCustomLinks(position, locale);
    return NextResponse.json(
      { links: links.map(({ id, url, type, openInNewTab, iconName, label }) => ({ id, url, type, openInNewTab, iconName, label })) },
      { headers: { 'Cache-Control': 'public, max-age=60' } },
    );
  } catch (error) {
    console.error('[api:custom-links] unexpected failure', {
      name: error instanceof Error ? error.name : 'Error',
    });
    return NextResponse.json({ links: [] });
  }
}
