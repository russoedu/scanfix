# @scanmate/image-fix

Put a scanned page back on top of the page it came from.

You render page 1 of a PDF, you send the document out, and a photograph or a
flatbed scan of it comes back — turned a couple of degrees, at some other
resolution, cropped differently, under a shadow. Two questions are then almost
impossible to answer:

1. **Was any of the printed text changed?** OCR both and diff, in principle.
   In practice, an OCR engine reads a crooked page at a different scale as a
   different document: line grouping differs, so the diff is noise.
2. **Was the box at (x, y) signed?** That question is about a fixed rectangle,
   and a rectangle only means something once both images agree where (x, y) is.

This library answers the geometry so you can answer those. Give it the original
and the scan; it gives you the scan resampled onto the original's canvas, plus
the transform it used and how much it trusts it.

**Pure JavaScript. No native bindings.** OpenCV and `sharp` are both off the
table when the target is an Azure Function app: they compile per platform, so
the bytes that work on your laptop are not the bytes that run in the cloud, and
a deployment that skips the rebuild fails at *import* time — after the cold
start, in production. Everything here runs the same everywhere.

## Install

```sh
npm install @scanmate/image-fix
```

## Quick start

```ts
import { readFile } from 'node:fs/promises'
import { alignScan, compareRegions } from '@scanmate/image-fix'

const original = await readFile('contract.page1.png')   // rendered from the PDF
const scanned = await readFile('returned.jpg')          // what came back

const result = alignScan(original, scanned)

console.log(result.confidence)                // 0.96
console.log(result.transform.rotationDeg)     // -2.68
console.log(result.transform.scaleX)          // 1.449

// result.raster is on the original's canvas, so PDF coordinates still hold.
const [signature] = compareRegions(original, result.raster, [
  { id: 'signature', rect: { x: 76, y: 905, width: 420, height: 78 } },
])

console.log(signature.filled)   // true
console.log(signature.added)    // 0.056 - 5.6% of the box is ink that is not in the original
```

`result.image` is the aligned page as PNG bytes, ready to hand to an OCR
engine. `result.raster` is the same thing undecoded, if your OCR engine takes
raw RGBA.

## How it works

```text
  decode ─► ink ─► coarse guess ─► rough warp ─► ORB features ─► RANSAC ─► warp
                   scale + skew                  + matching      + model
```

> What follows is the reasoning. For the full algorithm - the formulae, every
> constant, the coordinate-frame algebra and the measured error - see
> [`documentation/fix.md`](../../documentation/fix.md).

### 1. Ink, not greyscale

A scan differs from its source in ways that have nothing to do with geometry:
the lamp is brighter in the middle, the phone cast a shadow down one side, the
JPEG quantiser smeared the strokes. So nothing downstream looks at greyscale.
It looks at **ink**: greyscale divided by its own slowly varying background,
then inverted. Near zero on paper, near one on print, whatever the lighting did.

Division, not subtraction, because illumination is multiplicative — a shadow
halves what reaches the sensor, it does not subtract a constant. Think of it as
reading the page through tracing paper: you lose the tint of the paper and the
angle of the lamp, and you keep the writing.

### 2. A coarse guess, because descriptors are not scale invariant

Binary descriptors compare pixels at fixed offsets, so a corner at 300 dpi and
the same corner at 150 dpi produce two unrelated bit strings. Something has to
establish roughly how big the scan is before matching can work, and nothing in
a JPEG header says.

So the library guesses three ways and lets the pixels judge:

| strategy | assumption | when it wins |
| --- | --- | --- |
| `frame` | the scan is the whole page, so the frames correspond | edge-to-edge scans |
| `content` | the *printing* corresponds | scans with different margins |
| `deskew` | measure each page's own skew, then match the printing straight | usually |

Skew is measured by rotating until the rows of text stack up: at the right
angle every line falls into one bin of the projection histogram and the profile
is a comb of tall spikes; a degree off and each line smears across several.

Each guess gets a phase-correlation nudge for leftover translation, and all of
them are warped and scored on ink correlation. Guessing several times and
measuring beats one clever guess, and at 512 px each attempt is nearly free.

