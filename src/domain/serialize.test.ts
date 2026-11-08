import { describe, expect, it } from 'vitest'
import drawingText from './fixtures/v1/component-drawing.json?raw'
import pngText from './fixtures/v1/component-png.json?raw'
import projectText from './fixtures/v1/project.json?raw'
import {
  absolutePinPosition,
  componentIssues,
  FileFormatError,
  parseComponentDefinition,
  parseProject,
  serializeComponentDefinition,
  serializeProject
} from './index'

interface RawProject {
  schemaVersion: number
  components: { id: string; defId: string }[]
  wires: { points: number[][] }[]
}

interface RawComponent {
  pins: { x: number; y: number }[]
}

function mutateProject(change: (raw: RawProject) => void): string {
  const raw = JSON.parse(projectText) as RawProject
  change(raw)
  return JSON.stringify(raw)
}

function mutateComponent(text: string, change: (raw: RawComponent) => void): string {
  const raw = JSON.parse(text) as RawComponent
  change(raw)
  return JSON.stringify(raw)
}

function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`${what} manquant dans le fixture`)
  return value
}

function issuesOf(action: () => unknown): string {
  try {
    action()
  } catch (error) {
    if (error instanceof FileFormatError) return [error.message, ...error.issues].join('\n')
    throw error
  }
  throw new Error('Aucune erreur levée')
}

describe('projet : charger, valider, réenregistrer', () => {
  it('charge le projet d’exemple', () => {
    const project = parseProject(projectText)
    expect(project.name).toBe('Exemple de montage')
    expect(project.components).toHaveLength(2)
    expect(project.wires).toHaveLength(3)
    expect(Object.keys(project.embeddedDefs).sort()).toEqual(['arduino-nano', 'resistor'])
  })

  it('se réenregistre à l’identique', () => {
    const project = parseProject(projectText)
    const saved = serializeProject(project)
    expect(parseProject(saved)).toEqual(project)
    expect(serializeProject(parseProject(saved))).toBe(saved)
    expect(saved.endsWith('}\n')).toBe(true)
  })

  it('place la broche GND du Nano là où le premier fil démarre', () => {
    const project = parseProject(projectText)
    const u1 = must(
      project.components.find((instance) => instance.id === 'u1'),
      'composant u1'
    )
    const def = must(project.embeddedDefs[u1.defId], 'définition du Nano')
    const gnd = must(
      def.pins.find((pin) => pin.id === 'gnd'),
      'broche GND'
    )
    expect(absolutePinPosition(u1, def, gnd)).toEqual({ x: 8, y: 3 })
  })

  it('refuse un JSON malformé', () => {
    expect(() => parseProject('{ "schemaVersion": ')).toThrow(FileFormatError)
    expect(issuesOf(() => parseProject('[]'))).toMatch(/objet JSON/)
  })

  it('refuse un fichier plus récent que l’application', () => {
    const text = mutateProject((raw) => {
      raw.schemaVersion = 99
    })
    expect(issuesOf(() => parseProject(text))).toMatch(/plus récente/)
  })

  it('refuse un fil qui n’est pas orthogonal, avec le détail', () => {
    const text = mutateProject((raw) => {
      must(raw.wires[0], 'fil w1').points = [
        [8, 3],
        [12, 5]
      ]
    })
    expect(issuesOf(() => parseProject(text))).toMatch(
      /wires\.0\.points : .*ni horizontal ni vertical/
    )
  })

  it('refuse deux segments alignés', () => {
    const text = mutateProject((raw) => {
      must(raw.wires[0], 'fil w1').points = [
        [8, 3],
        [10, 3],
        [12, 3]
      ]
    })
    expect(issuesOf(() => parseProject(text))).toMatch(/alignés/)
  })

  it('refuse une instance sans définition embarquée', () => {
    const text = mutateProject((raw) => {
      must(raw.components[0], 'composant u1').defId = 'inconnu'
    })
    expect(issuesOf(() => parseProject(text))).toMatch(/absente de embeddedDefs/)
  })
})

describe('composants', () => {
  it('charge un composant dessiné et un composant PNG, sans avertissement', () => {
    const resistor = parseComponentDefinition(drawingText)
    expect(resistor.visual.kind).toBe('drawing')
    expect(resistor.pins.map((pin) => [pin.x, pin.y])).toEqual([
      [0, 1],
      [4, 1]
    ])
    expect(componentIssues(resistor)).toEqual([])

    const nano = parseComponentDefinition(pngText)
    expect(nano.visual.kind === 'png' && nano.visual.pxPerCell).toBe(80)
    expect(componentIssues(nano)).toEqual([])
  })

  it('se réenregistre à l’identique', () => {
    for (const text of [drawingText, pngText]) {
      const def = parseComponentDefinition(text)
      const saved = serializeComponentDefinition(def)
      expect(parseComponentDefinition(saved)).toEqual(def)
      expect(serializeComponentDefinition(parseComponentDefinition(saved))).toBe(saved)
    }
  })

  it('refuse une broche à l’intérieur du composant', () => {
    const text = mutateComponent(drawingText, (raw) => {
      must(raw.pins[0], 'broche a').x = 2
    })
    expect(issuesOf(() => parseComponentDefinition(text))).toMatch(/sur le bord/)
  })

  it('refuse deux broches sur la même intersection', () => {
    const text = mutateComponent(drawingText, (raw) => {
      must(raw.pins[1], 'broche b').x = 0
    })
    expect(issuesOf(() => parseComponentDefinition(text))).toMatch(/même intersection/)
  })

  it('avertit sans bloquer quand il n’y a aucune broche', () => {
    const def = parseComponentDefinition(
      mutateComponent(drawingText, (raw) => {
        raw.pins = []
      })
    )
    expect(componentIssues(def).map((issue) => issue.level)).toEqual(['warning'])
  })
})
