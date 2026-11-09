# Architecture

Le domaine ne dépend de rien ; tout le reste dépend de lui.

## Couches

| Couche             | Dossier         | Contenu                                                                                                   | Peut importer                           |
| ------------------ | --------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Coque applicative  | `src/app/`      | Fenêtre Vue, bascule Composants / Montage                                                                 | features, state, io, render, ui, domain |
| Fonctionnalités    | `src/features/` | `component-editor/`, `library/`, `schematic-editor/`, `export/`, `settings/` ; un store Pinia par éditeur | state, io, render, ui, domain           |
| État               | `src/state/`    | `History` : commandes nommées, patches Immer, undo/redo                                                   | domain                                  |
| Entrées / sorties  | `src/io/`       | Pont IPC (`bridge.ts`), paramètres, bibliothèque, projets, exports, profils, copie de secours, chemins    | domain                                  |
| Rendu              | `src/render/`   | Composants Vue SVG sans état qui dessinent les objets du domaine (composants)                             | domain                                  |
| Interface partagée | `src/ui/`       | Boutons, panneaux, palette de couleurs (rien du métier)                                                   | rien                                    |
| Domaine            | `src/domain/`   | Types, grille, formes, placement, fils, connectivité (jonctions, nets), schémas Zod, migrations, PNG      | zod seulement                           |
| Coque Electron     | `electron/`     | `main.ts` (fenêtre, fichiers, dialogues : seul code Node), `preload.ts` (pont), `api.ts` (contrat)        | Node, Electron                          |

La règle ESLint `no-restricted-imports` sur `src/domain/**` rend la ligne du domaine vérifiable.

## Processus

