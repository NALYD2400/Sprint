import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { isTauriEnv } from '../lib/tauri';

let cached = { key: '', icons: {}, expires: 0 };
export function useProjectIcons(projects) {
  const key = JSON.stringify(projects.map(({ id, root }) => [id, root]));
  const [icons, setIcons] = useState(() => cached.key === key ? cached.icons : {});
  useEffect(() => {
    let cancelled = false;
    if (!isTauriEnv() || projects.length === 0) { setIcons({}); return undefined; }
    if (cached.key === key && cached.expires > Date.now()) { setIcons(cached.icons); return undefined; }
    const previousRoots = new Map(JSON.parse(cached.key || '[]'));
    const unchangedIds = JSON.parse(key).filter(([id, root]) => previousRoots.get(id) === root).map(([id]) => id);
    setIcons(current => Object.fromEntries(unchangedIds.filter(id => current[id]).map(id => [id, current[id]])));
    invoke('get_project_icons_cmd').then(result => {
      if (cancelled) return;
      const icons = result && typeof result === 'object' && !Array.isArray(result) ? result : {};
      cached = { key, icons, expires: Date.now() + 60_000 };
      setIcons(icons);
    }).catch(() => {
      // Missing or unreadable branding never blocks project actions.
      if (!cancelled) setIcons({});
    });
    return () => { cancelled = true; };
  }, [key, projects.length]);
  return icons;
}
