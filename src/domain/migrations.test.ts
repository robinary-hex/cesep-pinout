import { describe, expect, it } from 'vitest'
import componentV1 from './fixtures/v1/component-drawing.json?raw'
import projectV1 from './fixtures/v1/project.json?raw'
import settingsV1 from './fixtures/v1/settings.json?raw'
import componentV2 from './fixtures/v2/component-drawing.json?raw'
import projectV2 from './fixtures/v2/project.json?raw'
import componentV3 from './fixtures/v3/component-drawing.json?raw'
import projectV3 from './fixtures/v3/project.json?raw'
import componentV4 from './fixtures/v4/component-drawing.json?raw'
import projectV4 from './fixtures/v4/project.json?raw'
import projectV5 from './fixtures/v5/project.json?raw'
import componentV5 from './fixtures/v5/component-drawing.json?raw'
import projectV6 from './fixtures/v6/project.json?raw'
import projectV7 from './fixtures/v7/project.json?raw'
import projectV8 from './fixtures/v8/project.json?raw'
import componentV6 from './fixtures/v6/component-drawing.json?raw'
import componentV7 from './fixtures/v7/component-drawing.json?raw'
import componentV8 from './fixtures/v8/component-drawing.json?raw'
import componentV9 from './fixtures/v9/component-drawing.json?raw'
import componentV10 from './fixtures/v10/component-drawing.json?raw'
import componentV11 from './fixtures/v11/component-drawing.json?raw'
import componentV12 from './fixtures/v12/component-drawing.json?raw'
import componentV13 from './fixtures/v13/component-drawing.json?raw'
import projectV17 from './fixtures/v17/project.json?raw'
import projectV18 from './fixtures/v18/project.json?raw'
import projectV15 from './fixtures/v15/project.json?raw'
import projectV14 from './fixtures/v14/project.json?raw'
import projectV13 from './fixtures/v13/project.json?raw'
import projectV12 from './fixtures/v12/project.json?raw'
import projectV11 from './fixtures/v11/project.json?raw'
import projectV10 from './fixtures/v10/project.json?raw'
import settingsV6 from './fixtures/v6/settings.json?raw'
import settingsV7 from './fixtures/v7/settings.json?raw'
import settingsV8 from './fixtures/v8/settings.json?raw'
import projectV16 from './fixtures/v16/project.json?raw'
import projectV9 from './fixtures/v9/project.json?raw'
import settingsV5 from './fixtures/v5/settings.json?raw'
import settingsV4 from './fixtures/v4/settings.json?raw'
import settingsV3 from './fixtures/v3/settings.json?raw'
import {
  componentMigrations,
  FileFormatError,
  migrateRaw,
  projectMigrations,
  type MigrationTable
} from './migrations'
import { parseComponentDefinition, parseProject, parseSettings } from './serialize'

describe('migrations', () => {
  it('laisse passer un document à la version courante', () => {
    const raw = { schemaVersion: projectMigrations.current, name: 'x' }
    expect(migrateRaw(raw, projectMigrations, 'Projet')).toEqual(raw)
  })

  it('rejette ce qui n’est pas un objet versionné', () => {
    expect(() => migrateRaw(null, projectMigrations, 'Projet')).toThrow(FileFormatError)
    expect(() => migrateRaw([], projectMigrations, 'Projet')).toThrow(/objet JSON/)
    expect(() => migrateRaw({}, projectMigrations, 'Projet')).toThrow(/schemaVersion/)
    expect(() => migrateRaw({ schemaVersion: 0 }, projectMigrations, 'Projet')).toThrow(
      /schemaVersion/
    )
    expect(() => migrateRaw({ schemaVersion: 1.5 }, projectMigrations, 'Projet')).toThrow(
      /schemaVersion/
    )
  })

  it('rejette une version plus récente que l’application', () => {
    expect(() =>
      migrateRaw({ schemaVersion: projectMigrations.current + 1 }, projectMigrations, 'Projet')
    ).toThrow(/plus récente/)
  })

  it('enchaîne les étapes jusqu’à la version courante', () => {
    const table: MigrationTable = {
      current: 3,
      steps: {
        1: (raw) => ({ ...raw, b: 2 }),
        2: (raw) => ({ ...raw, c: 3 })
      }
    }
    expect(migrateRaw({ schemaVersion: 1, a: 1 }, table, 'Test')).toEqual({
      schemaVersion: 3,
      a: 1,
      b: 2,
      c: 3
    })
    expect(migrateRaw({ schemaVersion: 2, a: 1 }, table, 'Test')).toEqual({
      schemaVersion: 3,
      a: 1,
      c: 3
    })
  })

  it('signale une étape de migration manquante', () => {
    const table: MigrationTable = { current: 2, steps: {} }
    expect(() => migrateRaw({ schemaVersion: 1 }, table, 'Test')).toThrow(/aucune migration/)
  })
})

