import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { readDb, writeDb, FileVersion } from '@/lib/jsonDb';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const fileId = (await params).id;
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { versionId } = await req.json();
    if (!versionId) {
      return NextResponse.json({ error: 'versionId is required' }, { status: 400 });
    }

    const db = readDb();

    // Verify ownership
    const file = db.files.find((f) => f.id === fileId && f.ownerId === user.id && !f.isDeleted);
    if (!file) {
      return NextResponse.json({ error: 'File not found or access denied' }, { status: 404 });
    }

    // Find the version to restore
    const versions = db.fileVersions.filter((v) => v.fileId === fileId);
    const versionToRestore = versions.find((v) => v.id === versionId);

    if (!versionToRestore) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }

    // Calculate next version number
    const maxVersionNumber = Math.max(0, ...versions.map((v) => v.versionNumber));
    const nextVersionNumber = maxVersionNumber + 1;

    // Create a new version entry pointing to the same storage key
    const newVersion: FileVersion = {
      id: 'ver_' + Math.random().toString(36).substring(2, 11),
      fileId,
      s3Key: versionToRestore.s3Key,
      size: versionToRestore.size,
      versionNumber: nextVersionNumber,
      uploadedBy: user.id,
      uploadedAt: new Date().toISOString(),
    };

    // Update main file record
    file.size = versionToRestore.size;
    file.createdAt = new Date().toISOString(); // Last modified timestamp

    db.fileVersions.push(newVersion);
    writeDb(db);

    return NextResponse.json({ success: true, version: newVersion });
  } catch (error) {
    console.error('Restore version error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
export const dynamic = 'force-dynamic';
