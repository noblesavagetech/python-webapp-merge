import { useState, useRef, useEffect } from 'react';
import { apiService } from '../../../services/api';
import './ContextPanel.css';

interface ContextPanelProps {
  memories: string[];
  onRemoveMemory: (index: number) => void;
  projectId: number | null;
}

interface FileUpload {
  id: number;
  filename: string;
  file_size: number;
  mime_type: string;
  processed: boolean;
  created_at: string;
}

interface ContextFile {
  filename: string;
  content: string;
  size: number;
}

interface MarkdownFile {
  filename: string;
  content: string;
  size: number;
  expanded: boolean;
}

// Collapsible Section Component
function CollapsibleSection({ 
  title, 
  children, 
  defaultExpanded = false,
  badge,
  onToggle
}: { 
  title: string; 
  children: React.ReactNode; 
  defaultExpanded?: boolean;
  badge?: string | number;
  onToggle?: (expanded: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  
  const handleToggle = () => {
    const newExpanded = !expanded;
    setExpanded(newExpanded);
    onToggle?.(newExpanded);
  };
  
  return (
    <div className={`context-collapsible ${expanded ? 'expanded' : 'collapsed'}`}>
      <button className="context-collapsible-header" onClick={handleToggle} type="button">
        <span className="context-collapsible-title">
          {title}
          {badge !== undefined && <span className="context-badge">{badge}</span>}
        </span>
        <span className="context-collapsible-arrow">{expanded ? '▼' : '▶'}</span>
      </button>
      {expanded && <div className="context-collapsible-content">{children}</div>}
    </div>
  );
}

function ContextPanel({ memories, onRemoveMemory, projectId }: ContextPanelProps) {
  const [trainedFiles, setTrainedFiles] = useState<FileUpload[]>([]);
  const [contextFiles, setContextFiles] = useState<ContextFile[]>([]);
  const [markdownFiles, setMarkdownFiles] = useState<MarkdownFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<'memories' | 'trained' | 'context' | 'markdown'>('memories');
  const trainInputRef = useRef<HTMLInputElement>(null);
  const contextInputRef = useRef<HTMLInputElement>(null);
  const markdownInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (projectId && activeTab === 'trained') {
      loadTrainedFiles();
    }
  }, [projectId, activeTab]);

  const loadTrainedFiles = async () => {
    if (!projectId) return;
    try {
      const fileList = await apiService.listFiles(projectId);
      // Only show files that were processed (trained)
      setTrainedFiles(fileList.filter((f: FileUpload) => f.processed));
    } catch (error) {
      console.error('Failed to load files:', error);
    }
  };

  const handleTrainUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !projectId) {
      console.log('Upload cancelled: no file or projectId', { file: !!file, projectId });
      return;
    }

    console.log('Starting training file upload:', file.name);
    setUploading(true);
    try {
      const result = await apiService.uploadFile(projectId, file, true);  // train=true
      console.log('Upload successful:', result);
      await loadTrainedFiles();
      if (trainInputRef.current) {
        trainInputRef.current.value = '';
      }
      alert(`✓ Successfully uploaded and trained: ${file.name}`);
    } catch (error) {
      console.error('Failed to upload training file:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to upload training file: ${errorMsg}`);
    } finally {
      setUploading(false);
    }
  };

  const handleContextUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !projectId) {
      console.log('Upload cancelled: no file or projectId', { file: !!file, projectId });
      return;
    }

    console.log('Starting context file upload:', file.name);
    setUploading(true);
    try {
      const result = await apiService.uploadFile(projectId, file, false);  // train=false
      console.log('Upload successful:', result);
      setContextFiles(prev => [...prev, {
        filename: result.filename,
        content: result.content,
        size: result.size
      }]);
      if (contextInputRef.current) {
        contextInputRef.current.value = '';
      }
      alert(`✓ Successfully added context file: ${file.name}`);
    } catch (error) {
      console.error('Failed to upload context file:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to upload context file: ${errorMsg}`);
    } finally {
      setUploading(false);
    }
  };

  const handleVerifyFile = async (filename: string) => {
    if (!projectId) return;
    try {
      // Query vector store for file content
      const results = await apiService.searchMemory(projectId, `content from ${filename}`, 5);
      alert(`File: ${filename}\n\nVector store contains ${results.length} chunks from this file.\n\nSample: ${results[0]?.substring(0, 200) || 'No results found'}...`);
    } catch (error) {
      console.error('Failed to verify file:', error);
      alert('Failed to verify file in vector store');
    }
  };

  const handleDeleteTrained = async (fileId: number) => {
    if (!projectId || !confirm('Delete this trained file from memory?')) return;
    
    try {
      await apiService.deleteFile(projectId, fileId);
      await loadTrainedFiles();
    } catch (error) {
      console.error('Failed to delete file:', error);
      alert('Failed to delete file');
    }
  };

  const handleDeleteContext = (filename: string) => {
    if (!confirm('Remove this context file?')) return;
    setContextFiles(prev => prev.filter(f => f.filename !== filename));
  };

  // Markdown file handlers
  const handleMarkdownUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Only allow .md files
    if (!file.name.endsWith('.md')) {
      alert('Please select a Markdown (.md) file');
      return;
    }

    setUploading(true);
    try {
      const content = await file.text();
      setMarkdownFiles(prev => [...prev, {
        filename: file.name,
        content,
        size: file.size,
        expanded: false
      }]);
      if (markdownInputRef.current) {
        markdownInputRef.current.value = '';
      }
      alert(`✓ Loaded markdown file: ${file.name}`);
    } catch (error) {
      console.error('Failed to read markdown file:', error);
      alert('Failed to read markdown file');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteMarkdown = (filename: string) => {
    if (!confirm('Remove this markdown file from context?')) return;
    setMarkdownFiles(prev => prev.filter(f => f.filename !== filename));
  };

  const toggleMarkdownExpanded = (filename: string) => {
    setMarkdownFiles(prev => prev.map(f => 
      f.filename === filename ? { ...f, expanded: !f.expanded } : f
    ));
  };

  // Simple markdown renderer
  const renderMarkdown = (content: string) => {
    // Very basic markdown rendering
    const lines = content.split('\n');
    return lines.map((line, i) => {
      // Headers
      if (line.startsWith('### ')) {
        return <h4 key={i} className="md-h3">{line.slice(4)}</h4>;
      }
      if (line.startsWith('## ')) {
        return <h3 key={i} className="md-h2">{line.slice(3)}</h3>;
      }
      if (line.startsWith('# ')) {
        return <h2 key={i} className="md-h1">{line.slice(2)}</h2>;
      }
      // Bold
      let processed = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      // Italic
      processed = processed.replace(/\*(.+?)\*/g, '<em>$1</em>');
      // Code
      processed = processed.replace(/`(.+?)`/g, '<code>$1</code>');
      // Lists
      if (line.startsWith('- ')) {
        return <li key={i} className="md-li" dangerouslySetInnerHTML={{ __html: processed.slice(2) }} />;
      }
      if (/^\d+\.\s/.test(line)) {
        return <li key={i} className="md-li-ordered" dangerouslySetInnerHTML={{ __html: processed.replace(/^\d+\.\s/, '') }} />;
      }
      // Empty lines
      if (line.trim() === '') {
        return <br key={i} />;
      }
      // Regular paragraph
      return <p key={i} className="md-p" dangerouslySetInnerHTML={{ __html: processed }} />;
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="context-panel-container">
      <div className="context-header">
        <div className="context-tabs">
          <button 
            className={`tab ${activeTab === 'memories' ? 'active' : ''}`}
            onClick={() => setActiveTab('memories')}
          >
            🧠 Memories
          </button>
          <button 
            className={`tab ${activeTab === 'trained' ? 'active' : ''}`}
            onClick={() => setActiveTab('trained')}
          >
            📚 Trained
          </button>
          <button 
            className={`tab ${activeTab === 'context' ? 'active' : ''}`}
            onClick={() => setActiveTab('context')}
          >
            📄 Context
          </button>
          <button 
            className={`tab ${activeTab === 'markdown' ? 'active' : ''}`}
            onClick={() => setActiveTab('markdown')}
          >
            📝 Markdown
          </button>
        </div>
      </div>
      
      <div className="context-content">
        {activeTab === 'memories' && (
          <div className="memories-section">
            <p className="section-hint">
              Key insights the membrane has learned from your work
            </p>
            {memories.length === 0 ? (
              <div className="empty-state">
                <span>No memories yet</span>
                <p>Add insights as you work</p>
              </div>
            ) : (
              <div className="memories-list">
                {memories.map((memory, idx) => (
                  <div key={idx} className="memory-item">
                    <div className="memory-content">{memory}</div>
                    <button 
                      className="memory-remove"
                      onClick={() => onRemoveMemory(idx)}
                      title="Remove memory"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'trained' && (
          <div className="trained-section">
            <div className="section-header">
              <p className="section-hint">
                Files trained into the membrane's permanent knowledge
              </p>
              <input
                ref={trainInputRef}
                type="file"
                onChange={handleTrainUpload}
                style={{ display: 'none' }}
                accept=".txt,.md,.csv,.json,.pdf"
              />
              <button 
                className="upload-btn"
                onClick={() => trainInputRef.current?.click()}
                disabled={uploading || !projectId}
              >
                {uploading ? '⏳ Uploading...' : '+ Train File'}
              </button>
            </div>
            {trainedFiles.length === 0 ? (
              <div className="empty-state">
                <span>No trained files</span>
                <p>Upload documents to train the membrane</p>
              </div>
            ) : (
              <div className="files-list">
                {trainedFiles.map(file => (
                  <div key={file.id} className="file-item">
                    <div className="file-info">
                      <div className="file-name">{file.filename}</div>
                      <div className="file-meta">
                        {formatFileSize(file.file_size)} • {new Date(file.created_at).toLocaleDateString()}
                        {file.processed && <span className="processed-badge"> ✓ Trained</span>}
                      </div>
                    </div>
                    <div className="file-actions">
                      <button 
                        className="file-verify"
                        onClick={() => handleVerifyFile(file.filename)}
                        title="Verify file in vector store"
                      >
                        🔍
                      </button>
                      <button 
                        className="file-delete"
                        onClick={() => handleDeleteTrained(file.id)}
                        title="Delete file"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'context' && (
          <div className="context-section">
            <div className="section-header">
              <p className="section-hint">
                Reference material for this session only (not trained)
              </p>
              <input
                ref={contextInputRef}
                type="file"
                onChange={handleContextUpload}
                style={{ display: 'none' }}
                accept=".txt,.md,.csv,.json,.pdf"
              />
              <button 
                className="upload-btn"
                onClick={() => contextInputRef.current?.click()}
                disabled={uploading || !projectId}
              >
                {uploading ? '⏳ Uploading...' : '+ Add Context'}
              </button>
            </div>
            {contextFiles.length === 0 ? (
              <div className="empty-state">
                <span>No context files</span>
                <p>Upload reference material that won't be trained</p>
              </div>
            ) : (
              <div className="files-list">
                {contextFiles.map(file => (
                  <div key={file.filename} className="file-item">
                    <div className="file-info">
                      <div className="file-name">{file.filename}</div>
                      <div className="file-meta">
                        {formatFileSize(file.size)} • Session only
                      </div>
                    </div>
                    <button 
                      className="file-delete"
                      onClick={() => handleDeleteContext(file.filename)}
                      title="Remove from session"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'markdown' && (
          <div className="markdown-section">
            <div className="section-header">
              <p className="section-hint">
                Load .md files to use as interactive context. View and reference them while writing.
              </p>
              <input
                ref={markdownInputRef}
                type="file"
                onChange={handleMarkdownUpload}
                style={{ display: 'none' }}
                accept=".md"
              />
              <button 
                className="upload-btn"
                onClick={() => markdownInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? '⏳ Loading...' : '+ Load .md File'}
              </button>
            </div>
            {markdownFiles.length === 0 ? (
              <div className="empty-state">
                <span>No markdown files loaded</span>
                <p>Load .md files to use as reference while writing</p>
              </div>
            ) : (
              <div className="markdown-files-list">
                {markdownFiles.map(file => (
                  <CollapsibleSection
                    key={file.filename}
                    title={file.filename}
                    badge={formatFileSize(file.size)}
                    defaultExpanded={file.expanded}
                    onToggle={() => toggleMarkdownExpanded(file.filename)}
                  >
                    <div className="markdown-content">
                      {renderMarkdown(file.content)}
                    </div>
                    <div className="markdown-actions">
                      <button 
                        className="md-action-btn"
                        onClick={() => {
                          navigator.clipboard.writeText(file.content);
                          alert('Content copied to clipboard!');
                        }}
                        title="Copy raw content"
                      >
                        📋 Copy Raw
                      </button>
                      <button 
                        className="md-action-btn md-action-btn--danger"
                        onClick={() => handleDeleteMarkdown(file.filename)}
                        title="Remove file"
                      >
                        🗑️ Remove
                      </button>
                    </div>
                  </CollapsibleSection>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ContextPanel;
