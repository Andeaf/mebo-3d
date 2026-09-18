# Mebo 3D

Internal desktop app (Electron + React + Three.js) for a custom furniture
maker: a 3D configurator for cabinet modules with a live material price.
The user manual (Dutch) is [HANDLEIDING.md](HANDLEIDING.md); the design and
architecture notes for contributors are in [CLAUDE.md](CLAUDE.md).

## Commands

| Command | Purpose |
| --- | --- |
| `npm install` | Install dependencies (downloads Electron) |
| `npm run dev` | Start the app with hot reload |
| `npm test` | Unit tests (vitest) |
| `npm run build` | Typecheck + production build to `out/` |
| `npm run dist` | Build + Windows installer → `release/Mebo-3D-Setup-<version>.exe` |
| `npm run icon` | Regenerate the placeholder `build/icon.ico` |

## Installer

`npm run dist` produces an NSIS installer for Windows x64 (`release/`,
gitignored): per-user install under `%LOCALAPPDATA%\Programs\Mebo 3D`, no
admin rights, desktop and Start-menu shortcuts, `.mebo` file association.
The version comes from `package.json`.

**Not code-signed.** Windows SmartScreen shows "Windows protected your PC /
Unknown publisher" on a downloaded copy; the user clicks *More info → Run
anyway*. Signing is a later step and changes nothing else in the build.

The price database ships beside the app, not inside it:
`<install dir>\resources\data\materials.json`. Editing it and restarting the
app changes the prices; a reinstall replaces it with the copy from the
installer.
