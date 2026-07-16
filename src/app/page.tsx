"use client";

import React, { useState, useEffect, useRef } from 'react';
import { 
  Download, Trash2, Folder as FolderIcon, File as FileIcon, 
  Share2, UploadCloud, Plus, LogOut, HardDrive, Search, 
  ChevronRight, X, Copy, Check, Info, FileText, ArrowLeft, 
  Users, History, RefreshCw, Key, ShieldAlert
} from 'lucide-react';

interface User {
  id: string;
  email: string;
  name: string;
}

interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  ownerId: string;
  createdAt: string;
}

interface FileItem {
  id: string;
  name: string;
  size: number;
  type: string;
  folderId: string | null;
  ownerId: string;
  createdAt: string;
}

interface FileVersion {
  id: string;
  fileId: string;
  s3Key: string;
  size: number;
  versionNumber: number;
  uploadedBy: string;
  uploadedAt: string;
}

interface Share {
  id: string;
  targetId: string;
  targetType: 'file' | 'folder';
  sharedWithEmail: string | null;
  permission: 'view' | 'edit';
  isPublic: boolean;
  publicToken: string | null;
}

export default function Home() {
  // Authentication State
  const [user, setUser] = useState<User | null>(null);
  const [s3Active, setS3Active] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  // App Core State
  const [activeTab, setActiveTab] = useState<'drive' | 'shared' | 'recent'>('drive');
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<{ type: 'file' | 'folder'; data: any } | null>(null);
  const [selectedVersions, setSelectedVersions] = useState<FileVersion[]>([]);
  const [selectedShares, setSelectedShares] = useState<Share[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Breadcrumbs history path
  const [breadcrumbs, setBreadcrumbs] = useState<Folder[]>([]);

  // Modals state
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [sharePermission, setSharePermission] = useState<'view' | 'edit'>('view');

  // Drag and Drop
  const [dragActive, setDragActive] = useState(false);

  // UI state
  const [isUploading, setIsUploading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Trigger brief Toast notification
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3000);
  };

  // Check auth status on mount
  useEffect(() => {
    checkAuth();
  }, []);

  // Reload current folder contents when folder changes or active tab changes
  useEffect(() => {
    if (user) {
      fetchContents();
    }
  }, [user, currentFolderId, activeTab]);

  // Load selected item versions and shares when selected item changes
  useEffect(() => {
    if (selectedItem) {
      fetchSelectedItemDetails();
    } else {
      setSelectedVersions([]);
      setSelectedShares([]);
    }
  }, [selectedItem]);

  const checkAuth = async () => {
    setIsLoadingAuth(true);
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setS3Active(data.s3Active);
      }
    } catch (err) {
      console.error('Auth verification failed:', err);
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
    const payload = authMode === 'login' 
      ? { email, password }
      : { email, password, name };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setUser(data.user);
        // Refresh me route to get config details
        checkAuth();
        showToast(`Welcome back, ${data.user.name}!`);
      } else {
        setAuthError(data.error || 'Authentication failed');
      }
    } catch (err) {
      setAuthError('An error occurred. Please try again.');
    }
  };

  const handleOAuth = async (provider: 'google' | 'github') => {
    setAuthError(null);
    const oauthUserId = Math.random().toString(36).substring(2, 6);
    const nameSuffix = provider === 'google' ? 'Google Explorer' : 'GitHub Developer';
    
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          provider, 
          oauthId: oauthUserId,
          oauthName: `${nameSuffix} ${oauthUserId}`
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setUser(data.user);
        checkAuth();
        showToast(`Signed in with ${provider.charAt(0).toUpperCase() + provider.slice(1)}!`);
      } else {
        setAuthError(data.error || 'OAuth authentication failed');
      }
    } catch (err) {
      setAuthError('An error occurred during OAuth authentication.');
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setUser(null);
      setSelectedItem(null);
      setCurrentFolderId(null);
      setFolders([]);
      setFiles([]);
      showToast('Logged out successfully.');
    } catch (err) {
      showToast('Logout failed', 'error');
    }
  };

  // Fetch folders and files in current view
  const fetchContents = async () => {
    try {
      if (activeTab === 'drive') {
        // Fetch folders
        const foldersRes = await fetch(`/api/folders?parentId=${currentFolderId}`);
        const foldersData = await foldersRes.json();
        
        // Fetch files
        const filesRes = await fetch(`/api/files?folderId=${currentFolderId}`);
        const filesData = await filesRes.json();

        setFolders(foldersData.folders || []);
        setFiles(filesData.files || []);

        // Fetch breadcrumbs parent hierarchy
        if (currentFolderId) {
          // Construct breadcrumb path (We can request a helper or build client-side from overall folders if cached, 
          // but fetching breadcrumbs directly is cleaner. For simplicity, we keep a dynamic state stack or fetch it)
          updateBreadcrumbs(currentFolderId, foldersData.folders || []);
        } else {
          setBreadcrumbs([]);
        }
      } else if (activeTab === 'shared') {
        const res = await fetch('/api/shared-with-me');
        const data = await res.json();
        setFolders(data.folders || []);
        setFiles(data.files || []);
        setBreadcrumbs([]);
      } else if (activeTab === 'recent') {
        // Fetch all files from root and subfolders, sort by date
        const res = await fetch('/api/files?folderId=all'); // Custom recent retrieval or fetch root
        const data = await res.json();
        const sortedFiles = (data.files || []).sort(
          (a: FileItem, b: FileItem) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setFolders([]);
        setFiles(sortedFiles);
        setBreadcrumbs([]);
      }
    } catch (err) {
      showToast('Failed to load drive contents', 'error');
    }
  };

  // Build breadcrumb folder hierarchy chain
  const updateBreadcrumbs = async (folderId: string, currentFolders: Folder[]) => {
    try {
      // In a real database we'd do a recursive fetch. We can build it by reading all user folders from db.json or dynamic endpoint.
      // Let's call a query or keep a history track. Let's make a request to /api/folders?breadcrumbs=true to parse all folders and build it.
      // For now, let's write a simple folder retrieval to query the parent folder name.
      const res = await fetch(`/api/folders?parentId=all`); // custom retrieval to get all folders owned by user
      const data = await res.json();
      const allFolders: Folder[] = data.folders || [];
      
      const chain: Folder[] = [];
      let current = allFolders.find(f => f.id === folderId);
      while (current) {
        chain.unshift(current);
        current = current.parentId ? allFolders.find(f => f.id === current!.parentId) : undefined;
      }
      setBreadcrumbs(chain);
    } catch (err) {
      console.error(err);
    }
  };

  // Get details (versions, shares) for the currently selected file/folder
  const fetchSelectedItemDetails = async () => {
    if (!selectedItem) return;
    const { type, data } = selectedItem;

    try {
      // Fetch shares
      const sharesRes = await fetch(`/api/share?targetId=${data.id}&targetType=${type}`);
      const sharesData = await sharesRes.json();
      setSelectedShares(sharesData.shares || []);

      if (type === 'file') {
        // Fetch versions
        const versionsRes = await fetch(`/api/files/${data.id}/versions`);
        const versionsData = await versionsRes.json();
        setSelectedVersions(versionsData.versions || []);
      } else {
        setSelectedVersions([]);
      }
    } catch (err) {
      console.error('Failed to load item details:', err);
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    try {
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newFolderName.trim(),
          parentId: currentFolderId,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Folder "${data.folder.name}" created!`);
        setShowFolderModal(false);
        setNewFolderName('');
        fetchContents();
      } else {
        showToast(data.error || 'Failed to create folder', 'error');
      }
    } catch (err) {
      showToast('Error creating folder', 'error');
    }
  };

  const handleFileUpload = async (filesToUpload: FileList | null) => {
    if (!filesToUpload || filesToUpload.length === 0) return;
    setIsUploading(true);

    try {
      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];
        const formData = new FormData();
        formData.append('file', file);
        if (currentFolderId) {
          formData.append('folderId', currentFolderId);
        }

        const res = await fetch('/api/files', {
          method: 'POST',
          body: formData,
        });

        const data = await res.json();
        if (res.ok) {
          showToast(`File "${file.name}" uploaded successfully!`);
        } else {
          showToast(data.error || `Upload failed for ${file.name}`, 'error');
        }
      }
      fetchContents();
      // If the selected item was updated, reload its details
      if (selectedItem && selectedItem.type === 'file') {
        fetchSelectedItemDetails();
      }
    } catch (err) {
      showToast('Error uploading file', 'error');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteItem = async (e: React.MouseEvent, item: { type: 'file' | 'folder'; data: any }) => {
    e.stopPropagation();
    const confirmMsg = `Are you sure you want to delete this ${item.type}?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const endpoint = item.type === 'file' 
        ? `/api/files/${item.data.id}`
        : `/api/folders/${item.data.id}`; // Custom folders delete or similar. We can also handle folders delete
      
      const res = await fetch(endpoint, { method: 'DELETE' });
      if (res.ok) {
        showToast(`${item.type === 'file' ? 'File' : 'Folder'} deleted.`);
        if (selectedItem && selectedItem.data.id === item.data.id) {
          setSelectedItem(null);
        }
        fetchContents();
      } else {
        const data = await res.json();
        showToast(data.error || 'Deletion failed', 'error');
      }
    } catch (err) {
      showToast('Deletion failed', 'error');
    }
  };

  const handleShareSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || !shareEmail.trim()) return;

    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetId: selectedItem.data.id,
          targetType: selectedItem.type,
          sharedWithEmail: shareEmail.trim(),
          permission: sharePermission,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Access shared with ${shareEmail}`);
        setShareEmail('');
        fetchSelectedItemDetails();
      } else {
        showToast(data.error || 'Failed to share', 'error');
      }
    } catch (err) {
      showToast('Failed to share item', 'error');
    }
  };

  const handleTogglePublicShare = async (checked: boolean) => {
    if (!selectedItem) return;

    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetId: selectedItem.data.id,
          targetType: selectedItem.type,
          isPublic: checked,
          permission: 'view',
        }),
      });
      if (res.ok) {
        showToast(checked ? 'Public link sharing enabled!' : 'Public link sharing disabled.');
        fetchSelectedItemDetails();
      } else {
        showToast('Failed to toggle public share', 'error');
      }
    } catch (err) {
      showToast('Failed to toggle public share', 'error');
    }
  };

  const handleRevokeShare = async (shareId: string) => {
    try {
      const res = await fetch(`/api/share?shareId=${shareId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        showToast('Sharing permission revoked.');
        fetchSelectedItemDetails();
      } else {
        showToast('Failed to revoke access', 'error');
      }
    } catch (err) {
      showToast('Failed to revoke access', 'error');
    }
  };

  const handleRestoreVersion = async (versionId: string, versionNumber: number) => {
    if (!selectedItem || selectedItem.type !== 'file') return;
    
    try {
      const res = await fetch(`/api/files/${selectedItem.data.id}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId }),
      });
      if (res.ok) {
        showToast(`File rolled back to Version ${versionNumber}!`);
        fetchContents();
        fetchSelectedItemDetails();
      } else {
        showToast('Failed to restore version', 'error');
      }
    } catch (err) {
      showToast('Failed to restore version', 'error');
    }
  };

  // Drag over handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(text);
    showToast('Copied share link!');
    setTimeout(() => setCopiedToken(null), 2000);
  };

  // Helper to format bytes
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Filter local folder items based on search query
  const filteredFolders = folders.filter((f) => 
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredFiles = files.filter((f) => 
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // If loading session
  if (isLoadingAuth) {
    return (
      <div className="auth-page">
        <div className="empty-state">
          <RefreshCw className="empty-state-icon animate-spin" size={48} />
          <h3>Loading Cloud Drive...</h3>
        </div>
      </div>
    );
  }

  // RENDER AUTHENTICATION VIEW IF LOGGED OUT
  if (!user) {
    return (
      <main className="auth-page">
        <div className="background-decorations">
          <div className="glow glow-1"></div>
          <div className="glow glow-2"></div>
        </div>

        <div className="glass-panel auth-card">
          <div className="auth-header">
            <HardDrive className="auth-logo-icon" size={48} />
            <h1>CloudStorage</h1>
            <p>{authMode === 'login' ? 'Sign in to access your secure drive' : 'Create an account to start storing files'}</p>
          </div>

          {authError && <div className="error-message">{authError}</div>}

          <form onSubmit={handleAuthSubmit} className="auth-form">
            {authMode === 'register' && (
              <div className="form-group">
                <label>Display Name</label>
                <input 
                  type="text" 
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  placeholder="e.g. John Doe"
                  className="glass-input" 
                  required 
                />
              </div>
            )}
            <div className="form-group">
              <label>Email Address</label>
              <input 
                type="email" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                placeholder="e.g. user@example.com"
                className="glass-input" 
                required 
              />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                placeholder="••••••••"
                className="glass-input" 
                required 
              />
            </div>

            <button type="submit" className="btn-primary">
              {authMode === 'login' ? 'Sign In' : 'Sign Up'}
            </button>
          </form>

          <div className="auth-divider">Or continue with</div>

          <div className="oauth-options">
            <button className="btn-oauth google" onClick={() => handleOAuth('google')}>
              <Key size={18} />
              Sign in with Google
            </button>
            <button className="btn-oauth github" onClick={() => handleOAuth('github')}>
              <Key size={18} />
              Sign in with GitHub
            </button>
          </div>

          <div className="auth-footer">
            {authMode === 'login' ? (
              <>
                Don't have an account? 
                <a href="#" className="auth-footer-link" onClick={() => setAuthMode('register')}>Sign up</a>
              </>
            ) : (
              <>
                Already have an account? 
                <a href="#" className="auth-footer-link" onClick={() => setAuthMode('login')}>Sign in</a>
              </>
            )}
          </div>
        </div>
      </main>
    );
  }

  // RENDER CLOUD DRIVE VIEW IF LOGGED IN
  const publicShareActive = selectedShares.find(s => s.isPublic);
  const publicShareUrl = publicShareActive && typeof window !== 'undefined' 
    ? `${window.location.origin}/s/${publicShareActive.publicToken}` 
    : '';

  return (
    <main className="app-container">
      <div className="background-decorations">
        <div className="glow glow-1"></div>
        <div className="glow glow-2"></div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type}`}>
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Sidebar Section */}
      <aside className="app-sidebar glass-panel">
        <div className="logo-section">
          <HardDrive className="logo-icon" />
          <span className="logo-text">CloudStorage</span>
        </div>

        <nav>
          <ul className="sidebar-menu">
            <li>
              <a 
                onClick={() => { setActiveTab('drive'); setCurrentFolderId(null); setSelectedItem(null); }}
                className={`menu-item ${activeTab === 'drive' ? 'active' : ''}`}
              >
                <HardDrive size={18} />
                My Drive
              </a>
            </li>
            <li>
              <a 
                onClick={() => { setActiveTab('shared'); setSelectedItem(null); }}
                className={`menu-item ${activeTab === 'shared' ? 'active' : ''}`}
              >
                <Users size={18} />
                Shared with me
              </a>
            </li>
            <li>
              <a 
                onClick={() => { setActiveTab('recent'); setSelectedItem(null); }}
                className={`menu-item ${activeTab === 'recent' ? 'active' : ''}`}
              >
                <History size={18} />
                Recent
              </a>
            </li>
          </ul>
        </nav>

        {/* Sidebar S3 status */}
        <div style={{ marginTop: '24px', padding: '12px', border: '1px solid var(--border-glass)', borderRadius: '8px', background: 'rgba(255,255,255,0.01)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', fontWeight: 500, color: 'var(--color-success)' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-success)', display: 'inline-block' }}></span>
            <span>AWS S3 Cloud Connected</span>
          </div>
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="avatar-placeholder">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="user-info">
              <span className="user-name">{user.name}</span>
              <span className="user-email">{user.email}</span>
            </div>
          </div>
          <button className="btn-logout" onClick={handleLogout}>
            <LogOut size={16} />
            Log Out
          </button>
        </div>
      </aside>

      {/* Main Explorer Section */}
      <section className="app-main">
        <header className="app-header">
          <div className="search-container">
            <Search className="search-icon" size={18} />
            <input 
              type="text" 
              placeholder="Search in drive..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="glass-input search-input" 
            />
          </div>

          <div className="header-actions">
            {activeTab === 'drive' && (
              <>
                <button className="btn-action-outline" onClick={() => setShowFolderModal(true)}>
                  <Plus size={18} />
                  New Folder
                </button>
                <button 
                  className="btn-action-primary" 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <RefreshCw className="animate-spin" size={18} />
                  ) : (
                    <UploadCloud size={18} />
                  )}
                  {isUploading ? 'Uploading...' : 'Upload File'}
                </button>
              </>
            )}
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={(e) => handleFileUpload(e.target.files)} 
              multiple 
              className="hidden-file-input" 
            />
          </div>
        </header>

        {/* Workspace Explorer Container */}
        <div className="explorer-container" onDragEnter={handleDrag}>
          
          {/* Breadcrumbs Navigation */}
          {activeTab === 'drive' && (
            <div className="breadcrumbs">
              <span 
                className={`breadcrumb-root ${currentFolderId === null ? 'active' : ''}`}
                onClick={() => { setCurrentFolderId(null); setSelectedItem(null); }}
              >
                My Drive
              </span>
              {breadcrumbs.map((folder, index) => (
                <React.Fragment key={folder.id}>
                  <ChevronRight className="breadcrumb-separator" size={14} />
                  <span 
                    className={`breadcrumb-item ${index === breadcrumbs.length - 1 ? 'active' : ''}`}
                    onClick={() => { setCurrentFolderId(folder.id); setSelectedItem(null); }}
                  >
                    {folder.name}
                  </span>
                </React.Fragment>
              ))}
            </div>
          )}

          {activeTab === 'shared' && (
            <div className="breadcrumbs">
              <span className="breadcrumb-item active">Shared with me</span>
            </div>
          )}

          {activeTab === 'recent' && (
            <div className="breadcrumbs">
              <span className="breadcrumb-item active">Recent Files</span>
            </div>
          )}

          {/* Drag & Drop Upload Zone (only in drive mode) */}
          {activeTab === 'drive' && (
            <div 
              className={`drag-drop-zone ${dragActive ? 'drag-active' : ''}`}
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadCloud className="drag-drop-icon" size={32} />
              <p>Drag and drop files here, or <strong>browse</strong> to upload</p>
            </div>
          )}

          {/* Explorer Sections: Folders & Files */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            
            {/* Folders List (only rendered if folders exist) */}
            {filteredFolders.length > 0 && (
              <div className="explorer-section">
                <h3 className="explorer-section-title">Folders</h3>
                <div className="folder-grid">
                  {filteredFolders.map((folder) => (
                    <div 
                      key={folder.id} 
                      className={`folder-card ${selectedItem?.data.id === folder.id ? 'selected' : ''}`}
                      onClick={() => setSelectedItem({ type: 'folder', data: folder })}
                      onDoubleClick={() => {
                        setCurrentFolderId(folder.id);
                        setSelectedItem(null);
                      }}
                    >
                      <FolderIcon className="folder-icon" size={20} fill="#F59E0B" />
                      <span className="folder-name">{folder.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Files List */}
            <div className="explorer-section">
              <h3 className="explorer-section-title">Files</h3>
              {filteredFiles.length === 0 && filteredFolders.length === 0 ? (
                <div className="empty-state">
                  <FileText className="empty-state-icon" size={48} />
                  <h3>Drive is Empty</h3>
                  <p>Upload a file or create a folder to get started.</p>
                </div>
              ) : filteredFiles.length === 0 ? (
                <div className="empty-state" style={{ padding: '24px' }}>
                  <p>No files in this directory</p>
                </div>
              ) : (
                <div className="table-wrapper">
                  <table className="explorer-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Size</th>
                        <th>Created At</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredFiles.map((file) => (
                        <tr 
                          key={file.id}
                          className={selectedItem?.data.id === file.id ? 'selected' : ''}
                          onClick={() => setSelectedItem({ type: 'file', data: file })}
                        >
                          <td className="item-name-cell">
                            <FileText className="icon-file" size={18} />
                            <span>{file.name}</span>
                          </td>
                          <td>{formatSize(file.size)}</td>
                          <td>{new Date(file.createdAt).toLocaleDateString()}</td>
                          <td className="actions-cell">
                            <a 
                              href={`/api/files/${file.id}`} 
                              download={file.name}
                              className="btn-icon-action"
                              title="Download"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Download size={16} />
                            </a>
                            {activeTab === 'drive' && (
                              <>
                                <button 
                                  className="btn-icon-action" 
                                  title="Share"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedItem({ type: 'file', data: file });
                                    setShowShareModal(true);
                                  }}
                                >
                                  <Share2 size={16} />
                                </button>
                                <button 
                                  className="btn-icon-action delete" 
                                  title="Delete"
                                  onClick={(e) => handleDeleteItem(e, { type: 'file', data: file })}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Right Drawer (Info and details panel) */}
      {selectedItem && (
        <aside className="details-panel glass-panel">
          <div className="details-header">
            <h2>Item Details</h2>
            <button className="btn-close-modal" onClick={() => setSelectedItem(null)}>
              <X size={18} />
            </button>
          </div>

          <div className="details-content">
            <div className="item-preview-section">
              <div className="preview-icon-box">
                {selectedItem.type === 'file' ? <FileIcon size={40} /> : <FolderIcon size={40} />}
              </div>
              <div className="preview-name">{selectedItem.data.name}</div>
              
              {selectedItem.type === 'file' && (
                <div className="preview-actions">
                  <a 
                    href={`/api/files/${selectedItem.data.id}`}
                    download={selectedItem.data.name}
                    className="btn-primary btn"
                    style={{ textDecoration: 'none' }}
                  >
                    <Download size={16} />
                    Download
                  </a>
                </div>
              )}
            </div>

            {/* General Info Metadata */}
            <div className="info-list">
              <div className="info-row">
                <span className="info-label">Type</span>
                <span className="info-value">{selectedItem.type === 'file' ? selectedItem.data.type : 'Folder'}</span>
              </div>
              {selectedItem.type === 'file' && (
                <div className="info-row">
                  <span className="info-label">Size</span>
                  <span className="info-value">{formatSize(selectedItem.data.size)}</span>
                </div>
              )}
              <div className="info-row">
                <span className="info-label">Created At</span>
                <span className="info-value">{new Date(selectedItem.data.createdAt).toLocaleDateString()}</span>
              </div>
            </div>

            {/* Sharing Permissions Section */}
            {activeTab === 'drive' && (
              <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '20px' }}>
                <h3 className="panel-section-title">Sharing Options</h3>
                
                <div className="sharing-quick-settings">
                  {/* Public link share toggle */}
                  <div className="public-link-box">
                    <div className="public-link-header">
                      <label>Public Link Sharing</label>
                      <label className="switch">
                        <input 
                          type="checkbox" 
                          checked={!!publicShareActive} 
                          onChange={(e) => handleTogglePublicShare(e.target.checked)}
                        />
                        <span className="slider"></span>
                      </label>
                    </div>

                    {publicShareActive && (
                      <div className="public-link-input-group">
                        <div className="glass-input public-link-url" title={publicShareUrl}>
                          {publicShareUrl}
                        </div>
                        <button className="btn-copy" onClick={() => copyToClipboard(publicShareUrl)}>
                          {copiedToken === publicShareUrl ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Add collaborator share trigger */}
                  <button 
                    className="btn-action-outline" 
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => setShowShareModal(true)}
                  >
                    <Users size={16} />
                    Manage Collaborators ({selectedShares.filter(s => !s.isPublic).length})
                  </button>
                </div>
              </div>
            )}

            {/* Version History Section (Files Only) */}
            {selectedItem.type === 'file' && activeTab === 'drive' && (
              <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '20px' }}>
                <h3 className="panel-section-title">Version History ({selectedVersions.length})</h3>
                <div className="version-list">
                  {selectedVersions.map((ver, idx) => (
                    <div key={ver.id} className="version-row">
                      <div className="version-meta-info">
                        <span className="version-number">
                          Version {ver.versionNumber} {idx === selectedVersions.length - 1 && '(Active)'}
                        </span>
                        <span className="version-date">
                          {new Date(ver.uploadedAt).toLocaleDateString()} at {new Date(ver.uploadedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="version-size">{formatSize(ver.size)}</span>
                      </div>
                      
                      {idx < selectedVersions.length - 1 && (
                        <button 
                          className="btn-restore-version"
                          onClick={() => handleRestoreVersion(ver.id, ver.versionNumber)}
                        >
                          Restore
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>
      )}

      {/* CREATE FOLDER MODAL */}
      {showFolderModal && (
        <div className="modal-overlay">
          <div className="glass-panel modal-card">
            <div className="modal-header">
              <h2>Create Folder</h2>
              <button className="btn-close-modal" onClick={() => { setShowFolderModal(false); setNewFolderName(''); }}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateFolder} className="modal-form">
              <div className="form-group">
                <label>Folder Name</label>
                <input 
                  type="text" 
                  className="glass-input" 
                  placeholder="e.g. Project Documents" 
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn-action-outline" 
                  onClick={() => { setShowFolderModal(false); setNewFolderName(''); }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Create Folder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SHARE / COLLABORATOR MODAL */}
      {showShareModal && selectedItem && (
        <div className="modal-overlay">
          <div className="glass-panel modal-card">
            <div className="modal-header">
              <h2>Share "{selectedItem.data.name}"</h2>
              <button className="btn-close-modal" onClick={() => { setShowShareModal(false); setShareEmail(''); }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleShareSubmit} className="modal-form">
              <div className="form-group">
                <label>Email Address</label>
                <input 
                  type="email" 
                  className="glass-input" 
                  placeholder="collaborator@example.com" 
                  value={shareEmail}
                  onChange={(e) => setShareEmail(e.target.value)}
                  required 
                />
              </div>

              <div className="form-group">
                <label>Permission Level</label>
                <select 
                  className="glass-input" 
                  value={sharePermission} 
                  onChange={(e) => setSharePermission(e.target.value as 'view' | 'edit')}
                  style={{ background: '#111827' }}
                >
                  <option value="view">Viewer (Read Only)</option>
                  <option value="edit">Editor (Modify Access)</option>
                </select>
              </div>

              <button type="submit" className="btn-primary" style={{ marginTop: '8px' }}>
                Add Collaborator
              </button>
            </form>

            <div className="modal-share-list">
              <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
                Who has access
              </h3>
              {selectedShares.filter(s => !s.isPublic).length === 0 ? (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Not shared with anyone yet.</p>
              ) : (
                selectedShares.filter(s => !s.isPublic).map((share) => (
                  <div key={share.id} className="modal-share-row">
                    <span className="collaborator-email" title={share.sharedWithEmail || ''}>
                      {share.sharedWithEmail}
                    </span>
                    <div className="collaborator-meta">
                      <span className="permission-badge">{share.permission}</span>
                      <button 
                        className="btn-revoke" 
                        onClick={() => handleRevokeShare(share.id)}
                        title="Revoke access"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="modal-footer" style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '16px', marginTop: '16px' }}>
              <button 
                type="button" 
                className="btn-action-outline" 
                onClick={() => { setShowShareModal(false); setShareEmail(''); }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
