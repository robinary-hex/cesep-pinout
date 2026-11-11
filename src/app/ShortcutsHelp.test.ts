// @vitest-environment jsdom
import { mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ShortcutsHelp from './ShortcutsHelp.vue'

/** Ligne de l'aide portant ce libellé. */
function rowOf(wrapper: VueWrapper, label: string): DOMWrapper<Element> {
  const found = wrapper
    .findAll('.sheet.shown .row')
    .find((row) => row.get('.label').text() === label)
  if (!found) throw new Error(`ligne « ${label} » introuvable`)
  return found
}

describe('aide sur les raccourcis', () => {
  it('s’ouvre sur le mode demandé ; ses onglets mènent aux autres', async () => {
    const wrapper = mount(ShortcutsHelp, { props: { initial: 'Montage' } })
    expect(wrapper.findAll('.tabs button').map((tab) => tab.text())).toEqual([
      'Composants',
      'Montage',
      'Diagramme'
    ])
    expect(wrapper.get('.tabs button.active').text()).toBe('Montage')
    expect(wrapper.findAll('.sheet.shown .category h3').map((title) => title.text())).toEqual([
      'Outils',
      'Tracer un fil',
      'Retoucher un fil',
      'Composants et étiquettes',
      'Ordre',
      'Sélectionner',
      'Modifier',
      'Vue',
      'Fichiers et onglets'
    ])
    await wrapper.findAll('.tabs button')[0]?.trigger('click')
    expect(wrapper.get('.tabs button.active').text()).toBe('Composants')
    expect(
      rowOf(wrapper, 'Rectangle')
        .findAll('kbd')
        .map((key) => key.text())
    ).toEqual(['R'])
    wrapper.unmount()
  })

  it('garde les trois planches en place, une seule visible : la boîte ne change pas de taille', async () => {
    const wrapper = mount(ShortcutsHelp, { props: { initial: 'Diagramme' } })
    const shown = (): boolean[] =>
      wrapper.findAll('.sheets > .sheet').map((sheet) => sheet.classes().includes('shown'))
    expect(shown()).toEqual([false, false, true])
    expect(wrapper.findAll('.sheet').map((sheet) => sheet.attributes('aria-hidden'))).toEqual([
      'true',
      'true',
      'false'
    ])
    await wrapper.findAll('.tabs button')[1]?.trigger('click')
    expect(shown()).toEqual([false, true, false])
    // Chaque planche a ses thèmes, qu'on la voie ou non.
    for (const sheet of wrapper.findAll('.sheet')) {
      expect(sheet.findAll('.category').length).toBeGreaterThan(5)
    }
    wrapper.unmount()
  })

  it('montre la première section quand on ne lui en demande aucune', () => {
    const wrapper = mount(ShortcutsHelp)
    expect(wrapper.get('.tabs button.active').text()).toBe('Composants')
    wrapper.unmount()
  })

  it('dessine une touche par capuchon et la souris en pictogramme', () => {
    const wrapper = mount(ShortcutsHelp, { props: { initial: 'Montage' } })
    // Deux touches, deux capuchons ; la variante avec Maj a le sien.
    const group = rowOf(wrapper, 'Grouper')
    expect(group.findAll('.keys kbd').map((key) => key.text())).toEqual(['Ctrl', 'G'])
    expect(group.get('.more').text()).toContain('dégrouper')
    expect(group.get('.more kbd').text()).toBe('Maj')
    // Un geste de souris : sa pastille, avec le dessin de la souris.
    const menu = rowOf(wrapper, 'Menu contextuel')
    expect(menu.get('.mouse').text()).toBe('clic droit')
    expect(menu.find('.mouse svg .pressed').exists()).toBe(true)
    expect(menu.findAll('.keys kbd')).toHaveLength(0)
    // Touche et souris ensemble.
    const pull = rowOf(wrapper, 'Tirer un fil d’une broche')
    expect(pull.findAll('.keys kbd').map((key) => key.text())).toEqual(['Ctrl'])
    expect(pull.get('.mouse').text()).toBe('glisser')
    // Deux façons de faire la même chose, séparées par « ou » ; un double-clic se dit « ×2 ».
    const fit = rowOf(wrapper, 'Ajuster la vue')
    expect(fit.findAll('.combo')).toHaveLength(2)
    expect(fit.text()).toContain('ou')
    expect(fit.get('.mouse').text()).toBe('milieu ×2')
    expect(rowOf(wrapper, 'Terminer le fil').get('.mouse').text()).toBe('clic ×2')
    // L'ordre des composants a sa ligne.
    expect(
      rowOf(wrapper, 'Avancer')
        .findAll('.keys kbd')
        .map((key) => key.text())
    ).toEqual(['Ctrl', 'Page haut'])
    // Une ligne par raccourci : le geste, son libellé, et rien dessous.
    for (const row of wrapper.findAll('.sheet.shown .row')) {
      expect(row.findAll('.keys')).toHaveLength(1)
      expect(row.findAll('.label')).toHaveLength(1)
    }
    expect(wrapper.find('.where').exists()).toBe(false)
    expect(wrapper.find('.hint').exists()).toBe(false)
    wrapper.unmount()
  })
})