describe('composant v1 → v4', () => {
  it('convertit les épaisseurs en multiplicateurs, ajoute flèches, textes variables et unité, retire le préfixe', () => {
    const def = parseComponentDefinition(componentV1)
    expect(def.schemaVersion).toBe(14)
    expect('labelPrefix' in def).toBe(false)
    if (def.visual.kind !== 'drawing') throw new Error('dessin attendu')
    const [line, rect, , text] = def.visual.primitives
    expect(line).toMatchObject({
      kind: 'line',
      arrows: { start: false, middle: false, end: false }
    })
    expect(line?.kind === 'line' && line.style.weight).toBe(1)
    expect(rect?.kind === 'rect' && rect.style.weight).toBe(1)
    expect(text).toMatchObject({
      kind: 'text',
      variable: false,
      defaultValue: '',
      unit: '',
      bold: false
    })
  })

  it('les épaisseurs non standard deviennent des multiplicateurs proportionnels', () => {
    const raw = JSON.parse(componentV1) as {
      visual: { primitives: { style?: { strokeWidth: number } }[] }
    }
    const first = raw.visual.primitives[0]
    if (!first?.style) throw new Error('style attendu')
    first.style.strokeWidth = 0.25
    const migrated = migrateRaw(raw, componentMigrations, 'Composant')
    const primitives = (migrated['visual'] as { primitives: { style: { weight: number } }[] })
      .primitives
    expect(primitives[0]?.style.weight).toBe(2.5)
  })
})

describe('composant v2 → v4', () => {
  it('ajoute une unité vide aux textes et garde le reste', () => {
    const def = parseComponentDefinition(componentV2)
    expect(def.schemaVersion).toBe(14)
    if (def.visual.kind !== 'drawing') throw new Error('dessin attendu')
    const text = def.visual.primitives[3]
    expect(text).toMatchObject({
      kind: 'text',
      variable: true,
      defaultValue: '10 kΩ',
      unit: '',
      bold: false
    })
    const arrowLine = def.visual.primitives[2]
    expect(arrowLine).toMatchObject({
      kind: 'line',
      arrows: { start: false, middle: false, end: true }
    })
    expect(arrowLine?.kind === 'line' && arrowLine.style.weight).toBe(1.5)
  })
})

describe('projet v1 → v5', () => {
  it('ajoute le trait des composants au profil, les champs aux instances, et migre les définitions', () => {
    const project = parseProject(projectV1)
    expect(project.schemaVersion).toBe(19)
    expect(project.wires[0]?.endLabels).toEqual({ start: '', end: '' })
    expect(project.profile.componentStroke).toBe(0.1)
    expect(project.components.every((instance) => instance.fields !== undefined)).toBe(true)
    for (const def of Object.values(project.embeddedDefs)) {
      expect(def.schemaVersion).toBe(14)
      expect('labelPrefix' in def).toBe(false)
    }
  })
})

