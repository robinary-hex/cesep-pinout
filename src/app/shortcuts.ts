import type { IconName } from '@/ui/icons'

// Contenu de l'aide (F1) : les raccourcis de chaque éditeur, rangés par thème et dits en peu de
// mots. ShortcutsHelp.vue les dessine : une touche par capuchon, un geste de souris par
// pictogramme.
//
// Les gestes communs aux trois éditeurs (`SELECT`, `EDIT`, `VIEW`) sont dits partout de la même
// façon, et les touches de modification y gardent le même sens : Maj ajoute à la sélection ou
// varie un tracé, Alt copie, Ctrl saisit le point d'attache le plus proche de ce qu'on survole.

/** Un raccourci : le geste, et ce qu'il fait. */
export interface Shortcut {
  /**
   * Combinaisons équivalentes. Dans chacune, « + » joint les touches et les gestes de souris
   * (`MOUSE_GESTURES`).
   */
  keys: string[]
  /** Ce que fait le geste, en quelques mots. */
  label: string
  /** Où le geste se fait (« sur un fil »), quand ce n'est pas partout. */
  where?: string
  /** Ce que fait le même geste avec Maj en plus. */
  withShift?: string
  /** Précision courte, sous le libellé. */
  note?: string
  /** Pictogramme de l'action : celui de son bouton ou de son entrée de menu. */
  icon?: IconName
}

/** Raccourcis d'un même thème ; `hint` : une phrase qui vaut pour tous. */
export interface ShortcutCategory {
  title: string
  hint?: string
  rows: Shortcut[]
}

/** Les raccourcis d'un éditeur. Son titre et son pictogramme sont ceux du bouton de son mode. */
export interface ShortcutSection {
  title: string
  icon: IconName
  categories: ShortcutCategory[]
}

/** Geste de souris : le bouton qui travaille, et s'il glisse ou clique deux fois. */
export interface MouseGesture {
  button: 'left' | 'right' | 'middle' | 'wheel'
  drag?: boolean
  double?: boolean
}

/** Les gestes de souris que l'aide sait dessiner, par leur nom dans une combinaison. */
export const MOUSE_GESTURES: Record<string, MouseGesture> = {
  clic: { button: 'left' },
  'double-clic': { button: 'left', double: true },
  'clic droit': { button: 'right' },
  'clic milieu': { button: 'middle' },
  'double-clic milieu': { button: 'middle', double: true },
  glisser: { button: 'left', drag: true },
  'glisser milieu': { button: 'middle', drag: true },
  molette: { button: 'wheel' }
}

/** Ce qu'on écrit sur une touche quand ce n'est pas son nom. */
const KEY_FACES: Record<string, string> = { Flèches: '← ↑ ↓ →' }

/** Un morceau de combinaison : une touche (`mouse` nul) ou un geste de souris. */
export interface KeyToken {
  text: string
  mouse: MouseGesture | null
}

/** Les touches et gestes d'une combinaison, dans l'ordre où on les fait. */
export function comboTokens(combo: string): KeyToken[] {
  return combo.split('+').map((part) => {
    const name = part.trim()
    return { text: KEY_FACES[name] ?? name, mouse: MOUSE_GESTURES[name] ?? null }
  })
}

/** Une ligne de l'aide ; `keys` : les combinaisons équivalentes, séparées par « / ». */
function k(keys: string, label: string, more: Omit<Shortcut, 'keys' | 'label'> = {}): Shortcut {
  return { keys: keys.split(' / '), label, ...more }
}

const SELECT: ShortcutCategory = {
  title: 'Sélectionner',
  rows: [
    k('clic', 'Sélectionner', { icon: 'cursor' }),
    k('glisser', 'Sélectionner au lasso', { where: 'dans le vide' }),
    k('Maj+clic', 'Ajouter ou retirer', { note: 'au lasso aussi' }),
    k('Ctrl+clic', 'Le prendre sans son groupe', { where: 'sur un élément groupé' }),
    k('Ctrl+A', 'Tout sélectionner', { icon: 'select-all' }),
    k('Échap', 'Annuler, puis désélectionner')
  ]
}

