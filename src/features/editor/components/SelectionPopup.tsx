import React, { useState, useRef, useEffect } from 'react';
import './SelectionPopup.css';

interface SelectionPopupProps {
  selectedText: string;
  position: { x: number; y: number };
  onSubmit: (instruction: string) => void;
  onClose: () => void;
  isLoading?: boolean;
}

export function SelectionPopup({ 
  selectedText, 
  position, 
  onSubmit, 
  onClose,
  isLoading = false 
}: SelectionPopupProps) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Focus input when popup opens
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    // Close on outside click
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

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

  return (
    <div 
      ref={popupRef}
      className="selection-popup" 
      style={{ 
        left: `${position.x}px`, 
        top: `${position.y}px` 
      }}
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
