# Architecture

Le domaine ne dépend de rien ; tout le reste dépend de lui.

## Couches

| Couche             | Dossier         | Contenu                                                                                                                      | Peut importer                           |
| ------------------ | --------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Coque applicative  | `src/app/`      | Fenêtre Vue, bascule Composants / Montage / Diagramme                                                                        | features, state, io, render, ui, domain |
| Fonctionnalités    | `src/features/` | `component-editor/`, `library/`, `schematic-editor/`, `diagram-editor/`, `export/`, `settings/` ; un store Pinia par éditeur | state, io, render, ui, domain           |
| État               | `src/state/`    | `History` (commandes nommées, patches Immer, undo/redo) ; `useDocumentTabs` (documents ouverts par onglet)                   | domain                                  |
| Entrées / sorties  | `src/io/`       | Pont IPC (`bridge.ts`), paramètres, bibliothèque, projets, exports, profils, copie de secours, chemins                       | domain                                  |
| Rendu              | `src/render/`   | Composants Vue SVG sans état qui dessinent les objets du domaine (composants)                                                | domain                                  |
| Interface partagée | `src/ui/`       | Boutons, panneaux, palette de couleurs (rien du métier)                                                                      | rien                                    |
| Domaine            | `src/domain/`   | Types, grille, formes, placement, fils, connectivité (jonctions, nets), schémas Zod, migrations, PNG                         | zod seulement                           |
| Coque Electron     | `electron/`     | `main.ts` (fenêtre, fichiers, dialogues : seul code Node), `preload.ts` (pont), `api.ts` (contrat)                           | Node, Electron                          |

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

Les documents ouverts d'un éditeur, un par onglet, sont tenus par `useDocumentTabs`
(`src/state/tabs.ts`) : le document affiché vit dans des refs, les autres attendent avec leur
historique et leur état d'édition, que chaque store décrit par `capture` et `restore`. La vue d'un
canevas infini (zoom autour d'un point, déplacement, ajustement au contenu, lignes de grille
visibles) est faite de fonctions pures dans `src/domain/view.ts`, communes aux canevas.

Dans le montage, toute commande qui déplace ou réoriente des composants passe par
`applyWithElasticWires` : après la recette, `wiresFollowingPins` (`src/domain/elastic.ts`) compare
la position des broches avant et après et fait suivre les extrémités de fil posées dessus (coude
ajouté par `dragVertex`) ; le canevas appelle la même fonction pour l'aperçu pendant le glisser.
Poser un composant depuis la bibliothèque remplace la copie embarquée de sa définition si elle a
changé (même commande élastique) : un projet suit la dernière version posée et garde son autonomie.

Les gestes du canevas du montage sont un état local (`drag`, une union par geste) qui ne touche le
document qu'au relâchement, par une commande. Tirer un fil d'une broche en mode sélection en est
un (`pin-wire`) : il ne passe pas par le tracé de l'outil Fil (`store.drawing`), l'aperçu vient de
`drawingPoints` et le relâchement appelle `addWire`. `SchematicCanvas.test.ts` rejoue ces gestes
sous jsdom avec de vrais événements de souris.

## Diagrammes

Un diagramme est un document à part (`src/domain/diagram.ts`, fichiers `.pinuml`) : des nœuds, des
liens, des textes libres. Les formes des nœuds viennent d'un catalogue en dur ; `diagramShapes.ts`
décrit ce que chacune dessine (des tracés SVG en cellules et la mise en page du titre et du
sous-titre), et les deux peintres, `DiagramNodeGraphic.vue` à l'écran et `diagramSvg.ts` à
l'export, ne font que colorer ces descriptions. Un lien a exactement la géométrie d'un fil : tout
`wires.ts` sert (tracé en L, coins arrondis, déplacement d'un segment ou d'un sommet). Comme pour
les jonctions du montage, rien ne dit dans le fichier qu'un lien est accroché à un nœud :
`diagramLinks.ts` le déduit (une extrémité posée sur un point d'accroche) et, à chaque commande
qui déplace, redimensionne ou change un nœud, `linksFollowingNodes` fait suivre les extrémités
concernées en réutilisant `wiresFollowingPins`. Il n'y a pas de routage automatique : les coudes
sont ceux que Robin pose. Le store (`diagram-editor/store.ts`) reprend la structure de celui du
montage : commandes nommées, onglets de `useDocumentTabs`, vue de `view.ts`.

Les couleurs d'un nœud sont une règle du domaine (`nodePaint`) : contour, fond teinté (la couleur
mêlée au papier), fond plein (la couleur, avec un contour qui s'en détache). L'export l'applique
en `#rrggbb` pour le fond de l'image, dont il déduit aussi l'encre (`exportGround`) ; l'écran
applique la même règle avec les variables CSS du thème (`color-mix`, `--node-tint`). La taille
qu'il faut à un nœud pour son texte (`nodeSizeForText`) prend un mesureur en paramètre : la mesure
réelle vient du rendu (`src/render/textMeasure.ts`), le domaine en garde une estimation.

## Gestes et touches de modification

Les trois canevas partagent une convention plutôt que du code : Maj ajoute à la sélection ou
contraint un tracé, Alt copie, Ctrl saisit le point d'attache le plus proche de ce qu'on survole
(poignée d'une forme, broche d'un composant, point d'accroche d'un nœud). Dans le montage et le
diagramme, ce Ctrl+glisser est pris en phase de capture sur le SVG (`onGrabDown`), avant les
gestes propres aux éléments ; l'anneau qui l'annonce n'apparaît que Ctrl enfoncée (`ctrlHeld` du
store, tenu par le clavier et recalé sur chaque mouvement du pointeur). CLAUDE.md tient le
tableau de ces gestes ; l'aide F1 les dit de la même façon dans chaque section.