- **Principal** (`electron/main.ts`) : crée la fenêtre, répond aux appels IPC (fichiers texte et
  binaires, dossiers, suppression d'un dossier de composant, dialogues, chemins). Rien d'autre.
- **Preload** (`electron/preload.ts`) : expose `window.pinout`, implémentation typée de
  `PinoutApi` (`electron/api.ts`). contextIsolation et sandbox activés, nodeIntegration désactivé.
- **Rendu** (`src/`) : Vue 3, Pinia, SVG. N'accède à Node que via `window.pinout`, lui-même
  encapsulé par `src/io/bridge.ts` (remplaçable par une fausse implémentation dans les tests).

## État et commandes

Chaque éditeur garde son document dans un `shallowRef` ; le document est immuable (gelé par
Immer). Toute modification passe par une commande nommée du store (`setSize`, `addPrimitive`,
`movePin`…) qui appelle `History.apply(label, recipe)` : Immer produit un nouveau document et les
patches inverses, l'annulation les rejoue. Les champs de l'inspecteur valident au changement,
pas à chaque touche, donc une saisie = une commande.

Dans le montage, toute commande qui déplace ou réoriente des composants passe par
`applyWithElasticWires` : après la recette, `wiresFollowingPins` (`src/domain/elastic.ts`) compare
la position des broches avant et après et fait suivre les extrémités de fil posées dessus (coude
ajouté par `dragVertex`) ; le canevas appelle la même fonction pour l'aperçu pendant le glisser.
Poser un composant depuis la bibliothèque remplace la copie embarquée de sa définition si elle a
changé (même commande élastique) : un projet suit la dernière version posée et garde son autonomie.

Le store du montage distingue le profil du projet (`doc.profile`, enregistré) du profil affiché
(`profile` = `profilePreview` s'il y en a un) : la boîte de profil prévisualise sans toucher à
l'historique et ne crée qu'une commande à la validation.

## Interface partagée (`src/ui/`)

`ModalDialog` (fond, Échap, compteur `openModals`), `PromptDialog` (saisie d'une valeur),
`ContextMenu` + `contextMenu.ts` (menu flottant : entrées, titres, séparateurs, pastilles de
couleur ; sert au clic droit du montage et au menu Fichier de la barre d'application), `Icon` +
`icons.ts` (pictogrammes SVG inline, un tableau de tracés par nom, testés en rendu).
`theme.ts` applique le thème choisi dans les paramètres ; les styles n'emploient que les variables
CSS déclarées dans `src/app/style.css` (jeux clair et sombre), sauf les surfaces de dessin, qui
restent claires.

## Conventions de coordonnées

- Unité du domaine : la cellule de grille, en entiers. Canevas infini, négatifs permis.
- Les composants occupent des cellules ; leur origine est le coin supérieur gauche.
- Les broches et les fils vivent sur les intersections. Une broche est sur le bord du composant ;
  l'éditeur accroche le clic à l'intersection du bord la plus proche (`nearestBorderPoint`).
- Transformation d'une instance : miroir horizontal d'abord, puis rotation horaire, en gardant le
  coin supérieur gauche de la boîte à l'origine (`transformLocalPoint`). Le miroir vertical de
  l'interface = miroir horizontal + 180°.
- Primitives du mini-éditeur : entiers en quarts de cellule, repère local du composant ;
  hauteurs de texte en cellules. L'épaisseur d'un trait n'est pas stockée en cellules mais comme
  multiplicateur (`weight`) du trait de base du profil de style (`componentStroke`) : changer de
  profil change l'épaisseur de tous les composants du montage. Les poignées de redimensionnement
  (`handles.ts`) et les pointes de flèche (`arrows.ts`) sont de la géométrie pure du domaine.
- Textes variables : un texte marqué `variable` porte le nom d'un champ ; chaque instance posée
  garde ses valeurs dans `fields` (nom → texte), la définition fournit `defaultValue`.
- PNG : 80 px par cellule. Un PNG d'une autre taille est rééchantillonné sur confirmation.
  Le profil de style (`cellPx`, par défaut 20) ne règle que l'affichage.

## Croisements et connectivité

`src/domain/connectivity.ts` dérive de la géométrie ce qui est relié : jonctions (une extrémité
sur un sommet ou un segment d'un autre fil), extrémités libres, nets par union-find, broches
reliées à rien. `src/domain/crossings.ts` trouve les croisements stricts (segment horizontal contre
segment vertical, hors sommets) et décide du fil du dessus : le rang d'empilement, sauf exception
locale stockée dans `crossingOverrides` (Alt+clic). Le fil du dessus est redessiné sur une
demi-cellule avec un liseré couleur de fond ; les exceptions orphelines sont élaguées à chaque
commande. Rien de tout cela n'est stocké, sauf les exceptions.

## Export

`src/domain/svg.ts` construit un SVG autonome : viewBox en cellules (étendue du contenu plus une
marge, une cellule réservée au-dessus des composants pour leurs repères), largeur et hauteur en
pixels = cellules × `cellPx` du profil × échelle (1×, 2×, 4×). Même ordre d'empilement que
l'éditeur, extrémités « prolongées » dessinées en flèche, aucun marqueur d'édition. Le PNG est
obtenu en dessinant ce SVG sur un canvas aux dimensions exactes (`src/features/export/svgToPng.ts`),
donc avec la même netteté que le SVG ; les PNG embarqués sont rééchantillonnés par le navigateur.

## Copie de secours et fermeture

Tant que le montage a des modifications non enregistrées, `App.vue` écrit toutes les
`autosaveSeconds` une copie dans `userData/autosave/` (projet + contexte : nom, chemin d'origine,
date) et l'efface dès que le montage est propre. Au lancement, une copie présente est proposée.
À la fermeture, le processus principal connaît l'état (`setDirty`) : s'il y a des modifications,
il demande confirmation, puis le rendu écrit la copie de secours avant de confirmer la fermeture
(`discard-then-quit` efface la copie de secours puis ferme, avec un délai de repli de 3 s ;
`save-then-quit` enregistre d'abord, sans délai, et `cancelQuit` garde la fenêtre si l'utilisateur
renonce). La copie de secours ne survit qu'à un arrêt brutal : c'est alors qu'elle est proposée.

## Fichiers

Tous en JSON indenté, avec `schemaVersion`, validés par Zod à l'ouverture, migrés étape par étape
(`src/domain/migrations.ts`). Un fichier d'exemple par version dans `src/domain/fixtures/`.
Versions courantes : composant 7 (textes droits sur le montage, boîtes de texte multilignes, flèche au milieu, graisse des textes, épaisseur en multiplicateur, flèches, textes variables avec
unité, plus de `labelPrefix`), projet 10 (étiquettes texte en boîte, police des étiquettes d'extrémité dans le profil, graisse des étiquettes, étiquettes d'extrémité des fils, `componentStroke` dans le profil, `fields` par instance,
définitions embarquées migrées à chaque version des composants), paramètres 6 (`componentStroke`
et `endLabelFont` du profil par défaut, thème, ouverture du panneau).

| Donnée                  | Schéma                      | Emplacement                                                             |
| ----------------------- | --------------------------- | ----------------------------------------------------------------------- |
| Définition de composant | `componentDefinitionSchema` | `<bibliothèque>/<id>/component.json` (+ `image.png` pour un visuel PNG) |
| Projet                  | `projectSchema`             | où l'utilisateur veut, `*.pinout.json`, autonome                        |
| Profil de style         | `styleProfileSchema`        | copié dans chaque projet ; modèles dans `userData/profiles/`            |
| Paramètres              | `settingsSchema`            | `userData/settings.json` (`userData` = `%APPDATA%\Pinout`)              |

La bibliothèque vit par défaut dans OneDrive (`(Cours)\Robotique\(Ressources)\Pinout\library` sous la racine
`OneDriveCommercial` ou `OneDrive` de la machine), sinon dans `userData/library` ; les paramètres
peuvent pointer ailleurs, un dossier pris dans OneDrive étant enregistré relativement à sa racine. Le nom du dossier d'un composant est son identifiant,
dérivé du nom à la première sauvegarde et stable ensuite.

Un projet embarque une copie de chaque définition utilisée (`embeddedDefs`, une par type, PNG en
dataUrl) et de son profil : il se rouvre à l'identique sans bibliothèque. Les jonctions ne sont
pas stockées, elles se déduisent de la géométrie des fils.

## Dépendances et pourquoi

- `vue`, `pinia` : interface et état d'interface.
- `immer` : patches pour l'historique undo/redo.
- `zod` : validation des fichiers et types dérivés.
- `electron`, `electron-vite`, `electron-builder` : coque, build, installeur.
- `electron-updater` : mise à jour automatique depuis les releases GitHub (vérification au
  lancement, téléchargement à la demande, installation au clic) ; lit `latest.yml` de la release.
- Outillage : TypeScript strict, ESLint (configs electron-toolkit + plugin Vue), Prettier, Vitest,
  Vue Test Utils + jsdom pour les tests de rendu.

Aucun framework de diagramme : le rendu des composants et des fils est à nous, en SVG.
