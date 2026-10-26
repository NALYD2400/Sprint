import React, { useState } from 'react';
import { Plus, SlidersHorizontal, Globe, ScrollText, ArrowRight, Pin, AlertTriangle } from 'lucide-react';
import PageHeader from '../ui/PageHeader';
import ResourceChart from '../ui/ResourceChart';
import ServerControls from '../ui/ServerControls';
import { dashboardPrefs } from '../../services/dashboardPrefs';

const ramText = (mb) => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} Go` : `${Math.round(mb)} Mo`);
const number = (value) => (Number.isFinite(value) ? Math.max(0, value) : 0);

export default function HomeView({
  metrics,
  projects,
  onSelectTab,
  onAddProject,
  onOpenBrowser,
  prefs,
  onCustomize,
  onOpenTerminal,
}) {
  const config = dashboardPrefs(prefs?.dashboard);
  const [serverFilter, setServerFilter] = useState('all');
  const favorites = new Set(prefs?.favoriteProjectIds || []);
  const servers = projects.flatMap((project) =>
    (project.servers || []).map((server) => ({ ...server, project })),
  );
  const running = servers.filter((server) => server.state === 'running');
  const needsAttention = (server) => server.state === 'error'
    || (server.state !== 'running' && server.state !== 'starting' && Boolean(server.lastExitReason));
  const active = (server) => server.state === 'running' || server.state === 'starting';
  const priority = (server) => needsAttention(server) ? 0 : active(server) ? 1 : 2;
  const errorCount = servers.filter(needsAttention).length;
  const filters = [
    { id: 'all', label: 'Tous', count: servers.length },
    { id: 'active', label: 'Actifs', count: servers.filter(active).length },
    { id: 'errors', label: 'Erreurs', count: errorCount },
  ];
  const visibleServers = servers.filter((server) => serverFilter === 'all'
    || (serverFilter === 'active' ? active(server) : needsAttention(server)))
    .sort((a, b) => priority(a) - priority(b)
      || Number(favorites.has(b.project.id)) - Number(favorites.has(a.project.id)));
  const system = config.scope === 'system';
  const cpuField = system ? 'cpu_usage' : 'managed_cpu_pct';
  const ramField = system ? 'ram_used_mb' : 'managed_ram_mb';
  const history = metrics.history || [];
  const hasMetrics = history.length > 0;
  const blocks = {
    stats: (
      <section className="dashboard-stats" aria-label="Statistiques">
        {[
          ['Projets', projects.length, 'enregistrés'],
          ['Serveurs actifs', running.length, `sur ${servers.length} configurés`],
          [
            'Processeur',
            hasMetrics ? `${number(metrics[cpuField]).toFixed(1)} %` : '—',
            system ? 'Ordinateur' : 'Vos projets',
          ],
          [
            'Mémoire',
            hasMetrics ? ramText(number(metrics[ramField])) : '—',
            system ? 'Ordinateur' : 'Vos projets',
          ],
        ].map(([label, value, detail]) => (
          <div key={label}>
            <p className="text-xs text-zinc-400">{label}</p>
            <p className="stat-value text-2xl text-zinc-100 mt-2">{value}</p>
            <p className="text-xs text-zinc-500 mt-1">{detail}</p>
          </div>
        ))}
      </section>
    ),
    cpu: (
      <ResourceChart
        title="Processeur"
        history={history}
        field={cpuField}
        unit="%"
        scopeLabel={system ? 'Ordinateur' : 'Vos projets'}
        style={config.chartStyle}
        period={config.period}
      />
    ),
    ram: (
      <ResourceChart
        title="Mémoire"
        history={history}
        field={ramField}
        unit="Mo"
        scopeLabel={system ? 'Ordinateur' : 'Vos projets'}
        style={config.chartStyle}
        period={config.period}
      />
    ),
    servers: (
      <section className="dashboard-servers">
        <div className="dashboard-server-heading">
          <h2 className="text-sm font-medium text-zinc-100">Serveurs</h2>
          <button onClick={() => onSelectTab('projects')} className="quiet-button">
            Gérer les projets <ArrowRight size={14} />
          </button>
        </div>
        {servers.length > 0 && (
          <div className="dashboard-server-toolbar">
            <div className="server-filters" role="group" aria-label="Filtrer les serveurs">
              {filters.map((filter) => (
                <button type="button" key={filter.id} aria-pressed={serverFilter === filter.id}
                  onClick={() => setServerFilter(filter.id)}>
                  {filter.label} <span>{filter.count}</span>
                </button>
              ))}
            </div>
            <p className="dashboard-sort-note">Erreurs et serveurs actifs en premier</p>
          </div>
        )}
        {servers.length === 0 ? (
          <p className="text-sm text-zinc-400 py-6">
            Ajoutez un projet pour configurer votre premier serveur.
          </p>
        ) : visibleServers.length === 0 ? (
          <div className="dashboard-filter-empty" role="status">
            <p>{serverFilter === 'errors' ? 'Aucun serveur en erreur.' : 'Aucun serveur actif.'}</p>
            <button type="button" className="quiet-button" onClick={() => setServerFilter('all')}>
              Afficher tous les serveurs
            </button>
          </div>
        ) : (
          visibleServers.map((server) => (
            <div key={server.id} data-server-id={server.id} className="server-overview-row">
              {needsAttention(server) ? <AlertTriangle size={15} className="server-attention shrink-0" aria-label="Erreur" /> : (
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${server.state === 'running' ? 'bg-emerald-400' : server.state === 'starting' ? 'bg-amber-400' : 'bg-zinc-500'}`}
              />
              )}
              <div className="server-overview-info">
                <p className="server-overview-name">
                  {favorites.has(server.project.id) && <Pin size={13} className="favorite-marker" aria-label="Projet favori" />}
                  <span className="truncate">{server.project.name}</span>
                  <span className="server-overview-detail">{server.name}</span>
                </p>
                <p className={`server-overview-status${needsAttention(server) ? ' server-attention' : ''}`} title={server.lastExitReason || undefined}>
                  {needsAttention(server) && server.lastExitReason ? 'Arrêt inattendu · ' + server.lastExitReason : server.state === 'running'
                    ? 'En cours'
                    : server.state === 'starting'
                      ? 'Démarrage'
                      : server.state === 'error'
                        ? 'Erreur'
                        : 'Arrêté'}
                  {server.port ? ` · :${server.port}` : ''}
                </p>
              </div>
              <span className="text-xs text-zinc-400 stat-value hidden lg:inline">
                {server.state === 'running' && metrics.server_metrics?.[server.id]
                  ? `${number(metrics.server_metrics[server.id].cpu_usage).toFixed(1)} % · ${ramText(number(metrics.server_metrics[server.id].ram_mb))}`
                  : ''}
              </span>
              {server.state === 'running' && server.port > 0 && (
                <button
                  className="icon-button"
                  aria-label={`Aperçu de ${server.name}`}
                  title="Aperçu web"
                  onClick={() => onOpenBrowser(server.id, `http://localhost:${server.port}`)}
                >
                  <Globe size={15} />
                </button>
              )}
              <button
                className="icon-button"
                title="Voir les logs"
                aria-label={`Logs de ${server.name}`}
                onClick={() => onOpenTerminal(server.id, server.name)}
              >
                <ScrollText size={15} />
              </button>
              <ServerControls project={server.project} server={server} nameInLabel />
            </div>
          ))
        )}
      </section>
    ),
  };
  return (
    <div
      className={`page workspace-page animate-fadeIn ${config.compact ? 'dashboard-compact' : ''}`}
    >
      <PageHeader
        title="Tableau de bord"
        lead={
          projects.length
            ? `${running.length} serveur${running.length > 1 ? 's' : ''} en cours · ${system ? 'Ressources de l’ordinateur' : 'Ressources de vos projets'}`
            : 'Ajoutez un projet pour commencer à suivre vos serveurs.'
        }
        actions={
          <>
            <button type="button" className="quiet-button" onClick={onCustomize}>
              <SlidersHorizontal size={14} />
              Personnaliser
            </button>
            <button type="button" className="quiet-button" onClick={onAddProject}>
              <Plus size={15} />
              Nouveau
            </button>
          </>
        }
      />
      <div className="dashboard-layout">
        {config.blocks
          .filter((id) => !config.hidden.includes(id))
          .map((id) => (
            <React.Fragment key={id}>{blocks[id]}</React.Fragment>
          ))}
      </div>
      {config.hidden.length === 4 && (
        <div className="empty-state">
          <p>Aucun bloc affiché.</p>
          <button className="btn mt-4" onClick={onCustomize}>
            Choisir les blocs du tableau de bord
          </button>
        </div>
      )}
      <p className="text-xs text-zinc-500 mt-6">
        Mesures en direct · Historique de cette session, jusqu’à 15 minutes.
      </p>
    </div>
  );
}
