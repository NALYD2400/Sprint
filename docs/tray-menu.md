# Menu Windows : actions par serveur

Un seul sous-menu natif « Serveurs (N) » regroupe tous les serveurs. Chaque ligne porte son logo, un point d’état et une flèche ouvrant ses actions. Survoler une ligne ou l’ouvrir au clavier ne lance et n’arrête aucun processus. Ce fonctionnement utilise les sous-menus natifs Windows, plutôt qu’un second clic droit dans un menu déjà ouvert.

Actions : Démarrer, Arrêter, Ouvrir les logs, Ouvrir l’aperçu web et Ouvrir le dossier. Démarrer est grisé si le serveur tourne, Arrêter s’il est arrêté. Les logs restent accessibles pour un serveur arrêté ; l’aperçu nécessite un port et ouvre l’adresse locale du serveur choisi. Le dossier provient de la configuration actuelle et doit être un répertoire existant. Les opérations de processus ciblent uniquement l’identifiant sélectionné.

Un point rouge indique un serveur arrêté, un point vert un serveur actif. Le point est dessiné sur un coin du logo miniature ou seul si aucun logo n’est disponible. Le sous-menu affiche aussi l’état en texte. Les états viennent du gestionnaire de processus et sont mis à jour après ses événements. La liste garde le même ordre lorsqu’un serveur démarre ou s’arrête. Un processus encore suivi dont le projet a été retiré reste visible avec son action Arrêter.

Les noms sont compacts :

- Projet avec un seul serveur : `Nivra :1438`.
- Plusieurs serveurs : `SR Editer · App :4313`, `SR Editer · Web :3000`.
- Noms personnalisés : conservés, avec une ellipse si nécessaire. Les ports et identifiants ne sont jamais tronqués ; l’identifiant reste indépendant du texte affiché.

Chaque ligne utilise, si disponible, un logo local issu de la même recherche que l’interface principale. Les images PNG, ICO, JPEG et WebP sont décodées avec des limites de dimensions et de mémoire, puis ajustées dans une miniature transparente de 16 × 16 pixels sans déformation. Un format incompatible avec le menu, par exemple SVG, est ignoré au profit du prochain fichier local compatible. L’absence de logo ne bloque pas le lancement.

La recherche et le décodage sont effectués en arrière-plan, une fois par dossier de projet lors de la reconstruction du sous-menu. Aucun téléchargement n’est effectué. Les menus natifs conservent uniquement les petites images RGBA ; les miniatures sont réutilisées pour les serveurs du même projet.

Validation : `cargo test --manifest-path src-tauri/Cargo.toml --lib --no-default-features --offline --locked` — 36 tests réussis. Couverture ajoutée : actions ciblées et disponibilité selon l’état, liste stable, points rouges et verts avec ou sans logo, projet retiré, renommage, ports, noms longs, miniatures, images invalides et repli vers un format local compatible.

`npm run test:ui` — 142 contrôles réussis, dont l’ouverture des bonnes consoles et des bons aperçus depuis les événements du menu, y compris quand la page affiche déjà un autre serveur. `npm run lint` et `npm run build` réussissent.
