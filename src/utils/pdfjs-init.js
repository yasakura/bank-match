import * as pdfjsLib from "pdfjs-dist";

// Initialiser le worker PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.js",
  import.meta.url
).toString();

export default pdfjsLib;
