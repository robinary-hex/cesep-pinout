import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE, FileFormatError } from '@/domain'
import { setBridge } from './bridge'
import {
  addMissingProfiles,
  deleteProfile,
  listProfiles,
  profilesFilePath,
  readLegacyProfiles,
  saveProfile
} from './profiles'
import { FakeFs } from './testing/fakeFs'

let fs: FakeFs

beforeEach(() => {
  fs = new FakeFs()
  setBridge(fs)
})

afterEach(() => {
  setBridge(null)
})

const ROOT = 'D:/Pinout'
const FILE = 'D:/Pinout/Applications/profils.json'
const compact = { ...DEFAULT_PROFILE, name: 'Compact', cellPx: 16 }
const large = { ...DEFAULT_PROFILE, name: 'Aéré', cellPx: 28 }

async function names(root: string | null = ROOT): Promise<string[]> {
  return (await listProfiles(root)).map((entry) => entry.profile.name)
}

describe('profils de style enregistrés', () => {
  it('sont tous dans un seul fichier, à côté des paramètres', async () => {
    expect(await profilesFilePath(ROOT)).toBe(FILE)
    expect(await names()).toEqual([])
    expect(await saveProfile(ROOT, compact)).toBe(FILE)
    await saveProfile(ROOT, large)
    expect([...fs.texts.keys()]).toEqual([FILE])
    // Dans l'ordre alphabétique, à l'écran comme dans le fichier.
    expect(await names()).toEqual(['Aéré', 'Compact'])
    const file = JSON.parse(await fs.readTextFile(FILE)) as {
      schemaVersion: number
      profiles: { name: string }[]
    }
    expect(file.schemaVersion).toBe(1)
    expect(file.profiles.map((profile) => profile.name)).toEqual(['Aéré', 'Compact'])
  })

  it('remplace le profil du même nom, et supprime par le nom', async () => {
    await saveProfile(ROOT, compact)
    await saveProfile(ROOT, large)
    await saveProfile(ROOT, { ...compact, cellPx: 12 })
    const saved = await listProfiles(ROOT)
    expect(saved).toHaveLength(2)
    expect(saved.find((entry) => entry.profile.name === 'Compact')?.profile.cellPx).toBe(12)
    await deleteProfile(ROOT, 'Compact')
    expect(await names()).toEqual(['Aéré'])
    // Un nom inconnu : rien ne change.
    await deleteProfile(ROOT, 'Inconnu')
    expect(await names()).toEqual(['Aéré'])
  })

  it('sans dossier de Pinout, restent dans un fichier de la machine', async () => {
    expect(await profilesFilePath(null)).toBe('C:/fake/Pinout/profils.json')
    await saveProfile(null, compact)
    expect(await names(null)).toEqual(['Compact'])
    expect(await names()).toEqual([])
  })

  it('écarte un profil invalide sans perdre les autres, et refuse un fichier qui n’en est pas un', async () => {
    await fs.writeTextFile(
      FILE,
      JSON.stringify({ schemaVersion: 1, profiles: [compact, { name: 'x' }, 'rien'] })
    )
    expect(await names()).toEqual(['Compact'])
    await fs.writeTextFile(FILE, '{')
    await expect(listProfiles(ROOT)).rejects.toThrow(FileFormatError)
    await fs.writeTextFile(FILE, '[]')
    await expect(listProfiles(ROOT)).rejects.toThrow(FileFormatError)
  })

  it('ajoute les profils dont le nom manque, sans remplacer les autres', async () => {
    await saveProfile(ROOT, compact)
    const added = await addMissingProfiles(ROOT, [{ ...compact, cellPx: 99 }, large])
    expect(added).toBe(1)
    const saved = await listProfiles(ROOT)
    expect(saved.map((entry) => entry.profile.name)).toEqual(['Aéré', 'Compact'])
    expect(saved[1]?.profile.cellPx).toBe(16)
    // Rien à ajouter : le fichier n'est pas réécrit, ni même créé.
    expect(await addMissingProfiles('E:/vide', [])).toBe(0)
    expect(await fs.pathExists('E:/vide')).toBe(false)
  })
})

describe('profils de l’ancienne organisation', () => {
  it('étaient un par fichier dans userData : ils se relisent, complétés', async () => {
    const dir = 'C:/fake/Pinout/profiles'
    await fs.writeTextFile(`${dir}/compact.json`, JSON.stringify(compact))
    // Un profil d'avant la police des étiquettes d'extrémité : elle lui est donnée.
    const older: Record<string, unknown> = { ...large }
    delete older['endLabelFont']
    await fs.writeTextFile(`${dir}/aere.json`, JSON.stringify(older))
    await fs.writeTextFile(`${dir}/casse.json`, '{')
    await fs.writeTextFile(`${dir}/faux.json`, '{ "name": "x" }')
    await fs.writeTextFile(`${dir}/notes.txt`, 'rien')
    const profiles = await readLegacyProfiles()
    expect(profiles.map((profile) => profile.name)).toEqual(['Aéré', 'Compact'])
    expect(profiles[0]?.endLabelFont.family).toBe(large.labelFont.family)
  })

  it('sans rien d’enregistré, la liste est vide', async () => {
    expect(await readLegacyProfiles()).toEqual([])
  })
})
