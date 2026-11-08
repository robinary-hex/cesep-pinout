# Pinout — règles du projet

Éditeur personnel de petits schémas électroniques (Electron + Vue 3 + TypeScript), un seul
utilisateur, Windows. Le plan de conception complet (décisions, formats, feuille de route) est
le document « Pinout — Plan de conception » : https://claude.ai/artifact/HMfQhs9L6FtgtXCTa6RfNz

## Commandes

- `pnpm dev` : lance l'application avec rechargement à chaud
- `pnpm check` : typecheck + lint + tests, à passer avant chaque commit
- `pnpm test` / `pnpm test:watch` : tests Vitest
- `pnpm build` : build electron-vite ; `pnpm build:win` : installeur NSIS + exe portable dans `release/`

## Architecture (détail dans ARCHITECTURE.md)

- `src/domain/` : TypeScript pur, zéro Vue, Pinia, Electron ou Node (règle ESLint). Géométrie,
  schémas Zod, migrations, nets : tout y vit et s'y teste sans fenêtre.
- Sens des dépendances : app → features → state → domain ; `io` et `render` sont appelés par
  features et app ; le domaine n'importe rien d'autre.
- Toute modification d'un document passe par une commande nommée du store de l'éditeur, qui
  produit des patches Immer via `src/state/history.ts` : c'est ce qui donne undo/redo.
- `electron/main.ts` est le seul code qui touche Node. Le rendu passe par le pont IPC typé
  (`electron/api.ts`, exposé par `electron/preload.ts`), contextIsolation activé, sandbox activé.
  Dans les tests, `setBridge()` de `src/io/bridge.ts` remplace le pont par `src/io/testing/fakeFs.ts`.

## Conventions

- Coordonnées du domaine : entiers en unités de grille. Les composants occupent des cellules ;
  broches et fils vivent sur les intersections ; broches uniquement sur le bord du composant.
- Primitives du mini-éditeur : entiers en quarts de cellule.
- PNG de composant : 80 px par cellule (4× la cellule d'affichage de 20 px).
- Orientation d'une instance : miroir local puis rotation horaire (`transformLocalPoint`,
  `instanceMatrix`). Un miroir à l'écran bascule `mirror` et inverse la rotation
  (`flippedInstance`) ; une rotation à l'écran garde le centre de la boîte (`rotatedInstance`).
- Jonctions : dérivées de la géométrie (une extrémité de fil sur un autre fil), jamais stockées ;
  un croisement en milieu de segment ne connecte pas.
- Raccourcis définis par la lettre (`KeyboardEvent.key`), clavier AZERTY belge, jamais de crochets
  ni de touches AltGr. Les deux seuls chiffres (0, 1) se lisent par touche physique (`event.code`)
  car la rangée du haut demande Maj sur ce clavier.
  - Montage : V sélection (arrête la pose ou le fil), W fil (clic par coude, Maj inverse le L,
    double-clic ou Entrée termine, Retour arrière retire le dernier sommet, Échap annule),
    R / Maj+R rotation, T / Maj+T miroir, Suppr, Échap, flèches = déplacer d'une cellule,
    Ctrl+A / D / C / V, Ctrl+Z / Y, Ctrl+S, Ctrl+Maj+S, Ctrl+O, Ctrl+N, Ctrl+E export, F1 aide,
    Ctrl+Page haut/bas
    (Maj pour premier/arrière-plan) = ordre des fils, 0 ajuster au contenu, 1 zoom 100 %,
    molette = zoom, Espace + glisser ou bouton du milieu = déplacer la vue. E (texte) arrive en
    phase 5.
- Fils : la géométrie pure est dans `src/domain/wires.ts` (tracé, coins arrondis, édition de
  segments et de sommets), la connectivité dérivée dans `src/domain/connectivity.ts` (jonctions,
  extrémités libres, nets par union-find). Un fil garde ses extrémités fixes quand on déplace un
  segment ou un sommet : un coude s'ajoute au besoin. Un sommet au milieu d'un segment droit est
  permis ; les demi-tours et les sommets confondus sont refusés.
- Export : `src/domain/svg.ts` construit le SVG autonome (viewBox en cellules, même ordre
  d'empilement que l'éditeur, sans marqueurs d'édition) ; `src/features/export/` le rastérise en
  PNG via un canvas et le copie dans le presse-papiers. Les réglages d'export, la palette, le profil
  par défaut, les fichiers récents et l'intervalle de copie de secours sont dans les paramètres
  (schéma v2 ; la migration 1 → 2 est dans `src/domain/migrations.ts`).
- Copie de secours : `src/io/autosave.ts` écrit `userData/autosave/` tant que le montage a des
  modifications non enregistrées ; `App.vue` la propose au lancement. La garde à la fermeture est
  dans `electron/main.ts` (le rendu tient `setDirty` à jour, puis répond à `autosave-then-quit`).
- Boîtes de dialogue : `src/ui/ModalDialog.vue` ; tant qu'une est ouverte (`openModals`), les
  éditeurs ignorent leurs raccourcis.
  - Éditeur de composants : V sélection, R rectangle, O ellipse, L ligne, P polyligne, E texte,
    B broche, Suppr, Échap, Entrée (termine une polyligne), Ctrl+Z / Ctrl+Y, Ctrl+S, Ctrl+N.
- Interface, messages, commentaires, commits en français ; identifiants de code en anglais.
- Fichiers JSON avec `schemaVersion` ; migrations dans `src/domain/migrations.ts` ; un fixture
  par version dans `src/domain/fixtures/`.
- Pas de framework de diagramme ; pas de dépendance ajoutée sans raison notée dans ARCHITECTURE.md.

## Git

- Un commit par phase de la feuille de route (accordé par Robin le 8 novembre 2026), après
  `pnpm check` vert. Message en français, trailer `Co-Authored-By` conservé.

## Lancer et vérifier l'interface

- Un terminal ouvert par Claude Code hérite de `ELECTRON_RUN_AS_NODE=1` (VS Code) : le retirer
  avant `pnpm dev` (`Remove-Item Env:ELECTRON_RUN_AS_NODE` en PowerShell), sinon le processus
  principal tourne sous Node nu et `electron.app` est indéfini.
- Le bac à sable de Claude Code n'ouvre pas de fenêtre : la vérification visuelle (`pnpm dev`)
  revient à Robin. Les tests et `pnpm build` restent la preuve automatisée.
