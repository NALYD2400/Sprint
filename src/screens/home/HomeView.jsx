import ProjectAvatar from '../../components/ui/ProjectAvatar';
import React, { useState } from 'react';
import { Plus, SlidersHorizontal, Globe, ScrollText, ArrowRight, Pin, AlertTriangle, Search, ChevronDown, Activity } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import SprintNavIcon, { PageLogo } from '../../components/layout/SprintNavIcon';
import ResourceChart from '../../components/ui/ResourceChart';
import ServerControls from '../../components/ui/ServerControls';
import { dashboardPrefs } from '../../lib/dashboardPrefs';
import { useSystemMetrics } from '../../hooks/useSystemMetrics';

const ramText = (mb) => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} Go` : `${Math.round(mb)} Mo`);
const number = (value) => (Number.isFinite(value) ? Math.max(0, value) : 0);

export default function HomeView({
  projects,
  onSelectTab,
  onAddProject,
  onOpenBrowser,
  prefs,
  onCustomize,
  onOpenTerminal,
  projectIcons = {},
}) {
  const metrics = useSystemMetrics();
  const config = dashboardPrefs(prefs?.dashboard);
  const [serverFilter, setServerFilter] = useState('all');
  const [serverSearch, setServerSearch] = useState('');
  const [showCharts, setShowCharts] = useState(false);
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
  const search = serverSearch.trim().toLowerCase();
  const visibleServers = servers.filter((server) => (serverFilter === 'all'
    || (serverFilter === 'active' ? active(server) : needsAttention(server)))
    && (!search || `${server.project.name} ${server.name} ${server.port || ''}`.toLowerCase().includes(search)))
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
          ['Projets', projects.length, 'enregistrés', 'projects'],
          ['Serveurs actifs', running.length, `sur ${servers.length} configurés`, 'serversActive'],
          [
            'Processeur',
            hasMetrics ? `${number(metrics[cpuField]).toFixed(1)} %` : '—',
            system ? 'Ordinateur' : 'Vos projets',
            'cpu',
          ],
          [
            'Mémoire',
            hasMetrics ? ramText(number(metrics[ramField])) : '—',
            system ? 'Ordinateur' : 'Vos projets',
            'memory',
          ],
        ].map(([label, value, detail, icon]) => (
          <div key={label} className="dashboard-stat">
            <span className="dashboard-stat-icon" aria-hidden="true"><SprintNavIcon name={icon} active /></span>
            <div>
              <p className="dashboard-stat-label">{label}</p>
              <p className="stat-value">{value}</p>
              <p className="dashboard-stat-detail">{detail}</p>
            </div>
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
        style="area"
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
        style="area"
        period={config.period}
      />
    ),
    servers: (
      <section className="dashboard-servers">
        <div className="dashboard-server-heading">
          <h2 className="text-sm font-medium text-zinc-100">Vos serveurs</h2>
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
            <label className="workspace-search">
              <Search size={14} aria-hidden="true" />
              <input aria-label="Rechercher un serveur" value={serverSearch} onChange={event => setServerSearch(event.target.value)} placeholder="Projet, serveur ou port…" />
            </label>
          </div>
        )}
        {servers.length === 0 ? (
          <p className="text-sm text-zinc-400 py-6">
            Ajoutez un projet pour configurer votre premier serveur.
          </p>
        ) : visibleServers.length === 0 ? (
          <div className="dashboard-filter-empty" role="status">
            <p>{search ? 'Aucun serveur ne correspond à cette recherche.' : serverFilter === 'errors' ? 'Aucun serveur en erreur.' : 'Aucun serveur actif.'}</p>
            <button type="button" className="quiet-button" onClick={() => { setServerFilter('all'); setServerSearch(''); }}>
              Afficher tous les serveurs
            </button>
          </div>
        ) : (
          visibleServers.map((server) => (
            <div key={server.id} data-server-id={server.id} className="server-overview-row" data-state={server.state}>
              <span className="server-project-avatar">
                <ProjectAvatar project={server.project} image={projectIcons[server.project.id]} />
                <span className={`server-avatar-status ${needsAttention(server) ? 'is-error' : server.state === 'running' ? 'is-running' : server.state === 'starting' ? 'is-starting' : ''}`} />
              </span>
              <div className="server-overview-info">
                <p className="server-overview-name">
                  {favorites.has(server.project.id) && <Pin size={13} className="favorite-marker" aria-label="Projet favori" />}
                  <span className="truncate">{server.project.name}</span>
                  <span className="server-overview-detail">{server.name}</span>
                </p>
                <p className={`server-overview-status${needsAttention(server) ? ' server-attention' : ''}`} title={server.lastExitReason || undefined}>
                  {needsAttention(server) && <AlertTriangle size={12} className="inline mr-1" aria-hidden="true" />}
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
      className="page workspace-page dashboard-page"
    >
      <PageHeader
        title="Tableau de bord"
        icon={<SprintNavIcon name="dashboard" active />}
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
        {!config.hidden.includes('stats') && blocks.stats}
        {!config.hidden.includes('servers') && blocks.servers}
        {(!config.hidden.includes('cpu') || !config.hidden.includes('ram')) && (
          <section className="dashboard-resources" aria-label="Ressources">
            <button type="button" className="resource-toggle" aria-expanded={showCharts} aria-controls="dashboard-charts" onClick={() => setShowCharts(value => !value)}>
              <span><Activity size={16} aria-hidden="true" /><strong>Ressources</strong><span>{system ? 'Tout l’ordinateur' : 'Vos projets'} · {config.period / 60} min</span></span>
              <span>{showCharts ? 'Masquer les graphiques' : 'Afficher les graphiques'}<ChevronDown size={15} className={showCharts ? 'rotate-180' : ''} /></span>
            </button>
            <div id="dashboard-charts" className="dashboard-charts" hidden={!showCharts}>
              {showCharts && !config.hidden.includes('cpu') && blocks.cpu}
              {showCharts && !config.hidden.includes('ram') && blocks.ram}
            </div>
          </section>
        )}
      </div>
      {config.hidden.length === 4 && (
        <div className="empty-state">
          <PageLogo name="dashboard" />
          <p>Aucun bloc affiché.</p>
          <button className="btn mt-4" onClick={onCustomize}>
            Choisir les blocs du tableau de bord
          </button>
        </div>
      )}
      <p className="dashboard-footnote">
        Mesures en direct · Historique de cette session, jusqu’à 15 minutes.
      </p>
    </div>
  );
}
