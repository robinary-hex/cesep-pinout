import { spawn } from 'node:child_process'

// Lancement de l'installeur d'une mise à jour (décision du 14 novembre 2026). L'installeur demande
// les droits d'administrateur : il passe par `elevate.exe`, livré avec l'application, qui pose la
// question de Windows puis rend la main dès que l'installeur tourne. L'application ne se ferme
// qu'à ce moment-là. Avant, elle se fermait aussitôt l'installeur demandé : sur un fichier tout
// juste téléchargé, Windows met plusieurs secondes à poser sa question, la fenêtre de Pinout avait
// alors disparu, et la question n'arrivait plus au premier plan ; rien ne semblait se passer, il
// fallait relancer Pinout et recommencer.

/** Ce que Windows répond quand on refuse sa demande d'autorisation. */
const ERROR_CANCELLED = 1223
/** Essais quand l'installeur ne démarre pas (fichier encore tenu par l'antivirus, par exemple). */
const ATTEMPTS = 3
const RETRY_MS = 1500

/** Une exécution d'elevate.exe. */
export interface ElevatedRun {
  /** Son code de sortie : 0 dès que le programme demandé est lancé ; null s'il n'a pas démarré. */
  code: number | null
  /** Ce qu'il a écrit sur sa sortie d'erreur, ou pourquoi il n'a pas démarré. */
  stderr: string
}

export type RunElevated = (helper: string, args: readonly string[]) => Promise<ElevatedRun>

/**
 * Lance elevate.exe et attend sa fin : il ne rend la main qu'une fois la question de Windows
 * répondue. Sans fenêtre de console, et sans détacher le processus : c'est l'application, restée
 * au premier plan, qui demande.
 */
export const runElevated: RunElevated = (helper, args) =>
  new Promise((resolve) => {
    let stderr = ''
    let settled = false
    const finish = (code: number | null, extra = ''): void => {
      if (settled) return
      settled = true
      resolve({ code, stderr: stderr + extra })
    }
    try {
      const child = spawn(helper, [...args], {
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe']
      })
      child.stderr?.setEncoding('utf8')
      child.stderr?.on('data', (chunk: string) => {
        stderr += chunk
      })
      child.on('error', (error) => finish(null, error.message))
      child.on('close', (code) => finish(code))
    } catch (error) {
      finish(null, error instanceof Error ? error.message : String(error))
    }
  })

/** Code d'erreur de Windows dans ce qu'elevate.exe écrit quand il n'a rien pu lancer. */
export function windowsError(stderr: string): number | null {
  const match = /could not be launched:\s*(\d+)/i.exec(stderr)
  return match?.[1] === undefined ? null : Number(match[1])
}

export type InstallerLaunch =
  /** L'installeur tourne : l'application peut se fermer. */
  | { outcome: 'started' }
  /** Refus à la question de Windows : rien n'a changé. */
  | { outcome: 'cancelled' }
  | { outcome: 'failed'; message: string }

export interface LaunchOptions {
  /** Chemin d'elevate.exe. */
  helper: string
  /** L'installeur téléchargé. */
  installer: string
  run?: RunElevated
  pause?: (ms: number) => Promise<void>
  log?: (line: string) => void
}

/**
 * Lance l'installeur avec les droits d'administrateur, comme le fait electron-updater (`--updated`,
 * puis `--force-run` pour relancer l'application une fois installée), et dit ce qu'il en est. Un
 * refus s'arrête là ; un échec se retente, le temps qu'un fichier tout neuf se libère.
 */
export async function launchInstaller(options: LaunchOptions): Promise<InstallerLaunch> {
  const run = options.run ?? runElevated
  const pause =
    options.pause ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const log = options.log ?? (() => undefined)
  const args = [options.installer, '--updated', '--force-run']
  let reason = ''
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    log(`installeur, essai ${attempt} : ${options.helper} ${args.join(' ')}`)
    const result = await run(options.helper, args)
    log(`installeur, essai ${attempt} : code ${result.code} ${result.stderr.trim()}`)
    if (result.code === 0) return { outcome: 'started' }
    const error = windowsError(result.stderr)
    if (error === ERROR_CANCELLED) return { outcome: 'cancelled' }
    reason =
      error !== null
        ? `erreur Windows ${error}`
        : result.stderr.trim() || `code ${result.code ?? 'inconnu'}`
    if (attempt < ATTEMPTS) await pause(RETRY_MS)
  }
  return { outcome: 'failed', message: `L’installeur n’a pas pu démarrer (${reason}).` }
}
