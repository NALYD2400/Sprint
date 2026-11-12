import React from 'react';
import { PageLogo } from '../layout/SprintNavIcon';

export default function EmptyState({ icon: Icon, mark, title, description, command, children, className = '' }) {
  return (
    <div className={'empty-state-panel ' + className}>
      {mark ? <PageLogo name={mark} /> : Icon && <Icon size={24} aria-hidden="true" />}
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {command && <code title={command}>{command}</code>}
      {children}
    </div>
  );
}
