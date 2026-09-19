import mnci from '@mnci/eslint-config'

// WHAT IS IN HERE. Each line is one config block, by the `name` it carries.
//
//   mnci/ignores                  paths never linted (dist, coverage, .venv, …)
//   mnci/base                     JS/TS correctness — @eslint/js, eslint-plugin-unicorn,
//                                 -promise, -n, -unused-imports
//   typescript-eslint/*           typescript-eslint's own recommended blocks
//   mnci/typescript*              TS rules on top of them, no type information needed
//   mnci/type-aware*              the rules that DO read types (no-floating-promises and
//                                 friends), scoped to {apps,libs,packages}/*/src
//   mnci/import-graph             import cycles — eslint-plugin-import-x
//   mnci/react                    JSX/TSX — @eslint-react/eslint-plugin,
//                                 eslint-plugin-react-hooks, -react-refresh, -jsx-a11y
//   mnci/regexp*                  regex correctness — eslint-plugin-regexp
//   mnci/json  mnci/jsonc  mnci/json5
//                                 eslint-plugin-jsonc — comments are allowed in .jsonc
//                                 and tsconfig.json, forbidden in plain .json
//   mnci/yaml*                    eslint-plugin-yml — your CI pipeline files
//   mnci/toml/base*               eslint-plugin-toml, PARSER ONLY: a malformed
//                                 pyproject.toml is a syntax error, nothing is styled
//   mnci/markdown                 @eslint/markdown
//   mnci/css                      @eslint/css
//   mnci/html                     @html-eslint/eslint-plugin
//   mnci/tests                    *.spec/*.test relaxations — eslint-plugin-jest
//                                 (Vitest's globals too; the two stacks share them)
//   mnci/nx-dependency-checks     @nx/eslint-plugin, on publishable packages' manifests
//   mnci/standard                 JavaScript Standard Style as ESLint rules — the
//                                 whole formatting opinion, a faithful port of
//                                 neostandard
//   mnci/house-style              the deliberate departures from Standard:
//                                 trailing commas, aligned object values,
//                                 consistent-as-needed quote-props, a blank line
//                                 before return. Composed LAST, on purpose:
//                                 nothing may follow that disables it.
//
// To list them as ESLint actually resolves them:  npx eslint --inspect-config
//
// TO OVERRIDE a rule, append a block AFTER the spread — later blocks win, so one
// of your own beats anything above it. Give it a name, so the inspector shows
// where the change came from:
//
//   export default [
//     ...mnci({ workspaceRoot: import.meta.dirname }),
//     {
//       name: 'local/legacy-app-allows-any',
//       files: ['apps/legacy/**/*.ts'],
//       rules: { '@typescript-eslint/no-explicit-any': 'off' }
//     }
//   ]
//
// Do NOT edit @mnci/eslint-config inside node_modules, and do not fork it: it is
// a dependency, so `npm update` brings rule fixes in the way it brings any
// other. An override here survives that; an edit to the package does not.
//
// FORMATTING IS LINTING HERE. There is no Prettier, no oxfmt and no
// `format:check` — `npm run lint` reports indentation, quotes and spacing as
// ordinary errors, and `npm run format` is `eslint . --fix`. So do not add a
// formatter: whichever one you pick will disagree with the `mnci/standard`
// block above, and because a formatter runs on save it wins silently, leaving
// `lint` to fail on files you never edited by hand.
//
// That also applies to the editor. Installing a Prettier or oxfmt extension is
// enough on its own — neither needs a config file, and with none present they
// format against their own defaults (semicolons, double quotes), which is the
// inverse of Standard.
export default [
  ...mnci({ workspaceRoot: import.meta.dirname }),
  {
    name:  'local/image-kernels',
    files: ['packages/{ink,align,diff,extract,enhance,merge,image-fix}/src/**/*.ts'],
    rules: {
      // Every pixel loop in this package is a nested loop, and the cheapest way
      // to skip a pixel is `continue`. The rule wants the inner loop extracted
      // into its own function, which for a per-pixel body means a call per
      // pixel - millions per page - in exchange for readability this code does
      // not gain: `for y { for x { if (blank) continue } }` is the idiom, not a
      // control-flow tangle. Scoped to the packages that own pixel kernels.
      'unicorn/no-break-in-nested-loop': 'off',
    },
  },
  {
    name:  'local/compiler-lib-parity',
    files: ['**/*.{ts,mts,cts}'],
    rules: {
      // The rule rewrites `for await` accumulation into Array.fromAsync, which
      // Node 24 has but TypeScript 6 only declares in the `esnext` lib - and a
      // published package should not compile against unfinished proposals. With
      // `lib: es2024` the fixed code fails typecheck, so the fixer and the
      // compiler cannot both be satisfied. Revisit when TypeScript ships
      // Array.fromAsync in a finished ES lib.
      'unicorn/prefer-array-from-async':  'off',
      // Same collision one step on: Iterator#toArray is ES2025, beyond the
      // es2024 lib, so `[...map.values()]` stays until the lib catches up.
      'unicorn/prefer-iterator-to-array': 'off',
    },
  },
  {
    // Vitest writes these beside a config while it resolves it, then deletes
    // them. Linting one is a race, and it is never source.
    name:    'local/vitest-scratch-files',
    ignores: ['**/vitest.config.*.timestamp*'],
  },
  {
    // @scanmate/ocr reads its English model from @tesseract.js-data/eng with
    // require.resolve at run time, which the rule cannot see - so it calls the
    // package unused, and --fix deletes it, leaving every install without
    // language data. The options repeat mnci's, because a rule's options are
    // replaced, not merged.
    name:  'local/ocr-language-data',
    files: ['packages/ocr/package.json'],
    rules: {
      '@nx/dependency-checks': ['error', {
        ignoredDependencies: ['@tesseract.js-data/eng'],
        ignoredFiles:        [
          '{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}',
          '{projectRoot}/rollup.config.{js,ts,mjs,mts,cjs,cts}',
          '{projectRoot}/tsup.config.{js,ts,mjs,mts,cjs,cts}',
          '{projectRoot}/vite.config.{js,ts,mjs,mts,cjs,cts}',
          '{projectRoot}/vitest.config.{js,ts,mjs,mts,cjs,cts}',
          '{projectRoot}/jest.config.{js,ts,mjs,mts,cjs,cts}',
          '{projectRoot}/**/*.spec.{js,ts,jsx,tsx}',
          '{projectRoot}/**/*.test.{js,ts,jsx,tsx}',
        ],
      }],
    },
  },
]
