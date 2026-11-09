<script setup lang="ts">
import ModalDialog from '@/ui/ModalDialog.vue'

const emit = defineEmits<{ close: [] }>()

const sections: { title: string; rows: [string, string][] }[] = [
  {
    title: 'Montage',
    rows: [
      ['V', 'Sélection ; arrête la pose ou le tracé'],
      ['F', 'Tracer un fil : un clic par coude, l’axe dominant d’abord, Maj inverse le L'],
      ['Entrée / double-clic', 'Terminer le fil (finir sur une broche ou un fil le termine aussi)'],
      ['Retour arrière', 'Retirer le dernier sommet du fil en cours'],
      ['Échap', 'Annuler le tracé, la pose, puis la sélection'],
      ['R / Maj+R', 'Rotation horaire / antihoraire'],
      ['T / Maj+T', 'Miroir horizontal / vertical'],
      ['Flèches', 'Déplacer la sélection d’une cellule'],
      ['Suppr', 'Supprimer la sélection'],
      ['Ctrl+A / D', 'Tout sélectionner / dupliquer'],
      ['Ctrl+C / V', 'Copier / coller (aussi dans un autre montage)'],
      ['Ctrl+Page haut / bas', 'Avancer / reculer les fils (Maj : premier / arrière-plan)'],
      ['Ctrl+Z / Y', 'Annuler / rétablir'],
      ['Ctrl+N / O / S', 'Nouveau / ouvrir / enregistrer (Ctrl+Maj+S : sous…)'],
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
    title: 'Éditeur de composants',
    rows: [
      ['V', 'Sélection : glisser déplace une forme ou une broche'],
      ['R / O / L / P', 'Rectangle / ellipse / ligne / polyligne'],
      ['E / B', 'Texte / broche (sur une intersection du composant)'],
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
</script>

<template>
  <ModalDialog title="Raccourcis clavier" wide @close="emit('close')">
    <div class="columns">
      <section v-for="section in sections" :key="section.title">
        <h3>{{ section.title }}</h3>
        <table>
          <tbody>
            <tr v-for="[keys, action] in section.rows" :key="keys">
              <td>
                <kbd>{{ keys }}</kbd>
              </td>
              <td>{{ action }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  </ModalDialog>
</template>

<style scoped>
.columns {
  display: grid;
  grid-template-columns: 3fr 2fr;
  gap: 24px;
}

h3 {
  margin: 0 0 8px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
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
