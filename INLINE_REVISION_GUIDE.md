# Inline Revision System

## Overview

The Document Editor now includes a **Non-Destructive Inline Revision System** that functions as a visual diff engine. This allows you to see suggested changes inline with the original text, making it easy to compare and decide whether to accept or reject them.

## How It Works

### Visual Diff Engine

When a suggestion is made (either from the AI chat or manually), the system:

1. **Preserves the original text** with a strikethrough style
2. **Shows the new suggestion** highlighted in green, right next to it
3. **Provides inline controls** to accept or reject each change
4. **Maintains context** so both you and the AI can see what was changed

### Key Features

#### 1. Non-Destructive Editing
- Original text is never deleted from the UI until you explicitly accept/reject
- You can see exactly what's being changed before committing
- Multiple revisions can be pending at once

#### 2. Side-by-Side Comparison
- Deleted text appears with strikethrough in red background
- Inserted text appears highlighted in green
- Both versions are visible inline in the document flow

#### 3. Granular Control
- Hover over any change to see accept/reject buttons
- Accept All / Reject All buttons in the toolbar for batch operations
- Each revision is tracked independently

#### 4. AI Context Retention
- The AI can see both original and revised text
- Prevents suggesting the same changes repeatedly
- Helps the AI learn your style preferences

## Using the Revision System

### Enabling Revision Mode

1. Click the **📝** button in the editor toolbar
2. The editor switches from plain text mode to revision mode
3. Any suggestions from the AI chat will now appear as inline revisions

### Making Revisions

#### From AI Suggestions:
1. Select text in the editor
2. Use a quick action in the chat (Improve, Expand, Simplify, Challenge)
3. The AI's suggestion appears as an inline revision
4. Hover over the change to accept or reject it

#### Accepting Changes:
- Click the **✓** button next to a specific revision
- Or click **✓ All** in the toolbar to accept all pending changes
- Accepted changes merge into the document as normal text

#### Rejecting Changes:
- Click the **✗** button next to a specific revision
- Or click **✗ All** in the toolbar to reject all pending changes
- Rejected changes are removed from view

### Switching Back to Plain Mode

1. Click the **📝** button again
2. Any accepted revisions become part of the document
3. Pending revisions can be reviewed before switching modes

## Technical Details

### For AI Agents

When interacting with the revision system, an AI should understand:

```typescript
// Each revision contains:
interface Revision {
  id: string;
  originalSpan: {
    text: string;        // The text being replaced
    startPos: number;    // Position in document
    endPos: number;
  };
  newSpan: {
    text: string;        // The suggested replacement
  };
  status: 'pending' | 'accepted' | 'rejected';
}
```

### Content Representation

In revision mode, the document has two representations:

1. **Final Content**: Only shows accepted changes and unchanged text
   - This is what gets saved to the database
   - Used for word/character counts

2. **Full Context**: Shows all revisions with markers
   - Format: `[DELETED: old text][INSERTED: new text]`
   - Sent to the AI for context awareness

### Visual Markers

- <span style="text-decoration: line-through; color: rgba(239, 68, 68, 0.7); background: rgba(239, 68, 68, 0.1); padding: 0.125rem 0.25rem; border-radius: 3px;">Original text (deleted)</span>
- <span style="background: rgba(34, 197, 94, 0.2); padding: 0.125rem 0.25rem; border-radius: 3px; font-weight: 500; box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.3);">New text (inserted)</span>

## Benefits

### For Writers
- See exactly what's changing before accepting it
- Maintain full control over every edit
- Learn from AI suggestions by comparing versions
- Avoid accidentally losing good phrasing

### For AI
- Context retention prevents redundant suggestions
- Can learn user's style preferences over time
- Sees the "direction" of edits (e.g., user prefers more evocative language)
- Better understanding of what suggestions are accepted vs rejected

## Keyboard Shortcuts

- **Tab**: Accept ghost suggestion (in plain mode)
- **Esc**: Dismiss ghost suggestion
- **Click 📝**: Toggle revision mode
- **Hover**: Show accept/reject controls on revisions

## Implementation Files

- `/src/utils/revisions.ts` - Core revision logic and data structures
- `/src/features/editor/components/InlineRevisionRenderer.tsx` - Visual renderer
- `/src/features/editor/components/InlineRevisionRenderer.css` - Styling
- `/src/features/editor/components/DocumentEditor.tsx` - Updated editor component