## Profil de style

Le profil de style est général à l'application (`defaultProfile` des paramètres) ; chaque montage
garde dans son fichier la copie avec laquelle il se dessine (`doc.profile`). Le store du montage
distingue cette copie du profil affiché (`profile` = `profilePreview` s'il y en a un) : la boîte
« Profil de style » prévisualise le profil général sur le montage affiché s'il le suit, sans
toucher à l'historique ; à la validation, les paramètres sont enregistrés et chaque montage ouvert
qui suivait l'ancien profil reçoit une commande (`followGeneralProfile`). Un montage dont le style
s'écarte du profil général garde le sien ; ses écarts (`profileDifferences`) sont surlignés dans le
panneau, où un bouton l'aligne ; le style d'un montage se modifie depuis ce panneau, avec la même
boîte ouverte en mode `montage`.

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
- Les broches et les fils vivent sur les intersections. Une broche se pose sur n'importe quelle
  intersection de la boîte du composant, bord compris ; l'éditeur accroche le clic à la plus
  proche (`nearestInsidePoint`).
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

## Onglets de montage

Plusieurs montages peuvent être ouverts, un par onglet de la barre d'application. Le store du
montage reste unique : l'onglet actif vit dans ses refs (document, fichier, vue, sélection) et dans
la variable `history` ; les autres attendent dans `tabStates`, chacun avec son propre `History`.
`activateTab` range l'état vivant (`stash`) puis charge celui de l'onglet demandé (`load`) ; les
éditeurs, les raccourcis et le canevas ne connaissent que l'onglet actif. Nouveau et Ouvrir passent
par `showInTab`, qui réutilise l'onglet actif s'il est vierge (`pristine`). Le presse-papiers
(`ClipboardData`, avec la définition de chaque composant copié) est commun : `insertCopies` embarque
dans le montage cible les définitions qui lui manquent.

Les composants ouverts suivent la même mécanique dans le store de l'éditeur de composants ; la
rangée d'onglets de la barre d'application montre ceux du mode affiché.

## Copies de secours et fermeture

Toutes les `autosaveSeconds`, `App.vue` appelle `syncAutosaves(dirtyDocuments())` : une copie par
montage modifié dans `userData/autosave/` (`montage-<onglet>.pinout.json` + contexte : nom, chemin
d'origine, date), toutes les autres effacées. Au lancement, les copies présentes sont proposées et
rouvertes chacune dans un onglet. À la fermeture, le processus principal connaît l'état
(`setDirty`, vrai dès qu'un onglet ou le composant est modifié) : s'il y a des modifications, il
demande confirmation (`discard-then-quit` efface les copies de secours puis ferme, avec un délai de
repli de 3 s ; `save-then-quit` enregistre chaque montage modifié, affiché à son tour, sans délai,
et `cancelQuit` garde la fenêtre si l'utilisateur renonce). Les copies de secours ne survivent qu'à
un arrêt brutal : c'est alors qu'elles sont proposées.

## Fichiers

Tous en JSON indenté, avec `schemaVersion`, validés par Zod à l'ouverture, migrés étape par étape
(`src/domain/migrations.ts`). Un fichier d'exemple par version dans `src/domain/fixtures/`.
Versions courantes : composant 14 (textes verticaux, angles arrondis des polylignes, forme point, opacité du remplissage, italique, souligné et barré des textes, orientation réglée texte par texte, textes droits sur le montage, boîtes de texte multilignes, flèche au milieu, graisse des textes, épaisseur en multiplicateur, flèches, textes variables avec
unité, plus de `labelPrefix`), projet 19 (styles, sens et couleur des étiquettes texte, couleurs de fil propres au montage, étiquettes texte en boîte, police des étiquettes d'extrémité dans le profil, graisse des étiquettes, étiquettes d'extrémité des fils, `componentStroke` dans le profil, `fields` par instance,
définitions embarquées migrées à chaque version des composants), diagramme 2 (style de texte par nœud ; nœuds, liens à étiquette, textes libres, style et couleurs du diagramme), paramètres 9 (`componentStroke`
et `endLabelFont` du profil par défaut, thème sombre par défaut, ouverture du panneau, affichage de
la bibliothèque).

| Donnée                  | Schéma                      | Emplacement                                                                                                                                                                   |
| ----------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Définition de composant | `componentDefinitionSchema` | `<bibliothèque>/<id>/component.json` (+ `image.png` pour un visuel PNG)                                                                                                       |
| Projet                  | `projectSchema`             | où l'utilisateur veut, `*.pinout.json`, autonome                                                                                                                              |
| Profil de style         | `styleProfileSchema`        | général dans les paramètres, copié dans chaque projet ; modèles dans `userData/profiles/`                                                                                     |
| Paramètres              | `settingsSchema`            | partagés : `<OneDrive>\(Cours)\Robotique\(Ressources)\Pinout\settings.json` ; locaux (copie et fichiers récents) : `userData/settings.json` (`userData` = `%APPDATA%\Pinout`) |

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
