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
  Fond des étiquettes : une case « Fond » du panneau (`background`, pas de fond par défaut,
  décision du 10 novembre 2026) peint la boîte de l'étiquette de la couleur du papier, à l'écran
  (`--paper`) comme à l'export (couleur du fond de l'image) ; même chose pour les textes libres
  d'un diagramme et pour l'étiquette d'un lien (`labelBackground`).
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
- Image dans un composant : une forme comme les autres (`image` : boîte en quarts de cellule,
  `file`, et `dataUrl` en mémoire ou dans un projet), pas un type de composant (décision du 10
  novembre 2026 ; les anciens visuels « PNG » sont migrés en un dessin d'une image). Convention :
  80 px du fichier par cellule (4× la cellule d'affichage de 20 px), donc 20 px par quart ; les
  broches d'un dessin se placent tous les 80 px. Le bouton Image de la barre d'outils
  (`importImage` de `pngImport.ts`, puis du store) pose le PNG à sa taille naturelle, par-dessus
  le dessin, centré sur des cellules entières ; un composant vierge prend la taille de l'image.
  Elle n'a que ses poignées de coin et garde les proportions de son fichier (`imageRatio`,
  `resizeBoxKeepingRatio`) ; le panneau la ramène à sa taille d'origine (`resetImageSize`). Dans
  la bibliothèque, un PNG par image à côté de component.json (`saveComponent` retire ceux qui
  ne servent plus, `loadComponentFile` les rattache) ; `withFreeImageFiles` nomme les images
  ajoutées ou collées pour qu'un fichier ne porte qu'une image.
- Orientation d'une instance : miroir local puis rotation horaire (`transformLocalPoint`,
  `instanceMatrix`). Un miroir à l'écran bascule `mirror` et inverse la rotation
  (`flippedInstance`) ; une rotation à l'écran garde le centre de la boîte (`rotatedInstance`).
- Jonctions : dérivées de la géométrie (une extrémité de fil sur un autre fil), jamais stockées ;
  un croisement en milieu de segment ne connecte pas.
