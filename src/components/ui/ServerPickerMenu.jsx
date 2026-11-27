import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Search } from 'lucide-react';
import FloatingMenu from './FloatingMenu';
import ProjectAvatar from './ProjectAvatar';
import { performServerAction } from '../../lib/serverActions';
import useServerOperations from '../../hooks/useServerOperations';
import { isServerLive, serverStatusLabel, serverStatusTone } from '../../lib/logTabs';

const normalize = (text) =>
  String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/** Portal popover listing projects and servers so any log console or web preview can be opened or started. */
export default function ServerPickerMenu({
  mode = 'logs',
  open,
  anchorRef,
  point,
  onClose,
  projects = [],
  projectIcons = {},
  openIds = [],
  activeId = null,
  splitId = null,
  isSplitMode = false,
  onSelectServer,
  onStartServer,
  onGoToProjects,
}) {
  const [query, setQuery] = useState('');
  const searchRef = useRef(null);
  const getOperation = useServerOperations();
  const isPreview = mode === 'preview';

  useEffect(() => {
    if (!open) return undefined;
    setQuery('');
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    const dismiss = (event) => {
      if (event.type === 'keydown') {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
        return;
      }
      if (
        event.target.closest?.('[data-dropdown-container]') ||
        anchorRef?.current?.contains(event.target)
      ) {
        return;
      }
      onClose();
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', dismiss);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', dismiss);
    };
  }, [open, anchorRef, onClose]);

  const allServers = useMemo(
    () =>
      projects.flatMap((project) =>
        (project.servers || [])
          .filter((server) => !isPreview || server.port > 0)
          .map((server) => ({
            ...server,
            project,
            projectId: project.id,
            projectName: project.name,
            projectRoot: project.root,
          })),
      ),
    [projects, isPreview],
  );

  const normalizedQuery = normalize(query.trim());
  const filteredGroups = useMemo(
    () =>
      projects
        .map((project) => {
          const servers = allServers.filter(
            (item) =>
              item.projectId === project.id &&
              (!normalizedQuery ||
                normalize(`${project.name} ${item.name} ${item.port || ''}`).includes(
                  normalizedQuery,
                )),
          );
          return servers.length ? { project, servers } : null;
        })
        .filter(Boolean),
    [projects, allServers, normalizedQuery],
  );

  if (!open) return null;

  return (
    <FloatingMenu point={point} width={360} className="logs-picker-menu">
      <div className="preview-menu-heading">
        <strong>{isPreview ? 'Ouvrir un aperçu' : 'Ouvrir des logs'}</strong>
        <span>
          {isPreview
            ? 'Choisissez un aperçu ou lancez un serveur'
            : 'Choisissez une console ou lancez un serveur'}
        </span>
      </div>

      {allServers.length > 0 && (
        <label className="preview-menu-search">
          <Search size={15} aria-hidden="true" />
          <input
            ref={searchRef}
            type="text"
            aria-label="Rechercher un projet ou un serveur"
            placeholder="Projet, serveur ou port…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      )}

      <div className="preview-menu-list">
        {!allServers.length ? (
          <div className="preview-server-empty">
            {isPreview ? 'Aucun serveur avec un port.' : 'Aucun serveur configuré.'}{' '}
            {onGoToProjects && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onGoToProjects();
                }}
              >
                Ajouter un projet
              </button>
            )}
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="preview-server-empty" role="status">
            Aucun serveur trouvé.
          </div>
        ) : (
          filteredGroups.map(({ project, servers }) => (
            <section className="preview-server-group" key={project.id} aria-label={project.name}>
              <div className="preview-server-group-heading">
                <ProjectAvatar project={project} image={projectIcons[project.id]} small />
                <strong title={project.name}>{project.name}</strong>
              </div>
              {servers.map((item) => {
                const pending = !!getOperation(item.id) || item.state === 'starting';
                const live = isServerLive(item);
                const tone = serverStatusTone(item);
                const isPrimary = item.id === activeId;
                const isSecondary = !isPreview && isSplitMode && item.id === splitId;
                const isOpen = openIds.includes(item.id);
                const activeLabel = isPreview
                  ? 'Aperçu actuel'
                  : isSplitMode
                    ? 'Console 1'
                    : 'Actif';
                const statusText = [
                  item.port > 0 ? `:${item.port}` : null,
                  live || item.state === 'error' || item.lastExitReason
                    ? serverStatusLabel(item, pending)
                    : !item.port
                      ? 'Arrêté'
                      : null,
                  isPrimary
                    ? activeLabel
                    : isSecondary
                      ? 'Console 2'
                      : isOpen
                        ? 'Ouvert'
                        : null,
                ]
                  .filter(Boolean)
                  .join(' · ');

                return (
                  <div
                    key={item.id}
                    className={`preview-server-option${isPrimary || isSecondary ? ' is-current' : ''}`}
                  >
                    <button
                      type="button"
                      className="preview-server-option-select"
                      onClick={() => {
                        onSelectServer(item.id);
                        onClose();
                      }}
                    >
                      <span
                        className={`server-dot is-${tone}${tone === 'running' ? ' running' : ''}`}
                      />
                      <span>
                        <strong>{item.name}</strong>
                        <small>{statusText}</small>
                      </span>
                    </button>
                    {!live && (
                      <button
                        type="button"
                        className="quiet-button"
                        disabled={pending}
                        onClick={() => {
                          onSelectServer(item.id);
                          onClose();
                          if (onStartServer) {
                            onStartServer(item);
                          } else {
                            performServerAction('start', { root: item.projectRoot }, item, {
                              silent: true,
                            });
                          }
                        }}
                      >
                        <Play size={12} /> Lancer
                      </button>
                    )}
                  </div>
                );
              })}
            </section>
          ))
        )}
      </div>
    </FloatingMenu>
  );
}
