import React from 'react';
import { X, Keyboard, BookOpen } from 'lucide-react';
import Modal from '../ui/Modal';

const SHORTCUTS = [
  { keys: ['Ctrl', 'K'], label: 'Rechercher un projet, une page ou une action' },
  { keys: ['Ctrl', '1…5'], label: 'Aller à Accueil, Projets, Aperçu, Connexions, Journal' },
  { keys: ['Ctrl', ','], label: 'Ouvrir les réglages' },
  { keys: ['Ctrl', 'N'], label: 'Ajouter un projet' },
  { keys: ['Ctrl', 'B'], label: 'Réduire ou agrandir le menu' },
  { keys: ['?'], label: 'Afficher cette aide' },
  { keys: ['Échap'], label: 'Fermer la fenêtre ouverte' },
];

const GLOSSARY = [
  ['Projet', 'Un dossier de votre ordinateur : un site, une application, un outil.'],
  ['Serveur', 'Un programme lancé par une commande (par exemple npm run dev) qui fait tourner votre projet.'],
  ['Port', 'Le numéro de « porte » par lequel un serveur répond, par exemple 3000. Deux serveurs ne peuvent pas utiliser la même.'],
  ['Journal', 'Les messages qu’un serveur écrit en direct : utile pour comprendre une erreur.'],
  ['Aperçu', 'Une fenêtre pour voir votre projet comme sur un ordinateur, une tablette ou un téléphone.'],
];

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

export function HelpContent() {
  return (
    <>
        <h3 className="mt-6 flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <Keyboard className="w-4 h-4 text-zinc-500" /> Raccourcis clavier
        </h3>
        <ul className="mt-3 divide-y divide-[var(--line)] rounded-xl border border-[var(--line)]">
          {SHORTCUTS.map((s) => (
            <li key={s.label} className="flex items-center justify-between gap-4 px-4 py-2.5">
              <span className="text-[13px] text-zinc-300">{s.label}</span>
              <span className="flex items-center gap-1 shrink-0">
                {s.keys.map((k) => (
                  <kbd key={k} className="key">{k}</kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>

        <h3 className="mt-6 flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <BookOpen className="w-4 h-4 text-zinc-500" /> Les mots utilisés dans Sprint
        </h3>
        <dl className="mt-3 space-y-3">
          {GLOSSARY.map(([term, def]) => (
            <div key={term}>
              <dt className="text-[13px] font-medium text-zinc-100">{term}</dt>
              <dd className="text-[13px] text-zinc-400 leading-relaxed">{def}</dd>
            </div>
          ))}
        </dl>
    </>
  );
}