describe('projet v2 → v5', () => {
  it('migre les définitions embarquées et garde les valeurs des instances', () => {
    const project = parseProject(projectV2)
    expect(project.schemaVersion).toBe(19)
    expect(project.components[0]?.fields).toEqual({ R: '4,7 kΩ' })
    const def = project.embeddedDefs['resistor']
    expect(def?.schemaVersion).toBe(14)
    if (def?.visual.kind !== 'drawing') throw new Error('dessin attendu')
    expect(def.visual.primitives[1]).toMatchObject({ kind: 'text', unit: '', bold: false })
    expect(project.wires[0]?.color).toBe('#d62828')
  })
})

describe('projet v3 → v5', () => {
  it('ajoute des étiquettes d’extrémité vides aux fils et garde le style des extrémités', () => {
    const project = parseProject(projectV3)
    expect(project.schemaVersion).toBe(19)
    expect(project.wires[0]).toMatchObject({ freeEnds: 'arrow', endLabels: { start: '', end: '' } })
  })
})

describe('composant v3 → v4', () => {
  it('ajoute une graisse normale aux textes et garde l’unité', () => {
    const def = parseComponentDefinition(componentV3)
    expect(def.schemaVersion).toBe(14)
    if (def.visual.kind !== 'drawing') throw new Error('dessin attendu')
    expect(def.visual.primitives[1]).toMatchObject({ kind: 'text', unit: 'kΩ', bold: false })
  })
})

describe('projet v4 → v5', () => {
  it('ajoute la graisse aux étiquettes et migre les définitions embarquées', () => {
    const project = parseProject(projectV4)
    expect(project.schemaVersion).toBe(19)
    expect(project.labels[0]).toMatchObject({ text: 'Diviseur', bold: false })
    expect(project.wires[0]).toMatchObject({ freeEnds: 'dotted', endLabels: { end: 'OUT' } })
    const def = project.embeddedDefs['resistor']
    expect(def?.schemaVersion).toBe(14)
    if (def?.visual.kind !== 'drawing') throw new Error('dessin attendu')
    expect(def.visual.primitives[0]).toMatchObject({ kind: 'text', bold: false })
  })
})

describe('composant v4 → v5', () => {
  it('ajoute la flèche du milieu, absente, et garde les autres', () => {
    const def = parseComponentDefinition(componentV4)
    expect(def.schemaVersion).toBe(14)
    if (def.visual.kind !== 'drawing') throw new Error('dessin attendu')
    expect(def.visual.primitives[0]).toMatchObject({
      kind: 'line',
      arrows: { start: false, middle: false, end: true }
    })
    expect(def.visual.primitives[1]).toMatchObject({ kind: 'text', bold: true })
  })
})

describe('projet v5 → v8', () => {
  it('migre les définitions embarquées et garde les étiquettes en gras', () => {
    const project = parseProject(projectV5)
    expect(project.schemaVersion).toBe(19)
    expect(project.labels[0]).toMatchObject({ bold: true, size: 16.5 })
    const def = project.embeddedDefs['arrow-line']
    expect(def?.schemaVersion).toBe(14)
    if (def?.visual.kind !== 'drawing') throw new Error('dessin attendu')
    expect(def.visual.primitives[0]).toMatchObject({ arrows: { middle: false, end: true } })
  })
})

describe('projet v6 → v8', () => {
  it('donne au profil une police d’étiquettes d’extrémité, de la famille des repères', () => {
    const project = parseProject(projectV6)
    expect(project.schemaVersion).toBe(19)
    expect(project.profile.endLabelFont).toEqual({ family: 'Consolas', size: 14 })
    expect(project.wires[0]?.endLabels.start).toBe('VCC')
  })
})

describe('composant v5 → v8', () => {
  it('donne au texte une boîte déduite de son ancre, centrée sur l’ancien point', () => {
    const def = parseComponentDefinition(componentV5)
    expect(def.schemaVersion).toBe(14)
    if (def.visual.kind !== 'drawing') throw new Error('dessin attendu')
    // « R » de 0,5 cellule ancré au centre en (8, 1) : boîte 2 × 2 quarts autour de ce point.
    expect(def.visual.primitives[1]).toMatchObject({
      kind: 'text',
      x: 7,
      y: 0,
      w: 2,
      h: 2,
      bold: true
    })
  })
})

