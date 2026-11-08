# Pinout

Éditeur personnel de petits schémas électroniques : des composants (dessinés ou importés en PNG)
posés sur une grille, reliés par des fils orthogonaux à coins arrondis, avec projets réouvrables
et export PNG. Electron + Vue 3 + TypeScript, Windows.

## Développer

```sh
pnpm install
pnpm dev        # application avec rechargement à chaud
pnpm check      # typecheck + lint + tests
pnpm build:win  # installeur NSIS et exe portable dans release/
```

Le plan de conception et les règles du projet sont dans `CLAUDE.md` et `ARCHITECTURE.md`.