const EDIT: ShortcutCategory = {
  title: 'Modifier',
  rows: [
    k('glisser', 'Déplacer'),
    k('Flèches', 'Déplacer d’un pas'),
    k('Alt+glisser', 'Déposer une copie'),
    k('Ctrl+D', 'Dupliquer', { icon: 'duplicate' }),
    k('Ctrl+C', 'Copier', { icon: 'copy' }),
    k('Ctrl+V', 'Coller', { icon: 'clipboard' }),
    k('Suppr', 'Supprimer', { icon: 'trash' }),
    k('Ctrl+Z', 'Annuler', { icon: 'undo' }),
    k('Ctrl+Y', 'Rétablir', { icon: 'redo' }),
    k('Ctrl+G', 'Grouper', { icon: 'group', withShift: 'dégrouper' }),
    k('clic droit', 'Menu contextuel', { icon: 'menu' })
  ]
}

const VIEW: ShortcutCategory = {
  title: 'Vue',
  rows: [
    k('molette', 'Zoomer', { icon: 'zoom-in' }),
    k('Espace+glisser / glisser milieu', 'Déplacer la vue'),
    k('0 / double-clic milieu', 'Ajuster la vue', { icon: 'fit' }),
    k('1', 'Zoom 100 %'),
    k('I', 'Panneau de propriétés', { icon: 'panel' }),
    k('F1', 'Cette aide', { icon: 'help' }),
    k('F11', 'Plein écran')
  ]
}

/** Ordre d'empilement : les mêmes touches partout ; `hint` dit ce qu'elles rangent. */
function order(hint?: string): ShortcutCategory {
  return {
    title: 'Ordre',
    ...(hint === undefined ? {} : { hint }),
    rows: [
      k('Ctrl+Page haut', 'Avancer', { icon: 'arrow-up', withShift: 'premier plan' }),
      k('Ctrl+Page bas', 'Reculer', { icon: 'arrow-down', withShift: 'arrière-plan' })
    ]
  }
}

/** Fichiers et onglets : un composant va dans la bibliothèque, sans fichier à ouvrir ni export. */
function files(kind: 'composant' | 'montage' | 'diagramme'): ShortcutCategory {
  const hasFile = kind !== 'composant'
  return {
    title: 'Fichiers et onglets',
    rows: [
      k('Ctrl+N', `Nouveau ${kind}`, { icon: 'file-plus' }),
      ...(hasFile ? [k('Ctrl+O', 'Ouvrir', { icon: 'folder-open' })] : []),
      hasFile
        ? k('Ctrl+S', 'Enregistrer', { icon: 'save', withShift: 'enregistrer sous' })
        : k('Ctrl+S', 'Enregistrer', { icon: 'save', note: 'dans la bibliothèque' }),
      ...(hasFile ? [k('Ctrl+E', 'Exporter en PNG ou SVG', { icon: 'export' })] : []),
      k('Ctrl+Tab', 'Onglet suivant', { withShift: 'précédent' }),
      k('clic milieu', 'Fermer l’onglet', { where: 'sur un onglet' }),
      k('glisser', 'Ouvrir le fichier', { where: 'un fichier dans la fenêtre' })
    ]
  }
}

