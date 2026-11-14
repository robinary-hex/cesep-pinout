// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ContextMenu from './ContextMenu.vue'
import { heading, item, SEPARATOR, submenu, type MenuItem } from './contextMenu'
import { menuEntry, menuLabels, subMenuLabels } from './testing/menus'

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

function build(): { items: MenuItem[]; calls: string[] } {
  const calls: string[] = []
  const items: MenuItem[] = [
    heading('Fil'),
    item('Copier', () => calls.push('copier')),
    submenu('Ordre', [
      item('Avancer', () => calls.push('avancer')),
      item('Reculer', () => calls.push('reculer'))
    ]),
    SEPARATOR,
    item('Supprimer', () => calls.push('supprimer'), { danger: true })
  ]
  return { items, calls }
}

describe('menu contextuel', () => {
  it('lance l’action d’une entrée et se ferme', async () => {
    const { items, calls } = build()
    const wrapper = mount(ContextMenu, { props: { x: 10, y: 10, items }, attachTo: document.body })
    await flushPromises()
    expect(menuLabels()).toEqual(['Copier', 'Ordre', 'Supprimer'])
    menuEntry('Copier').click()
    expect(calls).toEqual(['copier'])
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('ouvre un sous-menu à côté de son entrée, et y lance une action', async () => {
    const { items, calls } = build()
    const wrapper = mount(ContextMenu, { props: { x: 10, y: 10, items }, attachTo: document.body })
    await flushPromises()
    expect(document.body.querySelector('.sub-menu')).toBeNull()
    menuEntry('Ordre').click()
    await flushPromises()
    expect(subMenuLabels()).toEqual(['Avancer', 'Reculer'])
    expect(menuEntry('Ordre').classList.contains('open')).toBe(true)
    // Ouvrir le sous-menu ne ferme pas le menu.
    expect(wrapper.emitted('close')).toBeUndefined()
    menuEntry('Reculer').click()
    expect(calls).toEqual(['reculer'])
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('referme le sous-menu quand on survole une autre entrée, après un instant', async () => {
    vi.useFakeTimers()
    const { items } = build()
    const wrapper = mount(ContextMenu, { props: { x: 10, y: 10, items }, attachTo: document.body })
    await flushPromises()
    menuEntry('Ordre').click()
    await flushPromises()
    menuEntry('Copier').dispatchEvent(new MouseEvent('pointerenter'))
    vi.advanceTimersByTime(60)
    await flushPromises()
    // Pas encore : on a le temps de rejoindre le sous-menu, ce qui le garde ouvert.
    expect(document.body.querySelector('.sub-menu')).not.toBeNull()
    document.body.querySelector('.sub-menu')?.dispatchEvent(new MouseEvent('pointerenter'))
    vi.advanceTimersByTime(500)
    await flushPromises()
    expect(document.body.querySelector('.sub-menu')).not.toBeNull()
    // Reparti sur une autre entrée, sans y revenir : il se referme.
    menuEntry('Supprimer').dispatchEvent(new MouseEvent('pointerenter'))
    vi.advanceTimersByTime(500)
    await flushPromises()
    expect(document.body.querySelector('.sub-menu')).toBeNull()
    wrapper.unmount()
  })

  it('se ferme sur Échap ou un clic ailleurs', async () => {
    const { items } = build()
    const wrapper = mount(ContextMenu, { props: { x: 10, y: 10, items }, attachTo: document.body })
    await flushPromises()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    expect(wrapper.emitted('close')).toHaveLength(2)
    wrapper.unmount()
  })

  it('une entrée à croix : la croix agit sans lancer l’entrée ni fermer le menu', async () => {
    const calls: string[] = []
    const items: MenuItem[] = [
      heading('Récents'),
      item('pompe.pinout', () => calls.push('ouvrir'), {
        remove: { title: 'Retirer de la liste', action: () => calls.push('retirer') }
      }),
      item('Quitter', () => calls.push('quitter'))
    ]
    const wrapper = mount(ContextMenu, { props: { x: 10, y: 10, items }, attachTo: document.body })
    await flushPromises()
    // La croix est un bouton à part, à côté de l'entrée : seules les entrées qui en veulent en ont.
    expect(menuLabels()).toEqual(['pompe.pinout', 'Quitter'])
    const crosses = [...document.body.querySelectorAll<HTMLButtonElement>('.context-menu .remove')]
    expect(crosses).toHaveLength(1)
    expect(crosses[0]?.title).toBe('Retirer de la liste')
    expect(crosses[0]?.getAttribute('aria-label')).toBe('Retirer de la liste : pompe.pinout')
    expect(crosses[0]?.parentElement).toBe(menuEntry('pompe.pinout').parentElement)
    crosses[0]?.click()
    expect(calls).toEqual(['retirer'])
    expect(wrapper.emitted('close')).toBeUndefined()
    // L'entrée elle-même garde son rôle.
    menuEntry('pompe.pinout').click()
    expect(calls).toEqual(['retirer', 'ouvrir'])
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })
})
