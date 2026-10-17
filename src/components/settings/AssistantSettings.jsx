import React from 'react';
import { Copy, Download } from 'lucide-react';
import { SKILL_MARKDOWN } from '../../services/assistantSkill';


export default function AssistantSettings({ copiedSkill, handleCopySkill, handleDownloadSkill }) {
  return (
    <>
      <p className="settings-help">
        Le skill Sprint permet à votre assistant de configurer les projets et leurs
        commandes.
      </p>
      <div className="flex gap-2 flex-wrap mt-4">
        <button className="btn" onClick={handleCopySkill}>
          <Copy size={14} />
          {copiedSkill ? 'Copié' : 'Copier le skill'}
        </button>
        <button className="btn" onClick={handleDownloadSkill}>
          <Download size={14} />
          Télécharger
        </button>
      </div>
      <details className="skill-details">
        <summary>Voir le contenu du skill</summary>
        <pre>{SKILL_MARKDOWN}</pre>
      </details>
    </>
  );
}
