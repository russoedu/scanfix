![scanmate](./scanmate.svg)

# scanmate

Tools for checking what came back. A document goes out as a PDF; a scan or a
photograph of it comes back turned, rescaled and shadowed. These packages put
the two back on the same coordinates so you can ask whether anything changed
and whether anything was signed.

An [Nx](https://nx.dev) monorepo, created with
[`@mnci/cli`](https://www.npmjs.com/package/@mnci/cli).

## Packages

| package | what it is |
| --- | --- |
| [`@scanmate/image-fix`](packages/image-fix) |s a scan onto the page it came from, and reports which known regions gained ink. Pure JavaScript - no native bindings, so it deploys to an Azure Function app unchanged. |

| app | what it is |
| --- | --- |
| [`playground`](apps/playground) | A CLI for looking at what the library actually did: writes theed page and a diff overlay to disk. |

## Documentation

[`documentation/fix.md`](documentation/fix.md) explains the whole algorithm -
how the scan is registered onto the original, and how the library then decides
whether a known rectangle gained ink. Written to be reimplementable: every
constant quoted is the actual default, and each stage names the file that
implements it.

## Getting started

```sh
npm install
npm test              # every project
npm run image-fix:qa  # lint + test just the library
npm run playground:start
```

`playground:start` with no arguments runs a built-in demo: a printed form is
generated, signed and ticked, then scanned crooked, too big, out of focus,
under a shadow and with sensor noise. It aligns that back onto the blank form
and reports what it found.

```text
  alignment
  ─────────────────────────────────────────────
  method            features (coarse guess: deskew+phase)
  confidence        ██████████ 0.965
  ink overlap       █████████░ 0.873
  rotation          -2.679°
  scale             1.4489 x 1.4489
  matches           61 inliers of 136 (45%)
  reprojection      1.19 px
  elapsed           1645 ms

  regions
  ─────────────────────────────────────────────
  id                added  removed   filled
  tick-1           16.67%    0.00%      yes
  tick-2            0.00%    0.00%       no
  signature         5.62%    0.00%      yes
```

Point it at real files to check your own pages:

```sh
npm run playground:start -- \
  --original page1.png --scanned returned.jpg \
  --region signature:76,905,420,78 \
  --out ./out
```

It writes `aligned.png` and `diff.png`. In the diff, red is ink the scan added,
blue is ink it lost, grey is ink both agree on. A correct alignment of a signed
form is almost all grey with a red signature; a bad one is red and blue
confetti along every stroke.

---

# Working in this Nx workspace

## Generate a library

```sh
npx nx g @nx/js:lib packages/pkg1 --publishable --importPath=@my-org/pkg1
```

## Run tasks

To build the library use:

```sh
npx nx run pkg1:build
```

To run any task with Nx use:

```sh
npx nx run <project-name>:<target>
```

These targets are either [inferred automatically](https://nx.dev/docs/concepts/inferred-tasks?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) or defined in the `project.json` or `package.json` files.

[More about running tasks in the docs &raquo;](https://nx.dev/docs/features/run-tasks?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

## Versioning and releasing

To version and release the library use

```
npx nx release
```

Pass `--dry-run` to see what would happen without actually releasing the library.

[Learn more about Nx release &raquo;](https://nx.dev/docs/features/manage-releases?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

## Keep TypeScript project references up to date

Nx automatically updates TypeScript [project references](https://www.typescriptlang.org/docs/handbook/project-references.html) in `tsconfig.json` files to ensure they remain accurate based on your project dependencies (`import` or `require` statements). This sync is automatically done when running tasks such as `build` or `typecheck`, which require updated references to function correctly.

To manually trigger the process to sync the project graph dependencies information to the TypeScript project references, run the following command:

```sh
npx nx sync
```

You can enforce that the TypeScript project references are always in the correct state when running in CI by adding a step to your CI job configuration that runs the following command:

```sh
npx nx sync:check
```

[Learn more about nx sync](https://nx.dev/reference/nx-commands#sync)

## Nx Cloud

Nx Cloud ensures a [fast and scalable CI](https://nx.dev/nx-cloud?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) pipeline. It includes features such as:

- [Remote caching](https://nx.dev/docs/features/ci-features/remote-cache?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [Task distribution across multiple machines](https://nx.dev/docs/features/ci-features/distribute-task-execution?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [Automated e2e test splitting](https://nx.dev/docs/features/ci-features/split-e2e-tasks?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [Task flakiness detection and rerunning](https://nx.dev/docs/features/ci-features/flaky-tasks?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

### Set up CI (non-Github Actions CI)

**Note:** This is only required if your CI provider is not GitHub Actions.

Use the following command to configure a CI workflow for your workspace:

```sh
npx nx g ci-workflow
```

[Learn more about Nx on CI](https://nx.dev/docs/features/ci-features?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

## Install Nx Console

Nx Console is an editor extension that enriches your developer experience. It lets you run tasks, generate code, and improves code autocompletion in your IDE. It is available for VSCode and IntelliJ.

[Install Nx Console &raquo;](https://nx.dev/docs/getting-started/editor-setup?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

## 🔗 Learn More

- [Nx Documentation](https://nx.dev/docs)
- [Crafting Your Workspace Tutorial](https://nx.dev/docs/getting-started/tutorials/crafting-your-workspace)
- [Module Boundaries](https://nx.dev/docs/features/enforce-module-boundaries)
- [Releasing Packages](https://nx.dev/docs/features/manage-releases)
- [Nx Plugins](https://nx.dev/docs/concepts/nx-plugins)
- [Nx Cloud](https://nx.dev/nx-cloud)

## 💬 Community

Join the Nx community:

- [Discord](https://go.nx.dev/community)
- [X (Twitter)](https://twitter.com/nxdevtools)
- [LinkedIn](https://www.linkedin.com/company/nrwl)
- [YouTube](https://www.youtube.com/@nxdevtools)
- [Blog](https://nx.dev/blog)
