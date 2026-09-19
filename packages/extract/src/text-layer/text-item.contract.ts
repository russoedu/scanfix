/**
 * One run of text from a page's text layer, where it sits on the page.
 *
 * Positions are PDF points (1/72 inch) from the top-left corner of the page as
 * displayed - after its `/Rotate` - which is the frame a rendered page is in, and
 * the one `@scanmate/diff` takes regions in. Multiply by `dpi / 72` for pixels of
 * a page rendered at `dpi`.
 */
export interface TextItem {
  text:     string
  /** Axis-aligned box around the run, from the font's ascent to its descent. */
  x:        number
  y:        number
  width:    number
  height:   number
  /** Where the run's baseline starts. */
  baseline: { x: number, y: number }
  /** Size of the font as placed, in points. */
  fontSize: number
  /** pdf.js's name for the font, stable within a document - runs that share it share a face. */
  fontName: string
  /**
   * Direction of the baseline, in degrees clockwise from left-to-right. `0` for
   * ordinary text; a label printed up the margin reads `-90` or `270`-ish.
   */
  angle:    number
  /** The run ends a line. */
  endsLine: boolean
}
