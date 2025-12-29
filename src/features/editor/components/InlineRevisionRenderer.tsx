import { TextSpan, Revision, DocumentWithRevisions, buildTextSpans } from '../../../utils/revisions';
import './InlineRevisionRenderer.css';

interface InlineRevisionRendererProps {
  document: DocumentWithRevisions;
  onAcceptRevision: (revisionId: string) => void;
  onRejectRevision: (revisionId: string) => void;
  onTextClick?: (position: number) => void;
}

/**
 * Renders text with inline revisions showing:
 * - Strikethrough for deleted text
 * - Highlighted for inserted text
 * - Normal rendering for unchanged text
 */
export function InlineRevisionRenderer({
  document,
  onAcceptRevision,
  onRejectRevision,
  onTextClick,
}: InlineRevisionRendererProps) {
  const spans = buildTextSpans(document.baseContent, document.revisions);
  
  // Group consecutive deleted + inserted spans into revision pairs
  const renderElements: JSX.Element[] = [];
  let i = 0;
  
  while (i < spans.length) {
    const span = spans[i];
    
    // Check if this is a deleted span followed by an inserted span (a revision pair)
    if (span.type === 'deleted' && i + 1 < spans.length && spans[i + 1].type === 'inserted') {
      const deletedSpan = span;
      const insertedSpan = spans[i + 1];
      
      // Find the revision that created this pair
      const revision = document.revisions.find(r => 
        r.originalSpan.id === deletedSpan.id && 
        r.newSpan?.id === insertedSpan.id
      );
      
      if (revision) {
        renderElements.push(
          <RevisionPair
            key={revision.id}
            revision={revision}
            deletedSpan={deletedSpan}
            insertedSpan={insertedSpan}
            onAccept={() => onAcceptRevision(revision.id)}
            onReject={() => onRejectRevision(revision.id)}
          />
        );
      }
      
      i += 2; // Skip both the deleted and inserted spans
    } else if (span.type === 'deleted') {
      // Deletion without replacement
      const revision = document.revisions.find(r => r.originalSpan.id === span.id);
      
      if (revision) {
        renderElements.push(
          <RevisionPair
            key={revision.id}
            revision={revision}
            deletedSpan={span}
            insertedSpan={null}
            onAccept={() => onAcceptRevision(revision.id)}
            onReject={() => onRejectRevision(revision.id)}
          />
        );
      }
      
      i++;
    } else {
      // Regular text or standalone insertion
      renderElements.push(
        <TextSpanComponent
          key={span.id}
          span={span}
          onClick={onTextClick}
        />
      );
      i++;
    }
  }
  
  return (
    <div className="inline-revision-renderer">
      <div className="revision-content">
        {renderElements}
      </div>
    </div>
  );
}

/**
 * Renders a single text span
 */
function TextSpanComponent({ 
  span, 
  onClick 
}: { 
  span: TextSpan; 
  onClick?: (position: number) => void;
}) {
  const handleClick = () => {
    if (onClick) {
      onClick(span.startPos);
    }
  };
  
  const className = `text-span text-span--${span.type}`;
  
  return (
    <span className={className} onClick={handleClick}>
      {span.text}
    </span>
  );
}

/**
 * Renders a revision pair (deleted + inserted text) with action buttons
 */
function RevisionPair({
  revision,
  deletedSpan,
  insertedSpan,
  onAccept,
  onReject,
}: {
  revision: Revision;
  deletedSpan: TextSpan;
  insertedSpan: TextSpan | null;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <span className="revision-pair" data-revision-id={revision.id}>
      <span className="revision-content-wrapper">
        <span className="text-span text-span--deleted">
          {deletedSpan.text}
        </span>
        {insertedSpan && (
          <span className="text-span text-span--inserted">
            {insertedSpan.text}
          </span>
        )}
      </span>
      <span className="revision-actions">
        <button
          className="revision-action revision-action--accept"
          onClick={onAccept}
          title="Accept this change"
          aria-label="Accept change"
        >
          ✓
        </button>
        <button
          className="revision-action revision-action--reject"
          onClick={onReject}
          title="Reject this change"
          aria-label="Reject change"
        >
          ✗
        </button>
      </span>
    </span>
  );
}

export default InlineRevisionRenderer;
