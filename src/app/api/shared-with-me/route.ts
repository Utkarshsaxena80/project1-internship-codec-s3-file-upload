import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { readDb, FileItem, Folder } from '@/lib/jsonDb';

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = readDb();
    const userEmail = user.email.toLowerCase();

    // Get all shares targeting this user
    const userShares = db.shares.filter(
      (s) => s.sharedWithEmail?.toLowerCase() === userEmail
    );

    const files: FileItem[] = [];
    const folders: Folder[] = [];

    for (const share of userShares) {
      if (share.targetType === 'file') {
        const file = db.files.find((f) => f.id === share.targetId && !f.isDeleted);
        if (file) {
          files.push(file);
        }
      } else {
        const folder = db.folders.find((f) => f.id === share.targetId);
        if (folder) {
          folders.push(folder);
        }
      }
    }

    return NextResponse.json({ files, folders });
  } catch (error) {
    console.error('Shared-with-me GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
export const dynamic = 'force-dynamic';
