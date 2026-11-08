<script setup lang="ts">
import { ref } from 'vue'
import { FileFormatError, PROJECT_SCHEMA_VERSION, parseProject, serializeProject } from '@/domain'
import { bridge } from '@/io/bridge'

// Coque provisoire de la phase 0 : elle vérifie le critère de sortie dans la vraie application
// (ouvrir un projet, le valider, le réenregistrer à l'identique) à travers le pont IPC.

const status = ref('Aucun projet ouvert.')
const details = ref<string[]>([])

async function openProject(): Promise<void> {
  const path = await bridge().showOpenDialog({
    title: 'Ouvrir un projet Pinout',
    filters: [{ name: 'Projet Pinout', extensions: ['json'] }]
  })
  if (path === null) return

  try {
    const text = await bridge().readTextFile(path)
    const project = parseProject(text)
    const saved = serializeProject(project)
    const identical = serializeProject(parseProject(saved)) === saved
    status.value =
      `« ${project.name} » : ${project.components.length} composants, ${project.wires.length} fils ; ` +
      `réenregistrement ${identical ? 'identique' : 'DIFFÉRENT'}.`
    details.value = []
  } catch (error) {
    if (error instanceof FileFormatError) {
      status.value = error.message
      details.value = [...error.issues]
    } else {
      status.value = `Erreur : ${String(error)}`
      details.value = []
    }
  }
}
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <h1>Pinout</h1>
      <nav class="modes">
        <button type="button" disabled>Composants</button>
        <button type="button" disabled>Montage</button>
      </nav>
    </header>
    <main class="panel">
      <h2>Phase 0 · socle</h2>
      <p>Format de projet, version {{ PROJECT_SCHEMA_VERSION }}.</p>
      <button type="button" @click="openProject">Ouvrir un projet…</button>
      <p class="status">{{ status }}</p>
      <ul v-if="details.length > 0" class="issues">
        <li v-for="issue in details" :key="issue">{{ issue }}</li>
      </ul>
    </main>
  </div>
</template>
