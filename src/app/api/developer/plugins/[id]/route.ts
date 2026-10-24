import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDeveloperSession } from '@/lib/server-auth';
import { db } from '@/lib/db';
import { pluginCreateSchema } from '@/lib/validations';
import { AuthError, NotFoundError, ForbiddenError, logServerError } from '@/lib/auth-service';

// GET plugin by ID
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireDeveloperSession();
    const { id } = await params;

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

    // Get plugin
    const plugin = await db.orm.public.Plugin.where({
      id,
      developerId: profile.id,
    }).first();

    if (!plugin) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Plugin not found or access denied' },
        { status: 404 },
      );
    }

    // Get versions
    const versions = await db.orm.public.PluginVersion.where({
      pluginId: plugin.id,
    }).orderBy((v) => v.releasedAt.desc()).all();

    // Get screenshots
    const screenshots = await db.orm.public.PluginScreenshot.where({
      pluginId: plugin.id,
    }).orderBy((s) => s.order.asc()).all();

    // Get tags
    const tags = await db.orm.public.PluginTag.where({
      pluginId: plugin.id,
    }).all();

    // Get reviews
    const reviews = await db.orm.public.PublicationReview.where({
      targetType: 'PLUGIN',
      targetId: plugin.id,
    }).orderBy((r) => r.createdAt.desc()).all();

    return NextResponse.json(
      {
        plugin: {
          ...plugin,
          createdAt: plugin.createdAt.toString(),
          updatedAt: plugin.updatedAt.toString(),
        },
        versions: versions.map((v) => ({
          ...v,
          releasedAt: v.releasedAt.toString(),
        })),
        screenshots,
        tags,
        reviews: reviews.map((r) => ({
          ...r,
          createdAt: r.createdAt.toString(),
        })),
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
    logServerError('api:developer:plugins:[id]:GET', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      { status: 500 },
    );
  }
}

// PUT update plugin
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireDeveloperSession();
    const { id } = await params;

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

    // Get plugin
    const plugin = await db.orm.public.Plugin.where({
      id,
      developerId: profile.id,
    }).first();

    if (!plugin) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Plugin not found or access denied' },
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

    // Check if slug is being changed
    if (parsed.data.slug !== plugin.slug) {
      // Check if new slug is already taken
      const existingPlugin = await db.orm.public.Plugin.first({ slug: parsed.data.slug });
      if (existingPlugin && existingPlugin.id !== plugin.id) {
        return NextResponse.json(
          { error: 'SLUG_EXISTS', message: 'Plugin slug is already taken' },
          { status: 409 },
        );
      }
    }

    // Update plugin
    await db.orm.public.Plugin.where({ id: plugin.id }).update({
      slug: parsed.data.slug,
      name: parsed.data.name,
      description: parsed.data.description,
      product: parsed.data.product,
    });

    // Create audit log
    try {
      const changes: Record<string, unknown> = {};
      if (parsed.data.slug !== plugin.slug) {
        changes.slug = { from: plugin.slug, to: parsed.data.slug };
      }
      if (parsed.data.name !== plugin.name) {
        changes.name = { from: plugin.name, to: parsed.data.name };
      }
      if (parsed.data.description !== plugin.description) {
        changes.description = { from: plugin.description, to: parsed.data.description };
      }

      if (Object.keys(changes).length > 0) {
        await db.orm.public.AuditLog.create({
          userId: user.id,
          action: 'PLUGIN_UPDATED',
          details: JSON.stringify({ pluginId: plugin.id, changes }),
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
        message: 'Plugin updated successfully',
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
    logServerError('api:developer:plugins:[id]:PUT', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      { status: 500 },
    );
  }
}

// DELETE plugin
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireDeveloperSession();
    const { id } = await params;

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

    // Get plugin
    const plugin = await db.orm.public.Plugin.where({
      id,
      developerId: profile.id,
    }).first();

    if (!plugin) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Plugin not found or access denied' },
        { status: 404 },
      );
    }

    // Delete plugin and all related data
    await db.orm.public.Plugin.where({ id: plugin.id }).delete();

    // Create audit log
    try {
      await db.orm.public.AuditLog.create({
        userId: user.id,
        action: 'PLUGIN_DELETED',
        details: JSON.stringify({ pluginId: plugin.id, slug: plugin.slug, name: plugin.name }),
        ipAddress: null,
        userAgent: null,
      });
    } catch {
      // Non-critical
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Plugin deleted successfully',
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
    logServerError('api:developer:plugins:[id]:DELETE', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      { status: 500 },
    );
  }
}
