import React, { useState, useRef, useCallback, useEffect } from 'react';
import { apiService } from '../../../services/api';
import { 
  DocumentWithRevisions, 
  createRevision, 
  acceptRevision, 
  rejectRevision,
  acceptAllRevisions,
  rejectAllRevisions,
  getFinalContent,
  buildTextSpans
} from '../../../utils/revisions';
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

interface GhostSuggestion {
  text: string;
  position: number;
}

function DocumentEditor({ content, onChange, onSelection, purpose, selectedModel, projectId, partner: _partner }: DocumentEditorProps) {
  const [localContent, setLocalContent] = useState(content);
  const [ghostSuggestion, setGhostSuggestion] = useState<GhostSuggestion | null>(null);
  const [isComposing, setIsComposing] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const ghostTimeoutRef = useRef<number | null>(null);
  const isUpdatingRef = useRef(false);
  
  // Revision state
  const [revisionDoc, setRevisionDoc] = useState<DocumentWithRevisions>({
    baseContent: content,
    revisions: [],
    activeRevisionId: null,
  });

  useEffect(() => {
    // Only update if content changed from external source
    if (content !== localContent && !isUpdatingRef.current) {
      setLocalContent(content);
      setRevisionDoc(prev => ({
        ...prev,
        baseContent: content,
      }));
      
      // Update editor only if there are no revisions
      if (editorRef.current && revisionDoc.revisions.length === 0) {
        editorRef.current.textContent = content;
      }
    }
  }, [content, localContent]);

  // Generate ghost suggestion (disabled in revision mode for now)
  const generateGhostSuggestion = useCallback(async (text: string, cursorPosition: number) => {
    const textBeforeCursor = text.substring(0, cursorPosition);
    const words = textBeforeCursor.split(/\s+/);
    const contextWords = words.slice(-2000);
    const contextText = contextWords.join(' ');
    
    const lastChar = textBeforeCursor[textBeforeCursor.length - 1];
    if (lastChar && !/[\s.,;!?]/.test(lastChar)) {
      return null;
    }
    
    if (!projectId) {
      return null;
    }
    
    try {
      const suggestion = await apiService.getGhostSuggestion({
        text: contextText,
        cursorPosition: contextText.length,
        purpose,
        model: selectedModel,
        projectId,
      });
      
      if (suggestion && suggestion.trim()) {
        return {
          text: suggestion,
          position: cursorPosition,
        };
      }
    } catch (error) {
      console.error('Ghost suggestion error:', error);
    }
    return null;
  }, [purpose, selectedModel, projectId]);

  // Build HTML string for contenteditable with inline revisions
  const buildEditorHTML = useCallback(() => {
    const spans = buildTextSpans(revisionDoc.baseContent, revisionDoc.revisions);
    
    return spans.map((span) => {
      const escapedText = span.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      
      if (span.type === 'deleted') {
        return `<span class="text-span text-span--deleted" contenteditable="false">${escapedText}</span>`;
      } else if (span.type === 'inserted') {
        const revision = revisionDoc.revisions.find(r => r.newSpan?.id === span.id);
        const buttons = revision 
          ? `<span class="revision-actions" contenteditable="false">
               <button class="revision-action revision-action--accept" data-revision-id="${revision.id}" data-action="accept">✓</button>
               <button class="revision-action revision-action--reject" data-revision-id="${revision.id}" data-action="reject">✗</button>
             </span>`
          : '';
        return `<span class="text-span text-span--inserted" contenteditable="false">${escapedText}${buttons}</span>`;
      } else {
        return escapedText;
      }
    }).join('');
  }, [revisionDoc]);

  // Handle content editable input
  const handleContentInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    const newText = e.currentTarget.textContent || '';
    
    isUpdatingRef.current = true;
    
    // Only update base content if there are no pending revisions
    if (revisionDoc.revisions.length === 0) {
      setLocalContent(newText);
      setRevisionDoc(prev => ({
        ...prev,
        baseContent: newText,
      }));
      onChange(newText);
    }
    
    setTimeout(() => {
      isUpdatingRef.current = false;
    }, 100);
  }, [revisionDoc.revisions.length, onChange]);

  // Handle clicks on revision action buttons
  const handleEditorClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('revision-action')) {
      e.preventDefault();
      const revisionId = target.getAttribute('data-revision-id');
      const action = target.getAttribute('data-action');
      
      if (revisionId && action === 'accept') {
        handleAcceptRevision(revisionId);
      } else if (revisionId && action === 'reject') {
        handleRejectRevision(revisionId);
      }
    }
  }, []);

  // Handle selection
  const handleSelect = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || !editorRef.current) return;
    
    const selectedText = selection.toString();
    if (selectedText) {
      // Calculate position in the document
      const range = selection.getRangeAt(0);
      const preSelectionRange = range.cloneRange();
      preSelectionRange.selectNodeContents(editorRef.current);
      preSelectionRange.setEnd(range.startContainer, range.startOffset);
      const start = preSelectionRange.toString().length;
      const end = start + selectedText.length;
      
      onSelection(selectedText, { start, end });
    } else {
      onSelection('', null);
    }
  }, [onSelection]);

  // Revision handlers
  const handleAcceptRevision = useCallback((revisionId: string) => {
    const updated = acceptRevision(revisionDoc, revisionId);
    setRevisionDoc(updated);
    const finalContent = getFinalContent(updated);
    onChange(finalContent);
    
    // Update editor with final content (no more revisions for this one)
    if (editorRef.current) {
      if (updated.revisions.length === 0) {
        // No more revisions - back to plain text
        editorRef.current.textContent = finalContent;
      } else {
        // Still have other revisions - rebuild HTML
        const html = buildEditorHTML();
        editorRef.current.innerHTML = html;
      }
      
      // Put cursor at end
      setTimeout(() => {
        if (editorRef.current) {
          editorRef.current.focus();
          const range = document.createRange();
          const sel = window.getSelection();
          range.selectNodeContents(editorRef.current);
          range.collapse(false);
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      }, 0);
    }
  }, [revisionDoc, onChange, buildEditorHTML]);
  
  const handleRejectRevision = useCallback((revisionId: string) => {
    const updated = rejectRevision(revisionDoc, revisionId);
    setRevisionDoc(updated);
    
    // Update editor
    if (editorRef.current) {
      const finalContent = getFinalContent(updated);
      
      if (updated.revisions.length === 0) {
        // No more revisions
        editorRef.current.textContent = finalContent;
      } else {
        // Still have revisions
        const html = buildEditorHTML();
        editorRef.current.innerHTML = html;
      }
      
      setTimeout(() => {
        if (editorRef.current) {
          editorRef.current.focus();
        }
      }, 0);
    }
  }, [revisionDoc, buildEditorHTML]);
  
  const handleAcceptAll = useCallback(() => {
    const updated = acceptAllRevisions(revisionDoc);
    setRevisionDoc(updated);
    const finalContent = getFinalContent(updated);
    onChange(finalContent);
    
    // Force re-render
    if (editorRef.current) {
      editorRef.current.innerHTML = buildEditorHTML();
    }
  }, [revisionDoc, onChange, buildEditorHTML]);
  
  const handleRejectAll = useCallback(() => {
    const updated = rejectAllRevisions(revisionDoc);
    setRevisionDoc(updated);
    
    // Force re-render
    if (editorRef.current) {
      editorRef.current.innerHTML = buildEditorHTML();
    }
  }, [revisionDoc, buildEditorHTML]);
  
  // Public API to apply a revision from outside (e.g., from AI chat)
  const applyRevision = useCallback((startPos: number, endPos: number, newText: string) => {
    if (!editorRef.current) return;
    
    const content = editorRef.current.textContent || '';
    const revision = createRevision(content, startPos, endPos, newText);
    
    const updatedDoc = {
      ...revisionDoc,
      baseContent: content,
      revisions: [...revisionDoc.revisions, revision],
      activeRevisionId: revision.id,
    };
    
    setRevisionDoc(updatedDoc);
    
    // Update editor display with revisions
    const html = buildTextSpans(updatedDoc.baseContent, updatedDoc.revisions).map((span) => {
      const escapedText = span.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      
      if (span.type === 'deleted') {
        return `<span class="text-span text-span--deleted" contenteditable="false">${escapedText}</span>`;
      } else if (span.type === 'inserted') {
        const rev = updatedDoc.revisions.find(r => r.newSpan?.id === span.id);
        const buttons = rev 
          ? `<span class="revision-actions" contenteditable="false">
               <button class="revision-action revision-action--accept" data-revision-id="${rev.id}" data-action="accept">✓</button>
               <button class="revision-action revision-action--reject" data-revision-id="${rev.id}" data-action="reject">✗</button>
             </span>`
          : '';
        return `<span class="text-span text-span--inserted" contenteditable="false">${escapedText}${buttons}</span>`;
      } else {
        return escapedText;
      }
    }).join('');
    
    editorRef.current.innerHTML = html;
  }, [revisionDoc]);
  
  // Expose applyRevision method to parent components
  useEffect(() => {
    (window as any).__editorApplyRevision = applyRevision;
    
    return () => {
      delete (window as any).__editorApplyRevision;
    };
  }, [applyRevision]);

  // Initialize editor content on mount
  useEffect(() => {
    if (editorRef.current && !editorRef.current.textContent) {
      editorRef.current.textContent = content;
    }
  }, []);

  const finalContent = getFinalContent(revisionDoc);
  const wordCount = finalContent.split(/\s+/).filter(Boolean).length;
  const charCount = finalContent.length;
  const pendingRevisions = revisionDoc.revisions.filter(r => r.status === 'pending').length;

  return (
    <div className="document-editor">
      <div className="editor-toolbar">
        <div className="toolbar-group">
          {pendingRevisions > 0 && (
            <>
              <button 
                className="toolbar-btn toolbar-btn--success" 
                onClick={handleAcceptAll}
                title="Accept all changes"
              >
                ✓ All
              </button>
              <button 
                className="toolbar-btn toolbar-btn--danger" 
                onClick={handleRejectAll}
                title="Reject all changes"
              >
                ✗ All
              </button>
              <div className="toolbar-divider"></div>
            </>
          )}
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
          {pendingRevisions > 0 && (
            <>
              <span className="info-divider">•</span>
              <span className="pending-revisions">{pendingRevisions} changes</span>
            </>
          )}
        </div>
      </div>
      
      <div className="editor-container">
        <div
          ref={editorRef}
          className="editor-contenteditable"
          contentEditable={true}
          onInput={handleContentInput}
          onClick={handleEditorClick}
          onMouseUp={handleSelect}
          onKeyUp={handleSelect}
          suppressContentEditableWarning
          spellCheck
          data-placeholder="Begin writing... The membrane will learn your patterns."
        />
      </div>
      
      <div className="editor-hints">
        <span className="hint-item">
          <span style={{ textDecoration: 'line-through', color: 'rgba(239, 68, 68, 0.7)' }}>Deleted</span>
        </span>
        <span className="hint-item">
          <span style={{ background: 'rgba(34, 197, 94, 0.2)', padding: '0 0.25rem', borderRadius: '3px' }}>Inserted</span>
        </span>
        <span className="hint-item">
          Click ✓ or ✗ to accept/reject changes
        </span>
      </div>
    </div>
  );
}

export default DocumentEditor;
