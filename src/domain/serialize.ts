import { componentDefinitionSchema, type ComponentDefinition } from './component'
import { diagramSchema, type Diagram } from './diagram'
import {
  componentMigrations,
  diagramMigrations,
  FileFormatError,
  migrateRaw,
  projectMigrations,
  settingsMigrations,
  type MigrationTable
} from './migrations'
import { projectSchema, type Project } from './project'
import { settingsSchema, type Settings } from './settings'

interface IssueLike {
  path: ReadonlyArray<PropertyKey>
  message: string
}

interface SchemaLike<T> {
  safeParse(
    data: unknown
  ): { success: true; data: T } | { success: false; error: { issues: ReadonlyArray<IssueLike> } }
}

function formatIssues(issues: ReadonlyArray<IssueLike>): string[] {
  return issues.map((issue) => {
    const path = issue.path.map(String).join('.')
    return path.length > 0 ? `${path} : ${issue.message}` : issue.message
  })
}

function parseJson(text: string, what: string): unknown {
  try {
    return JSON.parse(text)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new FileFormatError(`${what} : JSON invalide (${reason})`)
  }
}

function parseDocument<T>(
  text: string,
  schema: SchemaLike<T>,
  table: MigrationTable,
  what: string
): T {
  const raw = migrateRaw(parseJson(text, what), table, what)
  const result = schema.safeParse(raw)
  if (!result.success) {
    throw new FileFormatError(`${what} invalide`, formatIssues(result.error.issues))
  }
  return result.data
}

/** Forme canonique des fichiers : JSON indenté de deux espaces, saut de ligne final. */
function serialize(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n'
}

export function parseProject(text: string): Project {
  return parseDocument(text, projectSchema, projectMigrations, 'Projet')
}

export function serializeProject(project: Project): string {
  return serialize(project)
}

export function parseComponentDefinition(text: string): ComponentDefinition {
  return parseDocument(text, componentDefinitionSchema, componentMigrations, 'Composant')
}

export function serializeComponentDefinition(def: ComponentDefinition): string {
  return serialize(def)
}

export function parseDiagram(text: string): Diagram {
  return parseDocument(text, diagramSchema, diagramMigrations, 'Diagramme')
}

export function serializeDiagram(diagram: Diagram): string {
  return serialize(diagram)
}

export function parseSettings(text: string): Settings {
  return parseDocument(text, settingsSchema, settingsMigrations, 'Paramètres')
}

export function serializeSettings(settings: Settings): string {
  return serialize(settings)
}
