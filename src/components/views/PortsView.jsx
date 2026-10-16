import React, { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RefreshCw, ExternalLink, Search, ShieldAlert, XCircle, Copy, MoreHorizontal, X, Folder, AppWindow, Shield } from 'lucide-react';
import { triggerToast } from '../../services/toastBus';
import ConfirmDialog from '../ui/ConfirmDialog';
import PageHeader from '../ui/PageHeader';
import FloatingMenu from '../ui/FloatingMenu';
import { portAccess, portCategory, projectWebUrl } from '../../services/portPresentation';
import { markManualStop, unmarkManualStop } from '../../hooks/useTauriIPC';

const POLL_INTERVAL_MS = 3000;

function PortActions({ entry, project, category, onKill }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const dismiss = (event) => {
      if (event.type === 'keydown' ? event.key === 'Escape' || event.key === 'Tab'
        : !root.current?.contains(event.target) && !event.target.closest('[role="menu"]')) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', dismiss);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', dismiss);
    };
  }, [open]);
  const access = portAccess(entry);
  const webUrl = projectWebUrl(project, entry);
  const openBrowser = (url) => invoke('open_browser', { url }).catch((error) =>
    triggerToast({ title: 'Ouverture impossible', message: String(error), type: 'error' }));
  const copy = async () => {
    setOpen(false);
    try {
      await navigator.clipboard.writeText(access.address);
      triggerToast({ title: 'Adresse copiée', message: access.address, type: 'success' });
    } catch (error) {
      triggerToast({ title: 'Copie impossible', message: String(error), type: 'error' });
    }
  };
  return (
    <div className="port-row-actions" ref={root}>
      {webUrl && <button className="quiet-button" onClick={() => openBrowser(webUrl)}
        aria-label={'Ouvrir le port ' + entry.port} title="Ouvrir l’URL du serveur web">
        <ExternalLink size={14} /> Ouvrir
      </button>}
      <button className="icon-button" aria-label={'Actions du port ' + entry.port}
        title="Copier l’adresse ou arrêter le processus" aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen((previous) => !previous)}><MoreHorizontal size={16} /></button>
      {open && <FloatingMenu className="context-menu" width={240}>
        <button role="menuitem" className="context-menu-item" onClick={copy}><Copy size={14} /> Copier l’adresse</button>
        {!webUrl && category !== 'windows' && <button role="menuitem" className="context-menu-item"
          onClick={() => { setOpen(false); openBrowser(access.url); }}><ExternalLink size={14} /> Essayer l’URL web</button>}
        <button role="menuitem" className="context-menu-item text-rose-400" disabled={!entry.pid || entry.pid <= 4}
          onClick={() => { setOpen(false); onKill(entry); }}><XCircle size={14} /> Arrêter le processus</button>
      </FloatingMenu>}
    </div>
  );
}

