// La mise à jour automatique lance l'installeur avec les droits d'administrateur.
//
// Sans eux, l'installation s'arrête en route dès que Pinout est installé dans un dossier que le
// compte ne peut pas écrire (installation pour tous les utilisateurs, dossier choisi hors du
// profil). electron-updater sait demander ces droits : quand le fichier latest.yml de la release
// porte `isAdminRightsRequired: true`, l'application installée lance l'installeur par
// elevate.exe, et Windows pose sa question. electron-builder n'écrit ce drapeau que pour un
// installeur « perMachine », ce que celui de Pinout n'est pas (on y choisit encore « pour moi »
// ou « pour tous »). Ce script le pose donc après le build : dernière étape de `pnpm build:win`.
//
//   node scripts/admin-update.mjs [chemin de latest.yml]
//
// C'est le fichier de la release qui décide, pas l'application installée : les versions déjà
// installées en profitent dès la release suivante. Sans dépendance : latest.yml est court et
// toujours écrit de la même façon ; un fichier inattendu arrête le build, plutôt que de publier
// une mise à jour qui échouerait.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FLAG = 'isAdminRightsRequired: true'

/**
 * Le contenu de latest.yml, le drapeau posé sur son premier fichier (l'installeur) :
 *
 *   files:
 *     - url: pinout-1.5.0-setup.exe
 *       sha512: …
 *       size: 124545493
 *       isAdminRightsRequired: true
 */
function withAdminRights(text) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(/\r?\n/)
  const list = lines.findIndex((line) => /^files:\s*$/.test(line))
  const first = list + 1
  if (list < 0 || !/^ {2}- url: \S+\.exe\s*$/.test(lines[first] ?? '')) {
    throw new Error('liste « files » introuvable, ou son premier fichier n’est pas un installeur')
  }
  // Les autres champs du premier fichier : les lignes qui suivent, en retrait de quatre espaces.
  let end = first + 1
  while (end < lines.length && /^ {4}\S/.test(lines[end])) end++
  const fields = lines.slice(first + 1, end).map((line) => line.trim())
  if (fields.includes(FLAG)) return text
  if (fields.some((field) => field.startsWith('isAdminRightsRequired'))) {
    throw new Error('`isAdminRightsRequired` est déjà là, avec une autre valeur')
  }
  lines.splice(end, 0, `    ${FLAG}`)
  return lines.join(eol)
}

const file =
  process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'release', 'latest.yml')
try {
  const before = readFileSync(file, 'utf8')
  const after = withAdminRights(before)
  if (after === before) {
    console.log(`${file} : la mise à jour demande déjà les droits d’administrateur.`)
  } else {
    writeFileSync(file, after)
    console.log(`${file} : la mise à jour demandera les droits d’administrateur.`)
  }
} catch (error) {
  console.error(`${file} : ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
