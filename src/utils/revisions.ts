/**
 * Inline Revision System
 * Non-destructive text editing with visual diff capabilities
 */

export interface TextSpan {
  id: string;
  type: 'original' | 'deleted' | 'inserted' | 'unchanged';
  text: string;
  startPos: number;
  endPos: number;
}

export interface Revision {
  id: string;
  originalSpan: TextSpan;
  newSpan: TextSpan | null;
  status: 'pending' | 'accepted' | 'rejected';
  timestamp: number;
}

export interface DocumentWithRevisions {
  baseContent: string;
  revisions: Revision[];
  activeRevisionId: string | null;
}

/**
 * Generate a unique ID for revisions
 */
export function generateRevisionId(): string {
  return `rev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Apply a revision to text: mark original as deleted, insert new text
 */
export function createRevision(
  content: string,
  startPos: number,
  endPos: number,
  newText: string
): Revision {
  const originalText = content.substring(startPos, endPos);
  
  return {
    id: generateRevisionId(),
    originalSpan: {
      id: generateRevisionId(),
      type: 'deleted',
      text: originalText,
      startPos,
      endPos,
    },
    newSpan: newText ? {
      id: generateRevisionId(),
      type: 'inserted',
      text: newText,
      startPos,
      endPos: startPos, // Insertions don't replace range
    } : null,
    status: 'pending',
    timestamp: Date.now(),
  };
}

/**
 * Build a flat list of text spans from base content + revisions
 * This is what the UI will render
 */
export function buildTextSpans(
  baseContent: string,
  revisions: Revision[]
): TextSpan[] {
  const spans: TextSpan[] = [];
  const sortedRevisions = [...revisions].sort((a, b) => 
    a.originalSpan.startPos - b.originalSpan.startPos
  );
  
  let currentPos = 0;
  
  for (const revision of sortedRevisions) {
    if (revision.status === 'rejected') continue;
    
    // Add unchanged text before this revision
    if (currentPos < revision.originalSpan.startPos) {
      spans.push({
        id: generateRevisionId(),
        type: 'unchanged',
        text: baseContent.substring(currentPos, revision.originalSpan.startPos),
        startPos: currentPos,
        endPos: revision.originalSpan.startPos,
      });
    }
    
    if (revision.status === 'accepted') {
      // Only show the new text for accepted revisions
      if (revision.newSpan) {
        spans.push({
          ...revision.newSpan,
          type: 'unchanged', // Accepted changes become "normal" text
        });
      }
      currentPos = revision.originalSpan.endPos;
    } else {
      // Show both old (strikethrough) and new (highlighted) for pending revisions
      spans.push({
        ...revision.originalSpan,
        type: 'deleted',
      });
      
      if (revision.newSpan) {
        spans.push({
          ...revision.newSpan,
          type: 'inserted',
        });
      }
      
      currentPos = revision.originalSpan.endPos;
    }
  }
  
  // Add any remaining unchanged text
  if (currentPos < baseContent.length) {
    spans.push({
      id: generateRevisionId(),
      type: 'unchanged',
      text: baseContent.substring(currentPos),
      startPos: currentPos,
      endPos: baseContent.length,
    });
  }
  
  return spans;
}

/**
 * Accept a revision: merge the new text into base content
 */
export function acceptRevision(
  doc: DocumentWithRevisions,
  revisionId: string
): DocumentWithRevisions {
  const revision = doc.revisions.find(r => r.id === revisionId);
  if (!revision) return doc;
  
  const updatedRevisions = doc.revisions.map(r =>
    r.id === revisionId ? { ...r, status: 'accepted' as const } : r
  );
  
  // Rebuild base content by applying all accepted revisions
  const baseContent = applyAcceptedRevisions(doc.baseContent, updatedRevisions);
  
  return {
    ...doc,
    baseContent,
    revisions: updatedRevisions.filter(r => r.status !== 'accepted'),
  };
}

/**
 * Reject a revision: keep original text, remove the revision
 */
export function rejectRevision(
  doc: DocumentWithRevisions,
  revisionId: string
): DocumentWithRevisions {
  return {
    ...doc,
    revisions: doc.revisions.filter(r => r.id !== revisionId),
  };
}

/**
 * Apply all accepted revisions to base content
 */
function applyAcceptedRevisions(baseContent: string, revisions: Revision[]): string {
  const accepted = revisions
    .filter(r => r.status === 'accepted')
    .sort((a, b) => b.originalSpan.startPos - a.originalSpan.startPos); // Reverse order
  
  let result = baseContent;
  
  for (const revision of accepted) {
    const before = result.substring(0, revision.originalSpan.startPos);
    const after = result.substring(revision.originalSpan.endPos);
    const newText = revision.newSpan?.text || '';
    result = before + newText + after;
  }
  
  return result;
}

/**
 * Get plain text content (final output) from document with revisions
 */
export function getFinalContent(doc: DocumentWithRevisions): string {
  const spans = buildTextSpans(doc.baseContent, doc.revisions);
  return spans
    .filter(span => span.type !== 'deleted')
    .map(span => span.text)
    .join('');
}

/**
 * Get content including deleted text (for AI context)
 */
export function getFullContextContent(doc: DocumentWithRevisions): string {
  const spans = buildTextSpans(doc.baseContent, doc.revisions);
  return spans.map(span => {
    if (span.type === 'deleted') {
      return `[DELETED: ${span.text}]`;
    } else if (span.type === 'inserted') {
      return `[INSERTED: ${span.text}]`;
    }
    return span.text;
  }).join('');
}

/**
 * Accept all pending revisions at once
 */
export function acceptAllRevisions(doc: DocumentWithRevisions): DocumentWithRevisions {
  let result = doc;
  for (const revision of doc.revisions) {
    if (revision.status === 'pending') {
      result = acceptRevision(result, revision.id);
    }
  }
  return result;
}

/**
 * Reject all pending revisions at once
 */
export function rejectAllRevisions(doc: DocumentWithRevisions): DocumentWithRevisions {
  return {
    ...doc,
    revisions: doc.revisions.filter(r => r.status !== 'pending'),
  };
}
