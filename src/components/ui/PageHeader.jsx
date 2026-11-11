import React from 'react';

/** En-tête commun à toutes les pages : titre, phrase d'explication, actions. */
export default function PageHeader({ title, lead, actions, children, icon }) {
  return (
    <header className="page-header flex flex-wrap items-center justify-between gap-4 mb-5">
      <div className="page-header-intro min-w-0">
        {icon && <span className="page-header-icon" aria-hidden="true">{icon}</span>}
        <div className="min-w-0">
          <h1 className="page-title">{title}</h1>
          {lead && <p className="page-lead">{lead}</p>}
          {children}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0 flex-wrap">{actions}</div>}
    </header>
  );
}
