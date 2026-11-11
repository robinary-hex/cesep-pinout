// Captures d'écran de l'application sans rien afficher : la version construite (`pnpm build`) tourne
// dans une fenêtre hors écran, un scénario y joue des gestes et prend des images PNG.
//
//   node scripts/appshot.cjs <scénario.cjs> <dossier de sortie>
//
// Le scénario est un module CommonJS qui exporte une fonction asynchrone ; elle reçoit les outils
// ci-dessous (`click`, `drag`, `key`, `js`, `fill`, `theme`, `shot`, `wait`…). Rien n'est lu ni
// écrit hors du dossier de sortie : le profil de l'application y est recréé à chaque lancement
// (`profile/`), son dossier de Pinout y est imposé (`profile/Pinout`) et les variables OneDrive
// sont retirées, donc ni la bibliothèque ni les paramètres de l'utilisateur ne sont touchés. La fenêtre hors écran n'a pas le focus du système : le texte
// d'un champ se pose avec `fill`, pas au clavier ; les raccourcis de l'application, eux, passent.
// Un chemin de fichier `.pinout` ou `.pinuml` ajouté à la fin est ouvert au lancement, comme un
// fichier double-cliqué.
const fs = require('node:fs')
const path = require('node:path')
const electron = require('electron')

if (typeof electron === 'string') {
  // Lancé par Node (ou par un Electron forcé en Node par ELECTRON_RUN_AS_NODE, que VS Code laisse
  // dans ses terminaux) : `electron` n'est que le chemin du programme. On s'y relance pour de bon.
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const { spawnSync } = require('node:child_process')
  const result = spawnSync(electron, [__filename, ...process.argv.slice(2)], {
    env,
    stdio: 'inherit',
    timeout: 240000
  })
  process.exit(result.status ?? 1)
}

const { app, BrowserWindow } = electron
const [scenarioArg, outArg] = process.argv.slice(2)
if (!scenarioArg || !outArg) {
  console.error('Usage : node scripts/appshot.cjs <scénario.cjs> <dossier de sortie>')
  process.exit(1)
}
const scenarioPath = path.resolve(scenarioArg)
const outDir = path.resolve(outArg)
const mainJs = path.join(__dirname, '..', 'out', 'main', 'main.js')
if (!fs.existsSync(mainJs)) {
  console.error('Application non construite : lancer `pnpm build` d’abord.')
  process.exit(1)
}

for (const name of Object.keys(process.env)) {
  if (/^onedrive/i.test(name)) delete process.env[name]
}
fs.mkdirSync(outDir, { recursive: true })
// Le profil repart de zéro à chaque lancement, sauf si APPSHOT_KEEP_PROFILE=1 : pour voir ce que
// l'application retrouve d'un lancement à l'autre.
if (process.env.APPSHOT_KEEP_PROFILE !== '1') {
  fs.rmSync(path.join(outDir, 'profile'), { recursive: true, force: true })
}
app.setPath('userData', path.join(outDir, 'profile'))
// Documents aussi : c'est là que l'application propose son dossier sans OneDrive.
app.setPath('documents', path.join(outDir, 'profile', 'Documents'))
// Le dossier de Pinout est imposé, dans le profil : pas de question au premier lancement. Avec
// APPSHOT_FIRST_RUN=1 il ne l'est pas, pour voir cette question.
if (process.env.APPSHOT_FIRST_RUN === '1') delete process.env.PINOUT_DATA_DIR
else process.env.PINOUT_DATA_DIR = path.join(outDir, 'profile', 'Pinout')

// La fenêtre de l'application devient une fenêtre hors écran : elle ne s'affiche jamais, mais la
// page se peint et se capture. Le processus principal reçoit ce `BrowserWindow` à la place du vrai.
class HiddenWindow extends BrowserWindow {
  constructor(options) {
    super({
      ...options,
      show: false,
      webPreferences: { ...options.webPreferences, offscreen: true }
    })
  }
  show() {}
}
const proxied = new Proxy(electron, {
  get: (target, prop) => (prop === 'BrowserWindow' ? HiddenWindow : target[prop])
})
const Module = require('node:module')
const realLoad = Module._load
Module._load = function (request, parent, ...rest) {
  if (request === 'electron' && parent && path.resolve(parent.filename) === mainJs) return proxied
  return realLoad.call(this, request, parent, ...rest)
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Outils donnés au scénario. Les coordonnées sont celles de la fenêtre (1400 × 860 au départ). */
function tools(win) {
  const wc = win.webContents
  /** Exécute du JavaScript dans la page et rend son résultat. */
  const js = (code) => wc.executeJavaScript(code, true)
  /** Appuie sur une touche (« f », « Enter », « Delete »…), avec des modificateurs (« control », « shift », « alt »). */
  const key = async (keyCode, modifiers = []) => {
    wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
    wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
    await wait(120)
  }
  const mouse = async (type, x, y, extra = {}) => {
    wc.sendInputEvent({ type, x, y, button: 'left', clickCount: 1, ...extra })
    await wait(60)
  }
  const click = async (x, y, extra = {}) => {
    await mouse('mouseMove', x, y)
    await mouse('mouseDown', x, y, extra)
    await mouse('mouseUp', x, y, extra)
    await wait(120)
  }
  const rightClick = (x, y) => click(x, y, { button: 'right' })
  const drag = async (x1, y1, x2, y2, extra = {}) => {
    // Bouton tenu pendant le trajet : sans lui, Chromium croit le bouton relâché et rend le
    // pointeur capturé dès qu'il sort de l'élément.
    const held = { ...extra, modifiers: [...(extra.modifiers ?? []), 'leftButtonDown'] }
    await mouse('mouseMove', x1, y1)
    await mouse('mouseDown', x1, y1, extra)
    await mouse('mouseMove', (x1 + x2) / 2, (y1 + y2) / 2, held)
    await mouse('mouseMove', x2, y2, held)
    await mouse('mouseUp', x2, y2, extra)
    await wait(150)
  }
  /** Écrit dans le champ que désigne le sélecteur CSS ; `enter` le valide par la touche Entrée. */
  const fill = (selector, value, enter = false) =>
    js(`(() => {
      const field = document.querySelector(${JSON.stringify(selector)})
      if (!field) return false
      field.value = ${JSON.stringify(value)}
      field.dispatchEvent(new Event('input', { bubbles: true }))
      field.dispatchEvent(new Event('change', { bubbles: true }))
      if (${JSON.stringify(enter)}) {
        field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      }
      return true
    })()`)
  /** Thème clair ou sombre, sans passer par les paramètres. */
  const theme = async (name) => {
    await js(`document.documentElement.dataset.theme = ${JSON.stringify(name)}`)
    await wait(250)
  }
  /** Capture la fenêtre dans `<dossier>/<nom>.png`. */
  const shot = async (name) => {
    const image = await wc.capturePage()
    fs.writeFileSync(path.join(outDir, `${name}.png`), image.toPNG())
  }
  return { win, wc, wait, js, key, mouse, click, rightClick, drag, fill, theme, shot }
}

setTimeout(() => {
  console.error('Scénario trop long : arrêt.')
  app.exit(2)
}, 180000)

app.on('browser-window-created', (_event, win) => {
  win.webContents.once('did-finish-load', async () => {
    let code = 0
    try {
      await wait(1500)
      win.webContents.focus()
      await require(scenarioPath)(tools(win))
    } catch (error) {
      console.error(error)
      code = 1
    }
    app.exit(code)
  })
})

require(mainJs)
