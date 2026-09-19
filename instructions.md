I want a full plan for this monorepo to be a “scan check central” or, a "scan mate" ;)

I want the code architecture/organisation to follow the principles of @vertical-feature-slices.md

The monorepo will have multiple packages: fix, ink, ocr-match, image-match, content-match

## @scanmate/extract

This is a direct "pdf to array of images" library. You provide either a path to a PDF or the binary data of it and you get the array of images form the PDF with some extra information of each page that could be used for the next steps (page number, color depth, resolution, size, etc, you help me figure out)

something like:

```
{
  page: number
  original: <data, blob etc useful for the other steps from the original file>
  scanned: <data, blob etc useful for the other steps from the scanned file before the alignment>
}[]
```

## @scanmate/align

It’s the “first part” of what the existing package does, just aligning/deskewing/zooming (I'm not sure we are dealing with different zooms, so please ensure me) etc the scanned images to match the original. The input should be the current options and either a pair of ImageInput (like the current version of "alignScan") or the output from "extract". I would like to add a 4th type of model (that should be the default) called "all", that, when selected, will execute all models and get the one with the best confidence score OR, stop whenever a model reaches (a new option, with value 0.9 by default) that is a "confidence matched" score (not sure about the name) that is a number (0 to 1)  of a confidence level that will make the loop stop whenever the model reached that level of alignment confidence.

The loop starts with the least consuming intensive model and ends with the more demanding one. Let's say the "confidence matched" option is 0.8. The first method gave 0.75 confidence, the next method is tried, if it gives over 0.8, it sets this result as the result.

The output should be an array similar to this:

```
{
  page: number
  original: <data, blob etc useful for the other steps from the original file>
  scanned: <data, blob etc useful for the other steps from the scanned file before the alignment>
  aligned: <data, blob etc useful for the other steps from the aligned scanned file - wht's currently on AlignResult>
}[]
```

## @scanmate/ocr

The input should be the output of "align" and it should use some distance comparison ([Levenshtein distance|https://en.wikipedia.org/wiki/Levenshtein_distance], [Jaccard index similarity|https://en.wikipedia.org/wiki/Jaccard_index] and/or any other relevant one) to give a confidence level on how similar is the OCR of the scanned with the original. We should apply a diacritics cleaner and whatever needed to clean "noise". The result should have a **total score** and, **per page**, a score (and any other relevant/nice/nerdy detail) and the both the OCRs from the original and the aligned scanned version

## @scanmate/diff

Kind of the “second part” of fix. The input is the output from "align" and the coordinates where we expect something per page.

On another project I was using [Otsu Thresholding|https://en.wikipedia.org/wiki/Otsu%27s_method] and [Connected Component Analysis|https://en.wikipedia.org/wiki/Connected-component_labeling] to identify the signature, but I believe the superposition you already created is better and gives a more "wowing" result with the overlayed image with the red part in the difference.

The array of coordinates should be like this:
```
{
  page: number,
  id: string,
  x: number,
  y: number,
  width: number,
  height: number
}
```

The output should give us the confirmation of the expected changes and the list of unexpected changes, like this:

```
{
  page: number,
  diffImage: <blob image with the red ink of the non overlapping part>
  diffRaster: <blob rasterwith the red ink of the non overlapping part>
  expected: {
    id: string,
    identified: boolean,
  }[],
  unexpected: {
    x: number,
    y: number,
    width: number,
    height: number
  }[] // here, we want to join overlapping contiguous changes
}
```

The other option I thought was, instead of

## @scanmate/find

The input should be the results of "ocr" and an array with an object containing the page and content that must be present and identifiable

```
{
  page: number
  content: string[]
}[]
```

For all of these, we should try and use (and fix if needed) mnci commands (https://www.npmjs.com/package/monecromanci - my package I'm testing in real projects, so, whatever identified bug, tell me so we can fix).

Whatever options you believe will make the packages better, more reliable, more flexible, please implement but define default values (like you did on the align code).