describe('projet v7 → v8', () => {
  it('migre les textes des définitions embarquées', () => {
    const project = parseProject(projectV7)
    expect(project.schemaVersion).toBe(19)
    const def = project.embeddedDefs['motor']
    expect(def?.schemaVersion).toBe(14)
    if (def?.visual.kind !== 'drawing') throw new Error('dessin attendu')
    // « M » d’une cellule ancré au centre en (8, 4) : hauteur 4, largeur 3, boîte décalée autour.
    expect(def.visual.primitives[0]).toMatchObject({ kind: 'text', w: 3, h: 4, y: 2 })
  })
})

describe('projet v8 → v9', () => {
  it('donne aux étiquettes une boîte en cellules sous leur ancienne ligne de base', () => {
    const project = parseProject(projectV8)
    expect(project.schemaVersion).toBe(19)
    // « Exemple » en 11 pt sur 20 px : 0,55 cellule de haut, 7 caractères → boîte 3 × 1 au-dessus de y = 0.
    expect(project.labels[0]).toMatchObject({ x: 2, y: -1, w: 3, h: 1, anchor: 'start' })
  })
})

describe('composant v6 → v8', () => {
  it('garde les textes droits sur le montage par défaut', () => {
    const def = parseComponentDefinition(componentV6)
    expect(def.schemaVersion).toBe(14)
    if (def.visual.kind !== 'drawing') throw new Error('dessin attendu')
    expect(def.visual.primitives[0]).toMatchObject({ kind: 'text', followsRotation: false })
  })
})

describe('projet v9 → v10', () => {
  it('migre les définitions embarquées et garde les boîtes des étiquettes', () => {
    const project = parseProject(projectV9)
    expect(project.schemaVersion).toBe(19)
    const motor = project.embeddedDefs['motor']
    expect(motor?.visual.kind === 'drawing' && motor.visual.primitives[0]).toMatchObject({
      followsRotation: false
    })
    expect(project.labels[0]).toMatchObject({ w: 4, h: 1, anchor: 'middle' })
  })
})

describe('composant v7 → v8', () => {
  it('reporte le réglage global sur chaque texte et le retire du composant', () => {
    const def = parseComponentDefinition(componentV7)
    expect(def.schemaVersion).toBe(14)
    expect('textFollowsTransform' in def).toBe(false)
    if (def.visual.kind !== 'drawing') throw new Error('dessin attendu')
    expect(def.visual.primitives[0]).toMatchObject({ kind: 'text', followsRotation: true })
  })
})

describe('projet v10 → v11', () => {
  it('migre les définitions embarquées (orientation texte par texte)', () => {
    const project = parseProject(projectV10)
    expect(project.schemaVersion).toBe(19)
    const motor = project.embeddedDefs['motor']
    expect(motor?.schemaVersion).toBe(14)
    expect(motor?.visual.kind === 'drawing' && motor.visual.primitives[0]).toMatchObject({
      followsRotation: true
    })
  })
})

describe('composant v8 → v9', () => {
  it('ajoute italique, souligné et barré, désactivés', () => {
    const def = parseComponentDefinition(componentV8)
    expect(def.schemaVersion).toBe(14)
    if (def.visual.kind !== 'drawing') throw new Error('dessin attendu')
    expect(def.visual.primitives[0]).toMatchObject({
      kind: 'text',
      followsRotation: true,
      italic: false,
      underline: false,
      strike: false
    })
  })
})

describe('projet v11 → v12', () => {
  it('migre les définitions embarquées (styles de texte)', () => {
    const project = parseProject(projectV11)
    expect(project.schemaVersion).toBe(19)
    const motor = project.embeddedDefs['motor']
    expect(motor?.schemaVersion).toBe(14)
    expect(motor?.visual.kind === 'drawing' && motor.visual.primitives[0]).toMatchObject({
      followsRotation: true,
      strike: false
    })
  })
})

