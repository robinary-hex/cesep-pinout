# Pinout — règles du projet

Éditeur personnel de petits schémas électroniques et de diagrammes « boîtes et flèches »
(Electron + Vue 3 + TypeScript), un seul utilisateur, Windows. Le plan de conception complet (décisions, formats, feuille de route) est
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
  broches et fils vivent sur les intersections ; une broche se pose sur n'importe quelle
  intersection de la boîte du composant, bord compris (décision du 9 novembre 2026).
- Primitives du mini-éditeur : entiers en quarts de cellule. Épaisseur d'une forme = `weight`
  (multiplicateur, choix dans `STROKE_WEIGHTS`) × `componentStroke` du profil de style (0,1 cellule
  par défaut) : un montage change d'épaisseur avec son profil. Le remplissage a une opacité
  (`fillOpacity`, 0 à 1, attribut `fill-opacity` à l'écran et à l'export) ; le trait reste
  opaque. Un point (`dot`) est un disque plein dont le diamètre vaut deux traits de composant ×
  `scale` (choix dans `DOT_SCALES`, ×1 à ×3 ; `dotRadiusCells`) : il suit le profil comme les
  traits. Une polyligne ou un polygone peut arrondir ses angles (`radius`, en quarts de cellule,
  comme `rx` du rectangle) : chaque sommet devient un arc tangent à ses deux côtés, quel que
  soit l'angle, limité à la moitié d'un côté (`roundedPathData`). Lignes et polylignes ouvertes portent
  des flèches optionnelles (`arrows` : début, centre dans le sens du tracé et centrée par son
  centre de gravité, fin), le trait
  s'arrêtant à la base des pointes d'extrémité
  (`trimForArrows`), à l'écran comme à l'export. Un texte `variable` a pour contenu le nom du champ ; l'instance
  posée fournit la valeur (`instance.fields`), sinon `defaultValue` s'affiche ; `bold`, `italic`,
  `underline` et `strike` stylent le texte, `vertical` le tourne de 90° autour du centre de sa
  boîte (`textLayoutBox`, `textTransform`) (`textStyleAttrs`, boutons à
  pictogramme dans le panneau) ; cocher ou décocher « Vertical » tourne aussi une boîte couchée
  dans l'autre sens (`turnedTextBox`, autour de son centre). Les étiquettes du montage ont les
  mêmes styles (`bold`, `italic`, `underline`, `strike`, `vertical`) et une couleur (`color`, le
  noir pur prenant l'encre du thème à l'écran), sans le texte variable ; elles gardent la police
  des libellés du profil (`textEmphasisAttrs`, commandes `setLabelStyle` et `setLabelVertical`).
  Un texte occupe une boîte (`x`, `y`, `w`, `h` en
  quarts) redimensionnable par poignées : lignes (retours à la ligne permis) centrées
  verticalement, alignées à gauche, au centre ou à droite selon `anchor` (`layoutTextBox`, ligne de base
  placée pour centrer les capitales). Les étiquettes texte du montage suivent le même modèle,
  en cellules (`x`, `y`, `w`, `h`, `anchor`), avec poignées sur le canevas et tailles en multiples
  de la police des libellés (×1 à ×3). Sur le montage, les textes d'un composant sont dessinés hors
  de la transformation (`instanceTextPlacements`) : par défaut ils restent horizontaux dans la
  boîte que celle-ci leur donne ; un texte dont `followsRotation` est coché (case « Tourne avec le
  composant » dans l'éditeur) est vertical quand le composant est tourné d'un quart de tour (90°
  ou 270°) et horizontal sinon, tourné autour du centre de sa boîte : jamais à l'envers. Dans les
  deux cas un miroir ne reflète jamais un texte, et l'alignement gauche/droite s'inverse quand la
  transformation retourne l'axe de lecture, pour que le texte reste collé au même bord. L'`unit`
  éventuelle suit toujours la valeur (espace insécable).
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
    molette = zoom, Espace + glisser ou bouton du milieu = déplacer la vue, double-clic du bouton
    du milieu = ajuster au contenu, E étiquette texte (deux clics ou un glisser donnent deux coins
    opposés de la boîte ; deux clics au même point, la boîte par défaut),
    Alt+clic sur un croisement = inverser l'ordre à cet endroit seulement, I = panneau de
    propriétés (replié par défaut, ouvert au clic sur un élément si le paramètre
    `autoOpenInspector` est actif), clic droit = menu contextuel (composant, fil, étiquette ou
    vide ; termine un fil en cours, arrête une pose), double-clic = valeur d'un composant ou texte
    d'une étiquette. Pose d'un composant : clic dans le panneau puis clic sur le montage, ou
    glisser-déposer ; une pose = un composant (la pose s'arrête, le composant posé est sélectionné).
    Poser un composant remplace la copie embarquée de sa définition par celle de la bibliothèque
    si elle a changé, pour tout le montage (fils élastiques compris). Alt+glisser dépose une copie
    de la sélection (Alt+clic sur un croisement garde son rôle) ; double-clic sur l'extrémité
    libre d'un fil saisit son étiquette d'extrémité. En sélection, la broche sous le pointeur
    montre un anneau (`pinGrab`, 8 px autour d'elle) : glisser depuis lui tire un fil de la broche
    jusqu'au point de relâchement (L selon l'axe dominant, Maj l'inverse, arrivée accrochée aux
    broches ; glisser `pin-wire` du canevas, une commande `addWire`), un simple clic sélectionne
    le composant, Maj et Alt gardent leurs gestes sur le composant.
- Fils : la géométrie pure est dans `src/domain/wires.ts` (tracé, coins arrondis, édition de
  segments et de sommets), la connectivité dérivée dans `src/domain/connectivity.ts` (jonctions,
  extrémités libres, nets par union-find). Un fil garde ses extrémités fixes quand on déplace un
  segment ou un sommet : un coude s'ajoute au besoin. Un sommet au milieu d'un segment droit est
  permis ; les demi-tours et les sommets confondus sont refusés. Le L d'un tracé suit l'axe
  dominant (Maj inverse). Élasticité (`src/domain/elastic.ts`) : les extrémités posées sur une
  broche suivent le composant déplacé, tourné ou retourné ; un fil déplacé en bloc garde ses
  extrémités sur les broches immobiles. Les jonctions suivent aussi : quand le tracé d'un fil
  change (déplacé, segment ou sommet glissé, emmené par une broche), les extrémités des autres
  fils posées sur lui le suivent, de proche en proche (`wiresFollowingJunctions`, appliqué dans
  `apply` à chaque commande et dans l'aperçu du canevas) ; une extrémité sur une broche ou
  déplacée par la commande elle-même ne suit pas. Un nouveau fil prend la couleur du dernier fil tracé ou
  recoloré (`currentColor`, recalée sur le dernier fil du projet à l'ouverture). Couleurs proposées
  (`colorChoices`) : la palette de l'application (Paramètres), commune à tous les montages, puis
  les couleurs du montage (`customColors`, huit au plus), ajoutées par le « + » de la barre et
  enregistrées dans son fichier. Extrémités
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
- Copies de secours : `src/io/autosave.ts` tient dans `userData/autosave/` une copie par montage
  modifié (`syncAutosaves(dirtyDocuments())`, fichiers `montage-<onglet>.*`, les autres effacés) ;
  `App.vue` les propose toutes au lancement. Elles ne survivent qu'à un arrêt brutal : quitter en
  enregistrant (chaque onglet modifié, à son tour) ou en abandonnant les efface. La garde à la fermeture est
  dans `electron/main.ts` (le rendu tient `setDirty` à jour, puis répond à `discard-then-quit` (efface la copie de secours) ou `save-then-quit` : Enregistrer / Ne pas enregistrer /
  Annuler, `cancelQuit` si l'enregistrement est abandonné ; l'enregistrement lui-même est dans
  `projectActions.ts` et `componentActions.ts`, partagé avec les éditeurs).
- Modes (`src/app/App.vue`) : un bouton à pictogramme par mode (puce = Composants, résistance =
  Montage, organigramme = Diagramme ; nom en infobulle), l'application démarre sur le montage. Ce que la coque demande à un
  mode (onglets, fermeture, enregistrement avant de quitter, statut) passe par son `ModeAdapter`.
- Barre d'application (`src/app/App.vue`) : menu Fichier (nouveau, ouvrir, récents, enregistrer,
  exporter, paramètres, raccourcis, quitter) construit avec `ContextMenu` et appelant les actions
  que `SchematicEditor` / `ComponentEditor` exposent par `defineExpose` selon le mode. Enregistrer
  sous propose le dossier du projet, sinon celui du dernier projet enregistré ou ouvert
  (`lastProjectDir`, dérivé des fichiers récents) ; Ouvrir s'ouvre dans ce dossier. Les barres
  d'outils ne portent plus d'actions de fichier ; dans le montage, rotation, miroir, duplication,
  suppression et ordre des fils ne sont accessibles que par le menu contextuel et le clavier. Les outils des deux barres sont des
  boutons à pictogramme seul (raccourci dans l'infobulle) ; quand la place manque, la partie gauche
  passe à la ligne, le nom du document et le bouton de droite restent sur la première ligne. Un
  composant dont la bibliothèque a une version plus récente se dessine dans `--stale` (traits
  rouges en clair, jaunes en sombre ; cadre pour un PNG). Pictogrammes : `src/ui/Icon.vue` dessine les
  tracés de `src/ui/icons.ts` (SVG inline, trait de la couleur courante, pas de police d'icônes).
- Onglets de montage (`App.vue`, à droite du bouton Montage) : un par montage ouvert, au nom du
  montage, point s'il est modifié (le bouton du mode qu'on ne regarde pas, Montage ou
  Composants, porte le même point dès qu'un de ses documents ouverts est à enregistrer), croix ou
  clic du milieu pour fermer (s'il est
  modifié : Enregistrer / Ne pas enregistrer / Annuler, dialogue natif `confirmSave` du pont, flux
  dans `closeTabAsking`), « + » pour un nouveau, Ctrl+Tab / Ctrl+Maj+Tab pour passer de l'un à l'autre,
  glisser-déposer pour les réordonner (`moveTab`). La mécanique d'onglets est commune aux
  éditeurs (`useDocumentTabs` de `src/state/tabs.ts`) : le document affiché vit dans des refs, les
  autres sont rangés avec leur historique, leur fichier et leur état d'édition (vue, sélection,
  couleur courante : ce que le store donne à `capture` et reprend dans `restore`) ; `activateTab`
  range l'un et charge l'autre. Nouveau et Ouvrir créent un onglet, ou prennent la place de l'onglet actif s'il
  est vierge (`pristine` : jamais enregistré, jamais modifié) ; rouvrir un fichier déjà ouvert
  ramène son onglet. Un montage n'est « modifié » que s'il a quelque chose à enregistrer : pas
  s'il est intact, ni s'il n'a jamais eu de fichier et qu'il est vide (`needsSaving`) ; de même un
  composant jamais enregistré et vierge. L'application se quitte alors sans question. Le presse-papiers est commun :
  coller dans un autre montage y embarque les définitions qui manquent.
- Onglets de composants : en mode Composants, la rangée d'onglets de la barre d'application montre
  les composants ouverts (même mécanique que les montages, dans le store de l'éditeur de
  composants : `useDocumentTabs`, `activateTab`, `newComponent`, `open` qui ramène l'onglet d'un
  composant de la bibliothèque déjà ouvert, `closeComponentTabAsking` pour la question à trois
  boutons). Le presse-papiers des formes est commun : on copie d'un composant à l'autre.
- Diagramme (`src/features/diagram-editor/`, domaine `src/domain/diagram.ts`,
  `diagramShapes.ts`, `diagramLinks.ts`, `diagramSvg.ts`) : organigrammes, diagrammes d'activité,
  schémas de communication ; pas de diagrammes de séquence ni de classes (décision du 10 novembre
  2026). Document à part, fichier `.pinuml` (JSON, `schemaVersion` 1), même grille infinie que le
  montage mais plus fine (`style.cellPx` = 10).
  - Nœuds : une boîte en cellules entières, une forme du catalogue en dur (`NODE_SHAPES`,
    `NODE_SPECS` : action arrondie, rectangle, décision, départ, fin, fin de flot, fourche, envoi,
    réception, note), un titre et un sous-titre, une couleur et un fond (`fill` : contour, teinté,
    plein). Pas de bibliothèque à créer : `DiagramLibrary.vue` montre le catalogue. Le domaine
    décrit ce que chaque forme dessine (`nodeParts`, `layoutNodeText`) ; `DiagramNodeGraphic.vue`
    à l'écran et `buildDiagramSvg` à l'export peignent la même chose. Losange et disques ont des
    dimensions paires (pointes sur la grille), les disques sont carrés, une barre a une épaisseur
    nulle (`fittedNodeSize`, `resizeNodeBox`). Texte à l'encre du thème, sauf sur un fond plein où
    il contraste (`nodeTextTone`) ; un fond teinté se pose sur une sous-couche couleur papier.
    Police du diagramme : normale (titre demi-gras) ou chasse fixe (sous-titre en italique).
  - Liens : la géométrie des fils (`wires.ts`), coudes posés à la main, pas de routage
    automatique. Pointe ouverte au départ et/ou à l'arrivée, trait plein ou pointillé, couleur,
    étiquette (`label`, décalage en quarts de cellule depuis le milieu du tracé). L'accroche se
    déduit de la géométrie, jamais stockée : une extrémité posée sur un point d'accroche d'un nœud
    (`nodeAnchors` : tour d'un rectangle, quatre pointes d'un losange ou d'un disque, toute une
    barre) le suit quand il bouge, change de taille ou de forme (`linksFollowingNodes`,
    `movedAnchor`, par `wiresFollowingPins`).
  - Couleurs : la palette de l'application puis celles du diagramme (`customColors`), comme pour
    les fils. La palette de la barre colore la sélection et règle la couleur des prochains nœuds,
    ou des prochains liens quand on en trace ou qu'on n'a sélectionné qu'eux (`paletteOnLinks`).
  - Gestes : forme prise dans la bibliothèque (clic puis clic, ou glisser-déposer), le texte se
    tape aussitôt sur place (petit éditeur HTML par-dessus le nœud : Entrée valide, Maj+Entrée va
    à la ligne, Échap abandonne) ; double-clic ou Entrée sur un nœud pour y revenir. V sélection,
    F lien, E texte libre (le modèle des étiquettes texte du montage), R tourne une barre, I
    panneau, Ctrl+Page haut/bas ordre des nœuds, le reste comme le montage. En sélection, le
    point d'accroche sous le pointeur montre un anneau : glisser depuis lui tire un lien.
  - Onglets, copies de secours (`diagramme-<onglet>.*`), question à la fermeture, fichiers
    récents (mêlés à ceux des montages, chaque menu ne montre que les siens), export PNG/SVG
    (`ExportDialog` reçoit de l'éditeur ce qu'il exporte) : comme le montage.
- Thème clair ou sombre choisi dans les paramètres (`theme`) : `src/ui/theme.ts` pose
  `data-theme` sur `<html>` et toutes les couleurs de l'interface passent par les variables CSS de
  `src/app/style.css`, jamais en dur dans les styles ; les surfaces de dessin (`--paper`) sont blanches en clair et
  gris bleuté en sombre (grille et textes sur papier via `--grid-*` et `--paper-text`) ; l'export
  garde ses propres couleurs. Le noir pur (`#000000`) des composants et des fils s'affiche dans
  l'encre du thème (`--ink`, via `screenColor` de `src/render/ink.ts`), blanc cassé en sombre ;
  l'export reste noir. Les surbrillances (net survolé, fils sélectionnés) sont des groupes à
  opacité unique : deux fils qui se chevauchent ne s'additionnent pas.
  Les marques d'extrémité libre et de broche reliée à rien prennent `--alert` (rouge en clair, ambre
  en sombre) ; l'aperçu d'export transparent montre un point à chaque
  intersection de la grille (`--transparent-*`).
- Profil de style : l'application a un profil général (`defaultProfile` des paramètres) et chaque
  montage a le sien, enregistré dans son fichier, avec lequel il se dessine. Une seule boîte,
  `settings/ProfileDialog.vue`, pour les deux : `target="general"` (bouton de la barre
  d'application entre l'aide et les paramètres, et menu Fichier) modifie le profil général, avec
  aperçu sur le montage affiché s'il le suit, et « Appliquer » l'enregistre puis le donne aux
  montages ouverts qui suivaient l'ancien (`followGeneralProfile`) ; `target="montage"` (bouton
  « Modifier le style… » du panneau) modifie le style du montage affiché, en une commande. Le
  panneau surligne en `--alert` les réglages où le montage s'écarte du profil général
  (`profileDifferences`) et propose de l'y aligner (`adoptGeneralProfile`).
- Paramètres en deux fichiers (`src/io/settings.ts`) : un fichier partagé
  `<OneDrive>\(Cours)\Robotique\(Ressources)\Pinout\settings.json`, que OneDrive synchronise entre
  les machines (tout sauf les fichiers récents ; profil général compris), et le fichier local
  `userData/settings.json`, copie complète avec les fichiers récents. Sans OneDrive, seul le local
  existe. Le fichier partagé est relu au lancement, avant chaque enregistrement (seuls les
  réglages modifiés écrasent) et quand la fenêtre reprend la main (`reloadSharedSettings`) ; il
  n'est réécrit que si son contenu change.
- Bibliothèque de composants : dossier par défaut = racine OneDrive de la machine (variables
  `OneDriveCommercial` puis `OneDrive`, exposées par `getAppPaths().oneDrive`) + `(Cours)\Robotique\(Ressources)\Pinout\library`,
  sinon `userData/library` ; un dossier choisi dans OneDrive est enregistré avec le préfixe
  `${OneDrive}` (`portableLibraryDir`), résolu sur chaque machine (`resolveLibraryDir`). Panneau en
  liste (nom, broches) ou en grille de vignettes (nom en petit dessous) selon `libraryView`
  (paramètres) ; catégories repliables.
- Champs des panneaux : ils valident au `change`. Un clic hors du champ en cours de saisie le
  valide d'abord (`commitFocusedField` dans `App.vue`, en phase de capture), pour que la saisie ne
  soit pas perdue quand le clic retire le champ. Hors des champs, le texte de l'interface ne se
  surligne pas (`user-select: none`).
- Boîtes de dialogue : `src/ui/ModalDialog.vue` ; tant qu'une est ouverte (`openModals`), les
  éditeurs ignorent leurs raccourcis. `src/ui/PromptDialog.vue` (saisie d'une valeur) et
  `src/ui/ContextMenu.vue` (menu contextuel, entrées décrites dans `contextMenu.ts`) comptent aussi
  dans `openModals`.
- Croisements : `src/domain/crossings.ts` (croisements stricts, fil du dessus, exceptions Alt+clic
  élaguées à chaque commande). Broches reliées à rien : `unconnectedPinKeys` de la connectivité.
- Exécutable : `pnpm icon` régénère `build/icon.png` (script sans dépendance), `pnpm build:win`
  produit l'installeur NSIS et l'exe portable dans `release/` (non signés : avertissement
  SmartScreen au premier lancement, normal). Les montages s'enregistrent en `.pinout` (du JSON ;
  les anciens `.pinout.json` s'ouvrent toujours) et les diagrammes en `.pinuml`, extensions que
  l'installeur associe à l'application (`fileAssociations`). Un fichier passé en argument s'ouvre au lancement ; avec
  l'application installée déjà ouverte (verrou d'instance unique, pas en développement), il
  arrive par `onOpenFile` et prend un onglet. Un fichier déposé dans la fenêtre s'ouvre de même
  (`pathForFile` du pont). `src/app/externalFiles.ts` reconnaît montage, diagramme ou composant à
  son contenu : montage et diagramme dans un onglet de leur éditeur, composant dans l'éditeur (tel quel s'il est dans la
  bibliothèque, sinon comme nouveau composant).
  - Éditeur de composants : V sélection, R rectangle, O ellipse, N point (un clic par point,
    l'outil reste actif), L ligne, P polyligne, E texte,
    B broche, Suppr, Échap, Entrée (termine une polyligne), Ctrl+Z / Ctrl+Y, Ctrl+S, Ctrl+N,
    Ctrl+Page haut/bas (Maj pour premier/arrière-plan) = ordre d'empilement de la forme
    sélectionnée (`reorderItem`, aussi par boutons dans le panneau),
    Ctrl+molette = zoom centré sur le curseur (boutons −/+/Ajuster dans la barre), bouton du milieu
    maintenu = déplacer la vue, double-clic du bouton du milieu = ajuster à la fenêtre. Le composant est centré dans la zone et ajusté à la fenêtre à
    l'ouverture (premier affichage, nouveau composant, composant chargé), sans ascenseur. La forme
    sélectionnée montre ses poignées (`src/domain/handles.ts`, curseurs en double flèche selon le
    coin ou le côté) ; Ctrl+glisser sur une forme saisit la poignée la plus proche ; sans sélection,
    Ctrl fait apparaître les poignées de la boîte du composant (`setBox` : le contenu suit
    l'origine, les broches qui sortent disparaissent). Redimensionner le composant supprime les broches qui sortent de la
    boîte ; les noms numériques des broches suivent toujours leur ordre (`renumberPins`). Le repère
    d'une broche se met du côté libre le plus proche du bord (`pinLabelSide`, contours et traits
    évités), sinon du côté du bord le plus proche ; son numéro (et le point médian qui le sépare
    du nom) est plus petit et grisé, le nom garde sa taille (`pinNumberText`). Tout l'espace de travail a la couleur du
    papier ; la marge du canevas vaut une cellule ou la place des repères qui dépassent, et
    l'ajustement à la fenêtre en tient compte (`pinLabelLayout.ts`).
    Sélection multiple : lasso dans le vide (formes et broches), Maj+clic ajoute ou retire une forme
    ou une broche, glisser déplace tout ce qui est sélectionné (par cellules entières dès qu'une
    broche en fait partie, `moveSelection`), un clic hors de la feuille désélectionne, Alt+glisser en dépose une copie, Ctrl+C / V / D copient,
    collent (décalées d'une cellule) et dupliquent ; le panneau de droite ne montre que l'élément
    sélectionné (forme, formes ou broche), sinon le composant.
    Maj pendant le tracé d'un rectangle ou d'une ellipse impose un carré ou un cercle. Tailles des
    textes proposées en multiples (×1 à ×3) d'une hauteur de référence de 0,5 cellule, comme
    les étiquettes du montage le sont de la taille des repères du profil ; la valeur stockée reste
    absolue. Les panneaux ne portent pas de texte explicatif : l'aide est dans F1. L'outil Texte
    pose la boîte entre deux coins (deux clics ou un glisser ; même point = boîte par défaut) et
    revient à la sélection dès qu'un texte est posé, dans les deux éditeurs. Le « repère » d'un
    composant posé s'appelle « libellé » dans l'interface.
- Interface, messages, commentaires, commits en français ; identifiants de code en anglais.
- Fichiers JSON avec `schemaVersion` ; migrations dans `src/domain/migrations.ts` ; un fixture
  par version dans `src/domain/fixtures/`. Versions courantes : composant 14, projet 19, paramètres 9,
  diagramme 1
  (la v1 des composants avait `strokeWidth` en cellules et `labelPrefix`, migrés en `weight` et
  supprimé).
- Pas de framework de diagramme ; pas de dépendance ajoutée sans raison notée dans ARCHITECTURE.md.

## Git

- Dépôt GitHub : https://github.com/robinary-hex/cesep-pinout (public). Une version ne se publie
  qu'à la demande explicite de Robin (décision du 9 novembre 2026) : un lot de retours se termine
  par un commit, sans montée de version, ni build, ni release. Publier une version :
  monter `version` dans package.json, commit, tag `vX.Y.Z`, `pnpm build:win`, puis
  `gh release create vX.Y.Z release/pinout-X.Y.Z-setup.exe release/pinout-X.Y.Z-setup.exe.blockmap
release/latest.yml release/pinout-X.Y.Z-portable.exe --latest` avec des notes qui donnent les
  liens directs des deux exécutables. `latest.yml` et le `.blockmap` sont indispensables : c'est ce
  que lit la mise à jour automatique.
- Mise à jour automatique (`electron-updater`, `setupUpdater` dans `electron/main.ts`) : au
  lancement d'une version installée, vérification de la dernière release GitHub ; si elle est plus
  récente, un bouton apparaît en haut à droite (`App.vue`, libellés dans `src/app/update.ts`) :
  télécharger en arrière-plan, puis installer et relancer. La version portable ne peut pas se
  réinstaller : son bouton ouvre la page de la release. Rien en développement ni hors ligne.

- Un commit par phase de la feuille de route (accordé par Robin le 8 novembre 2026), après
  `pnpm check` vert. Message en français, trailer `Co-Authored-By` conservé.

## Lancer et vérifier l'interface

- Un terminal ouvert par Claude Code hérite de `ELECTRON_RUN_AS_NODE=1` (VS Code) : le retirer
  avant `pnpm dev` (`Remove-Item Env:ELECTRON_RUN_AS_NODE` en PowerShell), sinon le processus
  principal tourne sous Node nu et `electron.app` est indéfini.
- Le bac à sable de Claude Code n'ouvre pas de fenêtre : la vérification visuelle (`pnpm dev`)
  revient à Robin. Les tests et `pnpm build` restent la preuve automatisée.