/** Les trois éditeurs, dans l'ordre des boutons de mode de la barre d'application. */
export const SHORTCUT_SECTIONS: ShortcutSection[] = [
  {
    title: 'Composants',
    icon: 'chip',
    categories: [
      {
        title: 'Outils',
        rows: [
          k('V', 'Sélection', { icon: 'cursor' }),
          k('R', 'Rectangle', { icon: 'square' }),
          k('O', 'Ellipse', { icon: 'circle' }),
          k('N', 'Point', { icon: 'dot' }),
          k('L', 'Ligne', { icon: 'line' }),
          k('P', 'Polyligne', { icon: 'polyline' }),
          k('E', 'Texte', { icon: 'type' }),
          k('B', 'Broche', { icon: 'pin' })
        ]
      },
      {
        title: 'Dessiner',
        rows: [
          k('Maj', 'Carré ou cercle', { where: 'en traçant' }),
          k('Entrée / double-clic', 'Terminer la polyligne'),
          k('Retour arrière', 'Retirer le dernier point'),
          k('Ctrl+glisser', 'Saisir sa poignée la plus proche', { where: 'sur une forme' }),
          k('Ctrl', 'Poignées du composant', { where: 'sans sélection' }),
          k('clic', 'Quitter l’outil', { where: 'hors de la feuille' })
        ]
      },
      {
        title: 'Broches, variantes, images',
        rows: [
          k('clic', 'Poser une broche', { where: 'outil Broche', icon: 'pin' }),
          k('glisser', 'Une broche par intersection', { where: 'outil Broche' }),
          k('glisser', 'Changer son rang ou son groupe', { where: 'une broche du panneau' }),
          k('glisser', 'Changer son rang', { where: 'une variante du panneau', icon: 'layers' }),
          k('glisser', 'Ajouter l’image au dessin', {
            where: 'un PNG dans la fenêtre',
            icon: 'image',
            note: '80 px du fichier par cellule'
          })
        ]
      },
      order(),
      SELECT,
      EDIT,
      VIEW,
      files('composant')
    ]
  },
  {
    title: 'Montage',
    icon: 'schematic',
    categories: [
      {
        title: 'Outils',
        rows: [
          k('V', 'Sélection', { icon: 'cursor' }),
          k('F', 'Fil', { icon: 'wire' }),
          k('E', 'Étiquette', { icon: 'type' }),
          k('clic / glisser', 'Poser un composant', {
            where: 'depuis la bibliothèque',
            icon: 'chip'
          })
        ]
      },
      {
        title: 'Tracer un fil',
        rows: [
          k('clic', 'Poser un coude'),
          k('Maj', 'Inverser le L'),
          k('Alt', 'Tracer à 45°'),
          k('Entrée / double-clic', 'Terminer le fil'),
          k('Retour arrière', 'Retirer le dernier coude'),
          k('Ctrl+glisser', 'Tirer un fil de sa broche la plus proche', {
            where: 'sur un composant'
          }),
          k('double-clic', 'Y brancher un nouveau fil', { where: 'sur un fil' })
        ]
      },
      {
        title: 'Retoucher un fil',
        rows: [
          k('glisser', 'Le déplacer', { where: 'un segment ou un coude' }),
          k('Ctrl+clic', 'Ajouter ou retirer un coude', { where: 'sur un fil' }),
          k('Alt+clic', 'Inverser le fil du dessus', { where: 'sur un croisement' }),
          k('double-clic', 'Étiqueter l’extrémité', { where: 'sur un bout libre', icon: 'tag' })
        ]
      },
      {
        title: 'Composants et étiquettes',
        rows: [
          k('R', 'Tourner', { icon: 'rotate-cw', withShift: 'dans l’autre sens' }),
          k('T', 'Miroir horizontal', { icon: 'flip-h', withShift: 'miroir vertical' }),
          k('double-clic', 'Saisir la valeur ou le texte', { icon: 'edit' })
        ]
      },
      order('Les composants entre eux, les fils entre eux.'),
      SELECT,
      EDIT,
      VIEW,
      files('montage')
    ]
  },
  {
    title: 'Diagramme',
    icon: 'diagram',
    categories: [
      {
        title: 'Outils',
        rows: [
          k('V', 'Sélection', { icon: 'cursor' }),
          k('F', 'Lien', { icon: 'link' }),
          k('E', 'Texte', { icon: 'type' }),
          k('clic / glisser', 'Poser une forme', {
            where: 'depuis la bibliothèque',
            icon: 'square'
          })
        ]
      },
      {
        title: 'Tracer un lien',
        rows: [
          k('clic', 'Poser un coude'),
          k('Maj', 'Essayer l’autre tracé'),
          k('Entrée / double-clic', 'Terminer le lien'),
          k('Retour arrière', 'Retirer le dernier coude'),
          k('Ctrl+glisser', 'Tirer un lien de son accroche la plus proche', {
            where: 'sur une forme'
          })
        ]
      },
      {
        title: 'Retoucher un lien',
        rows: [
          k('glisser', 'Le déplacer', { where: 'un segment ou un coude' }),
          k('glisser', 'Changer d’accroche', { where: 'le segment qui sort d’une forme' }),
          k('Ctrl+clic', 'Ajouter ou retirer un coude', { where: 'sur un lien' }),
          k('double-clic', 'Saisir son étiquette', { where: 'sur un lien', icon: 'tag' }),
          k('glisser', 'La déplacer le long du lien', { where: 'l’étiquette' })
        ]
      },
      {
        title: 'Formes et textes',
        rows: [
          k('Entrée / double-clic', 'Modifier le texte', { icon: 'edit' }),
          k('Maj+Entrée', 'Aller à la ligne', { where: 'en tapant' }),
          k('R', 'Tourner une barre', { icon: 'rotate-cw' })
        ]
      },
      order(),
      SELECT,
      EDIT,
      VIEW,
      files('diagramme')
    ]
  }
]