describe('composant v9 → v10', () => {
  it('retire la chasse fixe et garde les autres styles', () => {
    const def = parseComponentDefinition(componentV9)
    expect(def.schemaVersion).toBe(14)
    if (def.visual.kind !== 'drawing') throw new Error('dessin attendu')
    const text = def.visual.primitives[0]
    expect(text).toMatchObject({ kind: 'text', italic: true, bold: true })
    expect(text && 'mono' in text).toBe(false)
  })
})

describe('projet v12 → v13', () => {
  it('migre les définitions embarquées (plus de chasse fixe)', () => {
    const project = parseProject(projectV12)
    expect(project.schemaVersion).toBe(19)
    const motor = project.embeddedDefs['motor']
    expect(motor?.schemaVersion).toBe(14)
    const text = motor?.visual.kind === 'drawing' ? motor.visual.primitives[0] : undefined
    expect(text).toMatchObject({ italic: true })
    expect(text && 'mono' in text).toBe(false)
  })
})

describe('composant v10 → v11', () => {
  it('rend le remplissage opaque par défaut', () => {
    const def = parseComponentDefinition(componentV10)
    expect(def.schemaVersion).toBe(14)
    if (def.visual.kind !== 'drawing') throw new Error('dessin attendu')
    expect(def.visual.primitives[0]).toMatchObject({
      kind: 'rect',
      style: { fill: '#ffffff', fillOpacity: 1 }
    })
  })
})

describe('projet v13 → v14', () => {
  it('migre les définitions embarquées (opacité du remplissage)', () => {
    const project = parseProject(projectV13)
    expect(project.schemaVersion).toBe(19)
    const motor = project.embeddedDefs['motor']
    expect(motor?.schemaVersion).toBe(14)
    const rect = motor?.visual.kind === 'drawing' ? motor.visual.primitives[0] : undefined
    expect(rect).toMatchObject({ style: { fillOpacity: 1 } })
  })
})

describe('composant v11 → v12', () => {
  it('garde les formes telles quelles, opacité comprise', () => {
    const def = parseComponentDefinition(componentV11)
    expect(def.schemaVersion).toBe(14)
    if (def.visual.kind !== 'drawing') throw new Error('dessin attendu')
    expect(def.visual.primitives[0]).toMatchObject({ kind: 'rect', style: { fillOpacity: 0.5 } })
  })
})

describe('projet v14 → v15', () => {
  it('migre les définitions embarquées (forme point)', () => {
    const project = parseProject(projectV14)
    expect(project.schemaVersion).toBe(19)
    expect(project.embeddedDefs['motor']?.schemaVersion).toBe(14)
  })
})

describe('composant v12 → v13', () => {
  it('donne aux polylignes des angles vifs et garde le point', () => {
    const def = parseComponentDefinition(componentV12)
    expect(def.schemaVersion).toBe(14)
    if (def.visual.kind !== 'drawing') throw new Error('dessin attendu')
    expect(def.visual.primitives.find((primitive) => primitive.kind === 'polyline')).toMatchObject({
      closed: true,
      radius: 0
    })
    expect(def.visual.primitives.find((primitive) => primitive.kind === 'dot')).toMatchObject({
      scale: 1.5
    })
  })
})

describe('projet v15 → v16', () => {
  it('migre les définitions embarquées (angles arrondis)', () => {
    const project = parseProject(projectV15)
    expect(project.schemaVersion).toBe(19)
    expect(project.embeddedDefs['motor']?.schemaVersion).toBe(14)
  })
})

describe('projet v16 → v17', () => {
  it('reçoit une liste vide de couleurs propres au montage', () => {
    const project = parseProject(projectV16)
    expect(project.schemaVersion).toBe(19)
    expect(project.customColors).toEqual([])
  })
})

