# Audit du dimensionnement des icônes — 11 novembre 2026

Les anciens fichiers `search.png` et `collapse-v2.png` font bien 1 254 × 1 254 pixels, mais aucun import de l’interface ne les utilise. Leur présence dans les sources ne signifie pas qu’ils sont chargés ou décodés. Le bouton du menu utilise déjà `collapse.webp` en 192 pixels. Les autres icônes actives font également 192 pixels, sauf CPU et mémoire qui étaient encore en 256 pixels.

Les variantes existantes de 192 pixels restent adaptées : les en-têtes agrandissent certaines images par CSS et les préférences permettent un zoom du texte. Réduire toutes les icônes à leur taille CSS de 24 pixels dégraderait leur netteté sur les écrans haute densité.

## Ajustements

| Image utilisée | Résolution avant | Résolution après | Octets avant | Octets après |
| --- | --- | --- | ---: | ---: |
| CPU | 256 × 256 | 192 × 192 | 23 110 | 7 440 |
| Mémoire | 256 × 256 | 192 × 192 | 29 078 | 10 426 |
| Favicon | 512 × 512 | 128 × 128 | 187 527 | 23 343 |
| Total | | | 239 715 | 41 209 |

Les deux variantes WebP sont `src/assets/navigation/cpu-192.webp` et `memory-192.webp`. `SprintNavIcon` charge ces variantes avec les mêmes dimensions CSS. Le favicon est `public/favicon.png`, référencé par `index.html`. Les sources et les icônes natives restent disponibles.

## Mesure et limites

Le navigateur de contrôle confirme les résolutions réellement décodées. Une surface RGBA de chaque image représente :

- CPU et mémoire : 224 Kio de moins au total.
- Favicon, lorsqu’il est décodé : 960 Kio de moins.
- Total des trois surfaces : **1 212 416 octets, soit 1,15625 Mio de moins**.

Il s’agit d’un budget calculé à partir des pixels décodés, pas d’une mesure de la mémoire physique de l’application. Le navigateur peut conserver plusieurs copies ou des caches, et la WebView native n’affiche pas nécessairement le favicon. Aucun gain de RAM Windows n’est attribué à cette seule modification.

Contrôle visuel dans les deux thèmes, avec zoom du texte à 125 % et densité de pixels 3× : CPU affiché sur 50 pixels CSS, mémoire sur 47,5 pixels CSS. Les images de 192 pixels couvrent respectivement les besoins de 150 et 142,5 pixels physiques. Le rendu et les dimensions d’affichage sont conservés.

`npm run lint` et `npm run build` réussissent. Rapports et captures de comparaison : `test-results/icon-sizing-report.json`, `icon-browser-audit.json` et `icons-{before,after}-{light,dark}-3x.png` (artefacts ignorés par Git).
