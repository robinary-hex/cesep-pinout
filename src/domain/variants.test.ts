import { describe, expect, it } from 'vitest'
import {
  BASE_VARIANT,
  componentImages,
  componentIssues,
  componentPrimitives,
  componentVariants,
  createEmptyComponent,
  DEFAULT_SHAPE_STYLE,
  hasVariants,
  mapComponentPrimitives,
  movedVariantOrder,
  nextVariantId,
  nextVariantName,
  previewDefinition,
  sameComponentContent,
  variantDefinition,
  withPreviewVariant,
  type ComponentDefinition,
  type Primitive
} from './component'
import { projectPins } from './connectivity'
import { DEFAULT_PROFILE } from './profile'
import { createEmptyProject, instanceDefinition } from './project'
import { parseComponentDefinition, serializeComponentDefinition } from './serialize'
import { buildProjectSvg } from './svg'
import { DEFAULT_EXPORT } from './settings'

const body = {
  kind: 'rect' as const,
  x: 4,
  y: 2,
  w: 8,
  h: 4,
  rx: 0,
  style: DEFAULT_SHAPE_STYLE
}

/** Une LED à pattes courtes (4 × 2) et sa variante à pattes longues (6 × 2), mêmes broches. */
function led(): ComponentDefinition {
  const def = createEmptyComponent('led', 'LED')
  def.visual = { kind: 'drawing', primitives: [body] }
  def.pins = [
    { id: 'a', name: 'A', kind: 'io', x: 0, y: 1 },
    { id: 'k', name: 'K', kind: 'io', x: 4, y: 1 }
  ]
  def.variantName = 'Pattes courtes'
  def.variants = [
    {
      id: 'v1',
      name: 'Pattes longues',
      size: { widthCells: 6, heightCells: 2 },
      visual: { kind: 'drawing', primitives: [{ ...body, x: 8 }] },
      pins: [
        { id: 'a', name: 'A', kind: 'io', x: 0, y: 1 },
        { id: 'k', name: 'K', kind: 'io', x: 6, y: 1 }
      ]
    }
  ]
  return def
}

describe('variantes d’un composant', () => {
  it('liste la première variante, celle que le composant porte, puis les autres', () => {
    const plain = createEmptyComponent('r', 'Résistance')
    expect(componentVariants(plain)).toEqual([{ id: BASE_VARIANT, name: 'Standard' }])
    expect(hasVariants(plain)).toBe(false)
    expect(componentVariants(led())).toEqual([
      { id: BASE_VARIANT, name: 'Pattes courtes' },
      { id: 'v1', name: 'Pattes longues' }
    ])
    expect(hasVariants(led())).toBe(true)
    expect(nextVariantId(led())).toBe('v2')
    expect(nextVariantName(led())).toBe('Variante 3')
    expect(nextVariantName(plain)).toBe('Variante 2')
  })

  it('donne le composant tel que le dessine une variante, toujours le même objet', () => {
    const def = led()
    expect(variantDefinition(def, null)).toBe(def)
    expect(variantDefinition(def, BASE_VARIANT)).toBe(def)
    expect(variantDefinition(def, 'disparue')).toBe(def)
    const long = variantDefinition(def, 'v1')
    expect(long).toMatchObject({ id: 'led', name: 'LED', size: { widthCells: 6 } })
    expect(long.pins[1]).toMatchObject({ id: 'k', x: 6 })
    expect(variantDefinition(def, 'v1')).toBe(long)
  })

  it('s’enregistre et se relit avec ses variantes ; chacune est contrôlée', () => {
    const def = led()
    expect(parseComponentDefinition(serializeComponentDefinition(def))).toEqual(def)
    expect(componentIssues(def)).toEqual([])
    // Une broche hors de la boîte de la seconde variante : le message dit laquelle.
    const broken = led()
    const pin = broken.variants?.[0]?.pins[1]
    if (pin) pin.x = 9
    const issues = componentIssues(broken)
    expect(issues).toHaveLength(1)
    expect(issues[0]?.level).toBe('error')
    expect(issues[0]?.message).toMatch(/^Variante « Pattes longues » : Broche K/)
    expect(() => parseComponentDefinition(serializeComponentDefinition(broken))).toThrow()
  })

  it('parcourt les formes et les images de toutes les variantes', () => {
    const def = led()
    const image: Primitive = { kind: 'image', x: 0, y: 0, w: 4, h: 4, file: 'image.png' }
    def.variants?.[0]?.visual.primitives.push(image)
    expect(componentPrimitives(def)).toHaveLength(3)
    expect(componentImages(def)).toEqual([image])
    const moved = mapComponentPrimitives(def, (primitive) =>
      primitive.kind === 'image' ? { ...primitive, file: 'autre.png' } : primitive
    )
    expect(componentImages(moved)[0]?.file).toBe('autre.png')
    expect(componentImages(def)[0]?.file).toBe('image.png')
  })

  it('dans un montage, un exemplaire se dessine et se relie dans sa variante', () => {
    const def = led()
    const project = createEmptyProject('Essai', DEFAULT_PROFILE)
    project.embeddedDefs[def.id] = def
    const placed = {
      defId: 'led',
      x: 10,
      y: 5,
      rotation: 0 as const,
      mirror: false,
      label: '',
      fields: {},
      behindWires: false
    }
    project.components.push({ id: 'c1', ...placed }, { id: 'c2', ...placed, y: 10, variant: 'v1' })
    const [first, second] = project.components
    if (!first || !second) throw new Error('exemplaires attendus')
    expect(instanceDefinition(project, first)).toBe(def)
    expect(instanceDefinition(project, second)?.size.widthCells).toBe(6)
    const pins = new Map(projectPins(project).map((pin) => [pin.key, pin.point]))
    expect(pins.get('c1:k')).toEqual([14, 6])
    expect(pins.get('c2:k')).toEqual([16, 11])
    // L'export dessine chaque exemplaire dans sa variante : le rectangle n'est pas au même endroit.
    const svg = buildProjectSvg(project, DEFAULT_EXPORT)?.svg ?? ''
    expect(svg).toContain('x="1" y="0.5"')
    expect(svg).toContain('x="2" y="0.5"')
  })
})

