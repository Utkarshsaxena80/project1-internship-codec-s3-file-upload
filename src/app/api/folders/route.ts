import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { readDb, writeDb, Folder } from '@/lib/jsonDb';

export async function GET(req: Request) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const parentId = searchParams.get('parentId');
    
    // Parse parentId: "null" string or empty value should be treated as null
    const parsedParentId = !parentId || parentId === 'null' ? null : parentId;

    const db = readDb();
    
    // Filter folders owned by user and under the specified parent folder
    const folders = db.folders.filter(
      (f) => f.ownerId === user.id && f.parentId === parsedParentId
    );

    return NextResponse.json({ folders });
  } catch (error) {
    console.error('Folders GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, parentId } = await req.json();
    if (!name || name.trim() === '') {
      return NextResponse.json({ error: 'Folder name is required' }, { status: 400 });
    }

    const parsedParentId = !parentId || parentId === 'null' ? null : parentId;

    const db = readDb();

    // Prevent duplicate folder names in the same parent directory
    const duplicate = db.folders.find(
      (f) =>
        f.ownerId === user.id &&
        f.parentId === parsedParentId &&
        f.name.toLowerCase() === name.toLowerCase()
    );

    if (duplicate) {
      return NextResponse.json({ error: 'A folder with this name already exists' }, { status: 400 });
    }

    const newFolder: Folder = {
      id: 'folder_' + Math.random().toString(36).substring(2, 11),
      name: name.trim(),
      parentId: parsedParentId,
      ownerId: user.id,
      createdAt: new Date().toISOString(),
    };

    db.folders.push(newFolder);
    writeDb(db);

    return NextResponse.json({ folder: newFolder });
  } catch (error) {
    console.error('Folders POST error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
export const dynamic = 'force-dynamic';
