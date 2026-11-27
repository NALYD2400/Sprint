import React from 'react';
import { Keyboard, BookOpen } from 'lucide-react';

const SHORTCUTS = [
  { keys: ['Ctrl', 'K'], label: 'Rechercher un projet, une page ou une action' },
  { keys: ['Ctrl', '1…5'], label: 'Aller à Tableau de bord, Projets, Aperçu web, Ports, Logs' },
  { keys: ['Ctrl', ','], label: 'Ouvrir les paramètres' },
  { keys: ['Ctrl', 'N'], label: 'Ajouter un projet' },
  { keys: ['Ctrl', 'B'], label: 'Réduire ou agrandir le menu' },
  { keys: ['?'], label: 'Afficher cette aide' },
  { keys: ['Échap'], label: 'Fermer la fenêtre ouverte' },
];

const GLOSSARY = [
  ['Projet', 'Un dossier de votre ordinateur : un site, une application, un outil.'],
  ['Serveur', 'Un programme lancé par une commande (par exemple npm run dev) qui fait tourner votre projet.'],
  ['Port', 'Le numéro de « porte » par lequel un serveur répond, par exemple 3000. Deux serveurs ne peuvent pas utiliser la même.'],
  ['Logs', 'Les messages qu’un serveur écrit en direct : utile pour comprendre une erreur.'],
  ['Aperçu web', 'Une fenêtre pour voir votre projet comme sur un ordinateur, une tablette ou un téléphone.'],
];

export default function HelpContent() {
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
