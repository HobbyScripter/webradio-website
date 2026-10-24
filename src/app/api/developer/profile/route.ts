import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerAuthSession } from '@/lib/server-auth';
import { requireDeveloperSession } from '@/lib/server-auth';
import { db } from '@/lib/db';
import { developerProfileSchema } from '@/lib/validations';
import { AuthError, NotFoundError, logServerError } from '@/lib/auth-service';

// GET developer profile
export async function GET() {
  try {
    const user = await requireDeveloperSession();

    // Get developer profile
    const profile = await db.orm.public.DeveloperProfile.where({
      userId: user.id,
    }).first();

    if (!profile) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Developer profile not found' },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        profile: {
          id: profile.id,
          userId: profile.userId,
          displayName: profile.displayName,
          bio: profile.bio,
          githubUrl: profile.githubUrl,
          websiteUrl: profile.websiteUrl,
          createdAt: profile.createdAt.toString(),
          updatedAt: profile.updatedAt.toString(),
        },
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.statusCode },
      );
    }
    logServerError('api:developer:profile:GET', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      { status: 500 },
    );
  }
}

// POST create developer profile
export async function POST(request: Request) {
  try {
    const user = await requireDeveloperSession();

    // Check if user already has a profile
    const existingProfile = await db.orm.public.DeveloperProfile.where({
      userId: user.id,
    }).first();

    if (existingProfile) {
      return NextResponse.json(
        { error: 'PROFILE_EXISTS', message: 'Developer profile already exists' },
        { status: 409 },
      );
    }

    const body = await request.json();
    const parsed = developerProfileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: parsed.error.message },
        { status: 400 },
      );
    }

    const profile = await db.orm.public.DeveloperProfile.create({
      userId: user.id,
      displayName: parsed.data.displayName,
      bio: parsed.data.bio ?? null,
      githubUrl: parsed.data.githubUrl ?? null,
      websiteUrl: parsed.data.websiteUrl ?? null,
    });

    // Create audit log
    try {
      await db.orm.public.AuditLog.create({
        userId: user.id,
        action: 'DEVELOPER_PROFILE_CREATED',
        details: JSON.stringify({ profileId: profile.id, displayName: profile.displayName }),
        ipAddress: null,
        userAgent: null,
      });
    } catch {
      // Non-critical
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Developer profile created successfully',
        profile: {
          id: profile.id,
          userId: profile.userId,
          displayName: profile.displayName,
          bio: profile.bio,
          githubUrl: profile.githubUrl,
          websiteUrl: profile.websiteUrl,
          createdAt: profile.createdAt.toString(),
          updatedAt: profile.updatedAt.toString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.statusCode },
      );
    }
    logServerError('api:developer:profile:POST', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      { status: 500 },
    );
  }
}

// PUT update developer profile
export async function PUT(request: Request) {
  try {
    const user = await requireDeveloperSession();

    // Get developer profile
    const profile = await db.orm.public.DeveloperProfile.where({
      userId: user.id,
    }).first();

    if (!profile) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Developer profile not found' },
        { status: 404 },
      );
    }

    const body = await request.json();
    const parsed = developerProfileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: parsed.error.message },
        { status: 400 },
      );
    }

    // Update profile
    await db.orm.public.DeveloperProfile.where({ id: profile.id }).update({
      displayName: parsed.data.displayName,
      bio: parsed.data.bio ?? null,
      githubUrl: parsed.data.githubUrl ?? null,
      websiteUrl: parsed.data.websiteUrl ?? null,
    });

    // Create audit log
    try {
      const changes: Record<string, unknown> = {};
      if (parsed.data.displayName !== profile.displayName) {
        changes.displayName = { from: profile.displayName, to: parsed.data.displayName };
      }
      if (parsed.data.bio !== profile.bio) {
        changes.bio = { from: profile.bio, to: parsed.data.bio };
      }
      if (parsed.data.githubUrl !== profile.githubUrl) {
        changes.githubUrl = { from: profile.githubUrl, to: parsed.data.githubUrl };
      }
      if (parsed.data.websiteUrl !== profile.websiteUrl) {
        changes.websiteUrl = { from: profile.websiteUrl, to: parsed.data.websiteUrl };
      }

      if (Object.keys(changes).length > 0) {
        await db.orm.public.AuditLog.create({
          userId: user.id,
          action: 'DEVELOPER_PROFILE_UPDATED',
          details: JSON.stringify({ profileId: profile.id, changes }),
          ipAddress: null,
          userAgent: null,
        });
      }
    } catch {
      // Non-critical
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Developer profile updated successfully',
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.statusCode },
      );
    }
    logServerError('api:developer:profile:PUT', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      { status: 500 },
    );
  }
}

// DELETE developer profile
export async function DELETE() {
  try {
    const user = await requireDeveloperSession();

    // Get developer profile
    const profile = await db.orm.public.DeveloperProfile.where({
      userId: user.id,
    }).first();

    if (!profile) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Developer profile not found' },
        { status: 404 },
      );
    }

    // Delete profile
    await db.orm.public.DeveloperProfile.where({ id: profile.id }).delete();

    // Create audit log
    try {
      await db.orm.public.AuditLog.create({
        userId: user.id,
        action: 'DEVELOPER_PROFILE_DELETED',
        details: JSON.stringify({ profileId: profile.id, displayName: profile.displayName }),
        ipAddress: null,
        userAgent: null,
      });
    } catch {
      // Non-critical
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Developer profile deleted successfully',
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.statusCode },
      );
    }
    logServerError('api:developer:profile:DELETE', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      { status: 500 },
    );
  }
}
