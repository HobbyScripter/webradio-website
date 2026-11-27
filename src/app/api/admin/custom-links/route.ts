import { NextRequest, NextResponse } from 'next/server';
import { CustomLinkError, CustomLinkService } from '@/lib/custom-links/service';
import { requireAdmin } from '@/lib/auth-middleware';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '';
}

function failure(error: unknown, fallback: string, status: number) {
  if (errorMessage(error) === 'Unauthorized') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (error instanceof CustomLinkError) {
    const code = error.code;
    const codeStatus = code === 'NOT_FOUND' ? 404 : code === 'LIMIT_REACHED' ? 409 : 400;
    return NextResponse.json({ error: code }, { status: codeStatus });
  }

  console.error('[api:admin:custom-links] unexpected failure', { name: errorMessage(error) });
  return NextResponse.json({ error: fallback }, { status });
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const { searchParams } = new URL(request.url);
    const position = searchParams.get('position') as 'MAIN_NAVIGATION' | 'FOOTER' | null;
    const activeParam = searchParams.get('isActive');
    const isActive = activeParam === 'true' ? true : activeParam === 'false' ? false : undefined;

    const links = await CustomLinkService.getCustomLinks(position || undefined, isActive);
    return NextResponse.json({ links }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return failure(error, 'admin.customLinks.errors.load', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdmin(request, true);
    const body = await request.json();
    const userId = session === true ? undefined : session.user.id;
    const link = await CustomLinkService.createCustomLink(body, userId);
    return NextResponse.json({ success: true, link }, { status: 201 });
  } catch (error) {
    return failure(error, 'admin.customLinks.errors.save', 400);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireAdmin(request, true);
    const body = await request.json();
    if (typeof body?.id !== 'string' || body.id.length === 0) {
      return NextResponse.json({ error: 'INVALID_DATA' }, { status: 400 });
    }
    const userId = session === true ? undefined : session.user.id;
    const link = await CustomLinkService.updateCustomLink(body.id, body, userId);
    return NextResponse.json({ success: true, link });
  } catch (error) {
    return failure(error, 'admin.customLinks.errors.save', 400);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireAdmin(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'INVALID_DATA' }, { status: 400 });

    await CustomLinkService.deleteCustomLink(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return failure(error, 'admin.customLinks.errors.delete', 500);
  }
}