- Touches de modification et gestes de souris : le même sens dans les trois éditeurs (décision du
  10 novembre 2026). Avant d'en ajouter un, vérifier qu'il ne contredit pas ce tableau, et le dire
  de la même façon dans l'aide (`SELECTION` et `VIEW` de `src/app/ShortcutsHelp.vue`).
  - Maj : ajoute à la sélection ou en retire (Maj+clic, Maj+lasso) ; pendant un tracé, le
    contraint ou le varie (carré ou cercle dans l'éditeur de composants, L inversé d'un fil ou
    d'un lien). Jamais autre chose.
  - Alt : copie (Alt+glisser dépose une copie de la sélection). Deux exceptions, dans le montage :
    Alt+clic sur un croisement inverse l'ordre des deux fils ; pendant le tracé d'un fil, Alt
    maintenue trace à 45° (décision du 10 novembre 2026 : Maj y inverse déjà l'ordre, et Ctrl
    est prise quand on tire un fil d'une broche).
  - Ctrl : saisit le point d'attache le plus proche de ce qu'on survole, au lieu de l'élément
    entier. Éditeur de composants : Ctrl+glisser sur une forme saisit sa poignée la plus proche,
    Ctrl sans sélection montre les poignées de la boîte. Montage : Ctrl+glisser sur un composant
    tire un fil de sa broche la plus proche. Diagramme : Ctrl+glisser sur un nœud tire un lien de
    son point d'accroche le plus proche. Sur un fil ou un lien, le point d'attache est un
    sommet : Ctrl+clic en ajoute un sur une partie droite, ou retire le coin visé (à même le
    trait ou sur sa poignée ; `toggleWireVertex`, `toggleLinkVertex` ; décision du 11 novembre
    2026). Sans Ctrl, glisser un élément le déplace, toujours.
    Dans le même esprit, Ctrl+clic sur un élément groupé le prend seul, au lieu de son groupe ;
    un fil ou un lien groupé est d'abord pris seul, le Ctrl+clic suivant touche à ses sommets.
  - Molette = zoom autour du curseur ; Espace + glisser ou bouton du milieu = déplacer la vue ;
    double-clic du bouton du milieu ou 0 = ajuster la vue.
  - Flèches = déplacer la sélection d'un pas de grille ; Ctrl+A / D / C / V / Z / Y ; Ctrl+G /
    Ctrl+Maj+G = grouper / dégrouper ; Suppr ;
    Entrée termine un tracé, Retour arrière retire son dernier point ; Échap annule le geste, puis
    la sélection, puis revient à l'outil Sélection.
- Raccourcis définis par la lettre (`KeyboardEvent.key`), clavier AZERTY belge, jamais de crochets
  ni de touches AltGr. Les deux seuls chiffres (0, 1) se lisent par touche physique (`event.code`)
  car la rangée du haut demande Maj sur ce clavier.
  - Montage : V sélection (arrête la pose ou le fil), F fil (clic par coude, Maj inverse le L,
    Alt maintenue trace à 45° : une diagonale puis un segment droit, l'inverse avec Maj ;
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
    propriétés (voir « Panneau de propriétés »), clic droit = menu contextuel (composant, fil, étiquette ou
    vide ; termine un fil en cours, arrête une pose), double-clic = valeur d'un composant ou texte
    d'une étiquette. Pose d'un composant : clic dans le panneau puis clic sur le montage, ou
    glisser-déposer ; une pose = un composant (la pose s'arrête, le composant posé est sélectionné).
    Poser un composant remplace la copie embarquée de sa définition par celle de la bibliothèque
    si elle a changé, pour tout le montage (fils élastiques compris). Alt+glisser dépose une copie
    de la sélection (Alt+clic sur un croisement garde son rôle) ; double-clic sur l'extrémité
    libre d'un fil saisit son étiquette d'extrémité ; double-clic ailleurs sur un fil (sans
    touche) démarre un nouveau fil à cet endroit, raccordé au premier par une jonction
    (`wireSpotAt`, `startWireFrom` ; décision du 11 novembre 2026). Les canevas du montage et
    du diagramme ne capturent le pointeur qu'une fois le geste commencé (`captureOnceMoved`,
    3 px) : capturé dès l'appui, il ferait arriver le clic et le double-clic au canevas au lieu
    de l'élément visé, et les double-clics des composants, étiquettes et nœuds ne feraient
    rien. En sélection, Ctrl enfoncée (`ctrlHeld`),
    un anneau montre la broche qui serait saisie (`pinGrab` : la plus proche du pointeur parmi
    celles du composant survolé, sinon une broche à portée) : Ctrl+glisser tire un fil de cette
    broche jusqu'au point de relâchement (L selon l'axe dominant, Maj l'inverse, arrivée accrochée
    aux broches ; glisser `pin-wire` du canevas, pris en phase de capture avant tout autre geste,
    une commande `addWire`), un simple Ctrl+clic sélectionne le composant. Sans Ctrl, glisser un
    composant le déplace, même par une broche.
- Fils : la géométrie pure est dans `src/domain/wires.ts` (tracé, coins arrondis, édition de
  segments et de sommets), la connectivité dérivée dans `src/domain/connectivity.ts` (jonctions,
  extrémités libres, nets par union-find). Un fil garde ses extrémités fixes quand on déplace un
  segment ou un sommet : un coude s'ajoute au besoin. Un sommet au milieu d'un segment droit est
  permis ; les demi-tours et les sommets confondus sont refusés. Le L d'un tracé suit l'axe
  dominant (Maj inverse). Un segment est horizontal, vertical ou en diagonale à 45°
  (`segmentStep`, `wireGeometryProblem` ; `routeDiagonal` pour le tracé avec Alt ; les liens
  d'un diagramme, eux, restent sans diagonales : `wireGeometryProblem(points, true)`). Les
  coudes s'arrondissent par un arc tangent quel que soit l'angle (`wirePathData`) ; un segment
  ou un sommet qu'on glisse laisse à ses voisins leur direction, leur sommet commun glissant le
  long d'eux (`moveSegment`, `segmentCoordinate`, `dragVertex`). Élasticité (`src/domain/elastic.ts`) : les extrémités posées sur une
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
  enregistrant (chaque onglet modifié, à son tour) ou en abandonnant les efface. La garde à la
  fermeture commence dans `electron/main.ts` (le rendu tient `setDirty` à jour) : la fenêtre qui
  se ferme avec des modifications envoie `ask-then-quit`, le rendu accuse réception (`quitAsked`)
  et pose la question dans sa propre boîte (`askThenQuit` de `App.vue` : Enregistrer / Ne pas
  enregistrer / Annuler), puis `confirmQuit`, ou `cancelQuit` si l'enregistrement est abandonné.
  Sans accusé de réception (rendu bloqué), le dialogue de Windows prend le relais
  (`askToSaveNatively`, puis `save-then-quit` ou `discard-then-quit`). L'enregistrement lui-même
  est dans `projectActions.ts` et `componentActions.ts`, partagé avec les éditeurs.
- Modes (`src/app/App.vue`) : un bouton à pictogramme par mode (puce = Composants, résistance =
  Montage, organigramme = Diagramme ; nom en infobulle), l'application démarre sur le montage.
  Les trois forment un sélecteur segmenté, sans texte, le mode affiché plein dans la couleur
  d'accent (décision du 11 novembre 2026). Avec le bouton du menu, ils occupent le bloc gauche de
  la barre (`.topbar-side`), large comme le panneau latéral (`--side-panel-width`, 280 px : la
  bibliothèque de composants et celle des formes du diagramme ont la même largeur) ; un trait
  court (`.topbar-side::after`), comme les séparateurs des barres d'outils et non sur toute la
  hauteur de la barre, sépare les modes des onglets, à l'aplomb de la bordure du panneau. Ce que la coque demande à un
  mode (onglets, fermeture, enregistrement avant de quitter, statut) passe par son `ModeAdapter`.
- Barres d'outils des trois éditeurs : elles commencent toutes par `src/ui/ToolbarBasics.vue`,
  dans cet ordre (décision du 10 novembre 2026) : zoom arrière, valeur du zoom (un clic ou la
  touche 1 revient à 100 %), zoom avant, ajuster ; séparateur vertical ; annuler, rétablir,
  corbeille (grisée sans sélection) ; séparateur ; puis les outils propres à l'éditeur. Dans le
  diagramme, les fonds des nœuds et le style des liens viennent avant la palette, qui ferme la
  barre. Les cases d'affichage viennent en dernier (« Broches » et « Non reliées » dans le
  montage, « Groupes » dans les trois éditeurs dès que le document a des groupes) ; leur état
  est gardé dans les paramètres (`showPins`, `showUnconnected`, `showGroups`, `VIEW_OPTIONS`) :
  les stores des éditeurs les lisent et les écrivent par `setViewOption` du store de la
  bibliothèque, à l'écran tout de suite, dans le fichier en arrière-plan. Supprimer ne se trouve pas dans les panneaux de propriétés : corbeille, touche Suppr
  ou menu contextuel. Dans les panneaux, X, Y, largeur et hauteur ont leur propre section
  (« Position et taille », « Position et orientation » pour un composant posé, « Taille » pour
  un composant).
- Barre d'application (`src/app/App.vue`) : tout à gauche, un bouton à trois barres ouvre le menu
  Fichier (nouveau, ouvrir, récents, enregistrer,
  exporter, paramètres, raccourcis, quitter) construit avec `ContextMenu` et appelant les actions
  que `SchematicEditor` / `ComponentEditor` exposent par `defineExpose` selon le mode. Enregistrer
  sous propose le dossier du projet, sinon celui du dernier projet enregistré ou ouvert
  (`lastProjectDir`, dérivé des fichiers récents) ; Ouvrir s'ouvre dans ce dossier. Les barres
  d'outils ne portent plus d'actions de fichier ; dans le montage, rotation, miroir, duplication,
  suppression et ordre des fils ne sont accessibles que par le menu contextuel et le clavier. Les outils des deux barres sont des
  boutons à pictogramme seul (raccourci dans l'infobulle) ; quand la place manque, la partie gauche
  passe à la ligne, le nom du document et le bouton de droite restent sur la première ligne. Un
  composant dont la bibliothèque a une version plus récente se dessine dans `--stale` (traits
  rouges en clair, jaunes en sombre ; cadre s'il contient une image). Pictogrammes : `src/ui/Icon.vue` dessine les
  tracés de `src/ui/icons.ts` (SVG inline, trait de la couleur courante, pas de police d'icônes).
- Onglets de montage (`App.vue`, à droite du bouton Montage) : un par montage ouvert, au nom du
  montage, point s'il est modifié (le bouton du mode qu'on ne regarde pas, Montage ou
  Composants, porte le même point dès qu'un de ses documents ouverts est à enregistrer), croix ou
  clic du milieu pour fermer (s'il est
  modifié : Enregistrer / Ne pas enregistrer / Annuler, question `askToSave` de `src/ui/dialogs.ts`,
  flux dans `closeTabAsking`), « + » pour un nouveau, Ctrl+Tab / Ctrl+Maj+Tab pour passer de l'un à l'autre,
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
  2026). Document à part, fichier `.pinuml` (JSON, `schemaVersion` 4), même grille infinie que le
  montage mais plus fine (`style.cellPx` = 10).
  - Nœuds : une boîte en cellules entières, une forme du catalogue en dur (`NODE_SHAPES`,
    `NODE_SPECS`), un titre et un sous-titre, une couleur et un fond (`fill` : contour, teinté,
    plein). Dix-sept formes en quatre familles (`NODE_FAMILIES`, décision du 11 novembre 2026 ;
    un simple rangement, toute forme va dans tout diagramme) : général (action arrondie,
    rectangle, décision, note), organigramme (début / fin aux bouts arrondis, entrée / sortie
    en parallélogramme, sous-programme à doubles barres, préparation en hexagone, renvoi : un
    cercle qui porte une lettre), activité (départ, fin, fin de flot, fourche, envoi,
    réception), communication (base de données en cylindre, nuage). La bibliothèque, le menu
    « Forme », « Poser une forme ici » et la liste du panneau suivent ces familles. Ajouter une
    forme : son nom dans `NODE_SHAPES` et une famille, sa fiche dans `NODE_SPECS`, son tracé
    dans `nodeParts`, ses accroches dans `nodeAnchors`, la place de son texte (`nodeTextBox`,
    `nodeSizeForText`) et sa vignette (`SAMPLE_SIZES`).
    Pas de bibliothèque à créer : `DiagramLibrary.vue` montre le catalogue. Le domaine
    décrit ce que chaque forme dessine (`nodeParts`, `layoutNodeText`) ; `DiagramNodeGraphic.vue`
    à l'écran et `buildDiagramSvg` à l'export peignent la même chose. Losange, disques et les
    formes à pointes ou à sommets centrés (début / fin, parallélogramme, hexagone, cylindre,
    nuage) ont des
    dimensions paires (pointes sur la grille), les disques sont carrés, une barre a une épaisseur
    nulle (`fittedNodeSize`, `resizeNodeBox`). Couleurs d'un nœud (`nodePaint`, ce que l'export
    écrit ; l'écran applique les mêmes règles avec les variables du thème) : en contour, le trait
    a la couleur et il n'y a pas de fond ; en teinté (fond d'un nouveau nœud), le fond est la
    couleur mêlée au papier, opaque, donc plus clair que le contour en thème clair et plus sombre
    en thème sombre (`TINT_SHARE` : 20 % de couleur en clair, 40 % en sombre ; `--node-tint` dans
    style.css) ; en plein, le fond est la
    couleur même et le contour s'en détache, éclairci sur une couleur sombre, foncé sur une
    couleur claire (`SOLID_BORDER_SHARE`). Texte à l'encre du thème, sauf sur un fond plein où il
    contraste avec lui. Trois pastilles dans la barre montrent les fonds dans la couleur courante.
    Texte : le diagramme a une police (normale ou chasse fixe) et des tailles ; chaque nœud a son
    style (`NodeTextStyle`, boutons du panneau) : `font` (null = la police du diagramme, sinon la
    sienne ; un bouton bascule la chasse fixe), `bold`, `italic`, `underline`, `strike`, et
    `textScale`, multiplicateur ×1 à ×3 des tailles du diagramme (`NODE_TEXT_SCALES`). Gras,
    italique, souligné et barré stylent le titre ; le sous-titre reste une ligne secondaire,
    maigre, en italique en chasse fixe ; police et taille valent pour les deux
    (`layoutNodeText`, `nodeLineAttrs`). Un nœud neuf a un titre gras en police normale, maigre
    en chasse fixe (`defaultNodeTextStyle`, `createNode`). Un
    nœud grandit de lui-même quand le texte qu'on vient d'y écrire déborde (`setNodeText`, `setNodesTextStyle` quand c'est son style qui le grossit, même
    commande, centre gardé) ; « Ajuster » (panneau, menu contextuel) le ramène au
    plus près (`fitNodeToText`, `nodeBoxForText`). La largeur du texte se mesure sur un canevas
    hors écran (`src/render/textMeasure.ts`), estimée sans navigateur. Le style du diagramme
    (trait, coins, coudes, tailles de texte, police) se règle dans le panneau, sans sélection.
    Style général (`diagramDefaults` des paramètres : le style d'un nouveau diagramme, la
    couleur et le fond de ses nouveaux nœuds, la couleur de ses nouveaux liens) : onglet
    « Diagrammes » du profil de style général, mêmes champs que le panneau
    (`settings/DiagramStyleFields.vue`). Comme pour les montages, chaque diagramme garde son
    style ; le panneau surligne en `--alert` les réglages qui s'écartent du style général et
    propose d'y revenir (`adoptGeneralStyle`) ; changer le style général le donne aux
    diagrammes ouverts qui le suivaient (`followGeneralStyle`), avec aperçu sur le diagramme
    affiché (`stylePreview`).
  - Liens : la géométrie des fils (`wires.ts`), coudes posés à la main. Pas de routage
    automatique en continu, mais un tracé de départ soigné (décision du 11 novembre 2026) :
    un lien quitte une forme à angle droit et y arrive de face, jamais le long de son bord
    (`routeLink`, d'après `anchorNormals` : un L quand il suffit, sinon un Z par le milieu, un U
    ou une sortie droite de `LINK_STUB` cellules ; le plus simple des trajets possibles, Maj
    donne le suivant ; `routeTo` du canevas pour l'outil Lien et le Ctrl+glisser). Glisser de
    côté le segment qui sort d'une forme (ou y arrive) emmène son point d'attache d'une accroche
    à l'autre du même côté, jusqu'au bout du côté, au lieu de laisser un coude qui longe la
    forme (`moveLinkSegment` ; une accroche déjà prise par un autre lien reste permise). Un
    lien dont un bout est sur une note se trace en pointillés, sans changer le style des
    prochains liens (`touchesNote`, dans `addLink`). Pointe pleine et plutôt trapue (deux
    ailes, un creux, presque aussi large que longue : `linkArrowHead`) au départ
    et/ou à l'arrivée, trait plein ou pointillé, couleur. Au dessin seulement (`linkShape`,
    écran et export), une extrémité qui porte une pointe s'arrête un peu avant son point
    d'arrivée (`linkArrowGap`, 0,4 cellule) : la pointe ne touche pas la forme, et le trait
    s'arrête dans la pointe ; les sommets enregistrés ne changent pas. Étiquette (`label`) :
    jamais libre, elle longe le tracé, d'un côté ou de l'autre, toujours à la même distance du
    trait (`LINK_LABEL_GAP`). `labelAt` est la fraction de la longueur du tracé (0 départ, 1
    arrivée), `labelSide` le côté (-1 au-dessus ou à gauche, 1 en dessous ou à droite) ;
    `linkLabelPlacement` en tire la boîte et l'alignement du texte. La glisser la fait suivre
    le pointeur le long du lien et changer de côté quand il traverse le trait
    (`nearestOnPath`, au pas d'une demi-cellule) ; le panneau donne sa position et un bouton
    pour changer de côté. L'accroche se
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
    panneau, Ctrl+Page haut/bas ordre des nœuds, le reste comme le montage. En sélection, Ctrl
    enfoncée, un anneau montre le point d'accroche qui serait saisi (`anchorGrab` : le plus
    proche du pointeur sur le nœud survolé) : Ctrl+glisser tire un lien de ce point.
  - Onglets, copies de secours (`diagramme-<onglet>.*`), question à la fermeture, fichiers
    récents (mêlés à ceux des montages, chaque menu ne montre que les siens), export PNG/SVG
    (`ExportDialog` reçoit de l'éditeur ce qu'il exporte) : comme le montage. À l'export d'un
    diagramme l'encre suit le fond de l'image (`exportGround`) : noire sur un fond clair, claire
    sur un fond sombre ; pour un fond transparent, une case dit si l'image ira sur une page
    sombre (non mémorisée).
- Thème clair ou sombre choisi dans les paramètres (`theme`) : `src/ui/theme.ts` pose
  `data-theme` sur `<html>` et toutes les couleurs de l'interface passent par les variables CSS de
  `src/app/style.css`, jamais en dur dans les styles ; les surfaces de dessin (`--paper`) sont blanches en clair et
  gris bleuté en sombre (grille et textes sur papier via `--grid-*` et `--paper-text`) ; l'export
  garde ses propres couleurs. Le noir pur (`#000000`) des composants et des fils s'affiche dans
  l'encre du thème (`--ink`, via `screenColor` de `src/render/ink.ts`), blanc cassé en sombre ;
  l'export reste noir. Le net survolé est un groupe à opacité unique : deux fils qui se
  chevauchent ne s'additionnent pas. Un fil sélectionné (un lien, dans le diagramme) s'entoure
  d'un liseré franc (`.ring`, `--selection`) détaché de lui par un filet de la couleur du papier
  (`.gap`), pour se voir quelle que soit sa couleur (décision du 11 novembre 2026) ; tous les
  liserés sont dessinés avant tous les filets. `--selection` (bleu, plus clair en sombre) est la
  couleur de la sélection, des poignées et des tracés en cours sur les trois canevas.
  Les marques d'extrémité libre et de broche reliée à rien prennent `--alert` (rouge en clair, ambre
  en sombre) ; l'aperçu d'export transparent montre un point à chaque
  intersection de la grille (`--transparent-*`).
- Profil de style : l'application a un profil général (`defaultProfile` des paramètres) et chaque
  montage a le sien, enregistré dans son fichier, avec lequel il se dessine. Une seule boîte,
  `settings/ProfileDialog.vue`, pour les deux : `target="general"` (bouton de la barre
  d'application entre l'aide et les paramètres, et menu Fichier) a deux onglets, « Montages »
  et « Diagrammes » (elle s'ouvre sur celui du mode affiché ; « Appliquer » enregistre les
  deux), et pas d'onglet « Composants » : un composant n'a pas de style à lui, il se dessine
  avec celui du montage où il est posé. L'onglet Montages modifie le profil général, avec
  aperçu sur le montage affiché s'il le suit, et « Appliquer » l'enregistre puis le donne aux
  montages ouverts qui suivaient l'ancien (`followGeneralProfile`) ; `target="montage"` (bouton
  « Modifier le style… » du panneau) modifie le style du montage affiché, en une commande. Le
  panneau surligne en `--alert` les réglages où le montage s'écarte du profil général
  (`profileDifferences`) et propose de l'y aligner (`adoptGeneralProfile`).
- Paramètres en deux fichiers (`src/io/settings.ts`) : un fichier partagé `settings.json`, commun
  aux machines (tout sauf ce qui est propre à chacune ; profil général compris), et le fichier
  local `userData/settings.json`, copie complète avec les fichiers récents et `settingsDir`. Le
  fichier partagé vit dans le dossier choisi dans les paramètres (`settingsDir`, réglage local,
  noté `${OneDrive}…` s'il est dans OneDrive ; `resolveSettingsDir`), par défaut
  `<OneDrive>\(Cours)\Robotique\(Ressources)\Pinout` ; sans dossier choisi ni OneDrive, seul le
  local existe. Changer de dossier (`relocateSharedSettings`, `chooseSettingsDir`) reprend les
  paramètres qui s'y trouvent déjà, sinon y écrit les réglages courants ; un fichier illisible
  n'est pas écrasé. Le fichier partagé est relu au lancement, avant chaque enregistrement
  (seuls les réglages modifiés écrasent) et quand la fenêtre reprend la main
  (`reloadSharedSettings`) ; il n'est réécrit que si son contenu change. La boîte des paramètres
  n'enregistre que ses propres réglages : les deux dossiers changent dès qu'on les choisit.
- Bibliothèque de composants : dossier par défaut = racine OneDrive de la machine (variables
  `OneDriveCommercial` puis `OneDrive`, exposées par `getAppPaths().oneDrive`) + `(Cours)\Robotique\(Ressources)\Pinout\library`,
  sinon `userData/library` ; un dossier choisi dans OneDrive est enregistré avec le préfixe
  `${OneDrive}` (`portableDir`), résolu sur chaque machine (`resolveLibraryDir`). Panneau en
  liste (nom, broches) ou en grille de vignettes (nom en petit dessous) selon `libraryView`
  (paramètres) ; catégories repliables. Le panneau n'a pas de bouton « Nouveau » (un composant ou
  un montage se crée par le « + » des onglets ou Ctrl+N) et ses composants ne portent pas de
  boutons : tout passe par le clic droit (`openMenu` et `openListMenu` de `LibraryPanel.vue`,
  voir « Menus contextuels »). Renommer ou changer de catégorie réécrit le fichier du composant,
  sauf s'il est ouvert dans un onglet : c'est alors le document ouvert qu'on modifie
  (`changeMeta`).
- Panneau de propriétés : le même fonctionnement dans les trois éditeurs (décision du 11
  novembre 2026 ; `useInspectorPanel` de `src/state/inspector.ts`, `inspectorOpen` et
  `revealInspector` de chaque store). Replié au départ. La touche I, le bouton tout à droite de
  la barre d'outils, l'entrée « Propriétés » des menus et la croix du panneau l'ouvrent pour de
  bon ou le ferment : ouvert ainsi, il prend sa place à droite du canevas et reste. Avec le
  paramètre `autoOpenInspector`, un clic sur un élément (ou un lasso qui en prend) le montre
  aussi, mais seulement le temps de la sélection : il se referme dès que plus rien n'est
  sélectionné. Montré ainsi (`inspectorFloating`), il flotte sur le bord droit de la zone de
  dessin, au-dessus de la barre d'état (`.inspector.floating` de style.css, `--status-height`),
  sans ombre portée :
  le canevas ne change pas de taille à chaque clic et la feuille centrée de l'éditeur de
  composants ne glisse pas sous le pointeur. Sans sélection, il montre le document (montage,
  diagramme, composant). Pas de croix à côté du nom d'un élément : la seule croix du panneau le
  masque.
- Champs des panneaux : ils valident au `change`. Un clic hors du champ en cours de saisie le
  valide d'abord (`commitFocusedField` dans `App.vue`, en phase de capture), pour que la saisie ne
  soit pas perdue quand le clic retire le champ. Hors des champs, le texte de l'interface ne se
  surligne pas (`user-select: none`).
- Boîtes de dialogue : `src/ui/ModalDialog.vue` ; tant qu'une est ouverte (`openModals`), les
  éditeurs ignorent leurs raccourcis. `src/ui/PromptDialog.vue` (saisie d'une valeur) et
  `src/ui/ContextMenu.vue` (menu contextuel, entrées décrites dans `contextMenu.ts`, listes
  dessinées par `MenuList.vue`) comptent aussi
  dans `openModals`. Échap ne ferme que la boîte du dessus (`modalStack`).
- Menus contextuels (décision du 11 novembre 2026) : un clic droit partout où il y a un élément.
  Même ordre dans tous : titre, actions propres à l'élément, style, ordre d'empilement, puis
  Grouper / Dégrouper quand la sélection s'y prête (`groupItems`), Dupliquer / Copier /
  Propriétés, et Supprimer en dernier ; rien n'existe que dans un menu. Une
  famille de choix se range dans un sous-menu (`submenu` de `contextMenu.ts`, un seul niveau,
  ouvert au survol ou au clic) : Ordre, Style, Alignement, Forme, Texte, Fond, Type,
  Extrémités libres. Un texte se saisit dans `PromptDialog` avec `multiline` (Maj+Entrée va à
  la ligne).
  - Éditeur de composants (`openMenu` de `ComponentEditor.vue`, demande émise par
    `EditorCanvas`, types dans `menu.ts`) : forme (texte, flèches, fermeture, taille d'origine
    d'une image), broche (renommer, type), vide (coller ici : `pasteClipboardAt`, importer une
    image, vue, panneau). Un clic droit pendant un tracé le termine, sans menu.
  - Onglets (`openTabMenu` de `App.vue`) : enregistrer, enregistrer sous, afficher dans
    l'Explorateur (`showInFolder` du pont), fermer, fermer les autres.
  - Bibliothèque : sur un composant, ouvrir, dupliquer, renommer, catégorie, afficher dans
    l'Explorateur, supprimer ; dans le montage, poser ou modifier dans l'éditeur de composants ;
    dans le vide, nouveau composant, liste ou grille, dossier.
  - Montage : sur un fil, ce qui dépend de l'endroit du clic (`nearestWirePoint`) : ajouter un
    sommet (`insertVertex`), supprimer ce sommet si ses voisins peuvent se rejoindre
    (`removeVertex`), couper le fil (`splitPoints`, `splitWire` : rien ne bouge, les deux
    morceaux se touchent), inverser l'ordre à un croisement proche ; sélectionner tout le net.
    Sur un composant : la valeur de son texte variable s'il n'en a qu'un (plusieurs : dans le
    panneau, pas une entrée par champ ; décision du 11 novembre 2026), modifier dans l'éditeur
    de composants (`editComponent`, traité par
    `App.vue`), sélectionner les fils reliés. Sur une étiquette : style, alignement.
  - Diagramme : nœud (forme, texte, fond, ordre), lien (étiquette : côté, fond, retrait ;
    sommets, sans diagonale), texte (style, alignement), vide (poser une forme du catalogue à
    l'endroit du clic).
    Dans les tests, `src/ui/testing/menus.ts` lit et actionne le menu ouvert.
- Variantes d'un composant (décision du 11 novembre 2026) : le même composant dessiné autrement
  (LED rouge ou verte, pattes longues ou courtes). Une seule liste par composant, pas de
  critères croisés : six combinaisons font six variantes, nommées à la main. Chaque variante
  est un dessin complet (`size`, `visual`, `pins`, `pinGroups` : `ComponentBody`), née d'une
  copie de celle qu'on regardait puis retouchée ; rien n'est hérité, ce qui permet de changer
  aussi la taille et les broches, et une retouche commune se refait dans chaque variante (les
  formes se copient de l'une à l'autre). Deux variantes nées l'une de l'autre gardent les mêmes
  identifiants de broche.
  - Fichier : le composant porte lui-même le dessin de sa première variante (`BASE_VARIANT`,
    nommée par `variantName`, « Standard » par défaut) ; les autres sont dans `variants`
    (`id`, `name`, et leur dessin). Champs optionnels, sans montée de version. Les contrôles
    (`componentIssues`) et les images (`componentImages`, `mapComponentPrimitives` : un PNG par
    nom dans le dossier, toutes variantes confondues) couvrent toutes les variantes.
  - Domaine : `componentVariants`, `hasVariants`, `variantDefinition(def, id)` rend le composant
    tel que le dessine une variante (même identité, toujours le même objet pour un même couple) ;
    `instanceDefinition(project, instance)` fait de même pour un exemplaire posé
    (`instance.variant`, absent pour la première). Tout ce qui dessine ou relie un exemplaire
    passe par là (`placed` du store, `projectPins`, `projectBounds`, export), jamais par
    `embeddedDefs[defId]` directement ; les définitions embarquées et le presse-papiers, eux,
    gardent le composant entier.
  - Éditeur de composants : on édite une variante à la fois (`activeVariant` du store, gardée
    par onglet). Le store lit le dessin par `shown` et l'écrit par `bodyOf(draft)` : jamais
    `doc.value.pins` ni `draft.pins`, qui ne seraient que la première variante ; le canevas et le
    panneau lisent `store.shown`. Barre d'outils : la liste des variantes (dès deux) et le
    bouton qui en crée une ; panneau du composant : section « Variantes » (un clic affiche,
    le nom se change sur place, corbeille). `addVariant`, `showVariant`, `renameVariant`,
    `removeVariant` : supprimer la première promeut la suivante ; la dernière ne se supprime pas.
  - Montage : sous un composant de la bibliothèque, une pastille par variante la pose
    (`startPlacing(def, variante)`), le clic sur la ligne pose la première ; un composant posé
    change de variante par le clic droit (« Variante ») ou la liste du panneau
    (`setInstancesVariant`, par `applyWithElasticWires` : les fils posés sur ses broches suivent).
- Groupes (décision du 11 novembre 2026), dans les trois éditeurs : des éléments qu'on
  sélectionne et déplace d'un bloc. Rien n'est rangé à part : chaque élément groupé porte
  l'identifiant de son groupe (`group`, optionnel, sans montée de version des fichiers) et un
  groupe existe dès que deux éléments portent le même (`src/domain/groups.ts` : `groupIds`,
  `nextGroupId`, `regroupedCopies`, `groupOutline`). Pas de groupes imbriqués : grouper une
  sélection qui contient des groupes les fond en un seul. Montage et diagramme partagent
  `useGroups` (`src/state/groups.ts` : `groups`, `canGroup`, `canUngroup`,
  `syncGroupSelection`, `expandSelectionToGroups`, commandes « Grouper » et « Dégrouper ») ;
  l'éditeur de composants a les siennes (formes par rang, broches par identifiant :
  `EditorGroup`, `selectElement`). Un clic, un Maj+clic, un lasso ou un clic droit sur un
  membre prend tout le groupe ; Ctrl+clic prend l'élément seul, pour le retoucher sans défaire
  le groupe. Grouper / Dégrouper : menu contextuel, Ctrl+G / Ctrl+Maj+G. Les copies d'un groupe
  (coller, dupliquer, Alt+glisser) forment un nouveau groupe, une copie seule n'en a plus ; le
  morceau d'un fil coupé reste dans le groupe du fil. À l'écran, un cadre violet à longs tirets
  (`.group-outline` de style.css, `--group`) entoure chaque groupe, geste en cours compris,
  tant que la case « Groupes » de la barre d'outils est cochée ; jamais à l'export.
- Questions et alertes : jamais les boîtes de message de Windows ni `window.confirm` (décision du
  10 novembre 2026). `ask` de `src/ui/dialogs.ts` rend une promesse tenue par le bouton choisi
  (`askToSave`, `askToSaveBeforeQuit`, `confirmAction`) ; `src/ui/DialogHost.vue`, monté une
  fois par `App.vue`, les affiche une à la fois dans une `ModalDialog` compacte, le choix attendu
  à droite et au clavier. Dans les tests, `scriptDialogs()` de `src/ui/testing/dialogs.ts`
  répond à la place de la boîte (`setDialogResponder`). Les dialogues de fichier (ouvrir,
  enregistrer sous, choisir un dossier) restent ceux du système.
- Pas de barre de menus Electron : `Menu.setApplicationMenu(null)` dans `electron/main.ts`, pour
  qu'Alt ne fasse rien apparaître, et `swallowAlt` de `App.vue` neutralise la touche seule. F11
  reste le plein écran ; en développement seulement, F12
  ou Ctrl+Maj+I ouvre les outils et F5 ou Ctrl+R recharge (`before-input-event`).
- Composants et fils, ordre d'empilement du montage : les composants se dessinent au-dessus des
  fils, sauf ceux qu'on a mis derrière (`behindWires` de l'instance ; case « Derrière les fils »
  du panneau, menu contextuel, Ctrl+Page bas / haut sur un composant sélectionné :
  `setInstancesBehindWires`, `restackSelection`), pour qu'une image ne cache pas les fils qui vont
  à ses broches. Même ordre à l'écran (`STACK` et `layers` de `SchematicCanvas.vue`) et à
  l'export (`componentLayer` de `svg.ts`) ; les textes d'un composant suivent sa couche.