### 3. Features, on the *corrected* scan

FAST corners, oriented by the intensity centroid of their patch, described by
256 steered BRIEF bits — an ORB, written out, because the native one is
unavailable here.

Running this *after* the coarse warp is what makes it work. The two images are
now at the same scale and nearly the same angle, so a fixed-offset descriptor
describes the same thing on both, and any correspondence that jumps across the
page can be thrown out on sight. RANSAC then recovers only the small residual,
which is composed onto the coarse transform.

RANSAC is not optional. A page of text is full of things that genuinely look
identical — every lowercase "e", every corner of every table cell — so matching
produces a lot of confident nonsense, and least squares over all of it is
dragged wherever the wrong matches point. RANSAC ignores the average: it fits
the smallest sample that determines a transform and counts how many of the rest
agree. Measured on the test suite, it recovers the right answer with 60% of the
matches wrong.

If the feature stage comes up short — a near-blank form has few corners — the
coarse estimate is returned alone and `result.method` says `'coarse'`.

### 4. The warp

Inverse mapping: walk each output pixel and reach back into the scan, rather
than pushing scan pixels forward, which leaves the output full of pinholes
wherever the transform stretches, like spray-painting through a rotated
stencil. Minification pre-filters first, so shrinking a 300 dpi scan averages
the strokes instead of beating against them into moiré.

## Choosing a model

The `model` option is a bet about what the scan physically went through. Fewer
degrees of freedom is harder to fool; more is more expressive.

| model | DOF | use when |
| --- | --- | --- |
| `similarity` (default) | 4 | a flatbed or sheet-fed scan. The page is flat, so it can only be turned, resized and moved. |
| `affine` | 6 | one axis is stretched — a feed roller slipping. |
| `homography` | 8 | a photograph taken off-axis, where the far edge of the page really is smaller than the near one. |

Use the simplest one the physical situation allows. A homography fitted to a
flatbed scan has four extra parameters to spend on fitting noise.

## API

### `alignScan(original, scanned, options?): AlignResult`

Synchronous, deliberately. All of it is CPU-bound with no I/O to wait on; an
`async` signature would imply the event loop is free during the call, and it is
not. To align several pages at once, put it in a worker thread.

Inputs are PNG or JPEG bytes (`Buffer`, `Uint8Array`, `ArrayBuffer`) or an
already-decoded `Raster`, so you can decode once and align one page against
several scans.

```ts
interface AlignResult {
  raster: Raster          // the scan, on the original's canvas
  image: Uint8Array | null // encoded per options.output
  matrix: Matrix3         // original coordinates -> scanned coordinates
  inverse: Matrix3        // scanned -> original
  transform: TransformSummary   // scale, rotation, shear, translation
  confidence: number      // 0..1, from ink correlation after warping
  method: 'features' | 'coarse'
  diagnostics: AlignDiagnostics
}
```

`confidence` measures agreement in the *output*, not confidence in the process.
Above ~0.6 is a solid match on a printed page; below ~0.3, treat the alignment
as failed and do not trust any region report built on it.

Useful options (all optional):

| option | default | what it does |
| --- | --- | --- |
| `model` | `'similarity'` | see above |
| `workingSize` | `1400` | longest side for feature detection. Bigger is more precise and quadratically slower |
| `coarseSize` | `512` | longest side for the coarse guess |
| `maxFeatures` | `1200` | keypoint budget per image |
| `ransacThreshold` | `3` | inlier radius, in working-resolution pixels |
| `minInliers` | `12` | below this the feature stage is not trusted |
| `maxSkewDeg` | `12` | largest per-page skew considered |
| `interpolation` | `'bilinear'` | or `'bicubic'` (sharper strokes when upscaling), `'nearest'` |
| `background` | white | RGBA fill where the scan does not cover the canvas |
| `output` | `'png'` | `'jpeg'` or `'none'`. Encoding is most of the cost on a big page |
| `seed` | fixed | seeds RANSAC and the descriptor pattern, so the same bytes give the same matrix |

