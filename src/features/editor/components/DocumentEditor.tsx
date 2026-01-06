import React, { useState, useRef, useCallback, useEffect } from 'react';
import { 
  DocumentWithRevisions, 
  createRevision, 
  acceptAllRevisions,
  rejectAllRevisions,
  getFinalContent,
  buildTextSpans
} from '../../../utils/revisions';
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

function DocumentEditor({ content, onChange, onSelection, purpose, selectedModel, projectId, partner }: DocumentEditorProps) {
  const [localContent, setLocalContent] = useState(content);
  const editorRef = useRef<HTMLDivElement>(null);
  const isUpdatingRef = useRef(false);
  
  // Revision state
  const [revisionDoc, setRevisionDoc] = useState<DocumentWithRevisions>({
    baseContent: content,
    revisions: [],
    activeRevisionId: null,
  });
  
  // Selection popup state
  const [showPopup, setShowPopup] = useState(false);
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
  const [selectedTextInfo, setSelectedTextInfo] = useState<{
    text: string;
    range: { start: number; end: number };
  } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

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
  // const generateGhostSuggestion = useCallback(async (text: string, cursorPosition: number) => {
  //   const textBeforeCursor = text.substring(0, cursorPosition);
  //   const words = textBeforeCursor.split(/\s+/);
  //   const contextWords = words.slice(-2000);
  //   const contextText = contextWords.join(' ');
  //   
  //   const lastChar = textBeforeCursor[textBeforeCursor.length - 1];
  //   if (lastChar && !/[\s.,;!?]/.test(lastChar)) {
  //     return null;
  //   }
  //   
  //   if (!projectId) {
  //     return null;
  //   }
  //   
  //   try {
  //     const suggestion = await apiService.getGhostSuggestion({
  //       text: contextText,
  //       cursorPosition: contextText.length,
  //       purpose,
  //       model: selectedModel,
  //       projectId,
  //     });
  //     
  //     if (suggestion && suggestion.trim()) {
  //       return {
  //         text: suggestion,
  //         position: cursorPosition,
  //       };
  //     }
  //   } catch (error) {
  //     console.error('Ghost suggestion error:', error);
  //   }
  //   return null;
  // }, [purpose, selectedModel, projectId]);

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
    
    const selectedText = selection.toString().trim();
    if (selectedText && selectedText.length > 0) {
      const range = selection.getRangeAt(0);
      
      // Calculate position for popup
      const rect = range.getBoundingClientRect();
      const popupX = rect.left + (rect.width / 2);
      const popupY = rect.bottom + window.scrollY + 8;
      
      // Calculate position in document
      const preSelectionRange = range.cloneRange();
      preSelectionRange.selectNodeContents(editorRef.current);
      preSelectionRange.setEnd(range.startContainer, range.startOffset);
      const start = preSelectionRange.toString().length;
      const end = start + selectedText.length;
      
      setSelectedTextInfo({ text: selectedText, range: { start, end } });
      setPopupPosition({ x: popupX, y: popupY });
      setShowPopup(true);
      
      onSelection(selectedText, { start, end });
    } else if (!showPopup) {
      setSelectedTextInfo(null);
      onSelection('', null);
    }
  }, [onSelection, showPopup]);

  // Revision handlers
  const handleAcceptRevision = useCallback((revisionId: string) => {
    const revision = revisionDoc.revisions.find(r => r.id === revisionId);
    if (!revision || !editorRef.current) return;
    
    // Simple: apply the change to base content
    const before = revisionDoc.baseContent.substring(0, revision.originalSpan.startPos);
    const after = revisionDoc.baseContent.substring(revision.originalSpan.endPos);
    const newText = revision.newSpan?.text || '';
    const newContent = before + newText + after;
    
    // Remove this revision from the list
    const updated = {
      ...revisionDoc,
      baseContent: newContent,
      revisions: revisionDoc.revisions.filter(r => r.id !== revisionId),
    };
    
    setRevisionDoc(updated);
    onChange(newContent);
    
    // Update editor using the updated doc, not stale closure
    if (updated.revisions.length === 0) {
      editorRef.current.textContent = newContent;
    } else {
      const spans = buildTextSpans(updated.baseContent, updated.revisions);
      editorRef.current.innerHTML = spans.map((span) => {
        const escapedText = span.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        if (span.type === 'deleted') {
          return `<span class="text-span text-span--deleted" contenteditable="false">${escapedText}</span>`;
        } else if (span.type === 'inserted') {
          const revision = updated.revisions.find(r => r.newSpan?.id === span.id);
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
    }
  }, [revisionDoc, onChange]);
  
  const handleRejectRevision = useCallback((revisionId: string) => {
    if (!editorRef.current) return;
    
    // Simple: just remove the revision
    const updated = {
      ...revisionDoc,
      revisions: revisionDoc.revisions.filter(r => r.id !== revisionId),
    };
    
    setRevisionDoc(updated);
    
    // Update editor using the updated doc, not stale closure
    if (editorRef.current) {
      if (updated.revisions.length === 0) {
        editorRef.current.textContent = updated.baseContent;
      } else {
        const spans = buildTextSpans(updated.baseContent, updated.revisions);
        editorRef.current.innerHTML = spans.map((span) => {
          const escapedText = span.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          
          if (span.type === 'deleted') {
            return `<span class="text-span text-span--deleted" contenteditable="false">${escapedText}</span>`;
          } else if (span.type === 'inserted') {
            const revision = updated.revisions.find(r => r.newSpan?.id === span.id);
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
      }
    }
  }, [revisionDoc]);
  
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
    
    // Create revision using the CURRENT baseContent, not the editor's display content
    const revision = createRevision(revisionDoc.baseContent, startPos, endPos, newText);
    
    const updatedDoc = {
      ...revisionDoc,
      // NEVER modify baseContent when adding a revision - it stays unchanged!
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
      
      // Apply the AI's response as a revision
      if (aiResponse.trim()) {
        applyRevision(
          selectedTextInfo.range.start,
          selectedTextInfo.range.end,
          aiResponse.trim()
        );
      }
      
      setShowPopup(false);
      setSelectedTextInfo(null);
    } catch (error) {
      console.error('Error generating AI response:', error);
      alert('Failed to generate AI response. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  }, [selectedTextInfo, projectId, localContent, purpose, partner, selectedModel, applyRevision]);
  
  const handlePopupClose = useCallback(() => {
    setShowPopup(false);
    setSelectedTextInfo(null);
  }, []);
  
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
        <span className="hint-item">
          Select text to get AI assistance
        </span>
      </div>
      
      {showPopup && selectedTextInfo && (
        <SelectionPopup
          selectedText={selectedTextInfo.text}
          position={popupPosition}
          onSubmit={handlePopupSubmit}
          onClose={handlePopupClose}
          isLoading={isGenerating}
          editorRef={editorRef}
        />
      )}
    </div>
  );
}

export default DocumentEditor;
