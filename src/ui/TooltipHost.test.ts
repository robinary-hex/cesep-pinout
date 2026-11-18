// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref, type Ref } from 'vue'
import TooltipHost from './TooltipHost.vue'

/** Le pointeur arrive sur un élément. */
function over(element: Element, init: MouseEventInit = {}): void {
  element.dispatchEvent(new MouseEvent('pointerover', { bubbles: true, ...init }))
}

/** Laisse passer le temps, puis le rendu de l'infobulle et l'écoute des changements. */
async function after(ms: number): Promise<void> {
  vi.advanceTimersByTime(ms)
  for (let turn = 0; turn < 4; turn++) await nextTick()
}

function tip(): HTMLElement | null {
  return document.querySelector('.tooltip')
}

interface Page {
  wrapper: VueWrapper
  /** Infobulle du bouton « Fil nu » ; null : il n'en a pas. */
  wire: Ref<string | null>
}

/** Une barre d'outils (qui a son infobulle), deux boutons, un trait de dessin, et l'hôte. */
function page(): Page {
  const wire = ref<string | null>('Fil nu (N)')
  const wrapper = mount(
    defineComponent({
      setup() {
        return () =>
          h('div', { class: 'page' }, [
            h('div', { class: 'bar', title: 'Outils' }, [
              h('button', { class: 'wire', title: wire.value ?? undefined }, 'fil'),
              h('button', { class: 'copy', title: 'Arrêter la copie (S / Échap)' }, 'copie')
            ]),
            h('svg', [h('g', { class: 'cut', 'data-tip': 'Déplacer le motif' })]),
            h('p', { class: 'plain' }, 'rien à dire'),
            h(TooltipHost)
          ])
      }
    }),
    { attachTo: document.body }
  )
  return { wrapper, wire }
}

describe('infobulles de l’application', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('se montre après un temps de survol : le texte, puis le raccourci en capuchons', async () => {
    const { wrapper } = page()
    const button = wrapper.get('.wire').element
    over(button)
    await after(200)
    expect(tip()).toBeNull()
    await after(300)
    expect(tip()?.querySelector('.tip-text')?.textContent).toBe('Fil nu')
    expect([...(tip()?.querySelectorAll('kbd') ?? [])].map((key) => key.textContent)).toEqual(['N'])
    expect(tip()?.classList.contains('placed')).toBe(true)
    expect(tip()?.getAttribute('role')).toBe('tooltip')
    // Deux façons de faire : deux combinaisons, « ou » entre elles.
    over(wrapper.get('.copy').element)
    await after(0)
    expect(tip()?.querySelector('.tip-text')?.textContent).toBe('Arrêter la copie')
    expect(tip()?.querySelectorAll('.combo')).toHaveLength(2)
    expect(tip()?.querySelector('.or')?.textContent).toBe('ou')
    wrapper.unmount()
  })

  it('met de côté le `title` survolé et celui de ses parents, puis les rend', async () => {
    const { wrapper } = page()
    const button = wrapper.get('.wire').element
    const bar = wrapper.get('.bar').element
    over(button)
    // Tant qu'on survole : plus de `title`, donc pas d'infobulle de Windows par-dessus.
    expect(button.hasAttribute('title')).toBe(false)
    expect(bar.hasAttribute('title')).toBe(false)
    await after(500)
    expect(tip()?.textContent).toContain('Fil nu')
    // Sorti sur un élément qui n'a rien à dire : l'infobulle s'efface, tout revient.
    over(wrapper.get('.plain').element)
    await after(0)
    expect(tip()).toBeNull()
    expect(button.getAttribute('title')).toBe('Fil nu (N)')
    expect(bar.getAttribute('title')).toBe('Outils')
    expect(button.hasAttribute('data-tip')).toBe(false)
    expect(bar.hasAttribute('data-tip')).toBe(false)
    wrapper.unmount()
  })

  it('la suivante vient aussitôt ; un clic la fait taire sur cet élément', async () => {
    const { wrapper } = page()
    const wire = wrapper.get('.wire').element
    const copy = wrapper.get('.copy').element
    over(wire)
    await after(500)
    expect(tip()?.textContent).toContain('Fil nu')
    // D'un bouton à son voisin : pas de nouvelle attente.
    over(copy)
    await after(0)
    expect(tip()?.textContent).toContain('Arrêter la copie')
    // Un clic : elle s'efface, et ne revient pas tant qu'on reste là.
    copy.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await after(0)
    expect(tip()).toBeNull()
    over(copy)
    await after(1000)
    expect(tip()).toBeNull()
    expect(copy.hasAttribute('title')).toBe(false)
    // Sur un autre élément, elle revient, après son temps de survol.
    over(wire)
    await after(200)
    expect(tip()).toBeNull()
    await after(300)
    expect(tip()?.textContent).toContain('Fil nu')
    // Une touche la fait taire aussi.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }))
    await after(0)
    expect(tip()).toBeNull()
    wrapper.unmount()
  })

  it('ne se montre pas pendant un geste, bouton enfoncé', async () => {
    const { wrapper } = page()
    const button = wrapper.get('.wire').element
    over(button, { buttons: 1 })
    await after(1000)
    expect(tip()).toBeNull()
    expect(button.getAttribute('title')).toBe('Fil nu (N)')
    wrapper.unmount()
  })

  it('suit un `title` que l’application change ou retire pendant le survol', async () => {
    const { wrapper, wire } = page()
    const button = wrapper.get('.wire').element
    over(button)
    await after(500)
    expect(tip()?.textContent).toContain('Fil nu')
    // Le bouton dit autre chose : l'infobulle aussi, et Windows n'a toujours rien à montrer.
    wire.value = 'Arrêter le fil (Échap)'
    await after(0)
    expect(tip()?.querySelector('.tip-text')?.textContent).toBe('Arrêter le fil')
    expect([...(tip()?.querySelectorAll('kbd') ?? [])].map((key) => key.textContent)).toEqual([
      'Échap'
    ])
    expect(button.hasAttribute('title')).toBe(false)
    // Le bouton n'a plus d'infobulle : elle s'efface, et ne revient pas en sortant.
    wire.value = null
    await after(0)
    expect(tip()).toBeNull()
    over(wrapper.get('.plain').element)
    await after(0)
    expect(button.hasAttribute('title')).toBe(false)
    expect(button.hasAttribute('data-tip')).toBe(false)
    wrapper.unmount()
  })

  it('lit `data-tip` sur un élément de dessin, et rend tout en se démontant', async () => {
    const { wrapper } = page()
    const cut = wrapper.get('.cut').element
    over(cut)
    await after(500)
    expect(tip()?.textContent).toBe('Déplacer le motif')
    // Ce `data-tip` est écrit par l'application : il reste.
    over(wrapper.get('.plain').element)
    await after(0)
    expect(cut.getAttribute('data-tip')).toBe('Déplacer le motif')
    // Démonté pendant un survol, l'hôte rend son `title` à l'élément.
    const button = wrapper.get('.wire').element
    over(button)
    expect(button.hasAttribute('title')).toBe(false)
    wrapper.unmount()
    expect(button.getAttribute('title')).toBe('Fil nu (N)')
    expect(button.hasAttribute('data-tip')).toBe(false)
  })
})
