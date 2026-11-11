<script setup lang="ts">
import { computed, ref } from 'vue'
import ModalDialog from '@/ui/ModalDialog.vue'

// Aide : les raccourcis d'un éditeur à la fois, celui qu'on regarde d'abord ; des onglets mènent
// aux autres.

/** `initial` : titre de la section montrée à l'ouverture. */
const props = defineProps<{ initial?: string }>()
const emit = defineEmits<{ close: [] }>()

/** Une ligne de l'aide : les touches ou le geste, puis ce qu'il fait. */
type Row = [string, string]

// Gestes communs aux trois éditeurs, dits partout de la même façon. Les touches de modification
// gardent le même sens d'un éditeur à l'autre : Maj ajoute à la sélection ou contraint un tracé,
// Alt copie, Ctrl saisit le point d'attache le plus proche de ce qu'on survole.
const SELECTION: Row[] = [
  [
    'Clic, lasso dans le vide',
    'Sélectionner ; glisser un élément sélectionné déplace toute la sélection'
  ],
  ['Maj+clic, Maj+lasso', 'Ajouter à la sélection, ou en retirer'],
  ['Alt+glisser', 'Déposer une copie de la sélection'],
  ['Flèches', 'Déplacer la sélection d’un pas de grille'],
  ['Suppr', 'Supprimer la sélection'],
  ['Ctrl+A / D', 'Tout sélectionner / dupliquer'],
  [
    'Ctrl+G / Ctrl+Maj+G',
    'Grouper la sélection / défaire ses groupes (aussi par le clic droit) ; un groupe se sélectionne et se déplace d’un bloc'
  ],
  ['Ctrl+clic sur un élément groupé', 'Le sélectionner seul, sans son groupe'],
  ['Ctrl+C / V', 'Copier / coller, aussi d’un onglet à l’autre'],
  ['Ctrl+Z / Y', 'Annuler / rétablir'],
  ['Échap', 'Annuler le geste en cours, puis la sélection, puis revenir à l’outil Sélection']
]

const VIEW: Row[] = [
  ['Molette', 'Zoom autour du curseur'],
  ['Espace + glisser, bouton du milieu', 'Déplacer la vue'],
  ['Double-clic du bouton du milieu, 0', 'Ajuster la vue au contenu'],
  ['1', 'Zoom 100 %']
]

