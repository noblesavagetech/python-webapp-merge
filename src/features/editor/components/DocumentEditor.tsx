import React, { useState, useRef, useCallback, useEffect } from 'react';
import { SelectionPopup } from './SelectionPopup';
import { apiService } from '../../../services/api';
import './DocumentEditor.css';

interface DocumentEditorProps {
  content: string;
  onChange: (content: string) => void;
  onSelection: (text: string, range: { start: number; end: number } | null) => void;
  purpose: string;
  partner: string;
  selectedModel: string;
  projectId: number | null;
}

interface PendingChange {
  id: string;
  originalText: string;
  newText: string;
  range: { start: number; end: number };
  timestamp: number;
}

function DocumentEditor({ content, onChange, onSelection, purpose, selectedModel, projectId, partner }: DocumentEditorProps) {
  const [localContent, setLocalContent] = useState(content);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const isUpdatingRef = useRef(false);
  
  // Simple pending change - only one at a time for clarity
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);
  
  // Selection popup state
  const [showPopup, setShowPopup] = useState(false);
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
  const [selectedTextInfo, setSelectedTextInfo] = useState<{
    text: string;
    range: { start: number; end: number };
  } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Track the last content we received from parent to detect external changes
  const lastExternalContentRef = useRef(content);

  useEffect(() => {
    // Only update if content changed from external source AND no pending changes
    if (content !== lastExternalContentRef.current && !isUpdatingRef.current && !pendingChange) {
      lastExternalContentRef.current = content;
      setLocalContent(content);
    }
  }, [content, pendingChange]);

  // Handle textarea input - simple direct editing
  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    
    isUpdatingRef.current = true;
    setLocalContent(newContent);
    onChange(newContent);
    
    // Clear pending change if user edits manually
    if (pendingChange) {
      setPendingChange(null);
    }
    
    setTimeout(() => {
      isUpdatingRef.current = false;
    }, 100);
  }, [onChange, pendingChange]);

  // Handle selection
  const handleSelect = useCallback(() => {
    if (!editorRef.current) return;
    
    const textarea = editorRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    
    if (start !== end) {
      const selectedText = localContent.substring(start, end);
      
      // Get position for popup
      const rect = textarea.getBoundingClientRect();
      const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 20;
      const textBeforeSelection = localContent.substring(0, start);
      const linesBeforeSelection = textBeforeSelection.split('\n').length;
      
      const popupX = rect.left + rect.width / 2;
      const popupY = rect.top + (linesBeforeSelection * lineHeight) + window.scrollY + 40;
      
      setSelectedTextInfo({ text: selectedText, range: { start, end } });
      setPopupPosition({ x: popupX, y: Math.min(popupY, rect.bottom + window.scrollY) });
      setShowPopup(true);
      
      onSelection(selectedText, { start, end });
    } else if (!showPopup) {
      setSelectedTextInfo(null);
      onSelection('', null);
    }
  }, [localContent, onSelection, showPopup]);

  // Apply AI suggestion directly
  const applyChange = useCallback((startPos: number, endPos: number, newText: string) => {
    const before = localContent.substring(0, startPos);
    const after = localContent.substring(endPos);
    const updatedContent = before + newText + after;
    
    setLocalContent(updatedContent);
    lastExternalContentRef.current = updatedContent;
    onChange(updatedContent);
    
    // Move cursor to end of inserted text
    if (editorRef.current) {
      const newCursorPos = startPos + newText.length;
      setTimeout(() => {
        editorRef.current?.setSelectionRange(newCursorPos, newCursorPos);
        editorRef.current?.focus();
      }, 10);
    }
  }, [localContent, onChange]);

  // Create a pending change for preview
  const createPendingChange = useCallback((startPos: number, endPos: number, newText: string) => {
    const originalText = localContent.substring(startPos, endPos);
    
    setPendingChange({
      id: `change_${Date.now()}`,
      originalText,
      newText,
      range: { start: startPos, end: endPos },
      timestamp: Date.now(),
    });
  }, [localContent]);

  // Accept pending change
  const acceptPendingChange = useCallback(() => {
    if (!pendingChange) return;
    
    applyChange(pendingChange.range.start, pendingChange.range.end, pendingChange.newText);
    setPendingChange(null);
    setShowPopup(false);
    setSelectedTextInfo(null);
  }, [pendingChange, applyChange]);

  // Reject pending change
  const rejectPendingChange = useCallback(() => {
    setPendingChange(null);
    setShowPopup(false);
    setSelectedTextInfo(null);
  }, []);
  
  // Handle selection popup submission
  const handlePopupSubmit = useCallback(async (instruction: string) => {
    if (!selectedTextInfo || !projectId) return;
    
    setIsGenerating(true);
    
    try {
      const fullMessage = `IMPORTANT: Return ONLY the rewritten text. Do NOT include explanations, commentary, or phrases like "here's the rewrite" or "I changed". Just output the final text directly.

Selected text: "${selectedTextInfo.text}"

Instruction: ${instruction}`;
      
      let aiResponse = '';
      const stream = apiService.streamChat({
        message: fullMessage,
        documentContent: localContent,
        selectedText: selectedTextInfo.text,
        purpose: purpose || 'General writing',
        partner: partner || 'Creative Assistant',
        model: selectedModel,
        projectId,
      });
      
      for await (const chunk of stream) {
        aiResponse += chunk;
      }
      
      // Create pending change for preview
      if (aiResponse.trim()) {
        createPendingChange(
          selectedTextInfo.range.start,
          selectedTextInfo.range.end,
          aiResponse.trim()
        );
      }
      
      setShowPopup(false);
    } catch (error) {
      console.error('Error generating AI response:', error);
      alert('Failed to generate AI response. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  }, [selectedTextInfo, projectId, localContent, purpose, partner, selectedModel, createPendingChange]);
  
  const handlePopupClose = useCallback(() => {
    setShowPopup(false);
    setSelectedTextInfo(null);
  }, []);
  
  // Expose applyChange method to parent components
  useEffect(() => {
    (window as any).__editorApplyRevision = (startPos: number, endPos: number, newText: string) => {
      createPendingChange(startPos, endPos, newText);
    };
    
    return () => {
      delete (window as any).__editorApplyRevision;
    };
  }, [createPendingChange]);

  const wordCount = localContent.split(/\s+/).filter(Boolean).length;
  const charCount = localContent.length;

  // Build preview content with inline diff if there's a pending change
  const renderContentWithDiff = () => {
    if (!pendingChange) return null;
    
    const { range, originalText, newText } = pendingChange;
    const before = localContent.substring(0, range.start);
    const after = localContent.substring(range.end);
    
    return (
      <div className="diff-preview">
        <div className="diff-header">
          <span className="diff-title">📝 Proposed Change</span>
          <div className="diff-actions">
            <button 
              className="diff-btn diff-btn--accept" 
              onClick={acceptPendingChange}
              title="Accept this change"
            >
              ✓ Accept
            </button>
            <button 
              className="diff-btn diff-btn--reject" 
              onClick={rejectPendingChange}
              title="Reject this change"
            >
              ✗ Reject
            </button>
          </div>
        </div>
        <div className="diff-content">
          <span className="diff-context">{before.slice(-100)}</span>
          <span className="diff-deleted">{originalText}</span>
          <span className="diff-inserted">{newText}</span>
          <span className="diff-context">{after.slice(0, 100)}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="document-editor">
      <div className="editor-toolbar">
        <div className="toolbar-group">
          <button className="toolbar-btn" title="Bold (Ctrl+B)">
            <strong>B</strong>
          </button>
          <button className="toolbar-btn" title="Italic (Ctrl+I)">
            <em>I</em>
          </button>
          <button className="toolbar-btn" title="Underline (Ctrl+U)">
            <u>U</u>
          </button>
        </div>
        <div className="toolbar-divider"></div>
        <div className="toolbar-group">
          <button className="toolbar-btn" title="Heading 1">
            H1
          </button>
          <button className="toolbar-btn" title="Heading 2">
            H2
          </button>
          <button className="toolbar-btn" title="List">
            ≡
          </button>
        </div>
        <div className="toolbar-spacer"></div>
        <div className="toolbar-info">
          <span>{wordCount} words</span>
          <span className="info-divider">•</span>
          <span>{charCount} chars</span>
        </div>
      </div>
      
      {/* Diff preview for pending changes */}
      {pendingChange && renderContentWithDiff()}
      
      <div className="editor-container">
        <textarea
          ref={editorRef}
          className="editor-textarea"
          value={localContent}
          onChange={handleContentChange}
          onMouseUp={handleSelect}
          onKeyUp={handleSelect}
          spellCheck
          placeholder="Begin writing... Select text and get AI assistance."
        />
      </div>
      
      <div className="editor-hints">
        <span className="hint-item">
          📝 Select text to get AI assistance
        </span>
        <span className="hint-item">
          💡 Changes are saved automatically
        </span>
        {pendingChange && (
          <span className="hint-item hint-item--active">
            ⚡ Pending change - Accept or Reject above
          </span>
        )}
      </div>
      
      {showPopup && selectedTextInfo && !pendingChange && (
        <SelectionPopup
          selectedText={selectedTextInfo.text}
          position={popupPosition}
          onSubmit={handlePopupSubmit}
          onClose={handlePopupClose}
          isLoading={isGenerating}
          editorRef={editorRef as any}
        />
      )}
    </div>
  );
}

export default DocumentEditor;
