<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { EXPORT_SCALES, type ExportScale, type ExportSettings, type SvgExport } from '@/domain'
import { useLibraryStore } from '@/features/library/store'
import { bridge } from '@/io/bridge'
import { chooseExportPath } from '@/io/exportFiles'
import ModalDialog from '@/ui/ModalDialog.vue'
import { blobToBase64, svgToPngBlob } from './svgToPng'

// Export d'un montage ou d'un diagramme : options, aperçu, puis PNG, SVG ou presse-papiers.
// L'éditeur qui l'ouvre dit ce qu'on exporte et fournit de quoi construire le SVG.

const props = defineProps<{
  /** Ce qu'on exporte, dans les textes : « montage », « diagramme ». */
  what: string
  name: string
  filePath: string | null
  /** Pixels par cellule à 1×. */
  cellPx: number
  /** Propose la case des libellés de composants (montage seulement). */
  withLabels?: boolean
  build: (options: ExportSettings) => SvgExport | null
}>()
const emit = defineEmits<{ close: [] }>()
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

const result = computed(() => props.build({ ...options }))
const previewUrl = ref<string | null>(null)

/**
 * Fond transparent : un point à chaque intersection de la grille, derrière le dessin. Une tuile de
 * fond par cellule, en pourcentage de l'image, pour que les points suivent sa taille à l'écran ;
 * le décalage amène le premier point sur la première intersection quand le cadre ne commence pas
 * sur une cellule entière.
 */
const transparencyDots = computed(() => {
  const value = result.value
  if (!value || options.background !== 'transparent') return undefined
  const offset = (origin: number, cells: number): string => {
    const first = ((-origin % 1) + 1) % 1
    return cells > 1 ? `${(first / (cells - 1)) * 100}%` : '0%'
  }
  return {
    backgroundSize: `${100 / value.widthCells}% ${100 / value.heightCells}%`,
    backgroundPosition: `${offset(value.originX, value.widthCells)} ${offset(value.originY, value.heightCells)}`
  }
})
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
    const path = await chooseExportPath('png', props.name, props.filePath)
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
    const path = await chooseExportPath('svg', props.name, props.filePath)
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
  <ModalDialog :title="`Exporter le ${what}`" wide @close="emit('close')">
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
            {{ scale }}× ({{ cellPx * scale }} px par cellule)
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
        <label v-if="withLabels" class="check">
          <input v-model="options.labels" type="checkbox" />
          <span>Libellés des composants (R1, U2…)</span>
        </label>

        <p v-if="result" class="hint">
          Image de {{ result.widthPx }} × {{ result.heightPx }} px ({{ result.widthCells }} ×
          {{ result.heightCells }} cellules).
        </p>
        <p v-else class="hint">Le {{ what }} est vide : rien à exporter.</p>
      </form>

      <div class="preview" :class="{ transparent: options.background === 'transparent' }">
        <img
          v-if="previewUrl"
          :src="previewUrl"
          :style="transparencyDots"
          alt="Aperçu de l’export"
        />
      </div>
    </div>

    <!-- Zone réservée : la boîte ne bouge pas quand le message apparaît. -->
    <p class="message" :class="{ failed }">{{ message }}</p>

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

/* Entourage gris ; la zone exportée est cernée d'un pointillé bleu, à la taille de l'image. */
.preview {
  min-height: 320px;
  max-height: 60vh;
  display: grid;
  place-items: center;
  overflow: auto;
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--preview-bg);
}

.preview img {
  display: block;
  max-width: 100%;
  max-height: calc(58vh - 40px);
  object-fit: contain;
  outline: 2px dashed var(--accent);
  outline-offset: 4px;
}

/* Fond transparent : un point à chaque intersection de la grille, sous le dessin seulement. Chaque
   tuile (une cellule, taille donnée en ligne) porte un quart de point à ses quatre coins. */
.preview.transparent img {
  background-color: var(--transparent-bg);
  background-image:
    radial-gradient(circle at 0 0, var(--transparent-dot) 1.3px, transparent 1.9px),
    radial-gradient(circle at 100% 0, var(--transparent-dot) 1.3px, transparent 1.9px),
    radial-gradient(circle at 0 100%, var(--transparent-dot) 1.3px, transparent 1.9px),
    radial-gradient(circle at 100% 100%, var(--transparent-dot) 1.3px, transparent 1.9px);
}

.message {
  margin: 10px 0 0;
  min-height: 1.5em;
  font-size: 12px;
  color: var(--success);
}

.message.failed {
  color: var(--danger);
}
</style>
