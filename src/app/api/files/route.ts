import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { readDb, writeDb, FileItem, FileVersion } from '@/lib/jsonDb';
import { uploadFile } from '@/lib/storage';

export async function GET(req: Request) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const folderId = searchParams.get('folderId');
    const parsedFolderId = !folderId || folderId === 'null' ? null : folderId;

    const db = readDb();
    
    // Get files in folder owned by user and not deleted
    const files = db.files.filter(
      (f) => f.ownerId === user.id && f.folderId === parsedFolderId && !f.isDeleted
    );

    return NextResponse.json({ files });
  } catch (error) {
    console.error('Files GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const folderIdStr = formData.get('folderId') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const folderId = !folderIdStr || folderIdStr === 'null' ? null : folderIdStr;
    const name = file.name;
    const size = file.size;
    const type = file.type || 'application/octet-stream';

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const db = readDb();

    // Check if file with same name already exists in this directory for this user
    let fileItem = db.files.find(
      (f) =>
        f.ownerId === user.id &&
        f.folderId === folderId &&
        f.name === name &&
        !f.isDeleted
    );

    let isNewFile = false;
    let fileId: string;
    let nextVersionNumber = 1;

    if (fileItem) {
      // File exists - create a new version
      fileId = fileItem.id;
      // Find highest version number
      const existingVersions = db.fileVersions.filter((v) => v.fileId === fileId);
      nextVersionNumber = Math.max(0, ...existingVersions.map((v) => v.versionNumber)) + 1;
    } else {
      // File does not exist - create a new file record
      isNewFile = true;
      fileId = 'file_' + Math.random().toString(36).substring(2, 11);
    }

    const versionId = 'ver_' + Math.random().toString(36).substring(2, 11);
    // S3/Storage Key: uploads/{userId}/{fileId}/{versionId}_{filename}
    const storageKey = `uploads/${user.id}/${fileId}/${versionId}_${name}`;

    // Upload to AWS S3 or Local fallback
    const storedKey = await uploadFile(storageKey, buffer, type);

    const newVersion: FileVersion = {
      id: versionId,
      fileId,
      s3Key: storedKey,
      size,
      versionNumber: nextVersionNumber,
      uploadedBy: user.id,
      uploadedAt: new Date().toISOString(),
    };

    if (isNewFile) {
      const newFileItem: FileItem = {
        id: fileId,
        name,
        size,
        type,
        folderId,
        ownerId: user.id,
        createdAt: new Date().toISOString(),
        isDeleted: false,
      };
      db.files.push(newFileItem);
      fileItem = newFileItem;
    } else if (fileItem) {
      // Update file's size and modified date
      fileItem.size = size;
      fileItem.createdAt = new Date().toISOString(); // acts as last modified date
    }

    db.fileVersions.push(newVersion);
    writeDb(db);

    return NextResponse.json({ file: fileItem, version: newVersion });
  } catch (error: any) {
    console.error('File upload error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
export const dynamic = 'force-dynamic';
