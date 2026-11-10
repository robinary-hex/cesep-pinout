// Préparation commune des tests (voir `setupFiles` de vitest.config.mts).
//
// Vue ignore un événement daté, à la milliseconde, du moment où l'écouteur qui le reçoit a été
// posé : c'est sa parade à un vrai cas de navigateur (un écouteur ajouté pendant la propagation).
// Dans un test, monter un composant et cliquer tiennent souvent dans la même milliseconde : le
// clic se perdait alors de temps en temps, et le test échouait une fois sur quelques-unes. Chaque
// événement envoyé par un test est donc daté d'avance, bien après tout écouteur.

if (typeof window !== 'undefined') {
  const prototype = window.EventTarget.prototype
  const dispatch = prototype.dispatchEvent
  prototype.dispatchEvent = function (this: EventTarget, event: Event): boolean {
    const stamped = event as Event & { _vts?: number }
    stamped._vts ??= Number.MAX_SAFE_INTEGER
    return dispatch.call(this, event)
  }
}
