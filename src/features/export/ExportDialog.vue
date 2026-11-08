<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { buildProjectSvg, EXPORT_SCALES, type ExportScale, type ExportSettings } from '@/domain'
import { useLibraryStore } from '@/features/library/store'
import { useSchematicStore } from '@/features/schematic-editor/store'
import { bridge } from '@/io/bridge'
import { chooseExportPath } from '@/io/exportFiles'
import ModalDialog from '@/ui/ModalDialog.vue'
import { blobToBase64, svgToPngBlob } from './svgToPng'

// Export du montage : options, aperçu, puis PNG, SVG ou presse-papiers.

const emit = defineEmits<{ close: [] }>()
const store = useSchematicStore()
const library = useLibraryStore()

type BackgroundChoice = 'white' | 'transparent' | 'custom'

const options = reactive<ExportSettings>({ ...library.exportDefaults })
const backgroundChoice = ref<BackgroundChoice>(
  options.background === 'white' || options.background === 'transparent'
    ? options.background
    : 'custom'
)
const customBackground = ref(options.background.startsWith('#') ? options.background : '#f6f7f9')

watch([backgroundChoice, customBackground], ([choice, custom]) => {
  options.background = choice === 'custom' ? custom : choice
})

const result = computed(() => buildProjectSvg(store.doc, { ...options }))
const previewUrl = ref<string | null>(null)
const busy = ref(false)
const message = ref('')
const failed = ref(false)

watch(
  result,
  (value) => {
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = value
      ? URL.createObjectURL(new Blob([value.svg], { type: 'image/svg+xml;charset=utf-8' }))
      : null
  },
  { immediate: true }
)

onUnmounted(() => {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
})

function report(text: string, error = false): void {
  message.value = text
  failed.value = error
}

async function remember(): Promise<void> {
  await library.updateSettings({ export: { ...options } })
}

async function run(action: () => Promise<string | null>): Promise<void> {
  busy.value = true
  try {
    const done = await action()
    if (done !== null) {
      report(done)
      await remember()
    }
  } catch (error) {
    report(error instanceof Error ? error.message : String(error), true)
  } finally {
    busy.value = false
  }
}

function savePng(): void {
  void run(async () => {
    const current = result.value
    if (!current) return null
    const path = await chooseExportPath('png', store.doc.name, store.filePath)
    if (path === null) return null
    const blob = await svgToPngBlob(current.svg, current.widthPx, current.heightPx)
    await bridge().writeBinaryFile(path, await blobToBase64(blob))
    return `PNG enregistré : ${path}`
  })
}

function saveSvg(): void {
  void run(async () => {
    const current = result.value
    if (!current) return null
    const path = await chooseExportPath('svg', store.doc.name, store.filePath)
    if (path === null) return null
    await bridge().writeTextFile(path, current.svg)
    return `SVG enregistré : ${path}`
  })
}

function copyPng(): void {
  void run(async () => {
    const current = result.value
    if (!current) return null
    const blob = await svgToPngBlob(current.svg, current.widthPx, current.heightPx)
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    return 'Image copiée dans le presse-papiers.'
  })
}

function setScale(scale: ExportScale): void {
  options.scale = scale
}

function setMargin(event: Event): void {
  options.marginCells = Math.max(0, Math.round(Number((event.target as HTMLInputElement).value)))
}
</script>

<template>
  <ModalDialog title="Exporter le montage" wide @close="emit('close')">
    <div class="layout">
      <form class="options" @submit.prevent>
        <fieldset>
          <legend>Échelle</legend>
          <label v-for="scale in EXPORT_SCALES" :key="scale" class="radio">
            <input
              type="radio"
              name="scale"
              :checked="options.scale === scale"
              @change="setScale(scale)"
            />
            {{ scale }}× ({{ store.doc.profile.cellPx * scale }} px par cellule)
          </label>
        </fieldset>

        <fieldset>
          <legend>Fond</legend>
          <label class="radio">
            <input v-model="backgroundChoice" type="radio" value="white" /> Blanc
          </label>
          <label class="radio">
            <input v-model="backgroundChoice" type="radio" value="transparent" /> Transparent
          </label>
          <label class="radio">
            <input v-model="backgroundChoice" type="radio" value="custom" /> Couleur
            <input
              v-model="customBackground"
              type="color"
              :disabled="backgroundChoice !== 'custom'"
            />
          </label>
        </fieldset>

        <label class="field">
          <span>Marge autour du contenu (cellules)</span>
          <input type="number" min="0" step="1" :value="options.marginCells" @change="setMargin" />
        </label>
        <label class="check">
          <input v-model="options.grid" type="checkbox" />
          <span>Dessiner la grille</span>
        </label>
        <label class="check">
          <input v-model="options.labels" type="checkbox" />
          <span>Repères des composants (R1, U2…)</span>
        </label>

        <p v-if="result" class="hint">
          Image de {{ result.widthPx }} × {{ result.heightPx }} px ({{ result.widthCells }} ×
          {{ result.heightCells }} cellules).
        </p>
        <p v-else class="hint">Le montage est vide : rien à exporter.</p>
      </form>

      <div class="preview" :class="{ transparent: options.background === 'transparent' }">
        <img v-if="previewUrl" :src="previewUrl" alt="Aperçu de l’export" />
      </div>
    </div>

    <p v-if="message" class="message" :class="{ failed }">{{ message }}</p>

    <template #footer>
      <button type="button" :disabled="!result || busy" @click="copyPng">Copier l’image</button>
      <button type="button" :disabled="!result || busy" @click="saveSvg">
        Enregistrer en SVG…
      </button>
      <button type="button" class="primary" :disabled="!result || busy" @click="savePng">
        Enregistrer en PNG…
      </button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: 16px;
}

.options {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

fieldset {
  margin: 0;
  padding: 6px 10px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
}

legend {
  padding: 0 4px;
  font-size: 12px;
  color: var(--text-muted);
}

.radio,
.check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  padding: 2px 0;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 12px;
  color: var(--text-muted);
}

.field input {
  font: inherit;
  padding: 4px 6px;
  border: 1px solid var(--border);
  border-radius: 4px;
}

.hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-muted);
}

.preview {
  min-height: 320px;
  max-height: 60vh;
  display: grid;
  place-items: center;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
}

.preview.transparent {
  background-image:
    linear-gradient(45deg, var(--checker-b) 25%, transparent 25%),
    linear-gradient(-45deg, var(--checker-b) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--checker-b) 75%),
    linear-gradient(-45deg, transparent 75%, var(--checker-b) 75%);
  background-color: var(--checker-a);
  background-size: 12px 12px;
  background-position:
    0 0,
    0 8px,
    8px -8px,
    -8px 0;
}

.preview img {
  max-width: 100%;
  max-height: 58vh;
  object-fit: contain;
}

.message {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--success);
}

.message.failed {
  color: var(--danger);
}
</style>
