import { useEffect, useState } from 'react';
import { Atom, Braces, Cog, FileCode2, FolderCode, Globe, Monitor } from 'lucide-react';

function frameworkIcon(framework) {
  const name = String(framework || '').toLowerCase();
  if (name.includes('tauri') || name.includes('electron')) return Monitor;
  if (name.includes('react') || name.includes('next')) return Atom;
  if (name.includes('rust')) return Cog;
  if (name.includes('python')) return FileCode2;
  if (name.includes('static') || name.includes('html')) return Globe;
  if (name.includes('node') || name.includes('vite') || name.includes('vue')) return Braces;
  return FolderCode;
}

export default function ProjectAvatar({ project, image, small = false }) {
  const source = image?.dataUrl;
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [source]);
  const Icon = frameworkIcon(project.framework);
  return <span className={`project-avatar${small ? ' project-avatar-small' : ''}`} aria-hidden="true" style={{ color: project.color || 'var(--accent-readable)' }}>
    {source && !failed ? <img src={source} alt="" draggable="false" onError={() => setFailed(true)} /> : <Icon size={small ? 14 : 17} strokeWidth={1.7} />}
  </span>;
}
