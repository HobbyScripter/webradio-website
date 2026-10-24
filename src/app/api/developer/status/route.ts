import { NextResponse } from 'next/server';
import { requireDeveloperSession } from '@/lib/server-auth';
import { errorResponse } from '@/lib/api-response';

export async function GET() {
  try {
    const user = await requireDeveloperSession();

    return NextResponse.json({
      status: 'authenticated',
      developer: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    return errorResponse('api:developer:status', error);
  }
}