- Croisements : `src/domain/crossings.ts` (croisements stricts entre deux segments de directions
  différentes, fil du dessus redessiné dans sa direction par `crossingPieceEnds`, exceptions
  Alt+clic élaguées à chaque commande ; deux diagonales peuvent se croiser au milieu d'une
  cellule, les exceptions vont donc par demi-pas). Broches reliées à rien : `unconnectedPinKeys` de la connectivité.
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
    molette = zoom centré sur le curseur (boutons −/+/Ajuster dans la barre), bouton du milieu
    maintenu ou Espace + glisser = déplacer la vue, double-clic du bouton du milieu ou 0 =
    ajuster à la fenêtre, flèches = déplacer la sélection (d'un quart de cellule, d'une cellule
    avec une broche), Ctrl+A = tout sélectionner, Retour arrière = retirer le dernier point
    d'une polyligne en cours. Le composant est centré dans la zone et ajusté à la fenêtre à
    l'ouverture (premier affichage, nouveau composant, composant chargé), sans ascenseur. La forme
    sélectionnée montre ses poignées (`src/domain/handles.ts`, curseurs en double flèche selon le
    coin ou le côté) ; Ctrl+glisser sur une forme saisit la poignée la plus proche ; sans sélection,
    Ctrl fait apparaître les poignées de la boîte du composant (`setBox` : le contenu suit
    l'origine, les broches qui sortent disparaissent). Redimensionner le composant supprime les broches qui sortent de la
    boîte ; les noms numériques des broches suivent toujours leur ordre (`renumberPins`).
    Groupes de broches (décision du 11 novembre 2026 ; `src/domain/pinGroups.ts`) : dans le
    panneau du composant, « + Groupe » crée une section nommée (`pinGroups` du composant,
    `pinGroup` de la broche, optionnels, sans montée de version) ; une broche se glisse sur
    une autre ligne pour changer d'ordre, ou sur un groupe pour y entrer (`placePin`,
    `placedPin`). Les broches du composant restent rangées groupe par groupe, les sans-groupe
    à la fin (`arrangedPins`) : l'ordre du panneau est celui des broches, donc de leurs
    numéros. Défaire un groupe (sa corbeille) garde ses broches. Ce n'est qu'un rangement du
    panneau, rien n'est dessiné ; à ne pas confondre avec `group`, le groupe de sélection des
    formes et des broches sur le dessin. Le repère
    d'une broche se met du côté libre le plus proche du bord (`pinLabelSide`, contours et traits
    évités), sinon du côté du bord le plus proche ; son numéro (et le point médian qui le sépare
    du nom) est plus petit et grisé, le nom garde sa taille (`pinNumberText`). Tout l'espace de travail a la couleur du
    papier ; la marge du canevas vaut une cellule ou la place des repères qui dépassent, et
    l'ajustement à la fenêtre en tient compte (`pinLabelLayout.ts`).
    Sélection multiple : lasso dans le vide (formes et broches), Maj+clic ajoute ou retire une forme
    ou une broche, glisser déplace tout ce qui est sélectionné (par cellules entières dès qu'une
    broche en fait partie, `moveSelection`), un clic hors de la feuille désélectionne (avec un outil de dessin actif, il
    le quitte d'abord et revient à la sélection, en terminant la polyligne en cours :
    `onOutsideDown`), Alt+glisser en dépose une copie, Ctrl+C / V / D copient,
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
  par version dans `src/domain/fixtures/`. Versions courantes : composant 15, projet 21, paramètres 12,
  diagramme 4
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
- Le bac à sable de Claude Code n'ouvre pas de fenêtre, mais l'application se regarde quand même :
  `node scripts/appshot.cjs <scénario.cjs> <dossier>` (après `pnpm build`) la lance dans une
  fenêtre hors écran, joue un scénario de clics et de touches et écrit des captures PNG dans le
  dossier (à mettre dans le dossier temporaire de la session, pas dans le dépôt). Le profil de
  l'application y est recréé à chaque fois et les variables OneDrive sont retirées : ni la
  bibliothèque ni les paramètres de Robin ne sont lus. Le scénario exporte une fonction qui
  reçoit `click`, `rightClick`, `drag`, `key`, `js`, `fill`, `theme`, `shot`, `wait` ; la
  fenêtre n'a pas le focus du système, donc le texte d'un champ se pose avec `fill`. À faire
  pour tout changement visible avant de le dire terminé. L'essai à la main (`pnpm dev`) et le
  jugement sur l'ergonomie restent à Robin ; les tests et `pnpm build`, la preuve automatisée.
