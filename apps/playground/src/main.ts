import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import type { AlignResult } from '@scanmate/align'
import { alignScan } from '@scanmate/align'
import type { Region, RegionReport } from '@scanmate/diff'
import { compareRegions, renderDiff } from '@scanmate/diff'
import type { Raster, TransformModel } from '@scanmate/ink'
import {
  cloneRaster,
  createSyntheticDocument,
  decodeImage,
  drawSignature,
  drawTick,
  encodeImage,
  simulateScan,
} from '@scanmate/ink'

/**
 * A harness for looking at what `@scanmate/align` and `@scanmate/diff` actually did.
 *
 * Unit tests prove the matrix is right to a fraction of a pixel; they cannot
 * tell you that a scan of a real form came out legible. This writes the
 * alignment and the diff overlay to disk so you can open them.
 *
 * ```sh
 * npm run playground:start                      # synthetic form, end to end
 * npm run playground:start -- --original page.png --scanned returned.jpg \
 *   --region signature:76,905,420,78 --model homography
 * ```
 */

interface Options {
  original?: string
  scanned?:  string
  out:       string
  model:     TransformModel
  regions:   Region[]
  json:      boolean
}

async function main (): Promise<void> {
  const options = parseArguments(process.argv.slice(2))
  mkdirSync(options.out, { recursive: true })

  const inputs = options.original !== undefined && options.scanned !== undefined
    ? await loadPair(options.original, options.scanned)
    : await buildDemo(options.out)

  const regions = options.regions.length > 0 ? options.regions : inputs.regions

  const started = Date.now()
  const result = await alignScan(inputs.original, inputs.scanned, {
    model:  options.model,
    output: 'none',
  })
  const reports = await compareRegions(inputs.original, result.raster, regions)

  await write(options.out, 'aligned.png', result.raster)
  await write(options.out, 'diff.png', await renderDiff(inputs.original, result.raster))

  if (options.json) {
    console.log(JSON.stringify({ result: summarise(result), regions: reports }, null, 2))

    return
  }

  report(result, reports, options.out, Date.now() - started)
}

function report (result: AlignResult, regions: RegionReport[], out: string, elapsed: number): void {
  const { transform, diagnostics } = result

  console.log('')
  console.log('  alignment')
  console.log('  ─────────────────────────────────────────────')
  console.log(`  method            ${result.method} (coarse guess: ${diagnostics.coarseStrategy})`)
  const tried = diagnostics.attempts
    .map(a => `${a.model} ${a.confidence === null ? 'rejected' : a.confidence.toFixed(3)}`)
    .join(', ')
  console.log(`  model             ${diagnostics.selectedModel} (tried ${tried})`)
  console.log(`  confidence        ${bar(result.confidence)} ${result.confidence.toFixed(3)}`)
  console.log(`  ink overlap       ${bar(diagnostics.intersectionOverUnion)} ${diagnostics.intersectionOverUnion.toFixed(3)}`)
  console.log(`  rotation          ${transform.rotationDeg.toFixed(3)}°`)
  console.log(`  scale             ${transform.scaleX.toFixed(4)} x ${transform.scaleY.toFixed(4)}`)
  console.log(`  skew  original    ${diagnostics.skewDeg.original.toFixed(2)}°`)
  console.log(`  skew  scanned     ${diagnostics.skewDeg.scanned.toFixed(2)}°`)
  console.log(`  matches           ${diagnostics.inliers} inliers of ${diagnostics.matches} (${(diagnostics.inlierRatio * 100).toFixed(0)}%)`)
  console.log(`  reprojection      ${Number.isFinite(diagnostics.reprojectionError) ? `${diagnostics.reprojectionError.toFixed(2)} px` : 'n/a'}`)
  console.log(`  canvas            ${result.width} x ${result.height}`)
  console.log(`  elapsed           ${elapsed} ms`)

  if (regions.length > 0) {
    console.log('')
    console.log('  regions')
    console.log('  ─────────────────────────────────────────────')
    console.log(`  ${'id'.padEnd(14)}${'added'.padStart(9)}${'removed'.padStart(9)}${'filled'.padStart(9)}`)
    for (const region of regions)
      console.log(
        '  ' +
        region.id.padEnd(14) +
        percent(region.added) +
        percent(region.removed) +
        (region.filled ? 'yes' : 'no').padStart(9),
      )
  }

  console.log('')
  console.log(`  wrote ${resolve(out)}`)
  console.log('')
}

