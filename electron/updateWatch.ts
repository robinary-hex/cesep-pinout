// Recherche des mises à jour (décision du 16 novembre 2026) : au lancement, puis de loin en loin
// tant que l'application reste ouverte, et de nouveau peu après un échec (réseau pas encore là,
// GitHub injoignable). Une seule recherche au lancement ne suffisait pas : ratée, ou faite avant
// que la release ne soit publiée, elle laissait l'application sans bouton jusqu'à sa fermeture.
// Une seule recherche à la fois, et aucune tant qu'une mise à jour est en main (trouvée, en
// téléchargement, prête à installer).

/** Délai avant de réessayer après une recherche qui n'a pas abouti. */
export const UPDATE_RETRY_MS = 5 * 60 * 1000
/** Délai entre deux recherches quand la précédente a abouti. */
export const UPDATE_EVERY_MS = 3 * 60 * 60 * 1000

/** Ce que donne une recherche : faite, ratée, ou inutile (une mise à jour est déjà en main). */
export type CheckOutcome = 'done' | 'failed' | 'skipped'

export interface UpdateWatchOptions {
  /** Interroge GitHub ; rejette quand la recherche n'aboutit pas. */
  check: () => Promise<unknown>
  /** Vrai tant qu'une mise à jour est en main : inutile d'en chercher une. */
  settled: () => boolean
  retryMs?: number
  everyMs?: number
  log?: (line: string) => void
  /** Minuteries, remplaçables dans les tests. */
  timers?: {
    set: (run: () => void, ms: number) => unknown
    clear: (handle: unknown) => void
  }
}

export interface UpdateWatch {
  /** Cherche tout de suite ; pendant une recherche déjà partie, rend la sienne. */
  checkNow: () => Promise<CheckOutcome>
  /** Vrai pendant une recherche : une erreur signalée alors est la sienne, pas celle d'un téléchargement. */
  readonly checking: boolean
  /** Plus de recherche à venir. */
  stop: () => void
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function watchForUpdates(options: UpdateWatchOptions): UpdateWatch {
  const retryMs = options.retryMs ?? UPDATE_RETRY_MS
  const everyMs = options.everyMs ?? UPDATE_EVERY_MS
  const log = options.log ?? (() => undefined)
  const timers = options.timers ?? {
    set: (run: () => void, ms: number) => setTimeout(run, ms),
    clear: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>)
  }
  let pending: Promise<CheckOutcome> | null = null
  let timer: unknown = null
  let stopped = false

  /** La prochaine recherche, dans `ms` ; elle remplace celle qui était prévue. */
  function plan(ms: number): void {
    if (timer !== null) timers.clear(timer)
    timer = null
    if (stopped) return
    timer = timers.set(() => {
      timer = null
      void checkNow()
    }, ms)
  }

  function checkNow(): Promise<CheckOutcome> {
    if (pending) return pending
    if (stopped) return Promise.resolve('skipped')
    if (options.settled()) {
      plan(everyMs)
      return Promise.resolve('skipped')
    }
    const running: Promise<CheckOutcome> = options
      .check()
      .then(
        (): CheckOutcome => 'done',
        (error: unknown): CheckOutcome => {
          log(`recherche d'une mise à jour impossible : ${describe(error)}`)
          return 'failed'
        }
      )
      .then((outcome) => {
        pending = null
        plan(outcome === 'failed' ? retryMs : everyMs)
        return outcome
      })
    pending = running
    return running
  }

  return {
    checkNow,
    get checking() {
      return pending !== null
    },
    stop() {
      stopped = true
      if (timer !== null) timers.clear(timer)
      timer = null
    }
  }
}
