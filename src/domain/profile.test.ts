import { describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE, styleProfileSchema } from './profile'
import { createEmptyProject, projectSchema } from './project'
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
  })
})
