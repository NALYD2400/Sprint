import React, { useEffect, useRef, useState } from 'react';
import { Copy, Download } from 'lucide-react';
import { SKILL_MARKDOWN } from '../../services/assistantSkill';
import { triggerToast } from '../../services/toastBus';


export default function AssistantSettings() {
  const [copiedSkill, setCopiedSkill] = useState(false);
  const copiedTimer = useRef(null);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  const handleDownloadSkill = () => {
    const url = URL.createObjectURL(new Blob([SKILL_MARKDOWN], { type: 'text/markdown' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'SKILL.md';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleCopySkill = async () => {
    try {
      await navigator.clipboard.writeText(SKILL_MARKDOWN);
      setCopiedSkill(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopiedSkill(false), 2000);
    } catch (error) {
      triggerToast({ title: 'Copie impossible', message: String(error), type: 'error' });
    }
  };

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
