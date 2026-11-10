import { shallowRef } from 'vue'

// Questions posées à l'utilisateur dans une boîte de l'application (`DialogHost`), au lieu des
// boîtes de message de Windows : enregistrer avant de fermer, confirmer une suppression… Chaque
// question est une promesse, tenue par le bouton choisi.

/** Réponse à « Enregistrer les modifications ? ». */
export type SaveChoice = 'save' | 'discard' | 'cancel'

export interface DialogButton<T> {
  label: string
  value: T
  /** `primary` : le choix attendu, qu'Entrée actionne ; `danger` : un choix qui détruit. */
  kind?: 'primary' | 'danger'
}

export interface DialogOptions<T> {
  title: string
  message: string
  /** Précision sous le message, plus discrète ; ses retours à la ligne sont gardés. */
  detail?: string
  /** De gauche à droite ; le choix attendu se met à droite. */
  buttons: DialogButton<T>[]
  /** Réponse quand la boîte est fermée sans choisir (Échap, croix, clic à côté). */
  cancel: T
}

export interface PendingDialog extends DialogOptions<unknown> {
  id: number
  resolve: (value: unknown) => void
}

/** Questions en attente ; `DialogHost` montre la première. */
export const pendingDialogs = shallowRef<PendingDialog[]>([])

let nextId = 1
let responder: ((options: DialogOptions<unknown>) => unknown) | null = null

/** Tests : répond aux questions à la place de la boîte. null = retour à la boîte. */
export function setDialogResponder(
  next: ((options: DialogOptions<unknown>) => unknown) | null
): void {
  responder = next
}

/** Pose une question ; la promesse rend la valeur du bouton choisi. */
export function ask<T>(options: DialogOptions<T>): Promise<T> {
  if (responder) return Promise.resolve(responder(options as DialogOptions<unknown>) as T)
  return new Promise<T>((resolve) => {
    const pending: PendingDialog = {
      ...(options as DialogOptions<unknown>),
      id: nextId++,
      resolve: resolve as (value: unknown) => void
    }
    pendingDialogs.value = [...pendingDialogs.value, pending]
  })
}

/** Donne sa réponse à une question en attente (appelé par `DialogHost`). */
export function answerDialog(id: number, value: unknown): void {
  const pending = pendingDialogs.value.find((candidate) => candidate.id === id)
  if (!pending) return
  pendingDialogs.value = pendingDialogs.value.filter((candidate) => candidate.id !== id)
  pending.resolve(value)
}

const UNSAVED_DETAIL =
  'Sans enregistrement, tout ce qui a changé depuis la dernière sauvegarde sera perdu.'

const SAVE_BUTTONS: DialogButton<SaveChoice>[] = [
  { label: 'Annuler', value: 'cancel' },
  { label: 'Ne pas enregistrer', value: 'discard' },
  { label: 'Enregistrer', value: 'save', kind: 'primary' }
]

/** Document modifié qu'on ferme : Enregistrer, Ne pas enregistrer ou Annuler. */
export function askToSave(name: string): Promise<SaveChoice> {
  return ask({
    title: 'Enregistrer les modifications ?',
    message: `« ${name} » a des modifications qui ne sont pas enregistrées.`,
    detail: UNSAVED_DETAIL,
    buttons: SAVE_BUTTONS,
    cancel: 'cancel'
  })
}

/** Application qu'on quitte avec des documents modifiés. */
export function askToSaveBeforeQuit(): Promise<SaveChoice> {
  return ask({
    title: 'Enregistrer avant de quitter ?',
    message: 'Des modifications ne sont pas enregistrées.',
    detail: UNSAVED_DETAIL,
    buttons: SAVE_BUTTONS,
    cancel: 'cancel'
  })
}

/** Confirmation d'une action : vrai si elle est confirmée. `danger` pour ce qui détruit. */
export function confirmAction(options: {
  title: string
  message: string
  detail?: string
  confirm: string
  danger?: boolean
}): Promise<boolean> {
  return ask({
    title: options.title,
    message: options.message,
    ...(options.detail === undefined ? {} : { detail: options.detail }),
    buttons: [
      { label: 'Annuler', value: false },
      { label: options.confirm, value: true, kind: options.danger ? 'danger' : 'primary' }
    ],
    cancel: false
  })
}
