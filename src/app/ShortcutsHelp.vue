<script setup lang="ts">
import { computed, ref } from 'vue'
import ModalDialog from '@/ui/ModalDialog.vue'

// Aide : les raccourcis d'un éditeur à la fois, celui qu'on regarde d'abord ; des onglets mènent
// aux autres.

/** `initial` : titre de la section montrée à l'ouverture. */
const props = defineProps<{ initial?: string }>()
const emit = defineEmits<{ close: [] }>()

const sections: { title: string; rows: [string, string][] }[] = [
  {
    title: 'Montage',
    rows: [
      ['V', 'Sélection ; arrête la pose ou le tracé'],
      ['F', 'Tracer un fil : un clic par coude, l’axe dominant d’abord, Maj inverse le L'],
      ['Entrée / double-clic', 'Terminer le fil (finir sur une broche ou un fil le termine aussi)'],
      ['Retour arrière', 'Retirer le dernier sommet du fil en cours'],
      [
        'Glisser depuis une broche',
        'En sélection : tire un fil de cette broche jusqu’au point de relâchement (Maj inverse le L)'
      ],
      ['Échap', 'Annuler le tracé, la pose, puis la sélection'],
      ['R / Maj+R', 'Rotation horaire / antihoraire'],
      ['T / Maj+T', 'Miroir horizontal / vertical'],
      ['Flèches', 'Déplacer la sélection d’une cellule'],
      ['Suppr', 'Supprimer la sélection'],
      ['Ctrl+A / D', 'Tout sélectionner / dupliquer'],
      ['Ctrl+C / V', 'Copier / coller (aussi dans un autre montage)'],
      ['Ctrl+Page haut / bas', 'Avancer / reculer les fils (Maj : premier / arrière-plan)'],
      ['Ctrl+Z / Y', 'Annuler / rétablir'],
      ['Ctrl+N / O / S', 'Nouveau / ouvrir (dans un onglet) / enregistrer (Ctrl+Maj+S : sous…)'],
      [
        'Glisser un fichier',
        'Dans la fenêtre : un montage s’ouvre dans un onglet, un composant dans son éditeur'
      ],
      [
        'Ctrl+Tab / Ctrl+Maj+Tab',
        'Montage suivant / précédent ; clic du milieu sur un onglet : le fermer'
      ],
      ['Ctrl+E', 'Exporter en PNG ou SVG'],
      ['0 / 1', 'Ajuster au contenu / zoom 100 %'],
      ['Molette, Espace + glisser', 'Zoom autour du curseur, déplacer la vue'],
      ['Double-clic molette', 'Ajuster la vue au contenu'],
      ['I', 'Afficher / masquer le panneau de propriétés'],
      ['Clic droit', 'Menu contextuel : composant, fil, étiquette ou vide'],
      [
        'Double-clic',
        'Valeur d’un composant, texte d’une étiquette, étiquette d’une extrémité libre'
      ],
      ['Alt+glisser', 'Déposer une copie de la sélection']
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
      [
        'F',
        'Tracer un lien : un clic par coude, Maj inverse le L ; arriver sur un nœud le termine'
      ],
      [
        'Glisser depuis le bord d’un nœud',
        'En sélection : tire un lien de ce point d’accroche jusqu’au point de relâchement'
      ],
      ['Entrée / double-clic', 'Terminer le lien ; sur un nœud sélectionné, taper son texte'],
      [
        'Double-clic',
        'Texte d’un nœud (Entrée valide, Maj+Entrée va à la ligne), étiquette d’un lien, texte libre'
      ],
      ['E', 'Texte libre : deux clics ou un glisser pour les deux coins de sa boîte'],
      ['R', 'Tourner une barre de fourche d’un quart de tour'],
      ['Flèches', 'Déplacer la sélection d’une cellule ; les liens accrochés suivent'],
      ['Suppr', 'Supprimer la sélection'],
      ['Ctrl+A / D', 'Tout sélectionner / dupliquer'],
      ['Ctrl+C / V', 'Copier / coller (aussi dans un autre diagramme)'],
      ['Alt+glisser', 'Déposer une copie de la sélection'],
      ['Ctrl+Page haut / bas', 'Avancer / reculer les nœuds (Maj : premier / arrière-plan)'],
      ['Ctrl+Z / Y', 'Annuler / rétablir'],
      ['Ctrl+N / O / S', 'Nouveau / ouvrir (dans un onglet) / enregistrer en .pinuml'],
      ['Ctrl+E', 'Exporter en PNG ou SVG'],
      ['0 / 1', 'Ajuster au contenu / zoom 100 %'],
      ['Molette, Espace + glisser', 'Zoom autour du curseur, déplacer la vue'],
      ['I', 'Afficher / masquer le panneau de propriétés'],
      ['Clic droit', 'Menu contextuel : nœud, lien, texte ou vide']
    ]
  },
  {
    title: 'Éditeur de composants',
    rows: [
      [
        'V',
        'Sélection : glisser déplace les formes et les broches sélectionnées ; lasso dans le vide'
      ],
      [
        'Ctrl+Tab / Ctrl+Maj+Tab',
        'Composant suivant / précédent ; clic du milieu sur un onglet : le fermer'
      ],
      ['Ctrl (sans sélection)', 'Poignées de la boîte du composant : glisser un coin ou un côté'],
      ['R / O / N', 'Rectangle / ellipse / point (un clic par point)'],
      ['L / P', 'Ligne / polyligne'],
      ['E / B', 'Texte / broche (sur une intersection du composant)'],
      ['Ctrl+Page haut / bas', 'Avancer / reculer la forme (Maj : premier / arrière-plan)'],
      ['Bouton du milieu', 'Glisser : déplacer la vue ; double-clic : ajuster à la fenêtre'],
      ['Entrée', 'Terminer la polyligne'],
      ['Suppr, Échap', 'Supprimer, annuler'],
      ['Ctrl+Z / Y / S / N', 'Annuler / rétablir / enregistrer / nouveau'],
      ['Ctrl+molette', 'Zoom centré sur le curseur'],
      ['Double-clic molette', 'Ajuster le composant à la fenêtre'],
      ['Ctrl+glisser', 'Saisir la poignée la plus proche de la forme'],
      ['Lasso, Maj+clic', 'Sélectionner plusieurs formes'],
      ['Maj pendant le tracé', 'Carré ou cercle plutôt que rectangle ou ellipse'],
      ['Alt+glisser', 'Déposer une copie des formes sélectionnées'],
      ['Ctrl+C / V / D', 'Copier / coller / dupliquer les formes']
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
