/**
 * Launch-argument parsing for the main process: which `.mebo` file, if any,
 * a launch carries. Pure (no Electron import) so it runs under vitest.
 *
 * Windows passes the double-clicked file as an argument to the registered
 * command (`"Mebo 3D.exe" "%1"`); the same shape reaches `second-instance`
 * when the app is already running. In development the argument list is
 * `electron.exe <app path> …`, and Chromium may add `--flags` in both cases.
 */

/** The project file extension as main knows it (the core's `PROJECT_FILE_EXTENSION` is the domain's). */
export const PROJECT_EXTENSION = 'mebo'

/**
 * The first argument after the executable that names a `.mebo` file
 * (case-insensitive), skipping anything that starts with `-`. Returns the
 * argument as given (relative paths are the caller's to resolve against the
 * launch's working directory), or null when the launch carries no project.
 */
export function projectPathFromArgv(argv: readonly string[]): string | null {
  const suffix = `.${PROJECT_EXTENSION}`
  for (const argument of argv.slice(1)) {
    if (!argument.startsWith('-') && argument.toLowerCase().endsWith(suffix)) {
      return argument
    }
  }
  return null
}
