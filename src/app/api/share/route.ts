import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { readDb, writeDb, Share } from '@/lib/jsonDb';

export async function GET(req: Request) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const targetId = searchParams.get('targetId');
    const targetType = searchParams.get('targetType') as 'file' | 'folder' | null;

    if (!targetId || !targetType) {
      return NextResponse.json({ error: 'targetId and targetType are required' }, { status: 400 });
    }

    const db = readDb();

    // Verify ownership of the target
    let isOwner = false;
    if (targetType === 'file') {
      const file = db.files.find((f) => f.id === targetId);
      isOwner = file?.ownerId === user.id;
    } else {
      const folder = db.folders.find((f) => f.id === targetId);
      isOwner = folder?.ownerId === user.id;
    }

    if (!isOwner) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Get all shares for this target
    const shares = db.shares.filter((s) => s.targetId === targetId && s.targetType === targetType);
    return NextResponse.json({ shares });
  } catch (error) {
    console.error('Share GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { targetId, targetType, sharedWithEmail, permission, isPublic } = body;

    if (!targetId || !targetType) {
      return NextResponse.json({ error: 'targetId and targetType are required' }, { status: 400 });
    }

    const db = readDb();

    // Verify ownership
    let isOwner = false;
    if (targetType === 'file') {
      const file = db.files.find((f) => f.id === targetId);
      isOwner = file?.ownerId === user.id;
    } else {
      const folder = db.folders.find((f) => f.id === targetId);
      isOwner = folder?.ownerId === user.id;
    }

    if (!isOwner) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Handle Public Link Sharing Toggle
    if (isPublic !== undefined) {
      // Find existing public share
      const existingPublicShareIdx = db.shares.findIndex(
        (s) => s.targetId === targetId && s.targetType === targetType && s.isPublic
      );

      if (isPublic) {
        if (existingPublicShareIdx === -1) {
          // Create a new public share
          const publicShare: Share = {
            id: 'share_' + Math.random().toString(36).substring(2, 11),
            targetId,
            targetType,
            sharedWithEmail: null,
            permission: permission || 'view',
            isPublic: true,
            publicToken: 'pt_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
            createdAt: new Date().toISOString(),
          };
          db.shares.push(publicShare);
        } else {
          // Update permission of existing public share
          db.shares[existingPublicShareIdx].permission = permission || 'view';
        }
      } else {
        if (existingPublicShareIdx !== -1) {
          // Remove public share
          db.shares.splice(existingPublicShareIdx, 1);
        }
      }
    }

    // Handle Specific User Sharing
    if (sharedWithEmail) {
      const targetEmail = sharedWithEmail.trim().toLowerCase();

      // Check if sharing with self
      if (targetEmail === user.email.toLowerCase()) {
        return NextResponse.json({ error: 'You cannot share files with yourself' }, { status: 400 });
      }

      // Check if user to share with exists
      const targetUserExists = db.users.some((u) => u.email.toLowerCase() === targetEmail);
      if (!targetUserExists) {
        return NextResponse.json({ error: `User with email ${sharedWithEmail} does not exist` }, { status: 404 });
      }

      // Check if already shared with this user
      const existingShareIdx = db.shares.findIndex(
        (s) =>
          s.targetId === targetId &&
          s.targetType === targetType &&
          s.sharedWithEmail?.toLowerCase() === targetEmail
      );

      if (existingShareIdx === -1) {
        const newShare: Share = {
          id: 'share_' + Math.random().toString(36).substring(2, 11),
          targetId,
          targetType,
          sharedWithEmail: targetEmail,
          permission: permission || 'view',
          isPublic: false,
          publicToken: null,
          createdAt: new Date().toISOString(),
        };
        db.shares.push(newShare);
      } else {
        // Update existing permission
        db.shares[existingShareIdx].permission = permission || 'view';
      }
    }

    writeDb(db);

    const updatedShares = db.shares.filter((s) => s.targetId === targetId && s.targetType === targetType);
    return NextResponse.json({ shares: updatedShares });
  } catch (error) {
    console.error('Share POST error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const shareId = searchParams.get('shareId');

    if (!shareId) {
      return NextResponse.json({ error: 'shareId is required' }, { status: 400 });
    }

    const db = readDb();
    const shareIdx = db.shares.findIndex((s) => s.id === shareId);
    if (shareIdx === -1) {
      return NextResponse.json({ error: 'Share configuration not found' }, { status: 404 });
    }

    const share = db.shares[shareIdx];

    // Verify current user owns the resource being shared
    let isOwner = false;
    if (share.targetType === 'file') {
      const file = db.files.find((f) => f.id === share.targetId);
      isOwner = file?.ownerId === user.id;
    } else {
      const folder = db.folders.find((f) => f.id === share.targetId);
      isOwner = folder?.ownerId === user.id;
    }

    if (!isOwner) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Delete the share
    db.shares.splice(shareIdx, 1);
    writeDb(db);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Share DELETE error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
export const dynamic = 'force-dynamic';
