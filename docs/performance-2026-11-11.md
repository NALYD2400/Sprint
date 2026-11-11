# Optimisations de performance — 11 novembre 2026

Les fonctionnalités, les transitions, le suivi de la souris, les thèmes et les historiques sont conservés.

## Changements

- Fond animé : textures de dégradés et flou précalculés, tampon à un quart de la résolution logique, avec plafond pour les très grandes fenêtres. Aucune lecture de géométrie ni création de dégradé pendant les images d’animation.
- Dérive du fond à 15 images/s au repos et suivi de la souris à 30 images/s. La vitesse des déplacements reste fondée sur le temps écoulé. Arrêt du rendu quand la fenêtre est masquée ou les animations réduites.
- Métriques isolées dans un fournisseur React : les mesures ne recalculent plus le menu, les projets, les paramètres et les modales. L’historique continue d’être enregistré pendant la navigation, avec les mêmes limites de 15 minutes et 1 000 mesures.
- Logs : file circulaire bornée aux 2 000 lignes déjà conservées par le produit, traitement uniquement des lignes encore retenues et partage d’un instantané par lot. Les instantanés en pause restent stables. L’observateur de taille de la console ne se recrée plus à chaque lot.
- Backend : pas de scan initial des processus ni de construction de leur arbre lorsque tous les serveurs sont arrêtés. Les métriques système et la protection RAM restent disponibles.
- Images du logo et du bouton de menu : ressources WebP de 192 px, adaptées à leur affichage et aux écrans haute densité. Les deux images passent de 1 059 295 à 14 338 octets ; les originaux restent disponibles.

## Mesures

Test Chromium, fenêtre 1 320 × 860, cinq secondes :

| Mesure | Avant | Après |
| --- | ---: | ---: |
| Temps de travail du navigateur (`TaskDuration`) | 1 830 ms | 178 ms |
| Dégradés créés pendant l’échantillon | 288 | 0 |
| Lectures de géométrie du fond | 96 | 0 |
| Pixels du tampon principal | 1 716 000 | 107 250 |
| Rendus du shell pour 20 mesures, en développement StrictMode | 40 | 0 |

Cadence vérifiée : 15 images/s au repos, 30 pendant le suivi du pointeur. Comparaison du fond statique avec les dégradés et le flou initiaux : écart moyen par canal de 1,14/255 en sombre et 0,538/255 en clair.

Application Windows de développement relancée, sept processus dont WebView, échantillon de 12,05 secondes sur 12 processeurs logiques : **0,83 % de CPU total**, **180 Mio de mémoire physique privée**, 262,8 Mio d’engagement privé. La mesure précédente était de 1,17 % de CPU et 341 Mio de mémoire privée. Le redémarrage et la durée de fonctionnement influencent la mémoire : ces échantillons ne constituent pas une preuve de réduction permanente de moitié, ni un test de fuite de mémoire de longue durée. Les chiffres du navigateur ne représentent pas le CPU de l’ensemble de l’application.

## Validation et reproduction

- `npm run lint` et `npm run build` : succès.
- `npm run test:ui` : 138 contrôles, aucune erreur.
- `npm run test:dashboard`, `npm run test:flows` : succès, dont 48 contrôles des parcours serveur.
- `npm run test:workspace` : recherche, logos, actions et 24 états de mise en page validés.
- `cargo test --manifest-path src-tauri/Cargo.toml --lib --no-default-features --offline` : 28 tests réussis.
- `npm run test:performance` : animation, absence de recalcul du shell, historique hors tableau de bord, rafales de 10 000 puis 2 501 lignes, stabilité des instantanés, pause/reprise, tampon 4K et comparaison des thèmes.
- `./scripts/measure-native-performance.ps1 -Seconds 12` : mesure des processus Windows de Sprint. Préciser `-RootProcessId` si plusieurs instances tournent.

Les rapports JSON et captures de cette session sont dans `test-results/`, dossier généré ignoré par Git. Exécuter les suites navigateur en série : elles partagent le cache de développement de Vite.