export default function PortsView({ projects = [] }) {
  const [ports, setPorts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [fetchError, setFetchError] = useState('');
  const [confirmKill, setConfirmKill] = useState(null); // { pid, processName, port, isSprint }
  const manualRefreshRef = useRef(false);
  const fetchingRef = useRef(false);
  const [sort, setSort] = useState({ key: 'priority', ascending: true });
  const [updatedAt, setUpdatedAt] = useState(null);

  const fetchPorts = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    try {
      const res = await invoke('get_ports_cmd');
      setPorts(res || []);
      setUpdatedAt(new Date());
      setFetchError('');
    } catch (e) {
      setFetchError(String(e));
    } finally {
      setLoading(false);
      manualRefreshRef.current = false;
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    fetchPorts();

    let interval = setInterval(fetchPorts, POLL_INTERVAL_MS);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (!interval) interval = setInterval(fetchPorts, POLL_INTERVAL_MS);
        fetchPorts();
      } else if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchPorts]);

  const handleManualRefresh = () => {
    manualRefreshRef.current = true;
    fetchPorts();
  };

  const executeKill = async () => {
    if (!confirmKill) return;
    const { pid, processName, serverIds = [] } = confirmKill;
    setConfirmKill(null);
    serverIds.forEach(markManualStop);
    try {
      await invoke('kill_port_cmd', { pid });
      triggerToast({
        title: '⏹ Processus Terminé',
        message: `${processName} (PID ${pid}) a été arrêté avec succès.`,
        type: 'warning',
      });
      fetchPorts();
    } catch (e) {
      serverIds.forEach(unmarkManualStop);
      triggerToast({
        title: '⚠️ Échec de la Fermeture',
        message: String(e),
        type: 'error',
      });
    }
  };

  // Mapper les serveurs Sprint actifs par port
  const sprintServersMap = {};
  projects.forEach((p) => {
    (p.servers || []).forEach((srv) => {
      if (srv.port && srv.state === 'running') {
        sprintServersMap[srv.port] = {
          id: srv.id,
          projectName: p.name,
          projectColor: p.color || 'var(--accent-color)',
          serverName: srv.name,
          command: srv.command,
          state: srv.state,
          pid: srv.pid,
          url: srv.url,
        };
      }
    });
  });

  const counts = { projects: 0, applications: 0, windows: 0 };
  ports.forEach((entry) => counts[portCategory(entry, sprintServersMap[entry.port])]++);

  const filteredPorts = ports
    .filter((p) => {
      const isSprint = !!sprintServersMap[p.port];

      if (filterType !== 'all' && portCategory(p, sprintServersMap[p.port]) !== filterType) return false;

      if (!search) return true;
      const q = search.toLowerCase();
      return (
        p.port.toString().includes(q) ||
        (p.process_name || '').toLowerCase().includes(q) ||
        (p.local_address || '').toLowerCase().includes(q) ||
        String(p.pid ?? '').includes(q) ||
        (isSprint && (sprintServersMap[p.port].projectName + ' ' + sprintServersMap[p.port].serverName).toLowerCase().includes(q))
      );
    })
    .sort((a, b) => {
      const priorities = { projects: 0, applications: 1, windows: 2 };
      const comparison = sort.key === 'priority'
        ? priorities[portCategory(a, sprintServersMap[a.port])] - priorities[portCategory(b, sprintServersMap[b.port])] || a.port - b.port :
        sort.key === 'port' || sort.key === 'pid'
          ? Number(a[sort.key]) - Number(b[sort.key])
          : String(a[sort.key] || '').localeCompare(String(b[sort.key] || ''), 'fr');
      return sort.ascending ? comparison : -comparison;
    });

  const showSpinner = loading && manualRefreshRef.current;

  const filters = [
    { id: 'all', label: 'Tous', count: ports.length },
    { id: 'projects', label: 'Mes projets', count: counts.projects },
    { id: 'applications', label: 'Applications', count: counts.applications },
    { id: 'windows', label: 'Windows', count: counts.windows },
  ];

  const changeSort = (key) =>
    setSort((previous) => ({
      key,
      ascending: previous.key === key ? !previous.ascending : true,
    }));
  return (
    <div className="page ports-page animate-fadeIn">
      <PageHeader
        title="Ports"
        lead="Identifiez ce qui occupe un port et retrouvez vos serveurs."
        actions={
          <button className="btn" onClick={handleManualRefresh} disabled={loading}>
            <RefreshCw size={14} className={showSpinner ? 'animate-spin' : ''} />
            Actualiser
          </button>
        }
      />
      <div className="ports-tools">
        <div className="segmented-control" aria-label="Filtrer les ports">
          {filters.map((filter) => (
            <button
              key={filter.id}
              onClick={() => setFilterType(filter.id)}
              aria-pressed={filterType === filter.id}
            >
              {filter.label}
              <span className="text-zinc-400">{filter.count}</span>
            </button>
          ))}
        </div>
        <div className="ports-tools-end">
          <div className="relative">
            <Search size={14} className="text-zinc-400 absolute left-2.5 top-2.5" />
            <input
              className="control-input !pl-8 w-60"
              aria-label="Filtrer les ports"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Port, projet, processus ou PID"
            />
            {search && <button className="ports-search-clear icon-button" aria-label="Effacer la recherche des ports"
              onClick={() => setSearch('')}><X size={13} /></button>}
          </div>
          <label className="ports-sort">Tri <select className="control-input" aria-label="Ordre des ports" value={sort.key}
            onChange={(event) => setSort({ key: event.target.value, ascending: true })}>
            <option value="priority">Projets en premier</option><option value="port">Numéro de port</option>
            <option value="process_name">Processus</option><option value="pid">PID</option>
          </select></label>
        </div>
      </div>
      <div className="ports-summary">
        <span>{filteredPorts.length} {filteredPorts.length === 1 ? 'port affiché' : 'ports affichés'}
          {filteredPorts.length !== ports.length ? ' sur ' + ports.length : ''}</span>
      </div>
      {fetchError && (
        <div role="alert" className="text-xs text-rose-300 flex items-start gap-2 py-3">
          <ShieldAlert size={16} />
          <span>Impossible de lire les ports : {fetchError}</span>
        </div>
      )}
      {filteredPorts.length === 0 ? (
        <div className="empty-state">
          <p className="text-zinc-100">{loading ? 'Recherche des ports…' : 'Aucun port trouvé'}</p>
          <p className="text-xs mt-2">
            {search || filterType !== 'all'
              ? 'Essayez une autre recherche ou affichez tous les ports.'
              : 'Les connexions actives apparaîtront ici.'}
          </p>
          {(search || filterType !== 'all') && (
            <button
              className="btn mt-4"
              onClick={() => {
                setSearch('');
                setFilterType('all');
              }}
            >
              Afficher tous les ports
            </button>
          )}
        </div>
      ) : (
        <div className="ports-table-scroll">
          <table className="ports-table">
            <thead>
              <tr>
                {[
                  ['port', 'Port'],
                  ['process_name', 'Projet / processus'],
                  ['pid', 'PID'],
                  ['local_address', 'Accès / adresse'],
                ].map(([key, label]) => (
                  <th
                    key={key}
                    aria-sort={
                      sort.key === key ? (sort.ascending ? 'ascending' : 'descending') : 'none'
                    }
                  >
                    <button className="cursor-pointer inline-flex items-center min-h-6" onClick={() => changeSort(key)}>
                      {label}
                      {sort.key === key ? (sort.ascending ? ' ↑' : ' ↓') : ''}
                    </button>
                  </th>
                ))}
                <th className="ports-actions text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPorts.map((entry) => {
                const match = sprintServersMap[entry.port];
                const access = portAccess(entry);
                const category = portCategory(entry, match);
                const CategoryIcon = category === 'projects' ? Folder : category === 'windows' ? Shield : AppWindow;
                return (
                  <tr key={entry.protocol + '-' + entry.local_address + '-' + entry.port + '-' + entry.pid}>
                    <td><strong className="port-number">:{entry.port}</strong><span className="port-detail">{entry.protocol || 'TCP'}</span></td>
                    <td className="port-process">
                      <span className="port-process-title" title={match?.projectName || entry.process_name}>
                        <CategoryIcon size={14} className={match ? 'theme-accent-text' : ''} />
                        {match?.projectName || entry.process_name || 'Processus inconnu'}
                      </span>
                      <span className="port-detail" title={match ? match.serverName + ' · ' + entry.process_name : category === 'windows' ? 'Processus Windows identifié' : 'Application ou service non associé à un projet'}>
                        {match ? match.serverName + ' · ' + entry.process_name : category === 'windows' ? 'Windows' : 'Application / service'}
                      </span>
                    </td>
                    <td className="font-mono text-xs text-zinc-400">{entry.pid ?? '—'}</td>
                    <td>
                      <span className="port-access">{access.label}</span>
                      <span className="port-detail font-mono" title={access.address}>{access.address}</span>
                    </td>
                    <td className="ports-actions">
                      <PortActions entry={entry} project={match} category={category} onKill={(selected) => {
                        const affected = ports.filter((item) => item.pid === selected.pid);
                        setConfirmKill({ pid: selected.pid, processName: selected.process_name, port: selected.port,
                          isSprint: !!match, affectedPorts: [...new Set(affected.map((item) => item.port))],
                          serverIds: [...new Set(affected.map((item) => sprintServersMap[item.port]?.id).filter(Boolean))] });
                      }} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="ports-footer" role="status">{fetchError ? 'Actualisation interrompue · Derniers résultats conservés'
        : updatedAt ? 'Actualisation automatique · ' + updatedAt.toLocaleTimeString('fr-FR') : 'Recherche des ports…'}
        <span>Toutes les 3 secondes</span></p>
      <ConfirmDialog
        open={!!confirmKill}
        title={
          'Arrêter ce processus ?'
        }
        message={
          `L’arrêt forcé de « ${confirmKill?.processName} » (PID ${confirmKill?.pid}) termine aussi ses processus enfants. Ports concernés : ${confirmKill?.affectedPorts?.join(', ')}. ${confirmKill?.isSprint ? 'Ce processus appartient à un de vos projets.' : 'Ce processus n’est pas associé à Sprint : l’application ou le service sera interrompu.'}`
        }
        confirmLabel={`Arrêter le processus ${confirmKill ? `(${confirmKill.pid})` : ''}`.trim()}
        danger
        onConfirm={executeKill}
        onCancel={() => setConfirmKill(null)}
      />
    </div>
  );
}
