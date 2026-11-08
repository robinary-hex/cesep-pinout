<script setup lang="ts">
import { onMounted, ref } from 'vue'
import ComponentEditor from '@/features/component-editor/ComponentEditor.vue'
import LibraryPanel from '@/features/library/LibraryPanel.vue'
import { useLibraryStore } from '@/features/library/store'

// Coque applicative : bascule entre les deux modes. Le montage arrive en phase 2.

type Mode = 'components' | 'schematic'

const library = useLibraryStore()
const mode = ref<Mode>('components')

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
        <button type="button" disabled title="Phase 2 : à venir">Montage</button>
      </nav>
    </header>
    <main v-if="mode === 'components'" class="workspace">
      <LibraryPanel />
      <ComponentEditor />
    </main>
  </div>
</template>
