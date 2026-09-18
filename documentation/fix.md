# How `@scanmate/image-fix` works

This document explains the whole algorithm: how a scanned page is put back on
top of the original it came from, and how the library then decides whether a
known rectangle on that page gained ink.

It is written to be reimplementable. Every constant quoted is the actual
default in the source, and the file that implements each stage is named at the
end of its section.

## Contents

- [The problem](#the-problem)
- [Conventions](#conventions)
- [Pipeline overview](#pipeline-overview)
- [Stage 1 — Decode](#stage-1--decode)
- [Stage 2 — Ink](#stage-2--ink)
- [Stage 3 — The coarse estimate](#stage-3--the-coarse-estimate)
- [Stage 4 — Features](#stage-4--features)
- [Stage 5 — Model fitting and RANSAC](#stage-5--model-fitting-and-ransac)
- [Stage 6 — The warp](#stage-6--the-warp)
- [Stage 7 — Confidence](#stage-7--confidence)
- [Region differencing](#region-differencing)
- [Coordinate frames, and the matrix algebra that keeps them straight](#coordinate-frames-and-the-matrix-algebra-that-keeps-them-straight)
- [Parameter reference](#parameter-reference)
- [Failure modes](#failure-modes)
- [Measured results](#measured-results)

## The problem

A document goes out as a PDF. A scan or a photograph of it comes back turned a
couple of degrees, at some other resolution, cropped differently, under a
shadow. Two questions then become almost impossible to answer:

1. **Was any of the printed text changed?** OCR both and diff, in principle.
   In practice an OCR engine reads a crooked page at a different scale as a
   different document — its line grouping differs, so the diff is noise.
2. **Was the box at `(x, y)` signed?** That is a question about a fixed
   rectangle, and a rectangle only means something once both images agree
   where `(x, y)` is.

Both reduce to one geometric problem: find the transform that maps the
original's coordinates onto the scan's, then resample the scan through it. That
is *image registration*, and it is all this library does. Everything else —
the OCR, the business rules about what counts as a signature — is the caller's.

### Why it is all written by hand

The deployment target is an Azure Function app, which rules out OpenCV and
`sharp`. Both are native bindings: they compile per platform, so the bytes that
work on a laptop are not the bytes that run in the cloud, and a deployment that
skips the rebuild fails at *import* time — after the cold start, in production,
with a stack trace about a missing `.node` file.

So the feature detector, the linear algebra and the FFT are implemented here in
plain TypeScript. Only the codecs are dependencies, and both are pure JS with
no dependencies of their own: `pngjs` and `jpeg-js`.

## Conventions

Three conventions are load-bearing. Getting any of them wrong produces an
answer that is subtly and consistently off.

**Coordinates are continuous, not indices.** The centre of pixel `(i, j)` is at
`(i + 0.5, j + 0.5)`. Pixel `i` spans `[i, i + 1)`. This is what makes scaling
a coordinate frame a plain multiplication rather than a multiplication plus a
half-pixel correction, and it is why keypoint integer indices are converted to
centres before any transform is fitted to them.

**Every matrix maps original coordinates to scanned coordinates.** Never the
reverse. That reads backwards the first time: the output is produced on the
original's canvas, so the warp walks the *output* pixel by pixel and asks
"where in the scan does this come from?".

**A 3x3 matrix is row-major**, in homogeneous coordinates:

```text
      [ m0  m1  m2 ]                    m0*x + m1*y + m2         m3*x + m4*y + m5
  M = [ m3  m4  m5 ]     x' = ---------------------- ,  y' = ----------------------
      [ m6  m7  m8 ]                    m6*x + m7*y + m8         m6*x + m7*y + m8
```

`m6` and `m7` are the perspective terms and are zero for everything but a
homography.

## Pipeline overview

```text
  original ─┐
            ├─► decode ─► grey ─► ink ─┐
  scanned  ─┘                          │
                                       ▼
                        ┌──────────────────────────────┐
                        │  STAGE 3  coarse estimate    │
                        │  skew, content box, phase    │  → C  (similarity, 4 DOF)
                        │  correlation; 3 candidates   │
                        │  scored on ink correlation   │
                        └──────────────┬───────────────┘
                                       │ warp the scan through C
                                       ▼
                        ┌──────────────────────────────┐
                        │  STAGE 4  features           │
                        │  FAST-9 + steered BRIEF,     │  → correspondences
                        │  Hamming match, 3 filters    │
                        └──────────────┬───────────────┘
                                       ▼
                        ┌──────────────────────────────┐
                        │  STAGE 5  RANSAC + refit     │  → R  (residual)
                        │  similarity | affine | homog │
                        └──────────────┬───────────────┘
                                       │  H = C · R
                                       ▼
                     STAGE 6  warp the scan onto the original's canvas
                                       │
                                       ▼
                     STAGE 7  confidence = ink correlation of the result
```

The two-stage structure is the central design decision, and the reason for it
is in [Stage 3](#stage-3--the-coarse-estimate).

## Stage 1 — Decode

PNG and JPEG are decoded to 8-bit RGBA. An already-decoded raster is passed
through untouched, which is what makes it cheap to align one page against
several scans: decode once, reuse.

Format is detected from magic bytes (`89 50 4E 47 0D 0A 1A 0A` for PNG,
`FF D8 FF` for JPEG), never from a file extension.

*Source: `src/lib/image/codec.ts`*

## Stage 2 — Ink

Nothing downstream of here looks at greyscale. It looks at **ink**.

A scan differs from its source in ways that have nothing to do with geometry:
the lamp is brighter in the middle, the phone cast a shadow down one side, the
JPEG quantiser smeared the strokes, the paper is cream rather than white.
Comparing raw greyscale means comparing all of that too.

### Luminance

Rec. 601, with any alpha composited over white first:

```text
  a    = A / 255
  R'   = R*a + 255*(1 - a)          (same for G', B')
  grey = (0.299*R' + 0.587*G' + 0.114*B') / 255
```

Compositing over white rather than black matters: a transparent region of a
PDF render is paper, not ink.

### Background division

The background is the greyscale blurred with a box window of radius

```text
  r = max(4, round(min(width, height) / 16))
```

computed in O(1) per pixel from a summed-area table, with border windows
clipped and divided by their true area so the blur never invents dark paper
outside the page.

The radius has to sit in a band. Too small and a bold heading becomes its own
background and vanishes; too large and the blur stops following a shadow.
A sixteenth of the shorter side is comfortably wider than any glyph on a page
of body text and still narrow enough to track illumination.

Then:

```text
  ink = 1 - min(1, grey / max(background, 1e-3))
```

**Division, not subtraction, and that is not a detail.** Illumination is
multiplicative: a shadow halves what reaches the sensor, it does not subtract a
constant. Dividing restores the same contrast inside the shadow as outside it.
Subtracting would leave the shadowed strokes systematically fainter, and every
correlation downstream would be biased by the lighting.

Think of it as reading the page through tracing paper. You lose the tint of the
paper and the angle of the lamp. You keep the writing.

### Noise floor

Paper is never perfectly uniform, so a small positive ink value is noise.
Values below `floor = 0.06` are zeroed and the rest is rescaled so the range is
continuous:

```text
  ink < floor  ->  0
  otherwise    ->  (ink - floor) / (1 - floor)
```

The result is near 0 on paper and near 1 on print, whatever the lighting did.

### Binarisation

Where a hard mask is needed — scoring, region differencing — the ink image is
thresholded at Otsu's threshold over a 256-bin histogram, **floored at 0.12**.

That floor exists because Otsu assumes a bimodal histogram. A genuinely blank
page has no split to find, and Otsu will happily cut its noise down the middle
and report that half the paper is ink.

*Source: `src/lib/image/gray.ts`*

## Stage 3 — The coarse estimate

### Why this stage exists at all

Binary descriptors compare pixels at *fixed* offsets. The same corner
photographed at 300 dpi and rendered at 150 dpi therefore produces two
unrelated bit strings — the descriptor is not scale invariant, and a pyramid
only buys a limited range.

So something has to establish roughly how big the scan is before matching can
work. Nothing in a JPEG header says. The dpi field, where it exists at all, is
routinely wrong.

The answer is to guess — three different ways — and let the pixels decide which
guess was right. At this stage both images are shrunk so the longer side is at
most **512 px**, which makes each attempt nearly free.

### Skew, from the sharpness of a projection profile

Each page's own skew is measured independently, by rotating it until the rows of
text stack up.

For a candidate angle `α`, every ink pixel is projected onto the axis
perpendicular to the text direction and accumulated into unit-wide bins:

```text
  v = -x*sin(α) + y*cos(α)          bin index = floor(v - v_min)
```

and the profile is scored by its sum of squares:

```text
  S(α) = Σ p[k]²
```

At the correct angle every line of type falls into one bin and the profile is a
comb of tall spikes. A degree off and each line smears across several bins.
Total ink is the same either way, so concentrating it into fewer bins is
exactly what sum-of-squares rewards.

The search is coarse to fine, which keeps the cost flat:

| pass | range | step |
| --- | --- | --- |
| 1 | ±12° | 1° |
| 2 | ±1° around the winner | 0.2° |
| 3 | ±0.2° around the winner | 0.04° |

### The content box

The block of ink on the page is the same physical object in both images, so the
ratio of its measured sizes is the ratio of the resolutions.

Ink is projected onto both rotated axes and each extent is trimmed by
**0.4% of the total ink from each end**, cumulatively. The trim is what stops a
scanner's black edge strip, or a speck of dust, from defining the page
boundary — and since this measurement becomes the scale estimate, a 2% error
here would be a 2% error in every coordinate downstream.

A blank page reports the whole frame and a density of zero, so the caller falls
back to fitting the frame instead of dividing by zero.

### The three candidates

Each candidate is a similarity transform — uniform scale `s`, rotation `θ`,
mapping a pivot onto a target:

```text
  M = T(target) · sR(θ) · T(-pivot)
```

| candidate | assumption | scale from | pivot / target | when it wins |
| --- | --- | --- | --- | --- |
| `frame` | the scan is the whole page | image dimensions | image centres | edge-to-edge scans |
| `content` | the *printing* corresponds | axis-aligned content boxes | content centres | scans with different margins |
| `deskew` | as above, measured straight | content boxes each in its own deskewed frame | content centres, `θ = α_scan - α_original` | usually |

The scale is the **geometric** mean of the two axis ratios:

```text
  s = sqrt( (w_scan / w_original) * (h_scan / h_original) )
```

Geometric because the quantity is a ratio: the mean of a ratio and its
reciprocal should be 1. The arithmetic mean of 2 and 0.5 is 1.25.

### Phase correlation, for whatever translation is left

Each candidate also gets a variant nudged by phase correlation, which recovers
a global translation from the Fourier shift theorem: shifting an image does not
change the magnitude of its spectrum, only the phase, and it changes the phase
in proportion to the shift.

The scan is warped through the candidate onto the original's frame, then both
are Hann-windowed, zero-padded to powers of two, and transformed. The
normalised cross-power spectrum

```text
  R = (B · conj(A)) / |B · conj(A)|
```

is inverse-transformed; the peak of the result sits at the residual shift `d`.
Magnitudes are divided out entirely, so every frequency contributes its phase
and nothing else. The peak is refined to roughly a tenth of a pixel by fitting
a parabola through it and its two neighbours on each axis:

```text
  offset = 0.5 * (left - right) / (left - 2*centre + right)
```

The Hann window is not optional: without it the FFT treats the frame edges as a
hard discontinuity repeating forever, and that cross in the spectrum can be a
stronger signal than the page.

A residual shift `d` means the original at `p` matches the warp at `p + d`, so
the corrected candidate is `M' = M · T(d)`.

Phase correlation earns its place because it does not care *what* is on the
page — it uses every pixel at once. That makes it the one estimator that still
works on a nearly blank form.

### Scoring

Every candidate and every nudged variant is warped onto the original's frame
and scored by zero-mean normalised cross correlation of the ink:

```text
             Σ (a - ā)(b - b̄)
  ZNCC = ------------------------
          sqrt( Σ(a - ā)² Σ(b - b̄)² )
```

A *correlation*, not a difference, because the scan is darker, or fainter, or
contrast-stretched by the scanner's firmware. A sum of absolute differences
would rank a badly aligned pale scan above a well aligned dark one. ZNCC is
invariant to both offset and gain: it only asks whether the ink rises and falls
in the same places.

Guessing several times and measuring beats one clever guess.

*Source: `src/lib/analysis/content.ts`, `src/lib/estimate/phaseCorrelation.ts`,
`src/lib/estimate/coarse.ts`, `src/lib/analysis/score.ts`,
`src/lib/math/fft.ts`*

## Stage 4 — Features

The scan is warped through the coarse transform `C` before anything here runs.
That ordering is what makes the stage work: the two images are now at the same
scale and nearly the same angle, so a fixed-offset descriptor describes the
same thing on both, and a correspondence that jumps across the page can be
rejected on sight. What the feature stage recovers is only the small residual.

Detection runs at a working resolution of at most **1400 px** on the longer
side.

This is an ORB, written out. Its three parts answer three separate questions.

### Where — FAST-9

A pixel is a corner when a contiguous arc of the 16 pixels on a Bresenham
circle of radius 3 around it is either all brighter than it by more than a
threshold, or all darker by the same margin. The arc length is 9 and the
threshold is **0.08** in ink units.

```text
        15  0  1
     14           2          ring index 0 is directly above the centre,
   13               3        indices run clockwise
   12       p       4
   11               5
      10          6
         9  8  7
```

On a page this fires on stroke ends, serifs, and the corners of rules and table
cells — landmarks that survive being rescanned.

**The high-speed rejection test, and a trap in it.** Before examining all 16,
only the four compass points (ring indices 0, 4, 8, 12) are read. Any run of
`ARC` consecutive ring pixels must contain at least `floor((ARC - 1) / 4)` of
them, so fewer than that cannot be a corner.

For `ARC = 9` that bound is **2**. The widely quoted version of this test
requires 3, which is correct only for FAST-12. Requiring 3 with a 9-pixel arc
silently discards real corners — among them the corner of a plain filled
rectangle, where the compass points split exactly two bright and two dark. This
library got that wrong initially and its own unit test caught it: the detector
found zero corners on a filled quadrant.

Surviving pixels get a score

```text
  score = max( Σ (I_k - I_p - t)  over the bright set,
               Σ (I_p - I_k - t)  over the dark set )
```

and are reduced to 3x3 local maxima.

### Which way up — the intensity centroid

A binary descriptor is only rotation invariant if the patch has an orientation
the ink itself defines. Over a circular patch of radius 15:

```text
  m10 = Σ dx * I(dx, dy)
  m01 = Σ dy * I(dx, dy)
  θ   = atan2(m01, m10)
```

On an *ink* image the mass is the writing, so the vector from the patch centre
to its centre of mass turns with the page. (This is why orientation is computed
on ink rather than greyscale: on greyscale the centroid is dominated by paper.)

### What it looks like — steered BRIEF

256 bits, each one the answer to "is this pixel darker than that one?":

```text
  bit_i = smoothed(p + a_i) < smoothed(p + b_i) ? 1 : 0
```

- The 256 offset pairs are drawn once from a Gaussian with `σ = patchSize / 5`
  (6.2 px for the default 31 px patch), rounded and clamped to ±15, from a
  seeded PRNG so the pattern is identical on every run and every machine.
- `smoothed` is the level image under a 5x5 box blur. This is **part of the
  descriptor, not preprocessing**: BRIEF compares single pixels and is
  otherwise exquisitely sensitive to noise.
- The pattern is rotated by the keypoint's orientation. Rotating 256 pairs per
  keypoint would mean a thousand trig calls each, so the angle is quantised
  into **32 bins** (11.25° each, finer than ORB's own 12°) and 32 integer
  patterns are precomputed. Steering becomes a table lookup.

A descriptor is stored as 8 x 32-bit words, which is what makes brute-force
matching affordable.

### Scale — the pyramid

Levels are generated by area-averaging, **3 levels** with a factor of **1.3**.
Keypoint coordinates are mapped back to level-0 coordinates, so matches across
levels are matches at a scale ratio — which is exactly the residual scale error
the coarse stage may have left.

Area-averaging rather than point-sampling matters here: point-sampling a 300 dpi
page to half size deletes roughly half the strokes, so the thumbnail the
matcher sees is not a smaller version of the page, it is a different page.

### Spreading the keypoints

Score alone concentrates every keypoint in the densest paragraph, and a
transform fitted to correspondences from one corner of the page extrapolates
badly to the other three. So the image is divided into an **8x8** grid, the
best few per cell are kept first, the budget is topped up from the strongest
leftovers, and the result is trimmed to **1200** keypoints per image.

### Matching

Brute force, and that is the right algorithm here rather than a concession:
about a thousand keypoints per side is a million 256-bit comparisons, which is
eight million XOR-and-popcount operations — milliseconds. An index would cost
more than it saves and return approximate neighbours.

Hamming distance is 8 XORs and 8 SWAR popcounts. Three filters then do the real
work:

| filter | default | why |
| --- | --- | --- |
| **ratio test** | best < 0.8 x second best | On a page of repeated letterforms the nearest neighbour is often meaningless, and the giveaway is that the second nearest is just as close. |
| **cross-check** | both sides must name each other | One-directional bests are not symmetric, and the asymmetric ones are usually wrong. |
| **displacement gate** | 0.12 x page diagonal | The images are already roughly aligned, so a correspondence that jumps a fifth of the page is not a correspondence. Also cuts the inner loop short before any Hamming distance is computed. |
| absolute distance | ≤ 96 of 256 bits | Floor on descriptor similarity. |

*Source: `src/lib/estimate/features.ts`, `src/lib/estimate/match.ts`*

## Stage 5 — Model fitting and RANSAC

### Choosing a model

The model is a bet about what the scan physically went through. Fewer degrees
of freedom is harder to fool; more is more expressive.

| model | DOF | minimal sample | physically |
| --- | --- | --- | --- |
| `similarity` (default) | 4 | 2 | A flatbed or sheet-fed scan. The page is flat, so it can only be turned, resized and moved. |
| `affine` | 6 | 3 | One axis stretched — a feed roller slipping. |
| `homography` | 8 | 4 | A photograph taken off-axis, where the far edge of the page really is smaller than the near one. |

Use the simplest one the situation allows. A homography fitted to a flatbed
scan has four extra parameters to spend on fitting noise.

### Similarity, in closed form

Centre both point sets, then:

```text
  A = Σ (p'·q')  = Σ (px*qx + py*qy)
  B = Σ (p'×q')  = Σ (px*qy - py*qx)
  N = Σ |p'|²

  a = A / N   (= s·cos θ)        [ a  -b   tx ]
  b = B / N   (= s·sin θ)    M = [ b   a   ty ]
                                 [ 0   0    1 ]
```

with the translation recovered from the centroids. No iteration, no matrix
inverse — two dot products. That closed form is why similarity survives a
RANSAC sample that affine would choke on.

### Affine, by normal equations

Six unknowns separate into two independent 3x3 systems sharing one matrix
(`Σ` over the sample):

```text
  [ Σx²  Σxy  Σx ] [ a ]   [ Σx·u ]
  [ Σxy  Σy²  Σy ] [ b ] = [ Σy·u ]        and the same with v for the second row
  [ Σx   Σy   n  ] [ c ]   [ Σu   ]
```

Solved by Gaussian elimination with partial pivoting. A singular system means
the sample points were collinear — a real and common case, so it is a `null`
return rather than a throw.

### Homography, by DLT

Each correspondence contributes two rows:

```text
  [ -x  -y  -1   0   0   0   u*x  u*y  u ]
  [  0   0   0  -x  -y  -1   v*x  v*y  v ]  ·  h  =  0
```

and `h` is the null-space direction of `A`, found as the eigenvector of
`AᵀA` (9x9, accumulated directly so the cost is independent of the point count)
belonging to its smallest eigenvalue, via the cyclic Jacobi method. Jacobi is
the right tool at this size: a dozen lines, unconditionally stable for
symmetric input, and eigenvectors come free.

**Hartley normalisation is not optional polish.** Raw pixel coordinates put
entries like `x*u` (order 10⁶) next to a constant 1 in the same row, and the
eigen solve then answers a question dominated by the big column. Each point set
is translated to its centroid and scaled so the mean distance from it is `√2`;
the result is mapped back afterwards.

### RANSAC

Feature matching on a document produces a lot of confident nonsense, because
the page is full of things that genuinely look identical — every lowercase "e",
every corner of every table cell. Least squares over all of them is dragged
wherever the wrong ones point.

RANSAC ignores the average. It draws the smallest sample that determines a
transform, counts how many of the rest that transform explains within
**3 px** (at working resolution), and repeats. A wrong sample agrees with
almost nothing; the right one agrees with everything real on the page.

Two refinements:

- **Adaptive stopping.** Once a fraction `w` of matches agrees, the chance that
  more draws find something better collapses, so the iteration budget is
  recomputed as `N = log(1 - 0.995) / log(1 - wᵐ)`, capped at 2000.
- **Refit on all inliers.** The minimal sample only ever *located* the
  consensus; the accurate transform comes from least squares over every inlier.
  The refit is kept only if it does not lose inliers.

Every candidate is screened by a plausibility guard before its inliers are
counted: all entries finite, `|det| > 1e-9`, `det > 0` (a mirrored page is
never a scan of the same page), and both axis scales within a factor of 8. A
minimal sample of near-collinear points loves to return a matrix that folds the
page in half, and it is cheaper to reject that here than to discover it in the
output.

The whole thing is driven by a seeded PRNG (mulberry32), so the same bytes give
the same matrix — which is what makes a regression test meaningful and a
production bug reproducible from its inputs.

If RANSAC returns nothing, or fewer than **12** inliers survive, the feature
stage is not trusted: the coarse estimate is returned alone and
`result.method` reports `'coarse'` rather than `'features'`.

Otherwise the residual `R` is lifted from the working frame to full resolution
and composed onto the coarse transform:

```text
  H = C · R
```

*Source: `src/lib/estimate/models.ts`, `src/lib/estimate/ransac.ts`,
`src/lib/math/linalg.ts`, `src/lib/math/random.ts`*

## Stage 6 — The warp

The scan is resampled onto a canvas the same size as the original, through `H`.

**Inverse mapping.** The loop runs over destination pixels and reaches back
into the source. Pushing source pixels forward instead leaves the output full
of pinholes wherever the transform stretches — the same reason spray-painting
through a rotated stencil leaves gaps. For each output pixel:

```text
  (u, v) = H · (x + 0.5, y + 0.5)        then sample the scan at (u - 0.5, v - 0.5)
```

The half-pixel excursion is the centre convention from
[Conventions](#conventions), applied in both directions.

**Interpolation** is bilinear by default; `bicubic` (Catmull-Rom over 4x4) keeps
strokes sharper when upscaling at the cost of slight ringing on hard black
edges, and `nearest` exists for masks. Destination pixels that fall outside the
source get the background fill, opaque white by default.

**Minification prefilter.** `sqrt(|det|)` of the linear part is how many source
pixels land on one destination pixel along an average direction. When that
exceeds 1.25 the source is box-blurred by `(s - 1) / 2` first. Without it,
shrinking a 300 dpi scan point-samples one source pixel and discards the rest:
measured on a 5 px checkerboard read every 6.3 px, raw sampling produces moiré
with a standard deviation of 110 grey levels, against 14 with the prefilter.

*Source: `src/lib/image/warp.ts`, `src/lib/image/resize.ts`*

## Stage 7 — Confidence

Confidence is measured on the *output*, not inferred from the process. The scan
is warped through the final `H` at up to 800 px and compared with the original:

- `confidence` — ZNCC of the two ink images, clamped to `[0, 1]`
- `diagnostics.intersectionOverUnion` — intersection over union of the two
  binarised masks

Above roughly 0.6 is a solid match on a printed page. Below roughly 0.3 the
alignment should be treated as failed, and **no region report built on it means
anything**.

This is deliberately a different quantity from RANSAC's inlier count. A high
inlier ratio only says the matches agreed with each other; ZNCC on the warped
result says the pages actually lie on top of one another.

*Source: `src/lib/align.ts`, `src/lib/analysis/score.ts`*

## Region differencing

Once the scan sits on the original's canvas, "was this box signed?" stops being
an image problem and becomes arithmetic.

Both images are reduced to binary ink masks. Then, for a rectangle given in
**the original's** coordinates:

```text
  added   = | scan ∧ ¬dilate(original, tolerance) | / area
  removed = | original ∧ ¬dilate(scan, tolerance) | / area
  filled  = added ≥ threshold                          (default 0.02)
  score   = min(1, added / threshold)
```

### The tolerance band is the whole trick

Alignment is good to about a pixel, never to zero — and printed text is mostly
edges. Without a tolerance, a half-pixel shift lights up the outline of every
character as "new ink" and every region reports filled.

So the original's mask is dilated before the diff: every stroke is fattened by
`tolerance` px (default 2) using two 1D max passes. That absorbs sub-pixel
misalignment the way a proofreader ignores a letter sitting a hair off the
baseline. What it cannot absorb is a signature, which is ink in places the
original has none.

Raise the tolerance if alignment is loose; lower it to catch very fine
additions.

### Reading the numbers

`added` is the signal. **`removed` is not a reliable one**: a 1 px hairline rule
in the original, softened below the ink threshold by the scan's JPEG
quantiser, registers as removed ink even on a perfect alignment. Measured on a
real 150 dpi form scanned and re-rendered at 200 dpi, page-wide `removed` sits
at about 0.13% on an *unmodified* scan. Threshold on `added`.

### Guards

`compareRegions` refuses two images of different sizes outright. Rectangles are
in the original's coordinate system, so feeding it a raw scan would produce
confident nonsense — every rectangle naming a different part of the page in
each image. Rectangles are clamped to the canvas; one entirely off the page
returns zeros rather than throwing.

### Page-wide diff and the overlay

`diffDocument` runs the same arithmetic over the whole page plus any regions, in
one pass. A useful pre-check before OCR: if page-wide `added` is under about
2%, nothing was written on the page.

`renderDiff` produces an RGBA overlay for human eyes — **red** where the scan
added ink, **blue** where it lost ink, **grey** where both agree. This is the
fastest way to tell the two failure modes apart: a correctly aligned signed
form is almost entirely grey with a red signature, while a misaligned one is
red and blue confetti along every stroke.

*Source: `src/lib/regions.ts`, `src/lib/image/gray.ts`*

## Coordinate frames, and the matrix algebra that keeps them straight

Three frames are in play at once, and conflating them is the easiest way to
produce a transform that is right in shape and wrong in scale.

- **full-resolution original** and **full-resolution scan** — what the caller sees
- **coarse frames** — each image independently shrunk to ≤ 512 px
- **working frames** — each image independently shrunk to ≤ 1400 px

"Independently" is the awkward part: the original and the scan rarely have the
same pixel count, so they rarely shrink by the same factor.

Two helpers do all the bookkeeping. Given `k = working / full` for each side:

```text
  rebase(M, kSource, kTarget) = S(1 / kTarget) · M · S(kSource)
```

takes a matrix measured *between two shrunk frames* and restates it in full
resolution on both sides. Going the other way is the same call with reciprocals.
`conjugateScale(M, k) = rebase(M, k, k)` is the equal-scale case, used where
both frames belong to the same image.

The composition at the end of Stage 5 then reads:

```text
  C          original_full  -> scan_full          (coarse, already rebased)
  C_work     original_work  -> scan_work          = rebase(C, 1/k_o, 1/k_s)
  rough      the scan warped through C_work, living in the original's work frame
  R_work     original_work  -> rough              (what RANSAC fits)
  R          original_full  -> scan-via-rough     = conjugateScale(R_work, k_o)
  H = C · R  original_full  -> scan_full
```

`R_work` maps the original's working frame onto the rough warp, and the rough
warp lives in that *same* frame — which is why lifting it is a conjugation by a
single factor rather than a rebase between two.

One more subtlety, and it was a real bug: content-box binning uses
`floor(v - v_min)`, not `round`. With `round`, a pixel centre at `x + 0.5`
lands in bucket `x + 1`, and every content centre — and therefore every coarse
translation — comes out a pixel high and a pixel left.

*Source: `src/lib/math/matrix.ts`*

## Parameter reference

Every default in one place. All are `alignScan` options unless noted.

| parameter | default | effect |
| --- | --- | --- |
| `model` | `'similarity'` | Transform family. See [Stage 5](#stage-5--model-fitting-and-ransac). |
| `workingSize` | 1400 | Longer side for feature detection. Bigger is more precise and quadratically slower. |
| `coarseSize` | 512 | Longer side for the coarse guess. |
| `maxFeatures` | 1200 | Keypoint budget per image. |
| `ransacThreshold` | 3 | Inlier radius, in working-resolution px. |
| `minInliers` | 12 | Below this the feature stage is discarded for the coarse estimate. |
| `maxSkewDeg` | 12 | Half-range of the skew search. |
| `maxScaleRatio` | 6 | Largest scale ratio entertained between the two images. |
| `maxDisplacementRatio` | 0.12 | Match displacement gate, as a fraction of the page diagonal. |
| `interpolation` | `'bilinear'` | Or `'bicubic'`, `'nearest'`. |
| `background` | opaque white | RGBA fill outside the scan. |
| `output` | `'png'` | Or `'jpeg'`, or `'none'` to skip encoding — most of the cost on a big page. |
| `seed` | fixed | Seeds RANSAC and the BRIEF pattern. |
| `ink.backgroundFraction` | 1/16 | Background window, as a fraction of the shorter side. |
| `ink.floor` | 0.06 | Ink noise floor. |
| `tolerance` *(regions)* | 2 | Dilation radius, in px, applied to the original before diffing. |
| `threshold` *(regions)* | 0.02 | Fraction of new ink that counts as filled. Overridable per region. |

Internal constants not exposed as options: FAST threshold 0.08 and arc 9 on a
radius-3 circle; BRIEF 256 bits, 31 px patch, `σ = patchSize/5`, 32 steering
bins, 5x5 smoothing; pyramid 3 levels at factor 1.3; keypoint grid 8x8;
matching ratio 0.8, max Hamming 96, cross-check on; RANSAC confidence 0.995,
cap 2000 iterations, plausibility scale bound 8; Otsu floor 0.12; warp
prefilter above `sqrt(|det|) = 1.25`; scoring resolution `min(workingSize, 800)`.

## Failure modes

- **One page at a time.** This aligns a scan to a page, not a multi-page PDF to
  a multi-page scan. Split them first.
- **It is registration, not retrieval.** It will happily align the wrong
  document badly and tell you so through a low `confidence`. Check that number
  before trusting anything built on the result.
- **Flat pages only.** A creased or curled page needs a non-rigid warp;
  `homography` will get the plane right and leave the curl.
- **Bounded scale.** `maxScaleRatio` (6) bounds how far apart the two
  resolutions may be. Beyond that, resample before calling.
- **Blank pages degrade, they do not fail.** With almost no printing there is
  nothing to register on. You get `method: 'coarse'` and a low confidence,
  which is the honest answer.
- **`removed` ink is noisy** by construction. See
  [Reading the numbers](#reading-the-numbers).
- **Nothing streams.** Memory peaks at a few copies of the largest image, so a
  100 megapixel scan will hurt.

## Measured results

### Synthetic, with ground truth

The library generates its own test pages and distorts them through a known
matrix, so error can be measured rather than eyeballed. On a page rotated 1.4°,
scaled 1.5x, translated, noisy and unevenly lit, the recovered transform agrees
with the truth to **under 4 px of corner error**. 135 unit tests cover the
stages individually — including RANSAC recovering the right model with 60% of
its input wrong.

### A real scan

IRS Form W-9 page 1, rendered at 150 dpi, put through a third-party scanner
simulator, re-rendered at 200 dpi — so the estimator had to recover a 1.3333x
scale it was never told about, on top of the simulator's skew, shadow and JPEG
artefacts. The same page was also signed, dated and tick-boxed *before*
scanning, so the pen marks went through the same degradation as the print.

| | unmodified scan | signed scan |
| --- | --- | --- |
| confidence | 0.926 | 0.913 |
| recovered scale | 1.33420 (0.065% error) | 1.33446 (0.084% error) |
| recovered rotation | 1.4334° | 1.3634° |
| RANSAC inliers | 297 / 380 (78%) | 311 / 381 (82%) |
| mean reprojection error | 0.710 px | 0.693 px |
| page-wide `added` ink | 0.0096% | 0.1344% |

Per declared region on the signed scan: signature 8.16%, date 3.93%, ticked box
20.66% — all flagged. The *adjacent* untouched checkbox, 200 px away, reported
0.00%. On the unmodified scan every region reported 0.00% and nothing was
flagged.

The 14x separation in page-wide `added` between an unmodified and a signed scan
is the margin the "was anything written on this page?" check runs on.
