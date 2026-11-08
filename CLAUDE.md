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
- Primitives du mini-éditeur : entiers en quarts de cellule. Épaisseur d'une forme = `weight`
  (multiplicateur, choix dans `STROKE_WEIGHTS`) × `componentStroke` du profil de style (0,1 cellule
  par défaut) : un montage change d'épaisseur avec son profil. Lignes et polylignes ouvertes portent
  des flèches optionnelles (`arrows` : début, centre dans le sens du tracé et centrée par son
  centre de gravité, fin), le trait
  s'arrêtant à la base des pointes d'extrémité
  (`trimForArrows`), à l'écran comme à l'export. Un texte `variable` a pour contenu le nom du champ ; l'instance
  posée fournit la valeur (`instance.fields`), sinon `defaultValue` s'affiche ; `bold` met le
  texte en gras, comme sur les étiquettes du montage. Un texte occupe une boîte (`x`, `y`, `w`, `h` en
  quarts) redimensionnable par poignées : lignes (retours à la ligne permis) centrées
  verticalement, alignées à gauche, au centre ou à droite selon `anchor` (`layoutText`) ; l'`unit` éventuelle suit toujours la valeur (espace
  insécable).
- PNG de composant : 80 px par cellule (4× la cellule d'affichage de 20 px).
- Orientation d'une instance : miroir local puis rotation horaire (`transformLocalPoint`,
  `instanceMatrix`). Un miroir à l'écran bascule `mirror` et inverse la rotation
  (`flippedInstance`) ; une rotation à l'écran garde le centre de la boîte (`rotatedInstance`).
- Jonctions : dérivées de la géométrie (une extrémité de fil sur un autre fil), jamais stockées ;
  un croisement en milieu de segment ne connecte pas.
