import React from 'react';
import {
  Settings,
  Download,
} from 'lucide-react';

import { NAV_ITEMS } from '../../lib/navigation';
import SprintNavIcon from './SprintNavIcon';

const brandedItems = new Set(['dashboard', 'projects', 'browser', 'ports', 'terminal', 'settings']);

function NavLabel({ children, className = '' }) {
  return <span className={`nav-label ${className}`}>{children}</span>;
}

function NavButton({ item, isActive, onClick, collapsed, badge, shortcut }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
      aria-label={collapsed ? item.label : undefined}
      title={collapsed ? `${item.label}${shortcut ? ` (Ctrl+${shortcut})` : ''}` : item.hint}
      className={`nav-row relative w-full flex items-center h-10 rounded-lg text-sm cursor-pointer gap-3 px-3 ${
        isActive
          ? 'font-medium'
          : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.05]'
      }`}
    >
      {brandedItems.has(item.id) ? (
        <SprintNavIcon name={item.id} active={isActive} />
      ) : (
        <Icon className="w-[18px] h-[18px] shrink-0" strokeWidth={1.75} />
      )}
      <NavLabel className="flex-1 text-left">{item.label}</NavLabel>
      {!collapsed && badge ? (
        <span className="min-w-5 h-5 px-1.5 rounded-full text-[12px] font-medium bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
          {badge}
        </span>
      ) : null}
      {collapsed && badge ? (
        <span
          className="absolute top-1.5 right-2 w-2 h-2 rounded-full bg-emerald-400"
          aria-hidden="true"
        />
      ) : null}
    </button>
  );
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  onOpenUpdateModal,
  updateAvailable,
  collapsed,
  onToggleCollapsed,
}) {
  return (
    <aside
      className={`sidebar-shell ${collapsed ? 'is-collapsed' : ''} shrink-0 min-h-0 overflow-x-hidden overflow-y-auto pt-2 pb-3 flex flex-col justify-between gap-4 select-none z-10`}
      aria-label="Navigation principale"
    >
      <div className="sidebar-primary shrink-0">
        <nav className="sidebar-navigation" aria-label="Pages">
          {NAV_ITEMS.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              isActive={activeTab === item.id}
              onClick={() => setActiveTab(item.id)}
              collapsed={collapsed}
              shortcut={item.key}
            />
          ))}
        </nav>
      </div>

      <div className="sidebar-secondary shrink-0">
        {updateAvailable && (
          <button
            type="button"
            onClick={onOpenUpdateModal}
            className="nav-row w-full flex items-center h-10 rounded-lg text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/15 text-sm cursor-pointer gap-3 px-3"
            title="Une nouvelle version est disponible"
            aria-label="Mettre à jour Sprint"
          >
            <span className="nav-icon">
              <Download className="w-[18px] h-[18px]" strokeWidth={1.75} />
            </span>
            <NavLabel className="flex-1 text-left">Mettre à jour</NavLabel>
          </button>
        )}

        <NavButton
          item={{
            id: 'settings',
            label: 'Paramètres',
            hint: 'Apparence, notifications et comportement',
            icon: Settings,
          }}
          isActive={activeTab === 'settings'}
          onClick={() => setActiveTab('settings')}
          collapsed={collapsed}
        />

        <button
          type="button"
          onClick={onToggleCollapsed}
          className="nav-row w-full flex items-center h-10 rounded-lg text-sm text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.05] cursor-pointer gap-3 px-3"
          title={collapsed ? 'Agrandir le menu (Ctrl+B)' : 'Réduire le menu (Ctrl+B)'}
          aria-label={collapsed ? 'Agrandir le menu' : 'Réduire le menu'}
          aria-expanded={!collapsed}
        >
          <SprintNavIcon name="collapse" mirrored={collapsed} />
          <NavLabel className="flex-1 text-left">Réduire le menu</NavLabel>
        </button>
      </div>
    </aside>
  );
}
