import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerAuthSession } from '@/lib/server-auth';
import { requireDeveloperSession } from '@/lib/server-auth';
import { db } from '@/lib/db';
import { pluginCreateSchema, pluginVersionSchema } from '@/lib/validations';
import { hasRole, AuthError, logServerError, NotFoundError, ForbiddenError } from '@/lib/auth-service';

// GET all plugins for the current developer
export async function GET() {
  try {
    const user = await requireDeveloperSession();

    // Get developer profile
    const developerProfile = await db.orm.public.DeveloperProfile.where({
      userId: user.id,
    }).first();

    if (!developerProfile) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Developer profile not found' },
        { status: 404 },
      );
    }

    // Get all plugins by this developer
    const plugins = await db.orm.public.Plugin.where({
      developerId: developerProfile.id,
    }).all();

    // Get versions for each plugin
    const pluginsWithVersions = await Promise.all(
      plugins.map(async (plugin) => {
        const versions = await db.orm.public.PluginVersion.where({
          pluginId: plugin.id,
        }).orderBy((v) => v.releasedAt.desc()).all();
        
        const reviews = await db.orm.public.PublicationReview.where({
          targetType: 'PLUGIN',
          targetId: plugin.id,
        }).orderBy((r) => r.createdAt.desc()).all();

        return {
          ...plugin,
          versions,
          reviews,
          createdAt: plugin.createdAt.toString(),
          updatedAt: plugin.updatedAt.toString(),
        };
      })
    );

    return NextResponse.json({ plugins: pluginsWithVersions }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.statusCode },
      );
    }
    logServerError('api:developer:plugins:GET', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      { status: 500 },
    );
  }
}

// POST create a new plugin
export async function POST(request: Request) {
  try {
    const user = await requireDeveloperSession();

    // Get developer profile
    const developerProfile = await db.orm.public.DeveloperProfile.where({
      userId: user.id,
    }).first();

    if (!developerProfile) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Developer profile not found. Please create a developer profile first.' },
        { status: 404 },
      );
    }

    const body = await request.json();
    const parsed = pluginCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: parsed.error.message },
        { status: 400 },
      );
    }

    // Check if slug is already taken
    const existingPlugin = await db.orm.public.Plugin.first({ slug: parsed.data.slug });
    if (existingPlugin) {
      return NextResponse.json(
        { error: 'SLUG_EXISTS', message: 'Plugin slug is already taken' },
        { status: 409 },
      );
    }

    // Create the plugin
    const plugin = await db.orm.public.Plugin.create({
      slug: parsed.data.slug,
      name: parsed.data.name,
      description: parsed.data.description,
      product: parsed.data.product,
      developerId: developerProfile.id,
      status: 'PENDING_REVIEW',
      isPublished: false,
      downloads: 0,
    });

    // Create audit log
    try {
      await db.orm.public.AuditLog.create({
        userId: user.id,
        action: 'PLUGIN_CREATED',
        details: JSON.stringify({ pluginId: plugin.id, slug: plugin.slug }),
        ipAddress: null,
        userAgent: null,
      });
    } catch {
      // Non-critical
    }

    return NextResponse.json(
      { 
        success: true, 
        message: 'Plugin created successfully',
        plugin: {
          ...plugin,
          createdAt: plugin.createdAt.toString(),
          updatedAt: plugin.updatedAt.toString(),
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
    logServerError('api:developer:plugins:POST', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      { status: 500 },
    );
  }
}