function percent (value: number): string {
  return `${(value * 100).toFixed(2).padStart(8)}%`
}

function bar (value: number): string {
  const filled = Math.max(0, Math.min(10, Math.round(value * 10)))

  return `${'█'.repeat(filled)}${'░'.repeat(10 - filled)}`
}

function summarise (result: AlignResult): Record<string, unknown> {
  return {
    method:      result.method,
    confidence:  result.confidence,
    matrix:      result.matrix,
    transform:   result.transform,
    diagnostics: result.diagnostics,
  }
}

/** A printed form, a filled-in copy of it, and a bad scan of that copy. */
async function buildDemo (out: string): Promise<{ original: Raster, scanned: Raster, regions: Region[] }> {
  const page = createSyntheticDocument({ width: 850, height: 1100 })

  const filled = cloneRaster(page.raster)
  drawSignature(filled, page.regions.signature, 5)
  drawTick(filled, page.regions['tick-1'])

  const scan = simulateScan(filled, {
    rotationDeg:  -2.7,
    scale:        1.45,
    translateX:   36,
    translateY:   -28,
    noise:        0.02,
    blur:         1,
    illumination: 0.35,
    canvas:       { width: 1400, height: 1800 },
    seed:         17,
  })

  await write(out, 'original.png', page.raster)
  await write(out, 'scanned.png', scan.raster)

  console.log('')
  console.log('  no --original/--scanned given, so running the built-in demo:')
  console.log('  a printed form, signed and ticked, then scanned crooked, too big,')
  console.log('  out of focus, under a shadow, with sensor noise.')

  return {
    original: page.raster,
    scanned:  scan.raster,
    regions:  Object.entries(page.regions).map(([id, rect]) => ({ id, rect })),
  }
}

async function loadPair (original: string, scanned: string): Promise<{ original: Raster, scanned: Raster, regions: Region[] }> {
  console.log('')
  console.log(`  original  ${basename(original)}`)
  console.log(`  scanned   ${basename(scanned)}`)

  return {
    // The codec identifies the format from the bytes, so the extension above is
    // only ever used for the label.
    original: await decodeImage(readFileSync(resolve(original))),
    scanned:  await decodeImage(readFileSync(resolve(scanned))),
    regions:  [],
  }
}

async function write (out: string, name: string, raster: Raster): Promise<void> {
  writeFileSync(resolve(out, name), await encodeImage(raster, { format: 'png' }))
}

/** Flags that consume the argument after them. Everything else is a switch. */
const VALUED = new Set(['--original', '--scanned', '--out', '--model', '--region'])

function parseArguments (argv: string[]): Options {
  const options: Options = {
    out:     'playground-output',
    model:   'similarity',
    regions: [],
    json:    false,
  }

  const queue = [...argv]
  while (queue.length > 0) {
    const flag = queue.shift() as string

    if (flag === '--json') {
      options.json = true
      continue
    }

    if (!VALUED.has(flag)) throw new Error(`unknown argument: ${flag}`)

    const value = queue.shift()
    if (value === undefined) throw new Error(`${flag} needs a value`)

    applyFlag(options, flag, value)
  }

  return options
}

function applyFlag (options: Options, flag: string, value: string): void {
  switch (flag) {
    case '--original': {
      options.original = value
      break
    }
    case '--scanned': {
      options.scanned = value
      break
    }
    case '--out': {
      options.out = value
      break
    }
    case '--model': {
      options.model = value as TransformModel
      break
    }
    default: {
      options.regions.push(parseRegion(value))
    }
  }
}

/** `id:x,y,width,height`, in the original's pixel coordinates. */
function parseRegion (spec: string): Region {
  const [id, box] = spec.split(':', 2)
  const numbers = (box ?? '').split(',').map(Number)

  if (id === undefined || numbers.length !== 4 || numbers.some(n => !Number.isFinite(n)))
    throw new Error(`expected --region id:x,y,width,height, got "${spec}"`)

  return { id, rect: { x: numbers[0], y: numbers[1], width: numbers[2], height: numbers[3] } }
}

/**
 * The entry point is a wrapper rather than a bare `await main()` because this app
 * builds to CJS, where top-level await is a build error. A rejection must not
 * become an unhandled one with exit code 0 either - the harness is how a change
 * gets eyeballed, so a failure has to be loud.
 */
async function start (): Promise<void> {
  try {
    await main()
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}

void start()
