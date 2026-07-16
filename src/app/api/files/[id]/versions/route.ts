import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { readDb } from '@/lib/jsonDb';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const fileId = (await params).id;
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = readDb();

    // Verify ownership of the file
    const file = db.files.find((f) => f.id === fileId && f.ownerId === user.id && !f.isDeleted);
    if (!file) {
      return NextResponse.json({ error: 'File not found or access denied' }, { status: 404 });
    }

    // Get all versions
    const versions = db.fileVersions.filter((v) => v.fileId === fileId);
    return NextResponse.json({ versions });
  } catch (error) {
    console.error('File versions GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
export const dynamic = 'force-dynamic';