- Raccourcis définis par la lettre (`KeyboardEvent.key`), clavier AZERTY belge, jamais de crochets
  ni de touches AltGr. Les deux seuls chiffres (0, 1) se lisent par touche physique (`event.code`)
  car la rangée du haut demande Maj sur ce clavier.
  - Montage : V sélection (arrête la pose ou le fil), F fil (clic par coude, Maj inverse le L,
    double-clic ou Entrée termine, Retour arrière retire le dernier sommet, Échap termine aussi
    dès deux sommets),
    R / Maj+R rotation, T / Maj+T miroir, Suppr, Échap, flèches = déplacer d'une cellule,
    Ctrl+A / D / C / V, Ctrl+Z / Y, Ctrl+S, Ctrl+Maj+S, Ctrl+O, Ctrl+N, Ctrl+E export, F1 aide,
    Ctrl+Page haut/bas
    (Maj pour premier/arrière-plan) = ordre des fils, 0 ajuster au contenu, 1 zoom 100 %,
    molette = zoom, Espace + glisser ou bouton du milieu = déplacer la vue, E étiquette texte,
    Alt+clic sur un croisement = inverser l'ordre à cet endroit seulement, I = panneau de
    propriétés (replié par défaut), clic droit = menu contextuel (composant, fil, étiquette ou
    vide ; termine un fil en cours, arrête une pose), double-clic = valeur d'un composant ou texte
    d'une étiquette. Pose d'un composant : clic dans le panneau puis clic sur le montage, ou
    glisser-déposer ; une pose = un composant (la pose s'arrête, le composant posé est sélectionné).
    Poser un composant remplace la copie embarquée de sa définition par celle de la bibliothèque
    si elle a changé, pour tout le montage (fils élastiques compris). Alt+glisser dépose une copie
    de la sélection (Alt+clic sur un croisement garde son rôle) ; double-clic sur l'extrémité
    libre d'un fil saisit son étiquette d'extrémité.
- Fils : la géométrie pure est dans `src/domain/wires.ts` (tracé, coins arrondis, édition de
  segments et de sommets), la connectivité dérivée dans `src/domain/connectivity.ts` (jonctions,
  extrémités libres, nets par union-find). Un fil garde ses extrémités fixes quand on déplace un
  segment ou un sommet : un coude s'ajoute au besoin. Un sommet au milieu d'un segment droit est
  permis ; les demi-tours et les sommets confondus sont refusés. Le L d'un tracé suit l'axe
  dominant (Maj inverse). Élasticité (`src/domain/elastic.ts`) : les extrémités posées sur une
  broche suivent le composant déplacé, tourné ou retourné ; un fil déplacé en bloc garde ses
  extrémités sur les broches immobiles. Un nouveau fil prend la couleur du dernier fil tracé ou
  recoloré (`currentColor`, recalée sur le dernier fil du projet à l'ouverture). Extrémités
  libres (`freeEnds`) : nettes, en flèche ou en pointillés, dessinées pareil à l'écran et à
  l'export par `src/domain/wireEnds.ts` (corps raccourci, pointe sur le bout du fil, queue
  pointillée d'1,5 cellule). Étiquettes d'extrémité (`endLabels`) : point sur le bout libre et
  texte placé à l'opposé du fil, position toujours dérivée de la géométrie, police `endLabelFont` du
  profil (14 pt par défaut), toujours en gras. Arrêter un tracé (Échap, changement d'outil) garde le fil dès qu'il a
  deux sommets ; un seul point est abandonné (`stopWireDrawing`).
- Export : `src/domain/svg.ts` construit le SVG autonome (viewBox en cellules, même ordre
  d'empilement que l'éditeur, sans marqueurs d'édition) ; `src/features/export/` le rastérise en
  PNG via un canvas et le copie dans le presse-papiers. Les réglages d'export, la palette, le profil
  par défaut, les fichiers récents et l'intervalle de copie de secours sont dans les paramètres
  (schéma v2 ; la migration 1 → 2 est dans `src/domain/migrations.ts`).
- Copie de secours : `src/io/autosave.ts` écrit `userData/autosave/` tant que le montage a des
  modifications non enregistrées ; `App.vue` la propose au lancement. La garde à la fermeture est
  dans `electron/main.ts` (le rendu tient `setDirty` à jour, puis répond à `autosave-then-quit`).
- Barre d'application (`src/app/App.vue`) : menu Fichier (nouveau, ouvrir, récents, enregistrer,
  exporter, paramètres, raccourcis, quitter) construit avec `ContextMenu` et appelant les actions
  que `SchematicEditor` / `ComponentEditor` exposent par `defineExpose` selon le mode. Les barres
  d'outils ne portent plus d'actions de fichier ; dans le montage, rotation, miroir, duplication,
  suppression et ordre des fils ne sont accessibles que par le menu contextuel et le clavier. Pictogrammes : `src/ui/Icon.vue` dessine les
  tracés de `src/ui/icons.ts` (SVG inline, trait de la couleur courante, pas de police d'icônes).
- Thème clair ou sombre choisi dans les paramètres (`theme`) : `src/ui/theme.ts` pose
  `data-theme` sur `<html>` et toutes les couleurs de l'interface passent par les variables CSS de
  `src/app/style.css`, jamais en dur dans les styles ; les surfaces de dessin (`--paper`) sont blanches en clair et
  gris bleuté en sombre (grille et textes sur papier via `--grid-*` et `--paper-text`) ; l'export
  garde ses propres couleurs. Le noir pur (`#000000`) des composants et des fils s'affiche dans
  l'encre du thème (`--ink`, via `screenColor` de `src/render/ink.ts`), blanc cassé en sombre ;
  l'export reste noir. Les surbrillances (net survolé, fils sélectionnés) sont des groupes à
  opacité unique : deux fils qui se chevauchent ne s'additionnent pas.
  Les marques d'extrémité libre et de broche reliée à rien prennent `--alert` (rouge en clair, ambre
  en sombre) ; l'aperçu d'export transparent est hachuré (`--hatch-*`).
- Profil de style : la boîte « Profil de style du montage » prévisualise chaque réglage sur le
  montage via `profilePreview` (le store expose `profile` = aperçu ou profil du projet) et
  n'enregistre qu'à « Appliquer », en une commande. Les Paramètres proposent « Appliquer au
  montage ouvert » pour copier le profil par défaut dans le projet courant.
- Boîtes de dialogue : `src/ui/ModalDialog.vue` ; tant qu'une est ouverte (`openModals`), les
  éditeurs ignorent leurs raccourcis. `src/ui/PromptDialog.vue` (saisie d'une valeur) et
  `src/ui/ContextMenu.vue` (menu contextuel, entrées décrites dans `contextMenu.ts`) comptent aussi
  dans `openModals`.
- Croisements : `src/domain/crossings.ts` (croisements stricts, fil du dessus, exceptions Alt+clic
  élaguées à chaque commande). Broches reliées à rien : `unconnectedPinKeys` de la connectivité.
- Exécutable : `pnpm icon` régénère `build/icon.png` (script sans dépendance), `pnpm build:win`
  produit l'installeur NSIS et l'exe portable dans `release/` (non signés : avertissement
  SmartScreen au premier lancement, normal). Un `.json` passé en argument s'ouvre au lancement.
  - Éditeur de composants : V sélection, R rectangle, O ellipse, L ligne, P polyligne, E texte,
    B broche, Suppr, Échap, Entrée (termine une polyligne), Ctrl+Z / Ctrl+Y, Ctrl+S, Ctrl+N,
    Ctrl+molette = zoom centré sur le curseur (boutons −/+/Ajuster dans la barre). La forme
    sélectionnée montre ses poignées (`src/domain/handles.ts`) ; Ctrl+glisser sur une forme saisit
    la poignée la plus proche. Redimensionner le composant supprime les broches qui ne sont plus sur
    le bord ; les noms numériques des broches suivent toujours leur ordre (`renumberPins`).
    Sélection multiple : lasso dans le vide, Maj+clic ajoute ou retire une forme, glisser déplace
    toutes les formes sélectionnées, Alt+glisser en dépose une copie, Ctrl+C / V / D copient,
    collent (décalées d'une cellule) et dupliquent ; le panneau de droite ne montre que l'élément
    sélectionné (forme, formes ou broche), sinon le composant.
    Maj pendant le tracé d'un rectangle ou d'une ellipse impose un carré ou un cercle. Tailles des
    textes proposées en multiples (×1, ×1,5, ×2) d'une hauteur de référence de 0,5 cellule, comme
    les étiquettes du montage le sont de la taille des repères du profil ; la valeur stockée reste
    absolue. Les panneaux ne portent pas de texte explicatif : l'aide est dans F1. L'outil Texte
    revient à la sélection dès qu'un texte est posé, dans les deux éditeurs.
- Interface, messages, commentaires, commits en français ; identifiants de code en anglais.
- Fichiers JSON avec `schemaVersion` ; migrations dans `src/domain/migrations.ts` ; un fixture
  par version dans `src/domain/fixtures/`. Versions courantes : composant 6, projet 8, paramètres 5
  (la v1 des composants avait `strokeWidth` en cellules et `labelPrefix`, migrés en `weight` et
  supprimé).
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
