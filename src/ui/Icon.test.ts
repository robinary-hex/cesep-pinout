// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import Icon from './Icon.vue'
import { ICONS, type IconName } from './icons'

describe('pictogrammes', () => {
  it('chaque nom dessine au moins un tracé SVG valide', () => {
    const allowed = /^[MmLlHhVvCcSsQqTtAaZz0-9 ,.-]+$/
    for (const name of Object.keys(ICONS) as IconName[]) {
      const wrapper = mount(Icon, { props: { name, size: 20 } })
      const paths = wrapper.findAll('path')
      expect(paths.length, name).toBeGreaterThan(0)
      for (const path of paths) expect(path.attributes('d'), name).toMatch(allowed)
      expect(wrapper.attributes('width')).toBe('20')
    }
  })
})
