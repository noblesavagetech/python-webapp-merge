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

function ContextPanel({ memories, onRemoveMemory, projectId }: ContextPanelProps) {
  const [trainedFiles, setTrainedFiles] = useState<FileUpload[]>([]);
  const [contextFiles, setContextFiles] = useState<ContextFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<'memories' | 'trained' | 'context'>('memories');
  const trainInputRef = useRef<HTMLInputElement>(null);
  const contextInputRef = useRef<HTMLInputElement>(null);

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
      </div>
    </div>
  );
}

export default ContextPanel;
