import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useInspectorPanel } from './inspector'

function panel(autoOpen = true): {
  selected: ReturnType<typeof ref<boolean>>
  auto: ReturnType<typeof ref<boolean>>
  inspector: ReturnType<typeof useInspectorPanel>
} {
  const selected = ref(false)
  const auto = ref(autoOpen)
  const inspector = useInspectorPanel({
    hasSelection: () => selected.value === true,
    autoOpen: () => auto.value === true
  })
  return { selected, auto, inspector }
}

describe('panneau de propriétés', () => {
  it('est replié au départ ; un clic sur un élément le montre, la désélection le referme', () => {
    const { selected, inspector } = panel()
    expect(inspector.open.value).toBe(false)
    selected.value = true
    inspector.reveal()
    expect(inspector.open.value).toBe(true)
    expect(inspector.floating.value).toBe(true)
    // Passer d'un élément à l'autre : la sélection se vide puis se remplit dans le même geste.
    selected.value = false
    selected.value = true
    inspector.reveal()
    expect(inspector.open.value).toBe(true)
    selected.value = false
    expect(inspector.open.value).toBe(false)
    // Une sélection sans clic (tout sélectionner, coller) ne le rouvre pas.
    selected.value = true
    expect(inspector.open.value).toBe(false)
  })

  it('ouvert à la main, il reste, ancré, sélection ou pas', () => {
    const { selected, inspector } = panel()
    inspector.open.value = true
    expect(inspector.floating.value).toBe(false)
    selected.value = true
    inspector.reveal()
    selected.value = false
    expect(inspector.open.value).toBe(true)
    expect(inspector.floating.value).toBe(false)
    // Le refermer le referme pour de bon, même montré par une sélection.
    inspector.open.value = false
    selected.value = true
    inspector.reveal()
    expect(inspector.floating.value).toBe(true)
    inspector.open.value = false
    expect(inspector.open.value).toBe(false)
  })

  it('ne se montre pas tout seul quand le paramètre est décoché, ni sans sélection', () => {
    const { selected, auto, inspector } = panel(false)
    selected.value = true
    inspector.reveal()
    expect(inspector.open.value).toBe(false)
    auto.value = true
    selected.value = false
    inspector.reveal()
    expect(inspector.open.value).toBe(false)
  })
})
