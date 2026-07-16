import fs from 'fs';
import path from 'path';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  createdAt: string;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null; // null means root of user's drive
  ownerId: string;
  createdAt: string;
}

export interface FileItem {
  id: string;
  name: string;
  size: number; // in bytes
  type: string; // mime type
  folderId: string | null;
  ownerId: string;
  createdAt: string;
  isDeleted: boolean;
}

export interface FileVersion {
  id: string;
  fileId: string;
  s3Key: string; // AWS S3 Key or local file path
  size: number;
  versionNumber: number;
  uploadedBy: string; // user ID
  uploadedAt: string;
}

export interface Share {
  id: string;
  targetId: string; // File ID or Folder ID
  targetType: 'file' | 'folder';
  sharedWithEmail: string | null; // null if public link
  permission: 'view' | 'edit';
  isPublic: boolean;
  publicToken: string | null; // Token for public links
  createdAt: string;
}

interface DatabaseSchema {
  users: User[];
  folders: Folder[];
  files: FileItem[];
  fileVersions: FileVersion[];
  shares: Share[];
}

const DB_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DB_DIR, 'db.json');

// Ensure database directory and file exist
function initializeDb() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const initialData: DatabaseSchema = {
      users: [],
      folders: [],
      files: [],
      fileVersions: [],
      shares: [],
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
  }
}

export function readDb(): DatabaseSchema {
  initializeDb();
  try {
    const content = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(content) as DatabaseSchema;
  } catch (error) {
    console.error('Error reading JSON DB, resetting...', error);
    const initialData: DatabaseSchema = {
      users: [],
      folders: [],
      files: [],
      fileVersions: [],
      shares: [],
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
    return initialData;
  }
}

export function writeDb(data: DatabaseSchema) {
  initializeDb();
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}
