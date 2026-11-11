import type { IconName } from '@/ui/icons'

// Contenu de l'aide (F1) : les raccourcis de chaque éditeur, rangés par thème. ShortcutsHelp.vue
// les dessine : une touche par capuchon, un geste de souris par pictogramme.
//
// Un raccourci tient sur une ligne (décision du 11 novembre 2026) : un geste court, un libellé de
// quelques mots qui dit sur quoi il porte quand ce n'est pas évident (« Étiqueter un bout
// libre »), pas de précision en dessous. Ce qui ne tient pas se redit plus court ou se coupe en
// deux lignes (« Déplacer la vue », deux façons de faire).
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
  /** Ce que fait le même geste avec Maj en plus, dit à la suite du libellé. */
  withShift?: string
  /** Pictogramme de l'action : celui de son bouton ou de son entrée de menu. */
  icon?: IconName
}

/** Raccourcis d'un même thème. */
export interface ShortcutCategory {
  title: string
  rows: Shortcut[]
}

/** Les raccourcis d'un éditeur. Son titre et son pictogramme sont ceux du bouton de son mode. */
export interface ShortcutSection {
  title: string
  icon: IconName
  categories: ShortcutCategory[]
}

/** Geste de souris : ce que dit sa pastille, le bouton qui travaille, s'il glisse ou clique deux fois. */
export interface MouseGesture {
  text: string
  button: 'left' | 'right' | 'middle' | 'wheel'
  drag?: boolean
  double?: boolean
}

/**
 * Les gestes de souris que l'aide sait dessiner, par leur nom dans une combinaison. Un
 * double-clic se dit « ×2 », plus court ; « déposer », c'est glisser un fichier dans la fenêtre.
 */
export const MOUSE_GESTURES: Record<string, MouseGesture> = {
  clic: { text: 'clic', button: 'left' },
  'double-clic': { text: 'clic ×2', button: 'left', double: true },
  'clic droit': { text: 'clic droit', button: 'right' },
  'clic milieu': { text: 'clic milieu', button: 'middle' },
  'double-clic milieu': { text: 'milieu ×2', button: 'middle', double: true },
  glisser: { text: 'glisser', button: 'left', drag: true },
  'glisser milieu': { text: 'glisser milieu', button: 'middle', drag: true },
  déposer: { text: 'déposer', button: 'left', drag: true },
  molette: { text: 'molette', button: 'wheel' }
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
    const mouse = MOUSE_GESTURES[name] ?? null
    return { text: mouse?.text ?? KEY_FACES[name] ?? name, mouse }
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
    k('glisser', 'Sélectionner au lasso'),
    k('Maj+clic', 'Ajouter ou retirer'),
    k('Ctrl+clic', 'Un élément sans son groupe'),
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

const ORDER: ShortcutCategory = {
  title: 'Ordre',
  rows: [
    k('Ctrl+Page haut', 'Avancer', { icon: 'arrow-up', withShift: 'premier plan' }),
    k('Ctrl+Page bas', 'Reculer', { icon: 'arrow-down', withShift: 'arrière-plan' })
  ]
}

const VIEW: ShortcutCategory = {
  title: 'Vue',
  rows: [
    k('molette', 'Zoomer', { icon: 'zoom-in' }),
    k('Espace+glisser', 'Déplacer la vue'),
    k('glisser milieu', 'Déplacer la vue'),
    k('0 / double-clic milieu', 'Ajuster la vue', { icon: 'fit' }),
    k('1', 'Zoom 100 %'),
    k('I', 'Panneau de propriétés', { icon: 'panel' }),
    k('F1', 'Cette aide', { icon: 'help' }),
    k('F11', 'Plein écran')
  ]
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
        ? k('Ctrl+S', 'Enregistrer', { icon: 'save', withShift: 'sous…' })
        : k('Ctrl+S', 'Enregistrer', { icon: 'save' }),
      ...(hasFile ? [k('Ctrl+E', 'Exporter en PNG ou SVG', { icon: 'export' })] : []),
      k('Ctrl+Tab', 'Onglet suivant', { withShift: 'précédent' }),
      k('clic milieu', 'Fermer l’onglet'),
      k('déposer', 'Ouvrir un fichier')
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
          k('Maj', 'Carré ou cercle'),
          k('Entrée / double-clic', 'Terminer la polyligne'),
          k('Retour arrière', 'Retirer le dernier point'),
          k('Ctrl+glisser', 'Saisir la poignée proche'),
          k('Ctrl', 'Poignées du composant')
        ]
      },
      {
        title: 'Broches et images',
        rows: [
          k('clic', 'Poser une broche', { icon: 'pin' }),
          k('glisser', 'Remplir une zone de broches'),
          k('déposer', 'Ajouter un PNG au dessin', { icon: 'image' })
        ]
      },
      ORDER,
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
          k('clic / glisser', 'Poser un composant', { icon: 'chip' })
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
          k('Ctrl+glisser', 'Tirer un fil d’une broche'),
          k('double-clic', 'Nouveau fil depuis un fil')
        ]
      },
      {
        title: 'Retoucher un fil',
        rows: [
          k('Ctrl+clic', 'Ajouter ou retirer un coude'),
          k('Alt+clic', 'Inverser un croisement'),
          k('double-clic', 'Étiqueter un bout libre', { icon: 'tag' })
        ]
      },
      {
        title: 'Composants et étiquettes',
        rows: [
          k('R', 'Tourner', { icon: 'rotate-cw', withShift: 'sens inverse' }),
          k('T', 'Miroir', { icon: 'flip-h', withShift: 'vertical' }),
          k('double-clic', 'Saisir la valeur, le texte', { icon: 'edit' })
        ]
      },
      ORDER,
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
          k('clic / glisser', 'Poser une forme', { icon: 'square' })
        ]
      },
      {
        title: 'Tracer un lien',
        rows: [
          k('clic', 'Poser un coude'),
          k('Maj', 'Essayer l’autre tracé'),
          k('Entrée / double-clic', 'Terminer le lien'),
          k('Retour arrière', 'Retirer le dernier coude'),
          k('Ctrl+glisser', 'Tirer un lien d’une accroche')
        ]
      },
      {
        title: 'Retoucher un lien',
        rows: [
          k('Ctrl+clic', 'Ajouter ou retirer un coude'),
          k('double-clic', 'Écrire son étiquette', { icon: 'tag' })
        ]
      },
      {
        title: 'Formes et textes',
        rows: [
          k('Entrée / double-clic', 'Modifier le texte', { icon: 'edit' }),
          k('Maj+Entrée', 'Aller à la ligne'),
          k('R', 'Tourner une barre', { icon: 'rotate-cw' })
        ]
      },
      ORDER,
      SELECT,
      EDIT,
      VIEW,
      files('diagramme')
    ]
  }
]