describe('composant v13 → v14', () => {
  it('laisse les textes horizontaux et garde les angles arrondis', () => {
    const def = parseComponentDefinition(componentV13)
    expect(def.schemaVersion).toBe(14)
    if (def.visual.kind !== 'drawing') throw new Error('dessin attendu')
    expect(def.visual.primitives.find((primitive) => primitive.kind === 'text')).toMatchObject({
      vertical: false
    })
    expect(def.visual.primitives.find((primitive) => primitive.kind === 'polyline')).toMatchObject({
      radius: 2
    })
  })
})

describe('projet v17 → v18', () => {
  it('migre les définitions embarquées et garde les couleurs du montage', () => {
    const project = parseProject(projectV17)
    expect(project.schemaVersion).toBe(19)
    expect(project.customColors).toEqual(['#ff00aa'])
    expect(project.embeddedDefs['motor']?.schemaVersion).toBe(14)
  })
})

describe('projet v18 → v19', () => {
  it('donne aux étiquettes les styles de texte et une couleur noire', () => {
    const project = parseProject(projectV18)
    expect(project.schemaVersion).toBe(19)
    expect(project.labels[0]).toMatchObject({
      text: 'Pompe',
      bold: true,
      italic: false,
      underline: false,
      strike: false,
      vertical: false,
      color: '#000000'
    })
  })
})

describe('paramètres v8 → v9', () => {
  it('range les couleurs personnalisées dans la palette, sans doublon', () => {
    const settings = parseSettings(settingsV8)
    expect(settings.schemaVersion).toBe(9)
    expect('customColors' in settings).toBe(false)
    // #D62828 est déjà le rouge de la palette ; #ff00aa s'y ajoute sous son code.
    expect(settings.palette.map((color) => color.hex.toLowerCase())).toEqual([
      '#000000',
      '#d62828',
      '#ff00aa'
    ])
    expect(settings.palette.at(-1)?.name).toBe('#FF00AA')
    expect(settings.libraryView).toBe('grid')
  })
})

describe('paramètres v7 → v8', () => {
  it('affiche la bibliothèque en liste par défaut et garde le reste', () => {
    const settings = parseSettings(settingsV7)
    expect(settings.schemaVersion).toBe(9)
    expect(settings.libraryView).toBe('list')
    expect(settings.theme).toBe('dark')
  })
})

describe('paramètres v6 → v8', () => {
  it('passe au thème sombre et garde le reste', () => {
    const settings = parseSettings(settingsV6)
    expect(settings.schemaVersion).toBe(9)
    expect(settings.theme).toBe('dark')
    expect(settings.autoOpenInspector).toBe(true)
    expect(settings.autosaveSeconds).toBe(120)
  })
})

describe('paramètres v5 → v8', () => {
  it('ouvre le panneau de propriétés à la sélection par défaut', () => {
    const settings = parseSettings(settingsV5)
    expect(settings.schemaVersion).toBe(9)
    expect(settings.autoOpenInspector).toBe(true)
  })
})

describe('paramètres v4 → v8', () => {
  it('complète le profil par défaut et garde le thème', () => {
    const settings = parseSettings(settingsV4)
    expect(settings.schemaVersion).toBe(9)
    expect(settings.theme).toBe('dark')
    expect(settings.defaultProfile.endLabelFont).toEqual({ family: 'Segoe UI', size: 14 })
  })
})

describe('paramètres v1 → v8', () => {
  it('ajoute export, copie de secours, trait des composants et thème', () => {
    const settings = parseSettings(settingsV1)
    expect(settings.schemaVersion).toBe(9)
    expect(settings.defaultProfile.componentStroke).toBe(0.1)
    expect(settings.export.scale).toBe(2)
    expect(settings.theme).toBe('dark')
  })
})

describe('paramètres v3 → v8', () => {
  it('ajoute le thème, sombre désormais, et garde le reste', () => {
    const settings = parseSettings(settingsV3)
    expect(settings.schemaVersion).toBe(9)
    expect(settings.theme).toBe('dark')
    expect(settings.recentFiles).toEqual(['D:/Documents/diviseur.pinout.json'])
    expect(settings.autosaveSeconds).toBe(60)
  })
})