describe('ordre des variantes', () => {
  /** La LED et une troisième variante. */
  function three(): ComponentDefinition {
    const def = led()
    const first = def.variants?.[0]
    if (first) def.variants?.push({ ...first, id: 'v2', name: 'Verte' })
    return def
  }
  const ids = (def: ComponentDefinition): string[] =>
    componentVariants(def).map((variant) => variant.id)

  it('place la variante d’origine à son rang dans la liste, sans changer l’identité des autres', () => {
    const def = three()
    expect(ids(def)).toEqual(['base', 'v1', 'v2'])
    def.baseVariantRank = 1
    expect(ids(def)).toEqual(['v1', 'base', 'v2'])
    // Quel que soit l'ordre, chaque identifiant désigne toujours le même dessin.
    expect(variantDefinition(def, 'v1').size.widthCells).toBe(6)
    expect(variantDefinition(def, null)).toBe(def)
    expect(parseComponentDefinition(serializeComponentDefinition(def))).toEqual(def)
    // Un rang trop grand (une variante supprimée depuis) : à la fin.
    def.baseVariantRank = 9
    expect(ids(def)).toEqual(['v1', 'v2', 'base'])
  })

  it('calcule l’ordre après avoir glissé une variante devant une autre, ou à la fin', () => {
    const def = three()
    expect(movedVariantOrder(def, 'v2', 'base')).toEqual(['v2', 'base', 'v1'])
    expect(movedVariantOrder(def, 'base', null)).toEqual(['v1', 'v2', 'base'])
    expect(movedVariantOrder(def, 'base', 'v2')).toEqual(['v1', 'base', 'v2'])
    // Sur elle-même, ou une variante inconnue : rien ne bouge.
    expect(movedVariantOrder(def, 'v1', 'v1')).toEqual(['base', 'v1', 'v2'])
    expect(movedVariantOrder(def, 'disparue', null)).toEqual(['base', 'v1', 'v2'])
  })
})

describe('variante de l’aperçu', () => {
  it('se pose et se retire sans toucher au composant, et ne compte pas dans la comparaison', () => {
    const def = led()
    const withPreview = withPreviewVariant(def, 'v1')
    expect(withPreview.previewVariant).toBe('v1')
    expect(def.previewVariant).toBeUndefined()
    expect(previewDefinition(withPreview).size.widthCells).toBe(6)
    expect(previewDefinition(def)).toBe(def)
    // La variante d'origine, ou une variante inconnue : pas de propriété.
    expect('previewVariant' in withPreviewVariant(withPreview, 'base')).toBe(false)
    expect('previewVariant' in withPreviewVariant(withPreview, 'disparue')).toBe(false)
    expect(previewDefinition({ ...def, previewVariant: 'disparue' }).size.widthCells).toBe(4)
    // Même composant, à l'aperçu près ; un vrai changement se voit.
    expect(sameComponentContent(def, withPreview)).toBe(true)
    expect(sameComponentContent(def, { ...withPreview, name: 'DEL' })).toBe(false)
    expect(parseComponentDefinition(serializeComponentDefinition(withPreview))).toEqual(withPreview)
  })
})
