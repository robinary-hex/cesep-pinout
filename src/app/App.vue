<script setup lang="ts">
import { onMounted, ref } from 'vue'
import ComponentEditor from '@/features/component-editor/ComponentEditor.vue'
import LibraryPanel from '@/features/library/LibraryPanel.vue'
import { useLibraryStore } from '@/features/library/store'
import SchematicEditor from '@/features/schematic-editor/SchematicEditor.vue'

// Coque applicative : bascule entre les deux modes. Un seul éditeur est monté à la fois,
// donc un seul jeu de raccourcis clavier ; leur état vit dans les stores.

type Mode = 'components' | 'schematic'

const library = useLibraryStore()
const mode = ref<Mode>('schematic')

onMounted(() => {
  void library.init()
})
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <h1>Pinout</h1>
      <nav class="modes">
        <button
          type="button"
          :class="{ active: mode === 'components' }"
          @click="mode = 'components'"
        >
          Composants
        </button>
        <button type="button" :class="{ active: mode === 'schematic' }" @click="mode = 'schematic'">
          Montage
        </button>
      </nav>
    </header>
    <main class="workspace">
      <LibraryPanel :mode="mode === 'components' ? 'edit' : 'place'" />
      <ComponentEditor v-if="mode === 'components'" />
      <SchematicEditor v-else />
    </main>
  </div>
</template>
