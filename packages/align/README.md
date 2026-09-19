# `@scanmate/align`

> Coarse-to-fine geometric alignment engine for matching scanned pages back onto reference document templates.

`@scanmate/align` resamples photographs or flatbed scans of printed forms onto the exact coordinate canvas of their original digital templates (PDF pages). It solves translation, rotation, scaling, affine shear, and 8-DOF perspective distortions using a multi-hypothesis coarse estimator, Fast Fourier Transform (FFT) phase correlation, oriented FAST + steered BRIEF (ORB) feature matching, and RANSAC geometric model fitting.

---

## Features

- 🎯 **Coordinate Preservation**: Resamples scanned pages directly onto the original PDF canvas dimensions, ensuring bounding box coordinates $(x, y, w, h)$ remain 1:1 comparable.
- 🚀 **Multi-Hypothesis Coarse Estimation**: Guesses transformation candidates via frame matching, content bounding-box matching, and projection-histogram deskewing at low resolution (512px).
- ⚡ **FFT Phase Correlation**: Fine-tunes 2D translational offsets using frequency-domain cross-power spectral density peaks.
- 🔬 **Steered BRIEF & FAST Corners (ORB)**: Detects corners with intensity centroids for scale/rotation invariance without native OpenCV dependencies.
- 🛡️ **RANSAC Model Fitting**: Filters up to 60%+ false matches (e.g. repeated table cells, identical letterforms) using RANdom SAmple Consensus.
- 📐 **Multiple Transformation Models**: Supports `similarity` (4-DOF), `affine` (6-DOF), and `homography` (8-DOF perspective transform).

---

## Installation

```bash
# Using npm
npm install @scanmate/align @scanmate/ink

# Using pnpm
pnpm add @scanmate/align @scanmate/ink

# Using yarn
yarn add @scanmate/align @scanmate/ink
```

---

## Quick Start & Usage

### 1. Aligning a Scanned Image to an Original Template (`alignScan`)

```ts
import { alignScan } from '@scanmate/align'
import { decodeImage } from '@scanmate/ink'
import { readFile } from 'node:fs/promises'

// Decode images into RGBA Rasters
const original = await decodeImage(await readFile('contract_template_p1.png'))
const scanned = await decodeImage(await readFile('returned_photo.jpg'))

// Execute high-precision alignment
const result = await alignScan(original, scanned, {
  model: 'similarity',     // 'similarity' | 'affine' | 'homography'
  workingSize: 1400,        // Resolution cap for feature matching
  coarseSize: 512,          // Resolution cap for coarse estimation
  maxFeatures: 1200,        // Keypoint budget per image
})

console.log(`Confidence Score: ${(result.confidence * 100).toFixed(1)}%`)
console.log(`Rotation: ${result.transform.rotationDeg.toFixed(2)}°`)
console.log(`Scale X: ${result.transform.scaleX.toFixed(3)}, Scale Y: ${result.transform.scaleY.toFixed(3)}`)
console.log(`Alignment Method: ${result.method}`) // 'features' | 'coarse'

// result.raster is now resampled onto original canvas dimensions!
```

### 2. Multi-Page Batch Alignment (`alignPages`)

```ts
import { alignPages } from '@scanmate/align'

// Align an array of extracted original and scanned page pairs
const alignedPages = await alignPages(pagePairs, {
  onProgress: (stage, progress) => {
    console.log(`Progress [${stage}]: ${(progress * 100).toFixed(0)}%`)
  },
})
```

### 3. Pipeline Building Blocks

For advanced pipelines needing custom stops or intermediate inspection:

```ts
import {
  detectAndDescribe,
  estimateCoarse,
  fitModel,
  matchFeatures,
  phaseCorrelate,
  ransac,
} from '@scanmate/align'

// Step 1: Low-resolution coarse scale & translation guess
const coarse = await estimateCoarse(originalRaster, scannedRaster)

// Step 2: FFT Phase Correlation for shift refinement
const shift = phaseCorrelate(coarse.warpedGrayOriginal, coarse.warpedGrayScanned)

// Step 3: Feature Detection (FAST + Steered BRIEF)
const originalKeypoints = detectAndDescribe(originalInkMap)
const scannedKeypoints = detectAndDescribe(scannedInkMap)

// Step 4: Hamming Distance Feature Matching
const matches = matchFeatures(originalKeypoints, scannedKeypoints)

// Step 5: RANSAC Outlier Filtering
const ransacResult = ransac(matches, { model: 'similarity', threshold: 3.0 })
```

---

## Architecture & Algorithm Deep-Dive

### 1. Multi-Stage Coarse-to-Fine Pipeline

