# Sprint

Superviseur de processus de développement local haute performance — moteur natif Rust (Tauri 2), interface React 19 + Tailwind 4.

## Fonctionnalités

- **Gestion de projets & serveurs** : démarrez, arrêtez ou redémarrez vos serveurs de dev (`npm run dev`, `cargo run`, `python main.py`...) avec protection contre les doubles clics, détection du stack, branche git et éditeur `.env` intégré. Un arrêt inattendu affiche son code de sortie et donne accès aux logs.
- **Aperçu web** : barre compacte, formats ordinateur/tablette/mobile et comparaison. Le serveur, l’adresse, le format, les dimensions libres et le zoom sont mémorisés.
- **Logs temps réel** : choix du serveur par projet pour chaque console, vue divisée, filtrage et historique conservé après l’arrêt. Affichage batché et limité pour les flux volumineux.
- **Télémétrie CPU/RAM** : consommation par serveur (process racine + enfants), rafraîchie toutes les 2 s.
 - **Inspecteur de ports TCP** : scan natif via l'API Windows (`GetExtendedTcpTable`) — indépendant de la langue du système — avec identification des serveurs Sprint.
- **Auto-Restart Anti-Crash** : relance automatique d'un serveur qui plante (max 3 relances / 2 min).
- **Auto-Guard RAM** : redémarrage automatique d'un serveur qui dépasse sa limite de mémoire configurée (cooldown 30 s).
- **Tunnels publics** : partage d'un port local via localtunnel en un clic, process tracké et nettoyé à la fermeture.
- **Palette de commandes** (`Ctrl+K`) : navigation, projets, VS Code, terminaux — entièrement navigable au clavier.
- **Zone de notification Windows** : panneau d’accès rapide dans le thème de Sprint, liste et état des serveurs, lancement/arrêt individuel ou groupé, accès aux logs et aux paramètres. Un double-clic ouvre la fenêtre principale ; Échap ou un clic ailleurs ferme le panneau.
- **Paramètres stables** : navigation fixe et contenu défilant indépendamment, enregistrement avec état d’erreur et nouvelle tentative, aperçu avant restauration d’une sauvegarde.
- **Thème dynamique** : couleur d'accent personnalisable (#HEX), fond continu en clair et sombre, intensité, flou et vitesse réglables. Les animations réduites gardent un fond fixe.
- **Auto-update** : téléchargement des releases GitHub avec validation du domaine source, vérification SHA-256 (SHA256SUMS.txt de la release) et dossier de staging aléatoire.

## Stack

| Couche | Technologies |
|---|---|
| Backend | Rust, Tauri 2, tokio, sysinfo, netstat2 |
| Frontend | React 19, Vite 8, Tailwind CSS 4 |
| Outils | oxlint, parking_lot |

## Développement

```bash
npm install
npm run tauri dev    # lance l'app en mode développement
```

## Build de production

```bash
npm run tauri build  # produit l'installateur NSIS (dist/ + src-tauri/target)
```

## Vérifications

```bash
npm run lint
npm run build
npm run test:ui
npm run test:flows
cd src-tauri
cargo test --lib
```

Les tests UI utilisent Playwright avec les mocks IPC officiels de Tauri : ils n’arrêtent aucun processus réel et ne modifient pas votre configuration. Ils démarrent leur propre serveur Vite puis le ferment. Sous Windows, Microsoft Edge est utilisé ; pour Chromium sur un autre système, installez le navigateur avec `npx playwright install chromium`. Les captures et le rapport sont écrits dans `test-results/` (ignoré par Git).

Voir [la revue UI/UX et les corrections](docs/ux-review-2026-10-07.md).
Voir aussi [les améliorations et le nettoyage du code](docs/improvements-2026-10-07.md).

La version 0.5.8 harmonise les pages Projets, Ports et Logs avec le thème choisi. Voir [les notes de version](docs/releases/v0.5.8.md).

## Structure

```
src/
  components/
    layout/      # TitleBar, Sidebar
    views/       # Home, Projects, Browser, Ports, Terminal, Settings
    settings/    # sections des paramètres et enregistreur de raccourci
    modals/      # Modal de base + ConfirmDialog + formulaires
    ui/          # Modal, ConfirmDialog, Toasts, ContextMenu, Toggle...
  hooks/
    useTauriIPC.js  # état projets, logs batchés, métriques, auto-restart
    useServerOperations.js # état partagé des lancements/arrêts/redémarrages
  services/      # actions serveur, préférences, stockage, thème
  styles/        # base commune puis styles de chaque surface
src-tauri/src/
  lib.rs             # état de l'app, cycle de vie, commandes projets/serveurs
  process_manager.rs # spawn/kill des process + streaming logs
  system_metrics.rs  # télémétrie CPU/RAM + Auto-Guard RAM
  port_inspector.rs  # scan des ports TCP (API native) + arrêt protégé
  updater.rs         # téléchargement vérifié (SHA-256) et installation des mises à jour
  env_files.rs       # lecture/écriture des fichiers .env
  tunnel.rs          # tunnels localtunnel
  shortcut.rs        # raccourci global d'affichage de la fenêtre
  system.rs          # intégrations Windows (VS Code, explorateur, notifications, autostart)
  config_store.rs    # persistance atomique (tmp + rename, quarantaine)
  project_scanner.rs # détection de stack + branche git
  tray_menu.rs       # icône et panneau de la zone de notification
```

## Config utilisateur

`%APPDATA%\sprint\projects.json` — écriture atomique (`.tmp` + remplacement) avec sauvegarde de la version précédente (`.bak`). Les fichiers `.env` sont écrits sans copie `.bak` pour ne pas dupliquer de secrets. Les configurations Portly sont migrées au premier lancement. Un fichier corrompu est mis en quarantaine (`projects.corrupt-*.json`) plutôt qu'écrasé.
