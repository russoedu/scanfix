/**
 * Give every relative specifier in the emitted .d.ts files an explicit extension.
 *
 * ## Why this exists
 *
 * Without it the package is typeless to anyone on `moduleResolution: nodenext`,
 * which is the modern default. @nx/rollup writes the declaration entry point as
 * a one-line stub:
 *
 *     export * from "./src/index";
 *
 * In ESM mode nodenext will not resolve an extensionless relative path, so it
 * finds nothing to re-export and every named import fails with "Module
 * '@scanmate/image-fix' has no exported member". `skipLibCheck` does not save
 * you: the failure is resolving the entry point, not type-checking a lib file.
 * Verified against a packed tarball - before this sweep a nodenext consumer saw
 * zero exports with skipLibCheck both on and off.
 *
 * The same applies one level down, in the real declarations, where an
 * extensionless re-export raises TS2834 for any consumer that has not turned
 * skipLibCheck on.
 *
 * ## Why it runs twice
 *
 * `build` (rollup) and `typecheck` (tsc) both emit declarations into `dist`, so
 * whichever ran last decides what `dist/index.d.ts` contains - and they produce
 * different shapes. Hooking only the rollup build would leave the broken form
 * on disk after any `nx run-many -t typecheck,build`. So this runs from
 * rollup's closeBundle *and* from `prepack`, which npm runs immediately before
 * `npm pack` and `npm publish`. The pack-time pass is the one that actually
 * guarantees what ships.
 *
 * It only ever edits build output, never sources, and it is idempotent.
 *
 * Writing `.js` extensions in the TypeScript sources instead would be tidier,
 * but rollup's own resolution would then have to map `./lib/align.js` back onto
 * `align.ts` - a much larger thing to get wrong.
 *
 * This repairs something @nx/rollup emits, so it belongs in mnci's upgrade
 * sweep next to the source-map fix. It lives here because a workspace generated
 * before that sweep exists would never fix itself otherwise.
 */

const { existsSync, readdirSync, readFileSync, statSync, writeFileSync } = require('node:fs')
const { dirname, join } = require('node:path')

/** `from './x'` and `import('./x')`. Relative only - a bare package name must never gain an extension. */
const RELATIVE_SPECIFIER = /(\bfrom\s*|\bimport\s*\(\s*)(['"])(\.{1,2}\/[^'"]*)\2/g
const ALREADY_EXPLICIT = /\.(?:js|mjs|cjs|json|node)$/

function addDeclarationExtensions (outputDir) {
  if (!existsSync(outputDir)) return 0

  let changed = 0
  for (const file of declarationFiles(outputDir)) if (addExtensions(file)) changed++

  return changed
}

function * declarationFiles (directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) yield * declarationFiles(path)
    else if (entry.endsWith('.d.ts')) yield path
  }
}

function addExtensions (file) {
  const source = readFileSync(file, 'utf8')
  const updated = source.replaceAll(RELATIVE_SPECIFIER, (match, lead, quote, specifier) => {
    if (ALREADY_EXPLICIT.test(specifier)) return match
    const resolved = resolveSpecifier(dirname(file), specifier)

    return resolved === null ? match : `${lead}${quote}${resolved}${quote}`
  })

  if (updated === source) return false
  writeFileSync(file, updated)

  return true
}

/** Only rewrite a specifier we can prove points at an emitted declaration. */
function resolveSpecifier (from, specifier) {
  if (existsSync(join(from, `${specifier}.d.ts`))) return `${specifier}.js`
  if (existsSync(join(from, specifier, 'index.d.ts'))) return `${specifier}/index.js`

  return null
}

module.exports = { addDeclarationExtensions }

if (require.main === module) {
  const changed = addDeclarationExtensions(join(__dirname, '..', 'dist'))
  console.log(`declaration-extensions: rewrote ${changed} file(s)`)
}
