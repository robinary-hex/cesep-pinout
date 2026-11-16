import { describe, expect, it } from 'vitest'
import { UPDATE_EVERY_MS, UPDATE_RETRY_MS, watchForUpdates } from './updateWatch'

/** Fausses minuteries : on voit ce qui est prévu, et on le déclenche à la main. */
function fakeTimers(): {
  set: (run: () => void, ms: number) => unknown
  clear: (handle: unknown) => void
  planned: () => number[]
  fire: () => void
} {
  let next = 1
  const waiting = new Map<number, { run: () => void; ms: number }>()
  return {
    set: (run, ms) => {
      const id = next++
      waiting.set(id, { run, ms })
      return id
    },
    clear: (handle) => {
      waiting.delete(handle as number)
    },
    planned: () => [...waiting.values()].map((entry) => entry.ms),
    fire: () => {
      const [id, entry] = [...waiting.entries()][0] ?? []
      if (id === undefined || !entry) throw new Error('aucune recherche prévue')
      waiting.delete(id)
      entry.run()
    }
  }
}

/** Laisse passer les promesses en attente. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

describe('recherche des mises à jour', () => {
  it('cherche au lancement, puis de loin en loin tant que l’application reste ouverte', async () => {
    const timers = fakeTimers()
    let checks = 0
    const watch = watchForUpdates({
      check: () => {
        checks++
        return Promise.resolve()
      },
      settled: () => false,
      timers
    })
    expect(await watch.checkNow()).toBe('done')
    expect(checks).toBe(1)
    // Rien de neuf : la suivante est prévue dans quelques heures.
    expect(timers.planned()).toEqual([UPDATE_EVERY_MS])
    timers.fire()
    await settle()
    expect(checks).toBe(2)
    expect(timers.planned()).toEqual([UPDATE_EVERY_MS])
    expect(UPDATE_EVERY_MS).toBeGreaterThan(UPDATE_RETRY_MS)
  })

  it('réessaie peu après une recherche qui n’aboutit pas, et le note', async () => {
    const timers = fakeTimers()
    const lines: string[] = []
    let online = false
    const watch = watchForUpdates({
      check: () =>
        online ? Promise.resolve() : Promise.reject(new Error('net::ERR_INTERNET_DISCONNECTED')),
      settled: () => false,
      log: (line) => lines.push(line),
      timers
    })
    // Hors ligne au lancement : pas d'erreur qui remonte, une nouvelle tentative dans cinq minutes.
    expect(await watch.checkNow()).toBe('failed')
    expect(timers.planned()).toEqual([UPDATE_RETRY_MS])
    expect(lines.join('\n')).toContain('ERR_INTERNET_DISCONNECTED')
    online = true
    timers.fire()
    await settle()
    expect(timers.planned()).toEqual([UPDATE_EVERY_MS])
  })

  it('ne lance qu’une recherche à la fois, et dit quand elle est en cours', async () => {
    const timers = fakeTimers()
    let finish: () => void = () => undefined
    let checks = 0
    const watch = watchForUpdates({
      check: () => {
        checks++
        return new Promise<void>((resolve) => {
          finish = resolve
        })
      },
      settled: () => false,
      timers
    })
    expect(watch.checking).toBe(false)
    const first = watch.checkNow()
    const second = watch.checkNow()
    // La demande faite pendant la recherche attend la même.
    expect(second).toBe(first)
    expect(checks).toBe(1)
    expect(watch.checking).toBe(true)
    finish()
    expect(await first).toBe('done')
    expect(watch.checking).toBe(false)
  })

  it('ne cherche pas tant qu’une mise à jour est en main, et s’arrête sur demande', async () => {
    const timers = fakeTimers()
    let checks = 0
    let found = true
    const watch = watchForUpdates({
      check: () => {
        checks++
        return Promise.resolve()
      },
      settled: () => found,
      timers
    })
    // Une mise à jour est déjà trouvée : rien à chercher, on y reviendra plus tard.
    expect(await watch.checkNow()).toBe('skipped')
    expect(checks).toBe(0)
    expect(timers.planned()).toEqual([UPDATE_EVERY_MS])
    found = false
    timers.fire()
    await settle()
    expect(checks).toBe(1)
    watch.stop()
    expect(timers.planned()).toEqual([])
    expect(await watch.checkNow()).toBe('skipped')
    expect(checks).toBe(1)
  })
})