const sections: { title: string; rows: Row[] }[] = [
  {
    title: 'Montage',
    rows: [
      ['V', 'Sélection ; arrête la pose ou le tracé'],
      ['F', 'Tracer un fil : un clic par coude, l’axe dominant d’abord'],
      ['Alt pendant le tracé', 'Tracer à 45° : une diagonale, puis un segment droit'],
      ['Maj pendant le tracé', 'Inverser l’ordre : le L du fil, ou la diagonale à l’arrivée'],
      ['Entrée / double-clic', 'Terminer le fil (finir sur une broche ou un fil le termine aussi)'],
      ['Retour arrière', 'Retirer le dernier sommet du fil en cours'],
      [
        'Ctrl+glisser sur un composant',
        'Tirer un fil de sa broche la plus proche (l’anneau vert) jusqu’au point de relâchement'
      ],
      ['E', 'Étiquette texte : deux clics ou un glisser pour les deux coins de sa boîte'],
      ['R / Maj+R', 'Rotation horaire / antihoraire'],
      ['T / Maj+T', 'Miroir horizontal / vertical'],
      ...SELECTION,
      ['Alt+clic sur un croisement', 'Inverser l’ordre des deux fils à cet endroit seulement'],
      [
        'Ctrl+clic sur un fil',
        'Ajouter un sommet sur une partie droite, ou retirer le coin visé (un fil groupé est d’abord pris seul)'
      ],
      [
        'Double-clic sur un fil',
        'Démarrer à cet endroit un nouveau fil, raccordé par une jonction'
      ],
      [
        'Ctrl+Page haut / bas',
        'Avancer / reculer les fils (Maj : premier / arrière-plan) ; un composant passe devant / derrière les fils'
      ],
      [
        'Double-clic',
        'Valeur d’un composant, texte d’une étiquette, étiquette d’une extrémité libre'
      ],
      [
        'Clic droit',
        'Menu contextuel : composant, fil (sommet ou coupe à l’endroit du clic, net, croisement), étiquette ou vide'
      ],
      ...VIEW,
      [
        'I',
        'Panneau de propriétés : l’ouvrir pour de bon ou le masquer ; un clic sur un élément le montre le temps de la sélection'
      ],
      ['Ctrl+N / O / S', 'Nouveau / ouvrir (dans un onglet) / enregistrer (Ctrl+Maj+S : sous…)'],
      ['Ctrl+E', 'Exporter en PNG ou SVG'],
      [
        'Ctrl+Tab / Ctrl+Maj+Tab',
        'Montage suivant / précédent ; sur un onglet, clic du milieu : le fermer, clic droit : enregistrer, fermer les autres'
      ],
      [
        'Glisser un fichier',
        'Dans la fenêtre : un montage ou un diagramme s’ouvre dans un onglet, un composant dans son éditeur'
      ]
    ]
  },
  {
    title: 'Diagramme',
    rows: [
      [
        'Bibliothèque',
        'Clic sur une forme puis sur le diagramme, ou glisser-déposer ; le texte se tape aussitôt'
      ],
      ['V', 'Sélection ; arrête la pose ou le tracé'],
      ['F', 'Tracer un lien : un clic par coude ; arriver sur un nœud le termine'],
      ['Maj pendant le tracé', 'Inverser le L du lien'],
      ['Entrée / double-clic', 'Terminer le lien ; sur un nœud sélectionné, taper son texte'],
      ['Retour arrière', 'Retirer le dernier sommet du lien en cours'],
      [
        'Ctrl+glisser sur un nœud',
        'Tirer un lien de son point d’accroche le plus proche (l’anneau vert) jusqu’au point de relâchement'
      ],
      [
        'Départ et arrivée d’un lien',
        'Toujours de face : le lien quitte une forme et y arrive à angle droit, avec un coude de plus s’il le faut (Maj : l’autre tracé) ; depuis une note, il est en pointillés'
      ],
      [
        'Glisser le segment qui sort d’une forme',
        'Son point d’attache glisse le long du côté, d’une accroche à l’autre'
      ],
      ['Ctrl+clic sur un lien', 'Ajouter un sommet sur une partie droite, ou retirer le coin visé'],
      [
        'Glisser l’étiquette d’un lien',
        'Elle longe le trait, toujours à la même distance, et change de côté quand on le traverse'
      ],
      ['E', 'Texte libre : deux clics ou un glisser pour les deux coins de sa boîte'],
      ['R', 'Tourner une barre de fourche d’un quart de tour'],
      ...SELECTION,
      ['Ctrl+Page haut / bas', 'Avancer / reculer les nœuds (Maj : premier / arrière-plan)'],
      [
        'Double-clic',
        'Texte d’un nœud (Entrée valide, Maj+Entrée va à la ligne), étiquette d’un lien, texte libre'
      ],
      [
        'Clic droit',
        'Menu contextuel : nœud (forme, texte), lien (étiquette, sommets), texte, ou vide pour poser une forme'
      ],
      ...VIEW,
      [
        'I',
        'Panneau de propriétés : l’ouvrir pour de bon ou le masquer ; un clic sur un élément le montre le temps de la sélection'
      ],
      ['Ctrl+N / O / S', 'Nouveau / ouvrir (dans un onglet) / enregistrer en .pinuml'],
      ['Ctrl+E', 'Exporter en PNG ou SVG'],
      [
        'Ctrl+Tab / Ctrl+Maj+Tab',
        'Diagramme suivant / précédent ; sur un onglet, clic du milieu : le fermer, clic droit : enregistrer, fermer les autres'
      ]
    ]
  },
  {
    title: 'Éditeur de composants',
    rows: [
      ['V', 'Sélection'],
      ['R / O / N', 'Rectangle / ellipse / point (un clic par point)'],
      ['L / P', 'Ligne / polyligne'],
      ['Maj pendant le tracé', 'Carré ou cercle plutôt que rectangle ou ellipse'],
      ['Entrée / double-clic', 'Terminer la polyligne'],
      ['Retour arrière', 'Retirer le dernier point de la polyligne en cours'],
      ['E / B', 'Texte / broche (sur une intersection du composant)'],
      [
        'Bouton Image',
        'Importer un PNG, posé comme une forme : 80 px du fichier par cellule, donc des broches à dessiner tous les 80 px'
      ],
      ['Ctrl+glisser sur une forme', 'Saisir sa poignée la plus proche'],
      ['Ctrl (sans sélection)', 'Poignées de la boîte du composant : glisser un coin ou un côté'],
      [
        'Broches, dans le panneau',
        '« + Groupe » crée un groupe nommé ; glisser une broche change son ordre ou son groupe, son numéro suit'
      ],
      ...SELECTION,
      ['Ctrl+Page haut / bas', 'Avancer / reculer la forme (Maj : premier / arrière-plan)'],
      [
        'Clic hors de la feuille',
        'Désélectionner ; avec un outil de dessin, le quitter et revenir à la sélection'
      ],
      ['Clic droit', 'Menu contextuel : forme, broche ou vide'],
      [
        'Clic droit dans la bibliothèque',
        'Ouvrir, dupliquer, renommer, changer de catégorie ou supprimer un composant'
      ],
      ...VIEW,
      [
        'I',
        'Panneau de propriétés : l’ouvrir pour de bon ou le masquer ; un clic sur un élément le montre le temps de la sélection'
      ],
      ['Ctrl+N / S', 'Nouveau / enregistrer dans la bibliothèque'],
      [
        'Ctrl+Tab / Ctrl+Maj+Tab',
        'Composant suivant / précédent ; sur un onglet, clic du milieu : le fermer, clic droit : enregistrer, fermer les autres'
      ]
    ]
  }
]

/** Section montrée : celle demandée à l'ouverture, sinon la première. */
const current = ref(
  sections.find((section) => section.title === props.initial)?.title ?? sections[0]?.title ?? ''
)
const rows = computed(() => sections.find((section) => section.title === current.value)?.rows ?? [])
</script>

<template>
  <ModalDialog title="Raccourcis clavier" wide @close="emit('close')">
    <nav class="tabs">
      <button
        v-for="section in sections"
        :key="section.title"
        type="button"
        :class="{ active: section.title === current }"
        @click="current = section.title"
      >
        {{ section.title }}
      </button>
    </nav>
    <table>
      <tbody>
        <tr v-for="[keys, action] in rows" :key="keys">
          <td>
            <kbd>{{ keys }}</kbd>
          </td>
          <td>{{ action }}</td>
        </tr>
      </tbody>
    </table>
  </ModalDialog>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
}

.tabs button.active {
  background: var(--accent-soft);
  border-color: var(--accent-border);
  color: var(--accent);
}

table {
  border-collapse: collapse;
  width: 100%;
  font-size: 13px;
}

td {
  padding: 3px 8px 3px 0;
  vertical-align: top;
  border-top: 1px solid var(--border-soft);
}

kbd {
  white-space: nowrap;
  padding: 1px 6px;
  font-size: 12px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface-2);
}
</style>
