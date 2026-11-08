import { z } from 'zod'

/** Couleur au format #rrggbb, seule forme stockée dans les fichiers. */
export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Couleur hexadécimale attendue, par exemple #d62828')
export type HexColor = z.infer<typeof hexColorSchema>
