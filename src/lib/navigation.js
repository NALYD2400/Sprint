import { Home, FolderCode, Globe, Network, ScrollText } from 'lucide-react';

export const NAV_ITEMS = [
  {
    id: 'dashboard',
    label: 'Tableau de bord',
    hint: 'Statistiques et serveurs',
    icon: Home,
    key: '1',
  },
  {
    id: 'projects',
    label: 'Projets',
    hint: 'Gérer vos projets et leurs commandes',
    icon: FolderCode,
    key: '2',
  },
  {
    id: 'browser',
    label: 'Aperçu web',
    hint: 'Voir votre site sur ordinateur, tablette et mobile',
    icon: Globe,
    key: '3',
  },
  {
    id: 'ports',
    label: 'Ports',
    hint: 'Qui utilise quel port réseau sur cet ordinateur',
    icon: Network,
    key: '4',
  },
  {
    id: 'terminal',
    label: 'Logs',
    hint: 'Ce que vos applications affichent en direct',
    icon: ScrollText,
    key: '5',
  },
];