```mermaid
flowchart TD
    A["Original Template & Scanned Image"] --> B["Decode to Rasters & Ink Normalization"]
    B --> C["Coarse Estimator (512px downsample)"]
    
    subgraph CoarseStrategy["Coarse Estimation Hypotheses"]
        C1["Hypothesis 1: Frame Matching"]
        C2["Hypothesis 2: Content Bounding-Box"]
        C3["Hypothesis 3: Projection Histogram Deskew"]
    end
    
    C --> CoarseStrategy
    CoarseStrategy --> D["Score Candidates via Ink Correlation"]
    D --> E["Best Coarse Transform H_coarse"]
    E --> F["2D FFT Phase Correlation<br/>Fine translation shift (dx, dy)"]
    F --> G["Coarse-Warped Scan"]
    G --> H["ORB Feature Detection (1400px)<br/>FAST Corners + Steered BRIEF"]
    H --> I["Hamming Distance Matching & Mutual Filter"]
    I --> J["RANSAC Iterative Inlier Estimation"]
    J --> K{"Inlier count >= minInliers?"}
    K -- Yes --> L["Fit Final Homography H_fine<br/>Compose: H_total = H_coarse * H_fine"]
    K -- No --> M["Fallback to H_coarse (method: 'coarse')"]
    L --> N["Inverse Mapping Resample onto Original Canvas"]
    M --> N
    N --> O["Aligned Output Raster & Confidence Diagnostics"]
```

---

### 2. Feature Matching & RANSAC Alignment Sequence

```mermaid
sequenceDiagram
    autonumber
    participant App as Application
    participant Align as alignScan()
    participant ORB as Feature Matching (ORB)
    participant RANSAC as RANSAC Solver
    participant Kernel as @scanmate/ink Warp

    App->>Align: Execute alignScan(original, scanned)
    Align->>Align: Run Coarse Estimation & FFT Phase Correlation
    Align->>ORB: detectAndDescribe(originalInk) & detectAndDescribe(scannedInk)
    ORB->>ORB: Compute FAST corners & 256-bit steered BRIEF descriptors
    Align->>ORB: matchFeatures(setA, setB)
    ORB->>ORB: Calculate Hamming Bit Distances & Mutual Nearest Neighbor
    ORB-->>Align: Return candidate PointMatch correspondences
    Align->>RANSAC: ransac(matches, { model, threshold })
    loop Random Sample Consensuses (N iterations)
        RANSAC->>RANSAC: Sample minimal point set (e.g. 2 for Similarity, 4 for Homography)
        RANSAC->>RANSAC: Solve model parameter matrix H_candidate via SVD
        RANSAC->>RANSAC: Count inliers where distance(H * p_src, p_dst) < threshold
    end
    RANSAC->>RANSAC: Refit optimal model H_final on all consensus inliers
    RANSAC-->>Align: Return RansacResult (inliers, matrix)
    Align->>Kernel: warpRaster(scanned, outputCanvas, H_total_inv)
    Kernel-->>Align: Aligned Raster
    Align-->>App: Return AlignResult
```

---

### 3. Model Comparison & Choice

| Model | DOF | Parameters | Minimal Samples | Ideal Use Case |
|---|:---:|---|:---:|---|
| **`similarity`** *(default)* | 4 | Rotation, Uniform Scale, Translation $(tx, ty)$ | 2 points | Flatbed & sheet-fed scanner images where document plane is flat. |
| **`affine`** | 6 | Rotation, Independent Scale $(sx, sy)$, Shear, Translation | 3 points | Scans with non-uniform axis stretching (e.g. slipping feed rollers). |
| **`homography`** | 8 | Perspective projection matrix ($3 \times 3$) | 4 points | Photographs taken off-axis or with camera tilt. |

---

## Diagnostics & Confidence Metrics

`alignScan` returns a comprehensive `AlignResult` object:

```ts
interface AlignResult {
  raster: Raster                  // Aligned scan resampled to original canvas
  image: Uint8Array | null        // Encoded bytes (PNG/JPEG) if requested
  matrix: Matrix3                 // Original -> Scanned transformation matrix
  inverse: Matrix3                // Scanned -> Original transformation matrix
  transform: TransformSummary     // Extracted scaleX, scaleY, rotationDeg, shear
  confidence: number              // 0.0 to 1.0 ink correlation after warping
  method: 'features' | 'coarse'   // Method used for final alignment
  diagnostics: AlignDiagnostics   // Detailed execution timing and model scores
}
```

> [!TIP]
> A `confidence` score **> 0.60** indicates a solid registration match on printed documents. Confidence **< 0.35** suggests significant misalignment or non-matching document templates.

---

## License

MIT © [ScanMate Team](https://github.com/russoedu/scanmate)
