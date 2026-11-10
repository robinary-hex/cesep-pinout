import { describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE, profileDifferences, sameProfile, styleProfileSchema } from './profile'
import { createEmptyProject, isEmptyProject, projectSchema } from './project'
import { DEFAULT_PALETTE, DEFAULT_SETTINGS, settingsSchema } from './settings'

describe('profil de style et paramètres', () => {
  it('le profil Standard est valide', () => {
    expect(styleProfileSchema.safeParse(DEFAULT_PROFILE).success).toBe(true)
  })

  it('refuse un facteur de jonction hors liste', () => {
    expect(styleProfileSchema.safeParse({ ...DEFAULT_PROFILE, junctionScale: 3 }).success).toBe(
      false
    )
  })

  it('accepte une couleur fixe ou la couleur du fil pour la jonction', () => {
    expect(
      styleProfileSchema.safeParse({ ...DEFAULT_PROFILE, junctionColor: '#000000' }).success
    ).toBe(true)
    expect(
      styleProfileSchema.safeParse({ ...DEFAULT_PROFILE, junctionColor: 'rouge' }).success
    ).toBe(false)
  })

  it('les paramètres par défaut sont valides, avec dix couleurs et sans blanc', () => {
    expect(settingsSchema.safeParse(DEFAULT_SETTINGS).success).toBe(true)
    expect(DEFAULT_PALETTE).toHaveLength(10)
    expect(DEFAULT_PALETTE.some((color) => color.hex.toLowerCase() === '#ffffff')).toBe(false)
  })

  it('un projet vide créé depuis le profil est valide', () => {
    const project = createEmptyProject('Nouveau montage', DEFAULT_PROFILE)
    expect(projectSchema.safeParse(project).success).toBe(true)
    expect(project.profile).not.toBe(DEFAULT_PROFILE)
    expect(isEmptyProject(project)).toBe(true)
    const label = {
      id: 't1',
      x: 0,
      y: 0,
      w: 4,
      h: 1,
      anchor: 'middle' as const,
      text: 'Texte',
      size: 11,
      bold: false,
      italic: false,
      underline: false,
      strike: false,
      vertical: false,
      color: '#000000',
      background: false
    }
    expect(isEmptyProject({ ...project, labels: [label] })).toBe(false)
  })

  it('liste les réglages où un profil s’écarte du profil général', () => {
    expect(profileDifferences(DEFAULT_PROFILE, structuredClone(DEFAULT_PROFILE))).toEqual([])
    expect(sameProfile(DEFAULT_PROFILE, structuredClone(DEFAULT_PROFILE))).toBe(true)
    const custom = {
      ...DEFAULT_PROFILE,
      name: 'Cours',
      cornerRadius: 0,
      junctionColor: '#000000',
      endLabelFont: { family: 'Segoe UI', size: 18 }
    }
    expect(profileDifferences(custom, DEFAULT_PROFILE)).toEqual([
      'name',
      'wires',
      'junction',
      'endLabels'
    ])
    expect(sameProfile(custom, DEFAULT_PROFILE)).toBe(false)
  })
})
