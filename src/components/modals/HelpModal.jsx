import React from 'react';
import { X } from 'lucide-react';
import Modal from '../ui/Modal';
import HelpContent from './HelpContent';

export default function HelpModal({ isOpen, onClose }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="max-w-2xl" labelledBy="help-title">
      <div className="p-6 max-h-[80vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="help-title" className="text-lg font-semibold text-zinc-50">Aide et raccourcis</h2>
            <p className="text-[13px] text-zinc-400 mt-1">Tout ce qu’il faut pour aller vite, sans rien apprendre par cœur.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-100 hover:bg-white/[0.06] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <HelpContent />
      </div>
    </Modal>
  );
}
