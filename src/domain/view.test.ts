import { describe, expect, it } from 'vitest'
import {
  DEFAULT_VIEW,
  fittingView,
  gridLines,
  MAX_ZOOM,
  pannedView,
  screenToWorld,
  zoomedView
} from './view'

describe('vue d’un canevas infini', () => {
  it('zoome autour d’un point d’écran, qui reste sur le même point de la grille', () => {
    const view = { zoom: 1, panX: 80, panY: 80 }
    const before = screenToWorld(view, 20, 300, 200)
    const zoomed = zoomedView(view, 2, 300, 200, 20)
    expect(zoomed.zoom).toBe(2)
    const after = screenToWorld(zoomed, 40, 300, 200)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('s’arrête aux butées du zoom sans changer la vue', () => {
    const view = { zoom: MAX_ZOOM, panX: 0, panY: 0 }
    expect(zoomedView(view, 2, 10, 10, 20)).toBe(view)
  })

  it('déplace la vue et l’ajuste au contenu, centré avec une marge', () => {
    expect(pannedView(DEFAULT_VIEW, 5, -3)).toEqual({ zoom: 1, panX: 85, panY: 77 })
    expect(fittingView(null, { width: 800, height: 600 }, 20)).toEqual(DEFAULT_VIEW)
    // 16 × 6 cellules, plus 2 de marge de chaque côté : 20 × 10 dans 800 × 600 à 20 px → ×2.
    const view = fittingView({ x: 4, y: 2, width: 16, height: 6 }, { width: 800, height: 600 }, 20)
    expect(view.zoom).toBe(2)
    expect(view.panX).toBe((800 - 16 * 40) / 2 - 4 * 40)
    expect(view.panY).toBe((600 - 6 * 40) / 2 - 2 * 40)
  })

  it('donne les lignes visibles de la grille, une sur cinq marquée, aucune si elle est trop fine', () => {
    const lines = gridLines({ zoom: 1, panX: 10, panY: 0 }, 20, { width: 100, height: 40 })
    expect(lines.xs.map((line) => line.px)).toEqual([-10, 10, 30, 50, 70, 90, 110])
    expect(lines.xs.filter((line) => line.major).map((line) => line.px)).toEqual([10, 110])
    expect(lines.ys.map((line) => line.px)).toEqual([0, 20, 40])
    expect(gridLines(DEFAULT_VIEW, 4, { width: 100, height: 40 })).toEqual({ xs: [], ys: [] })
  })
})
