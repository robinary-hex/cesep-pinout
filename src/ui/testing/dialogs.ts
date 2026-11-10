import { setDialogResponder, type DialogOptions } from '../dialogs'

/** Réponses programmées aux questions de l'application, et les questions posées. */
export interface DialogScript {
  /** Chaque question consomme la première réponse ; sans réponse, elle est annulée. */
  answers: unknown[]
  asked: DialogOptions<unknown>[]
}

/**
 * Tests : répond aux questions (`ask`) à la place de la boîte. À défaire après chaque test par
 * `setDialogResponder(null)`.
 */
export function scriptDialogs(): DialogScript {
  const script: DialogScript = { answers: [], asked: [] }
  setDialogResponder((options) => {
    script.asked.push(options)
    return script.answers.length > 0 ? script.answers.shift() : options.cancel
  })
  return script
}
