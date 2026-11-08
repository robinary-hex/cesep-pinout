<script setup lang="ts">
import { computed } from 'vue'
import { instanceBounds, ROTATIONS, type Rotation } from '@/domain'
import { useSchematicStore } from './store'

// Panneau de droite du montage : projet, puis composant(s) sélectionné(s).

const store = useSchematicStore()
const doc = computed(() => store.doc)

const single = computed(() => {
  if (store.selection.length !== 1) return null
  const id = store.selection[0]
  const instance = doc.value.components.find((candidate) => candidate.id === id)
  const def = instance ? doc.value.embeddedDefs[instance.defId] : undefined
  return instance && def ? { instance, def } : null
})

function inputValue(event: Event): string {
  return (event.target as HTMLInputElement).value
}

function numberValue(event: Event): number {
  return Math.round(Number((event.target as HTMLInputElement).value))
}

function setName(event: Event): void {
  const name = inputValue(event).trim()
  if (name.length > 0) store.setProjectName(name)
}

function setPosition(axis: 'x' | 'y', event: Event): void {
  const current = single.value
  if (!current) return
  const value = numberValue(event)
  store.setInstancePosition(
    current.instance.id,
    axis === 'x' ? value : current.instance.x,
    axis === 'y' ? value : current.instance.y
  )
}

function setRotation(event: Event): void {
  const current = single.value
  if (!current) return
  store.setInstanceOrientation(
    current.instance.id,
    Number(inputValue(event)) as Rotation,
    current.instance.mirror
  )
}

function setMirror(event: Event): void {
  const current = single.value
  if (!current) return
  store.setInstanceOrientation(
    current.instance.id,
    current.instance.rotation,
    (event.target as HTMLInputElement).checked
  )
}
</script>

<template>
  <aside class="inspector">
    <section class="block">
      <h3>Projet</h3>
      <label class="field">
        <span>Nom</span>
        <input type="text" :value="doc.name" @change="setName" />
      </label>
      <p class="hint">
        Profil « {{ doc.profile.name }} » : {{ doc.profile.cellPx }} px par cellule, fils de
        {{ doc.profile.wireWidth }} cellule, rayon {{ doc.profile.cornerRadius }}.
      </p>
      <p class="hint">{{ doc.components.length }} composant(s), {{ doc.wires.length }} fil(s).</p>
      <p v-if="store.filePath" class="hint">Fichier : {{ store.filePath }}</p>
    </section>

    <section v-if="single" class="block">
      <h3>{{ single.def.name }}</h3>
      <label class="field">
        <span>Repère</span>
        <input
          type="text"
          :value="single.instance.label"
          placeholder="R1, U2…"
          @change="store.setInstanceLabel(single.instance.id, inputValue($event).trim())"
        />
      </label>
      <div class="row">
        <label class="field">
          <span>X (cellules)</span>
          <input
            type="number"
            step="1"
            :value="single.instance.x"
            @change="setPosition('x', $event)"
          />
        </label>
        <label class="field">
          <span>Y (cellules)</span>
          <input
            type="number"
            step="1"
            :value="single.instance.y"
            @change="setPosition('y', $event)"
          />
        </label>
      </div>
      <div class="row">
        <label class="field">
          <span>Rotation</span>
          <select :value="single.instance.rotation" @change="setRotation">
            <option v-for="rotation in ROTATIONS" :key="rotation" :value="rotation">
              {{ rotation }}°
            </option>
          </select>
        </label>
        <label class="check">
          <input type="checkbox" :checked="single.instance.mirror" @change="setMirror" />
          <span>Miroir</span>
        </label>
      </div>
      <p class="hint">
        Boîte : {{ instanceBounds(single.instance, single.def).width }} ×
        {{ instanceBounds(single.instance, single.def).height }} cellules ·
        {{ single.def.pins.length }} broche(s) · définition « {{ single.def.id }} ».
      </p>
      <div class="row">
        <button type="button" @click="store.rotate('ccw')">⟲</button>
        <button type="button" @click="store.rotate('cw')">⟳</button>
        <button type="button" @click="store.flip('horizontal')">↔</button>
        <button type="button" @click="store.flip('vertical')">↕</button>
        <button type="button" class="danger" @click="store.removeSelection()">Supprimer</button>
      </div>
    </section>

    <section v-else-if="store.selection.length > 1" class="block">
      <h3>{{ store.selection.length }} composants sélectionnés</h3>
      <div class="row">
        <button type="button" @click="store.rotate('ccw')">⟲</button>
        <button type="button" @click="store.rotate('cw')">⟳</button>
        <button type="button" @click="store.flip('horizontal')">↔</button>
        <button type="button" @click="store.flip('vertical')">↕</button>
        <button type="button" @click="store.duplicateSelection()">Dupliquer</button>
        <button type="button" class="danger" @click="store.removeSelection()">Supprimer</button>
      </div>
    </section>

    <section v-else class="block">
      <h3>Sélection</h3>
      <p class="hint">
        Clique un composant de la bibliothèque pour le poser, puis clique sur le montage. Sur le
        montage : clic pour sélectionner, Maj+clic pour ajouter, glisser pour déplacer ou pour
        tracer un rectangle de sélection ; molette pour zoomer, Espace + glisser ou bouton du milieu
        pour se déplacer.
      </p>
    </section>
  </aside>
</template>

<style scoped>
.inspector {
  width: 300px;
  flex: none;
  overflow-y: auto;
  background: #ffffff;
  border-left: 1px solid #d0d7de;
}

.block {
  padding: 12px 14px;
  border-bottom: 1px solid #eaeef2;
}

.block h3 {
  margin: 0 0 8px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #57606a;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-bottom: 8px;
  font-size: 12px;
  color: #57606a;
}

.field input,
.field select {
  font: inherit;
  font-size: 13px;
  color: #1f2328;
  padding: 4px 6px;
  border: 1px solid #d0d7de;
  border-radius: 4px;
  background: #ffffff;
}

.row {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.row .field {
  flex: 1;
  min-width: 90px;
  margin-bottom: 0;
}

.check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #57606a;
  padding-bottom: 6px;
}

.hint {
  margin: 4px 0;
  font-size: 12px;
  color: #57606a;
  word-break: break-word;
}
</style>
