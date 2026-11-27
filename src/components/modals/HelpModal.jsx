import React from 'react';
import { X } from 'lucide-react';
import Modal from '../ui/Modal';
import SprintNavIcon from '../layout/SprintNavIcon';
import HelpContent from './HelpContent';

export default function HelpModal({ isOpen, onClose }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="max-w-2xl" labelledBy="help-title">
      <div className="p-6 max-h-[80vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="page-header-icon" aria-hidden="true">
              <SprintNavIcon name="help" active />
            </span>
            <div>
              <h2 id="help-title" className="text-lg font-semibold text-[var(--text-hi)]">Aide et raccourcis</h2>
              <p className="text-[13px] text-[var(--text-mid)] mt-0.5">Tout ce qu’il faut pour aller vite, sans rien apprendre par cœur.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-mid)] hover:text-[var(--text-hi)] hover:bg-[var(--surface-3)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <HelpContent />
      </div>
    </Modal>
  );
}