### `compareRegions(original, aligned, regions, options?): RegionReport[]`

Answers "was this box filled in?" as arithmetic: count the ink inside the
rectangle that is in the scan and not in the original.

```ts
const reports = compareRegions(original, result.raster, [
  { id: 'signature', rect: { x: 76, y: 905, width: 420, height: 78 } },
  { id: 'consent', rect: { x: 76, y: 800, width: 18, height: 18 }, threshold: 0.05 },
])
```

Rectangles are in the **original's** coordinates — which is the whole point of
aligning first. Passing a raw scan produces confident nonsense, so the function
refuses two images on different canvases outright.

The `tolerance` option (default 2 px) fattens the original's ink before
diffing. Alignment is good to about a pixel, never to zero, and printed text is
mostly edges, so without it a half-pixel shift lights up the outline of every
character as new ink — the way a proofreader ignores a letter sitting a hair
off the baseline. What it cannot absorb is a signature, which is ink where the
original has none.

`filled` is `added >= threshold` (default 2% of the region). `score` is `added`
as a multiple of that threshold, clamped to 1, if you want a number rather than
a boolean.

### `diffDocument(original, aligned, regions?, options?)`

Page-wide added/removed ink plus the same per-region detail, in one pass.
A useful pre-check before OCR: if `added` across the whole page is under ~2%,
nothing was written on it.

### `renderDiff(original, aligned, options?): Raster`

An RGBA overlay to look at with your own eyes. Red is ink the scan added, blue
is ink it lost, grey is ink both agree on. A correctly aligned signed form is
almost entirely grey with a red signature; a misaligned one is red and blue
confetti along every stroke — the fastest way to tell those two failures apart.

### Building blocks

The stages are exported individually, for pipelines that need to stop part way:
`decodeImage`, `encodeImage`, `toGrayscale`, `inkMap`, `binarize`, `dilate`,
`estimateSkew`, `contentExtent`, `estimateCoarse`, `detectAndDescribe`,
`matchFeatures`, `fitSimilarity` / `fitAffine` / `fitHomography`, `ransac`,
`phaseCorrelate`, `warpRaster`, `warpGray`, and the `Matrix3` helpers.

### Test fixtures

`createSyntheticDocument`, `simulateScan`, `drawSignature` and `drawTick`
generate a printed form and a realistically bad scan of it, with the ground
truth matrix returned alongside. They are exported rather than kept in the test
folder because the same trick smoke-tests a deployment without shipping sample
scans:

```ts
import { alignScan, createSyntheticDocument, simulateScan } from '@scanmate/image-fix'

const page = createSyntheticDocument()
const scan = simulateScan(page.raster, { rotationDeg: -2.7, scale: 1.45, noise: 0.02 })
const result = alignScan(page.raster, scan.raster, { output: 'none' })

// result.matrix should agree with scan.matrix to about a pixel.
```

## Limits

- **One page at a time.** It aligns a scan to a page, not a multi-page PDF to a
  multi-page scan. Split them first.
- **The page must be recognisably the same page.** It is registration, not
  retrieval: it will happily align the wrong document badly and tell you so
  through a low `confidence`. Check that number.
- **Flat pages only.** A creased or curled page needs a non-rigid warp;
  `homography` will get the plane right and leave the curl.
- **Not scale-free.** `maxScaleRatio` (default 6) bounds how far apart the two
  resolutions may be. Beyond that, resample first.
- **Blank pages degrade gracefully, not magically.** With almost no printing
  there is nothing to register on; you get `method: 'coarse'` and a low
  confidence, which is the honest answer.

## Performance

Single-threaded, on one core: a 850x1100 original against a 1400x1800 scan runs
in roughly 1.6 s, of which the feature stage is about half. Lower `workingSize`
to trade accuracy for speed; set `output: 'none'` if you are going to hand
`raster` straight to something else, since PNG encoding a big page is a
substantial share of the total.

Memory peaks at a few copies of the largest image. Nothing here streams, so a
100 megapixel scan will hurt.

## Licence

MIT
