import React, { useEffect, useRef, useState } from 'react';
import { Plus, Settings, X } from 'lucide-react';

import { NAV_ITEMS } from '../../lib/navigation';
import { serverStatusLabel, serverStatusTone } from '../../lib/logTabs';
import ServerPickerMenu from '../ui/ServerPickerMenu';
import ProjectAvatar from '../ui/ProjectAvatar';
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

function SidebarTreeSection({
  item,
  prefix,
  isPageActive,
  onSelectPage,
  collapsed,
  servers = [],
  activeId = null,
  splitId = null,
  isSplitMode = false,
  onSelectServer,
  onCloseServer,
  pickerOpen,
  addButtonRef,
  onTogglePicker,
  addLabel,
  addTitle,
  treeLabel,
  closeLabelPrefix,
  itemLabelPrefix,
  showPortSubtitle = false,
}) {
  const hasChildren = servers.length > 0;

  return (
    <div
      className={`sidebar-tree-group sidebar-${prefix}-group${collapsed ? ' is-collapsed' : ''}${
        hasChildren ? ' has-children' : ''
      }`}
    >
      <div
        className={`sidebar-tree-parent sidebar-${prefix}-parent${
          isPageActive ? ' is-active-page' : ''
        }${hasChildren ? ' has-children' : ''}`}
      >
        <NavButton
          item={item}
          isActive={isPageActive}
          onClick={onSelectPage}
          collapsed={collapsed}
          shortcut={item.key}
        />
        {!collapsed && (
          <button
            ref={addButtonRef}
            type="button"
            className={`sidebar-tree-add sidebar-${prefix}-add`}
            aria-label={addLabel}
            aria-expanded={pickerOpen}
            title={addTitle}
            onClick={onTogglePicker}
          >
            <Plus size={14} strokeWidth={2.3} />
          </button>
        )}
      </div>

      {hasChildren && !collapsed && (
        <div className={`sidebar-tree-list sidebar-${prefix}-tree`} role="list" aria-label={treeLabel}>
          {servers.map((srv) => {
            const isPrimary = srv.id === activeId;
            const isSecondary = isSplitMode && srv.id === splitId;
            const isSelected = isPageActive && isPrimary;
            const isSplitSelected = isPageActive && isSecondary;
            const tone = serverStatusTone(srv);
            const statusText = serverStatusLabel(srv);
            const subtitle =
              showPortSubtitle && srv.port > 0
                ? `${srv.projectName} · :${srv.port}`
                : srv.projectName;

            return (
              <div
                key={srv.id}
                role="listitem"
                data-server-id={srv.id}
                className={`sidebar-tree-item sidebar-${prefix}-item${isSelected ? ' is-active' : ''}${
                  isSplitSelected ? ' is-split' : ''
                }`}
              >
                <button
                  type="button"
                  className={`sidebar-tree-select sidebar-${prefix}-select`}
                  aria-current={isSelected ? 'true' : undefined}
                  title={`${srv.projectName} · ${srv.name}${srv.port > 0 ? ` :${srv.port}` : ''} · ${statusText}`}
                  onClick={() => onSelectServer?.(srv.id)}
                >
                  <span className="sidebar-tree-avatar">
                    <ProjectAvatar project={srv.project} image={srv.icon} small />
                    <span className={`server-avatar-status is-${tone}`} />
                  </span>
                  <span className="sidebar-tree-copy">
                    <span className="sidebar-tree-name">{srv.name}</span>
                    <span className="sidebar-tree-project">{subtitle}</span>
                  </span>
                  {isSplitMode && (isPrimary || isSecondary) && (
                    <span
                      className="sidebar-tree-pane-badge"
                      title={isPrimary ? 'Console 1' : 'Console 2'}
                    >
                      {isPrimary ? '1' : '2'}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  className={`sidebar-tree-close sidebar-${prefix}-close`}
                  aria-label={`${closeLabelPrefix} ${srv.projectName} · ${srv.name}`}
                  title="Fermer cet onglet"
                  onClick={() => onCloseServer?.(srv.id)}
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {hasChildren && collapsed && (
        <div
          className={`sidebar-tree-list sidebar-${prefix}-tree is-collapsed`}
          role="list"
          aria-label={treeLabel}
        >
          {servers.map((srv) => {
            const isPrimary = srv.id === activeId;
            const isSecondary = isSplitMode && srv.id === splitId;
            const isSelected = isPageActive && isPrimary;
            const isSplitSelected = isPageActive && isSecondary;
            const tone = serverStatusTone(srv);
            const statusText = serverStatusLabel(srv);

            return (
              <button
                key={srv.id}
                type="button"
                role="listitem"
                data-server-id={srv.id}
                className={`sidebar-tree-mini sidebar-${prefix}-mini${isSelected ? ' is-active' : ''}${
                  isSplitSelected ? ' is-split' : ''
                }`}
                aria-label={`${itemLabelPrefix} · ${srv.projectName} · ${srv.name}`}
                aria-current={isSelected ? 'true' : undefined}
                title={`${srv.projectName} · ${srv.name}${srv.port > 0 ? ` :${srv.port}` : ''} · ${statusText}`}
                onClick={() => onSelectServer?.(srv.id)}
              >
                <span className="sidebar-tree-avatar">
                  <ProjectAvatar project={srv.project} image={srv.icon} small />
                  <span className={`server-avatar-status is-${tone}`} />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  onOpenUpdateModal,
  updateAvailable,
  collapsed,
  onToggleCollapsed,
  projects = [],
  projectIcons = {},
  openLogIds = [],
  openLogServers = [],
  activeLogId = null,
  splitLogId = null,
  isLogSplitMode = false,
  onOpenLogTab,
  onCloseLogTab,
  openPreviewIds = [],
  openPreviewServers = [],
  activePreviewId = null,
  onOpenPreviewTab,
  onClosePreviewTab,
}) {
  const [pickerMode, setPickerMode] = useState(null);
  const [pickerPoint, setPickerPoint] = useState(null);
  const addLogButtonRef = useRef(null);
  const addPreviewButtonRef = useRef(null);

  useEffect(() => {
    if (collapsed && pickerMode) setPickerMode(null);
  }, [collapsed, pickerMode]);

  const togglePicker = (mode, ref) => {
    setPickerMode((current) => {
      const next = current === mode ? null : mode;
      if (next && ref.current) {
        const rect = ref.current.getBoundingClientRect();
        setPickerPoint({ x: rect.right + 10, y: rect.top });
      }
      return next;
    });
  };

  const withIcons = (servers) =>
    servers.map((srv) => ({ ...srv, icon: projectIcons[srv.projectId] }));

  return (
    <aside
      data-tauri-drag-region="deep"
      className={`sidebar-shell ${collapsed ? 'is-collapsed' : ''} shrink-0 min-h-0 overflow-x-hidden overflow-y-auto pt-2 pb-3 flex flex-col justify-between gap-4 select-none cursor-default z-10`}
      aria-label="Navigation principale"
    >
      <div className="sidebar-primary shrink-0">
        <nav className="sidebar-navigation" aria-label="Pages">
          {NAV_ITEMS.map((item) => {
            if (item.id === 'browser') {
              return (
                <SidebarTreeSection
                  key={item.id}
                  item={item}
                  prefix="preview"
                  isPageActive={activeTab === 'browser'}
                  onSelectPage={() => setActiveTab('browser')}
                  collapsed={collapsed}
                  servers={withIcons(openPreviewServers)}
                  activeId={activePreviewId}
                  onSelectServer={(id) => onOpenPreviewTab?.(id, { navigate: true })}
                  onCloseServer={onClosePreviewTab}
                  pickerOpen={pickerMode === 'preview'}
                  addButtonRef={addPreviewButtonRef}
                  onTogglePicker={() => togglePicker('preview', addPreviewButtonRef)}
                  addLabel="Choisir un projet"
                  addTitle="Ouvrir un aperçu"
                  treeLabel="Aperçus ouverts"
                  closeLabelPrefix="Fermer l’aperçu"
                  itemLabelPrefix="Aperçu web"
                  showPortSubtitle
                />
              );
            }

            if (item.id === 'terminal') {
              return (
                <SidebarTreeSection
                  key={item.id}
                  item={item}
                  prefix="log"
                  isPageActive={activeTab === 'terminal'}
                  onSelectPage={() => setActiveTab('terminal')}
                  collapsed={collapsed}
                  servers={withIcons(openLogServers)}
                  activeId={activeLogId}
                  splitId={splitLogId}
                  isSplitMode={isLogSplitMode}
                  onSelectServer={(id) => onOpenLogTab?.(id, { navigate: true })}
                  onCloseServer={onCloseLogTab}
                  pickerOpen={pickerMode === 'logs'}
                  addButtonRef={addLogButtonRef}
                  onTogglePicker={() => togglePicker('logs', addLogButtonRef)}
                  addLabel="Ouvrir des logs"
                  addTitle="Ouvrir une console"
                  treeLabel="Consoles ouvertes"
                  closeLabelPrefix="Fermer les logs"
                  itemLabelPrefix="Logs"
                />
              );
            }

            return (
              <NavButton
                key={item.id}
                item={item}
                isActive={activeTab === item.id}
                onClick={() => setActiveTab(item.id)}
                collapsed={collapsed}
                shortcut={item.key}
              />
            );
          })}
        </nav>
      </div>

      <ServerPickerMenu
        mode={pickerMode || 'logs'}
        open={Boolean(pickerMode) && !collapsed}
        anchorRef={pickerMode === 'preview' ? addPreviewButtonRef : addLogButtonRef}
        point={pickerPoint}
        onClose={() => setPickerMode(null)}
        projects={projects}
        projectIcons={projectIcons}
        openIds={pickerMode === 'preview' ? openPreviewIds : openLogIds}
        activeId={pickerMode === 'preview' ? activePreviewId : activeLogId}
        splitId={pickerMode === 'logs' ? splitLogId : null}
        isSplitMode={pickerMode === 'logs' ? isLogSplitMode : false}
        onSelectServer={(serverId) =>
          pickerMode === 'preview'
            ? onOpenPreviewTab?.(serverId, { navigate: true })
            : onOpenLogTab?.(serverId, { navigate: true })
        }
        onGoToProjects={() => setActiveTab('projects')}
      />

      <div className="sidebar-secondary shrink-0">
        {updateAvailable && (
          <button
            type="button"
            onClick={onOpenUpdateModal}
            className="nav-row nav-update relative w-full flex items-center h-10 rounded-lg text-sm cursor-pointer gap-3 px-3"
            title="Une nouvelle version est disponible"
            aria-label="Mettre à jour Sprint"
          >
            <SprintNavIcon name="update" active />
            <NavLabel className="flex-1 text-left">Mettre à jour</NavLabel>
            {collapsed && <span className="update-indicator" aria-hidden="true" />}
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
