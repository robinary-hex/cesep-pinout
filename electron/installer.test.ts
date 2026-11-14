import { describe, expect, it } from 'vitest'
import { launchInstaller, runElevated, windowsError, type ElevatedRun } from './installer'

/** Faux elevate.exe : rend ces résultats l'un après l'autre et note ce qu'on lui a demandé. */
function fakeElevate(results: ElevatedRun[]): {
  run: (helper: string, args: readonly string[]) => Promise<ElevatedRun>
  calls: string[][]
} {
  const calls: string[][] = []
  const queue = [...results]
  return {
    calls,
    run: (helper, args) => {
      calls.push([helper, ...args])
      return Promise.resolve(queue.shift() ?? { code: null, stderr: 'plus de résultat prévu' })
    }
  }
}

const refused: ElevatedRun = {
  code: 1,
  stderr: 'C:\\cache\\pinout-setup.exe could not be launched: 1223\n'
}
const busy: ElevatedRun = {
  code: 1,
  stderr: 'C:\\cache\\pinout-setup.exe could not be launched: 32\n'
}

describe('lancement de l’installeur d’une mise à jour', () => {
  const options = {
    helper: 'C:\\app\\resources\\elevate.exe',
    installer: 'C:\\cache\\pinout-setup.exe'
  }

  it('lit le code d’erreur de Windows dans ce qu’écrit elevate.exe', () => {
    expect(windowsError(refused.stderr)).toBe(1223)
    expect(windowsError(busy.stderr)).toBe(32)
    expect(windowsError('')).toBeNull()
    expect(windowsError('spawn ENOENT')).toBeNull()
  })

  it('lance l’installeur par elevate.exe, pour une mise à jour qui relance l’application', async () => {
    const elevate = fakeElevate([{ code: 0, stderr: '' }])
    const pauses: number[] = []
    const result = await launchInstaller({
      ...options,
      run: elevate.run,
      pause: (ms) => {
        pauses.push(ms)
        return Promise.resolve()
      }
    })
    // L'installeur tourne : l'application peut se fermer.
    expect(result).toEqual({ outcome: 'started' })
    expect(elevate.calls).toEqual([[options.helper, options.installer, '--updated', '--force-run']])
    expect(pauses).toEqual([])
  })

  it('s’arrête sur un refus à la question de Windows, sans réessayer', async () => {
    const elevate = fakeElevate([refused, { code: 0, stderr: '' }])
    const result = await launchInstaller({
      ...options,
      run: elevate.run,
      pause: () => Promise.resolve()
    })
    expect(result).toEqual({ outcome: 'cancelled' })
    expect(elevate.calls).toHaveLength(1)
  })

  it('réessaie quand l’installeur ne démarre pas, puis le lance', async () => {
    const elevate = fakeElevate([busy, { code: 0, stderr: '' }])
    const pauses: number[] = []
    const lines: string[] = []
    const result = await launchInstaller({
      ...options,
      run: elevate.run,
      pause: (ms) => {
        pauses.push(ms)
        return Promise.resolve()
      },
      log: (line) => lines.push(line)
    })
    expect(result).toEqual({ outcome: 'started' })
    expect(elevate.calls).toHaveLength(2)
    expect(pauses).toEqual([1500])
    // Le journal garde la trace de chaque essai.
    expect(lines.some((line) => line.includes('essai 1') && line.includes('32'))).toBe(true)
    expect(lines.some((line) => line.includes('essai 2') && line.includes('code 0'))).toBe(true)
  })

  it('renonce après trois essais, en disant pourquoi', async () => {
    const elevate = fakeElevate([busy, busy, busy, { code: 0, stderr: '' }])
    const result = await launchInstaller({
      ...options,
      run: elevate.run,
      pause: () => Promise.resolve()
    })
    expect(result).toEqual({
      outcome: 'failed',
      message: 'L’installeur n’a pas pu démarrer (erreur Windows 32).'
    })
    expect(elevate.calls).toHaveLength(3)
    // elevate.exe introuvable : son erreur est rapportée telle quelle.
    const missing = fakeElevate([
      { code: null, stderr: 'spawn elevate.exe ENOENT' },
      { code: null, stderr: 'spawn elevate.exe ENOENT' },
      { code: null, stderr: 'spawn elevate.exe ENOENT' }
    ])
    const lost = await launchInstaller({
      ...options,
      run: missing.run,
      pause: () => Promise.resolve()
    })
    expect(lost).toEqual({
      outcome: 'failed',
      message: 'L’installeur n’a pas pu démarrer (spawn elevate.exe ENOENT).'
    })
  })

  it('attend la fin du programme lancé et rapporte son code et sa sortie d’erreur', async () => {
    // Node tient lieu d'elevate.exe : un vrai processus, qui échoue comme lui puis réussit.
    const script = (code: number, text: string): string[] => [
      '-e',
      `process.stderr.write(${JSON.stringify(text)}); process.exit(${code})`
    ]
    const failed = await runElevated(process.execPath, script(1, 'x could not be launched: 5'))
    expect(failed.code).toBe(1)
    expect(windowsError(failed.stderr)).toBe(5)
    expect(await runElevated(process.execPath, script(0, ''))).toEqual({ code: 0, stderr: '' })
    // Un programme qui n'existe pas : pas de code, et la raison.
    const missing = await runElevated('pinout-programme-inexistant.exe', [])
    expect(missing.code).toBeNull()
    expect(missing.stderr).toContain('ENOENT')
  })
})
