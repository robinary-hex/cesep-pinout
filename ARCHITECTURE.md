# Architecture

Le domaine ne dépend de rien ; tout le reste dépend de lui.

## Couches

| Couche             | Dossier         | Contenu                                                                                              | Peut importer                           |
| ------------------ | --------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Coque applicative  | `src/app/`      | Fenêtre Vue, bascule Composants / Montage                                                            | features, state, io, render, ui, domain |
| Fonctionnalités    | `src/features/` | `component-editor/`, `library/`, `schematic-editor/`, puis `export/` ; un store Pinia par éditeur    | state, io, render, ui, domain           |
| État               | `src/state/`    | `History` : commandes nommées, patches Immer, undo/redo                                              | domain                                  |
| Entrées / sorties  | `src/io/`       | Pont IPC (`bridge.ts`), paramètres, bibliothèque sur disque, chemins                                 | domain                                  |
| Rendu              | `src/render/`   | Composants Vue SVG sans état qui dessinent les objets du domaine (composants)                        | domain                                  |
| Interface partagée | `src/ui/`       | Boutons, panneaux, palette de couleurs (rien du métier)                                              | rien                                    |
| Domaine            | `src/domain/`   | Types, grille, formes, placement, fils, connectivité (jonctions, nets), schémas Zod, migrations, PNG | zod seulement                           |
| Coque Electron     | `electron/`     | `main.ts` (fenêtre, fichiers, dialogues : seul code Node), `preload.ts` (pont), `api.ts` (contrat)   | Node, Electron                          |

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

## Conventions de coordonnées

- Unité du domaine : la cellule de grille, en entiers. Canevas infini, négatifs permis.
- Les composants occupent des cellules ; leur origine est le coin supérieur gauche.
- Les broches et les fils vivent sur les intersections. Une broche est sur le bord du composant ;
  l'éditeur accroche le clic à l'intersection du bord la plus proche (`nearestBorderPoint`).
- Transformation d'une instance : miroir horizontal d'abord, puis rotation horaire, en gardant le
  coin supérieur gauche de la boîte à l'origine (`transformLocalPoint`). Le miroir vertical de
  l'interface = miroir horizontal + 180°.
- Primitives du mini-éditeur : entiers en quarts de cellule, repère local du composant ;
  épaisseurs de trait et hauteurs de texte en cellules.
- PNG : 80 px par cellule. Un PNG d'une autre taille est rééchantillonné sur confirmation.
  Le profil de style (`cellPx`, par défaut 20) ne règle que l'affichage.

## Fichiers

Tous en JSON indenté, avec `schemaVersion`, validés par Zod à l'ouverture, migrés étape par étape
(`src/domain/migrations.ts`). Un fichier d'exemple par version dans `src/domain/fixtures/`.

| Donnée                  | Schéma                      | Emplacement                                                             |
| ----------------------- | --------------------------- | ----------------------------------------------------------------------- |
| Définition de composant | `componentDefinitionSchema` | `<bibliothèque>/<id>/component.json` (+ `image.png` pour un visuel PNG) |
| Projet                  | `projectSchema`             | où l'utilisateur veut, `*.pinout.json`, autonome                        |
| Profil de style         | `styleProfileSchema`        | copié dans chaque projet ; modèles dans `userData/profiles/`            |
| Paramètres              | `settingsSchema`            | `userData/settings.json` (`userData` = `%APPDATA%\Pinout`)              |

La bibliothèque est par défaut `userData/library` ; les paramètres peuvent pointer vers un
autre dossier (OneDrive par exemple). Le nom du dossier d'un composant est son identifiant,
dérivé du nom à la première sauvegarde et stable ensuite.

Un projet embarque une copie de chaque définition utilisée (`embeddedDefs`, une par type, PNG en
dataUrl) et de son profil : il se rouvre à l'identique sans bibliothèque. Les jonctions ne sont
pas stockées, elles se déduisent de la géométrie des fils.

## Dépendances et pourquoi

- `vue`, `pinia` : interface et état d'interface.
- `immer` : patches pour l'historique undo/redo.
- `zod` : validation des fichiers et types dérivés.
- `electron`, `electron-vite`, `electron-builder` : coque, build, installeur.
- Outillage : TypeScript strict, ESLint (configs electron-toolkit + plugin Vue), Prettier, Vitest,
  Vue Test Utils + jsdom pour les tests de rendu.

Aucun framework de diagramme : le rendu des composants et des fils est à nous, en SVG.
