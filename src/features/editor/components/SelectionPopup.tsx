import React, { useState, useRef, useEffect } from 'react';
import './SelectionPopup.css';

interface SelectionPopupProps {
  selectedText: string;
  position: { x: number; y: number };
  onSubmit: (instruction: string) => void;
  onClose: () => void;
  isLoading?: boolean;
  editorRef?: React.RefObject<HTMLDivElement>;
}

export function SelectionPopup({ 
  selectedText, 
  position, 
  onSubmit, 
  onClose,
  isLoading = false,
  editorRef
}: SelectionPopupProps) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [popupPosition, setPopupPosition] = useState(position);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Update position when prop changes
  useEffect(() => {
    setPopupPosition(position);
  }, [position]);

  // Handle dragging
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setPopupPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  useEffect(() => {
    // Close on outside click (but not on editor)
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const clickedInPopup = popupRef.current?.contains(target);
      const clickedInEditor = editorRef?.current?.contains(target);
      
      if (!clickedInPopup && !clickedInEditor) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose, editorRef]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSubmit(input.trim());
      setInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only allow dragging from the header
    const target = e.target as HTMLElement;
    if (!target.closest('.selection-popup__header')) return;
    if (target.closest('.selection-popup__close')) return;

    const rect = popupRef.current?.getBoundingClientRect();
    if (rect) {
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
      setIsDragging(true);
    }
  };

  return (
    <div 
      ref={popupRef}
      className="selection-popup" 
      style={{ 
        left: `${popupPosition.x}px`, 
        top: `${popupPosition.y}px` 
      }}
      onMouseDown={handleMouseDown}
    >
      <div className="selection-popup__header">
        <div className="selection-popup__selected-text">
          "{selectedText.length > 50 ? selectedText.slice(0, 50) + '...' : selectedText}"
        </div>
        <button 
          className="selection-popup__close" 
          onClick={onClose}
          type="button"
          disabled={isLoading}
        >
          ×
        </button>
      </div>
      
      <form onSubmit={handleSubmit} className="selection-popup__form">
        <textarea
          ref={inputRef}
          className="selection-popup__input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What would you like to do with this text? (e.g., 'describe Tom's physique and rewrite the sentence')"
          rows={3}
          disabled={isLoading}
        />
        
        <div className="selection-popup__actions">
          <button 
            type="submit" 
            className="selection-popup__submit"
            disabled={!input.trim() || isLoading}
          >
            {isLoading ? (
              <>
                <span className="selection-popup__spinner"></span>
                Generating...
              </>
            ) : (
              'Generate'
            )}
          </button>
          <div className="selection-popup__hint">
            Press Enter to submit, Shift+Enter for new line
          </div>
        </div>
      </form>
    </div>
  );
}
