const { join } = require('node:path')

const { withNx } = require('@nx/rollup/with-nx')

const { addDeclarationExtensions } = require('./tools/declaration-extensions.cjs')

const DIST = join(__dirname, 'dist')

module.exports = withNx(
  {
    main:       './src/index.ts',
    outputPath: './dist',
    tsConfig:   './tsconfig.lib.json',
    compiler:   'swc',
    format:     ['esm'],
    // Added by MoNecromanCI: without this rollup emits no .js.map at all, so
    // a breakpoint in a .ts file can never bind. Not published - see `files`.
    sourceMap:  true,
  },
  {
    // Added by MoNecromanCI. rollup hands sourcemapPathTransform an OS-NATIVE
    // path with one parent segment too many, so `sources` resolve to nothing
    // and no breakpoint can bind. Separators are normalised too: a sources
    // entry is URL-style, so a backslash is wrong on every platform.
    output: {
      sourcemapPathTransform: relativeSourcePath =>
        relativeSourcePath
          .replaceAll(String.fromCodePoint(92), '/')
          .replace(/^(\.\.\/)+/, '../'),
    },
    // withNx appends these to its own plugin list, so this runs last. The same
    // sweep also runs from `prepack` - see tools/declaration-extensions.cjs for
    // why it needs both.
    plugins: [
      {
        name: 'declaration-extensions',
        closeBundle () {
          addDeclarationExtensions(DIST)
        },
      },
    ],
  },
)
