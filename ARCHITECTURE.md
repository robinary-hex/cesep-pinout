# Architecture

Le domaine ne dépend de rien ; tout le reste dépend de lui.

## Couches

| Couche             | Dossier         | Contenu                                                                                  | Peut importer                   |
| ------------------ | --------------- | ---------------------------------------------------------------------------------------- | ------------------------------- |
| Coque applicative  | `src/app/`      | Fenêtre Vue, bascule Composants / Montage, raccourcis globaux                            | features, state, io, ui, domain |
| Fonctionnalités    | `src/features/` | `component-editor/`, `schematic-editor/`, `library/`, `export/`                          | state, io, ui, domain           |
| État               | `src/state/`    | Stores Pinia, commandes nommées, historique undo/redo par patches Immer                  | domain                          |
| Entrées / sorties  | `src/io/`       | Pont IPC (`bridge.ts`), autosave, paramètres, bibliothèque sur disque                    | domain                          |
| Interface partagée | `src/ui/`       | Boutons, panneaux, palette de couleurs                                                   | rien du métier                  |
| Domaine            | `src/domain/`   | Types, grille, géométrie des fils, jonctions, nets, schémas Zod, migrations              | rien (zod seulement)            |
| Coque Electron     | `electron/`     | `main.ts` (fenêtre, fichiers, dialogues : seul code Node), `preload.ts` (pont), `api.ts` | Node, Electron                  |

La règle ESLint `no-restricted-imports` sur `src/domain/**` rend la dernière ligne vérifiable.

## Processus

- **Principal** (`electron/main.ts`) : crée la fenêtre, répond aux appels IPC (lecture et
  écriture de fichiers texte, dialogues, chemins de l'application). Rien d'autre.
- **Preload** (`electron/preload.ts`) : expose `window.pinout`, implémentation typée de
  `PinoutApi` (`electron/api.ts`). contextIsolation et sandbox activés, nodeIntegration désactivé.
- **Rendu** (`src/`) : Vue 3, Pinia, SVG. N'accède à Node que via `window.pinout`.

## Conventions de coordonnées

- Unité du domaine : la cellule de grille, en entiers. Canevas infini, négatifs permis.
- Les composants occupent des cellules ; leur origine est le coin supérieur gauche.
- Les broches et les fils vivent sur les intersections. Une broche est sur le bord du composant.
- Transformation d'une instance : miroir horizontal d'abord, puis rotation horaire, en gardant le
  coin supérieur gauche de la boîte à l'origine (`transformLocalPoint`). Le miroir vertical de
  l'interface = miroir horizontal + 180°.
- Primitives du mini-éditeur : entiers en quarts de cellule, repère local du composant.
- PNG : 80 px par cellule. Le profil de style (`cellPx`, par défaut 20) ne règle que l'affichage.

## Fichiers

Tous en JSON indenté, avec `schemaVersion`, validés par Zod à l'ouverture, migrés étape par étape
(`src/domain/migrations.ts`). Un fichier d'exemple par version dans `src/domain/fixtures/`.

| Donnée                  | Schéma                      | Emplacement                                                  |
| ----------------------- | --------------------------- | ------------------------------------------------------------ |
| Définition de composant | `componentDefinitionSchema` | `<bibliothèque>/<slug>/component.json` (+ `image.png`)       |
| Projet                  | `projectSchema`             | où l'utilisateur veut, `*.pinout.json`, autonome             |
| Profil de style         | `styleProfileSchema`        | copié dans chaque projet ; modèles dans `userData/profiles/` |
| Paramètres              | `settingsSchema`            | `userData/settings.json`                                     |

Un projet embarque une copie de chaque définition utilisée (`embeddedDefs`, une par type) et de
son profil : il se rouvre à l'identique sans bibliothèque. Les jonctions ne sont pas stockées,
elles se déduisent de la géométrie des fils.

## Dépendances et pourquoi

- `vue`, `pinia` : interface et état d'interface.
- `immer` : patches pour l'historique undo/redo.
- `zod` : validation des fichiers et types dérivés.
- `electron`, `electron-vite`, `electron-builder` : coque, build, installeur.
- Outillage : TypeScript strict, ESLint (configs electron-toolkit + plugin Vue), Prettier, Vitest.

Aucun framework de diagramme : le rendu des fils et des composants est à nous, en SVG.
