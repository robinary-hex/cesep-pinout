# Pinout

Éditeur personnel de petits schémas électroniques : des composants (dessinés ou importés en PNG)
posés sur une grille, reliés par des fils orthogonaux à coins arrondis, avec projets réouvrables
et export PNG ou SVG. Electron + Vue 3 + TypeScript, Windows.

## Développer

```sh
pnpm install
pnpm dev        # application avec rechargement à chaud
pnpm check      # typecheck + lint + tests
pnpm build      # bundles electron-vite dans out/
```

## Télécharger

Les exécutables Windows sont publiés sur GitHub : https://github.com/robinary-hex/cesep-pinout/releases/latest

- Installeur 1.1.0 : https://github.com/robinary-hex/cesep-pinout/releases/download/v1.1.0/pinout-1.1.0-setup.exe
- Portable 1.1.0 : https://github.com/robinary-hex/cesep-pinout/releases/download/v1.1.0/pinout-1.1.0-portable.exe

La bibliothèque de composants vit par défaut dans OneDrive, sous `(Cours)\Robotique\(Ressources)\Pinout\library`, résolu
sur chaque machine à partir de la racine OneDrive ; sans OneDrive, dans `%APPDATA%\Pinout\library`.

## Installer sur le PC et le portable

```sh
pnpm icon       # régénère build/icon.png si besoin
pnpm build:win  # installeur NSIS et exe portable dans release/
```

`release/pinout-<version>-setup.exe` installe l'application (dossier au choix, raccourci bureau) ;
`release/pinout-<version>-portable.exe` se lance sans installation. L'exécutable n'est pas signé :
au premier lancement, SmartScreen demande « Informations complémentaires » puis « Exécuter quand
même ». Les projets sont autonomes ; pour partager la bibliothèque de composants entre deux
machines, elle est déjà dans OneDrive ; un autre dossier se choisit dans Paramètres (un dossier
pris dans OneDrive est enregistré relativement à sa racine, donc valable sur l'autre machine).

Le plan de conception et les règles du projet sont dans `CLAUDE.md` et `ARCHITECTURE.md`.
