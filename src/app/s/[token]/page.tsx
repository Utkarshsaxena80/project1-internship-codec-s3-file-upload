import { redirect } from 'next/navigation';
import Link from 'next/link';
import { readDb, FileItem, Folder } from '@/lib/jsonDb';
import { Download, FileText, Folder as FolderIcon, HardDrive, ShieldAlert } from 'lucide-react';

interface Params {
  token: string;
}

export default async function PublicSharePage({ params }: { params: Promise<Params> }) {
  const { token } = await params;
  const db = readDb();

  // Find share configuration
  const share = db.shares.find((s) => s.publicToken === token && s.isPublic);

  if (!share) {
    return (
      <div className="public-error-container">
        <div className="error-card">
          <ShieldAlert className="error-icon" size={64} />
          <h1>Access Expired or Link Invalid</h1>
          <p>This sharing link is invalid, expired, or has been revoked by the owner.</p>
          <Link href="/" className="back-home-btn">
            Go to Cloud Drive
          </Link>
        </div>
      </div>
    );
  }

  let fileItem: FileItem | undefined;
  let folderItem: Folder | undefined;
  let childFiles: FileItem[] = [];
  let childFolders: Folder[] = [];
  let ownerName = 'A user';

  if (share.targetType === 'file') {
    fileItem = db.files.find((f) => f.id === share.targetId && !f.isDeleted);
    if (!fileItem) {
      return redirect('/');
    }
    const owner = db.users.find((u) => u.id === fileItem!.ownerId);
    if (owner) ownerName = owner.name;
  } else {
    folderItem = db.folders.find((f) => f.id === share.targetId);
    if (!folderItem) {
      return redirect('/');
    }
    const owner = db.users.find((u) => u.id === folderItem!.ownerId);
    if (owner) ownerName = owner.name;

    // List folder contents
    childFiles = db.files.filter((f) => f.folderId === folderItem!.id && !f.isDeleted);
    childFolders = db.folders.filter((f) => f.parentId === folderItem!.id);
  }

  // Format file size helper
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <main className="public-share-page">
      <div className="background-decorations">
        <div className="glow glow-1"></div>
        <div className="glow glow-2"></div>
      </div>

      <header className="public-header">
        <div className="logo-section">
          <HardDrive className="logo-icon" />
          <span className="logo-text">CloudStorage</span>
        </div>
        <div className="user-indicator">
          <span>Shared by <strong>{ownerName}</strong></span>
        </div>
      </header>

      <div className="public-content-container">
        {share.targetType === 'file' && fileItem && (
          <div className="share-card file-share-card">
            <div className="file-icon-wrapper">
              <FileText className="file-preview-icon" size={80} />
            </div>
            <h1 className="share-title">{fileItem.name}</h1>
            <div className="meta-details">
              <span className="meta-badge">{fileItem.type.split('/')[1]?.toUpperCase() || 'FILE'}</span>
              <span className="meta-divider">•</span>
              <span>{formatSize(fileItem.size)}</span>
            </div>
            
            <a 
              href={`/api/files/${fileItem.id}?token=${token}`}
              download={fileItem.name}
              className="download-btn-main"
            >
              <Download size={20} />
              Download File
            </a>
          </div>
        )}

        {share.targetType === 'folder' && folderItem && (
          <div className="share-card folder-share-card">
            <div className="folder-title-section">
              <FolderIcon className="folder-preview-icon" size={40} />
              <div>
                <h1 className="share-title">{folderItem.name}</h1>
                <p className="subtitle-desc">Public shared folder containing {childFiles.length + childFolders.length} items</p>
              </div>
            </div>

            <div className="public-explorer-table-wrapper">
              {childFolders.length === 0 && childFiles.length === 0 ? (
                <div className="empty-state-placeholder">
                  <p>This folder is empty</p>
                </div>
              ) : (
                <table className="explorer-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Size</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {childFolders.map((f) => (
                      <tr key={f.id}>
                        <td className="item-name-cell">
                          <FolderIcon className="icon-folder" size={18} />
                          <span>{f.name}</span>
                        </td>
                        <td>Folder</td>
                        <td>—</td>
                        <td>—</td>
                      </tr>
                    ))}
                    {childFiles.map((f) => (
                      <tr key={f.id}>
                        <td className="item-name-cell">
                          <FileText className="icon-file" size={18} />
                          <span className="file-name-text">{f.name}</span>
                        </td>
                        <td>{f.type.split('/')[1]?.toUpperCase() || 'FILE'}</td>
                        <td>{formatSize(f.size)}</td>
                        <td>
                          <a
                            href={`/api/files/${f.id}?token=${token}`}
                            download={f.name}
                            className="btn-download-small"
                            title="Download"
                          >
                            <Download size={16} />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
