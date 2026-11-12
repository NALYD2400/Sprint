import cpu from '../../assets/navigation/cpu-192.webp';
import memory from '../../assets/navigation/memory-192.webp';
import serversActive from '../../assets/navigation/servers-active.webp';
import React from 'react';
import dashboard from '../../assets/navigation/dashboard.webp';
import projects from '../../assets/navigation/projects.webp';
import browser from '../../assets/navigation/browser.webp';
import ports from '../../assets/navigation/ports.webp';
import terminal from '../../assets/navigation/terminal.webp';
import help from '../../assets/navigation/help.webp';
import settings from '../../assets/navigation/settings.webp';
import collapse from '../../assets/navigation/collapse.webp';
import update from '../../assets/navigation/update.webp';
import previewAdd from '../../assets/navigation/preview-add-symbol.webp';
import previewControls from '../../assets/navigation/preview-controls-symbol.webp';
import previewQr from '../../assets/navigation/preview-qr-symbol.webp';
import previewLogs from '../../assets/navigation/preview-logs-symbol.webp';

const icons = { dashboard, projects, browser, ports, terminal, help, settings, collapse, cpu, memory, update, serversActive, previewAdd, previewControls, previewQr, previewLogs };
// The artwork has different amounts of transparent padding around each symbol.
// Scale each image so the visible symbols occupy roughly the same 24px space.
const imageSizes = { dashboard: 36, projects: 46, browser: 50, ports: 43, terminal: 36, help: 31, settings: 31, collapse: 36, cpu: 40, memory: 38, update: 32, serversActive: 52, previewAdd: 34, previewControls: 40, previewQr: 40, previewLogs: 48 };

export default function SprintNavIcon({ name, active = false, mirrored = false }) {
  const src = icons[name];
  if (!src) return null;
  return (
    <span aria-hidden="true" className={`relative block h-6 w-6 shrink-0 transition-transform duration-500 ${mirrored ? '-scale-x-100' : ''}`}>
      <img
        src={src}
        alt=""
        draggable="false"
        style={{ width: imageSizes[name], height: imageSizes[name] }}
        className={`pointer-events-none absolute left-1/2 top-1/2 max-w-none -translate-x-1/2 -translate-y-1/2 transition-opacity ${active ? 'opacity-100' : 'opacity-80'}`}
      />
    </span>
  );
}
