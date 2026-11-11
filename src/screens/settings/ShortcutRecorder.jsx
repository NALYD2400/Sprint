import React, { useState, useEffect } from 'react';
import { Keyboard } from 'lucide-react';

export default function ShortcutRecorder({ value, onChange }) {
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    if (!isRecording) return undefined;

    const handleKeyDown = (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        setIsRecording(false);
        return;
      }
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;

      const parts = [];
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');

      if (!e.ctrlKey && !e.altKey) {
        parts.unshift('Ctrl');
      }

      let keyName = e.key.toUpperCase();
      if (keyName === ' ') keyName = 'Space';

      parts.push(keyName);
      onChange(parts.join('+'));
      setIsRecording(false);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isRecording, onChange]);

  const keys = (value || 'Ctrl+Alt+P').split('+');

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => setIsRecording(!isRecording)}
        className={`px-4 py-2 rounded-lg border text-xs font-mono font-semibold transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${
          isRecording
            ? 'theme-accent-active animate-pulse border-white/30'
            : 'bg-white/[0.04] hover:bg-white/[0.08] border-[var(--line)] text-white'
        }`}
      >
        <Keyboard className="w-3.5 h-3.5 theme-accent-text" />
        <span>
          {isRecording
            ? '⌨️ Appuyez sur les touches... (Esc pour annuler)'
            : 'Modifier le raccourci'}
        </span>
      </button>

      {!isRecording && (
        <div className="flex items-center gap-1">
          {keys.map((k, idx) => (
            <kbd
              key={idx}
              className="px-2.5 py-1 rounded-lg bg-black/40 border border-[var(--line-strong)] text-xs font-mono font-semibold theme-accent-text"
            >
              {k}
            </kbd>
          ))}
        </div>
      )}
    </div>
  );
}
