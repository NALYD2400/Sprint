# Interface compacte — 11 novembre 2026

Direction retenue : les projets et leurs actions passent en premier. L’identité turquoise/violette et les icônes de navigation sont conservées.

- Tableau de bord : statistiques sur une bande compacte, recherche par projet/serveur/port, liste des serveurs avant les ressources. Les graphiques se déplient à la demande et restent configurables depuis les paramètres. Les erreurs sont distinguées par leur couleur et leur libellé.
- Projets : filtres Tous/Favoris/Actifs/À vérifier, recherche et commande de repli dans une barre dédiée. Chaque projet forme un groupe distinct ; les commandes de lancement et les options sont visibles sans survol. Les listes de serveurs gardent leurs actions existantes.
- Aperçu : sélection du serveur et adresse ensemble, formats d’écran et état du serveur sur une seconde ligne. Le contenu web garde la place disponible.
- Logs : la sélection du serveur appartient à sa console, y compris en mode comparatif. Filtres, recherche et actions restent associés au même flux. La vue divisée reste côte à côte dans les tailles desktop prises en charge.
- Ports : barre de filtres/recherche/tri séparée du tableau, densité et espacements cohérents avec les autres pages.
- Paramètres : icônes pour repérer les sections, état d’enregistrement au niveau du titre, lignes plus compactes. Dans les fenêtres étroites, les onglets défilent horizontalement.

## Vérification

`npm run test:workspace` couvre la recherche, les filtres de projets, les graphiques repliables, la sélection dans les consoles, la place des logs en vue divisée, la récupération après une recherche vide, les six pages dans deux thèmes et deux tailles de fenêtre. Les tests utilisent un backend simulé et ne lancent aucun projet personnel.

Autres contrôles : `npm run test:dashboard`, `npm run test:ui`, `npm run test:flows`, `npm run build`, `npm run lint`.

Les captures sont générées dans `test-results/ux-*.png` (dossier ignoré par Git).

## Icônes créées

Création avec l’outil imagegen intégré, en prenant `src/assets/navigation/projects.webp` comme référence de style. Sorties intégrées et optimisées en WebP 256 × 256, transparence conservée :

- `src/assets/navigation/cpu.webp`
- `src/assets/navigation/memory.webp`

Consigne CPU :

> Create a single small desktop UI icon of a CPU microchip, matching the supplied Sprint folder icon’s glossy polished 3D material: dark navy core, luminous turquoise/cyan bevel, restrained violet highlight at lower edge. Simple front-facing square microchip with a few chunky pins and one readable central chip inset. Strong simple silhouette readable at 28 pixels. Square composition centered, object occupies about 70% of canvas, true transparent background with generous clean margins. No letters, no text, no background tile, no scenery, no additional symbols. Reference is style only.

Consigne mémoire :

> Create a single small desktop UI icon of RAM memory module, matching the supplied Sprint folder icon’s glossy polished 3D material: dark navy body, luminous turquoise/cyan bevels, restrained violet highlight at lower edge. One simple horizontal rounded memory stick, three large dark inset memory chips, short chunky contacts underneath. Front-facing with slight subtle 3D depth. Strong simple silhouette readable at 28 pixels. Square composition centered, module fills about 70% width with clean transparent margins. True transparent background. No letters, no text, no background tile, no scenery, no additional symbols. Reference is style only.

## Logos réels des projets

La page Projets lit désormais les icônes locales des projets enregistrés : déclaration `bundle.icon` Tauri, fichiers d’icônes habituels et liens favicon du HTML. Le logo est affiché dans un carré dans l’en-tête et sur les lignes des serveurs ; un badge conserve l’état en marche/arrêté. Une image absente ou illisible est remplacée par une icône correspondant à la stack.

La lecture est effectuée en arrière-plan, sans modifier les dossiers des projets et sans télécharger d’image. Les chemins sont limités au dossier du projet après résolution des liens. Les images de plus de 512 Kio et les formats non pris en charge sont ignorés. Le résultat est gardé brièvement en cache côté interface pour éviter les scans répétés.

Tests natifs : `cargo test --manifest-path src-tauri/Cargo.toml --lib project_icons --offline`. Le test `test:workspace` couvre aussi un logo valide, un logo cassé, un projet sans logo et la présence des logos sur les lignes de serveurs.

La détection est partagée au niveau de l’application : les mêmes logos sont utilisés sur le tableau de bord et la page Projets. Un ajout de projet ou un changement de dossier déclenche une nouvelle lecture, même si le cache précédent est encore récent. Les logos des projets inchangés restent visibles pendant cette lecture. Le test de parcours ajoute un projet simulé et vérifie l’apparition de son logo sur les deux pages sans rechargement.
