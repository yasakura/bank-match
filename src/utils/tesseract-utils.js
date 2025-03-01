import { createWorker } from "tesseract.js";

// Cache pour stocker l'instance du worker Tesseract
let workerInstance = null;

/**
 * Initialise le worker Tesseract avec la langue française
 * @returns {Promise<Worker>} L'instance du worker Tesseract
 */
export const initTesseractWorker = async () => {
  if (workerInstance) {
    return workerInstance;
  }

  try {
    // eslint-disable-next-line no-console, no-undef
    console.log("Initialisation du worker Tesseract...");

    // Dans Tesseract.js v6, on initialise le worker différemment
    // On spécifie la langue directement dans les options de création
    const worker = await createWorker("fra");

    // eslint-disable-next-line no-console, no-undef
    console.log(
      "Tesseract worker initialisé avec succès avec la langue française"
    );

    workerInstance = worker;
    return worker;
  } catch (error) {
    // eslint-disable-next-line no-console, no-undef
    console.error(
      "Erreur lors de l'initialisation du worker Tesseract:",
      error
    );
    throw error;
  }
};

/**
 * Effectue la reconnaissance de texte sur une image
 * @param {Blob|File|ImageData|HTMLCanvasElement|HTMLImageElement} image - L'image à analyser
 * @returns {Promise<string>} Le texte extrait de l'image
 */
export const recognizeText = async (image) => {
  try {
    // eslint-disable-next-line no-console, no-undef
    console.log("Début de la reconnaissance de texte...");

    // Vérification que l'image est valide
    if (!image) {
      // eslint-disable-next-line no-console, no-undef
      console.error("Erreur: Image invalide fournie à recognizeText");
      return "";
    }

    // eslint-disable-next-line no-console, no-undef
    console.log("Initialisation du worker Tesseract...");

    const worker = await initTesseractWorker();

    // eslint-disable-next-line no-console, no-undef
    console.log("Worker prêt, lancement de la reconnaissance...");

    // Vérification du type d'image pour le debug
    // eslint-disable-next-line no-console, no-undef
    console.log(`Type d'image fourni: ${image.constructor.name}`);

    // Vérifier si l'image a les propriétés d'un canvas sans utiliser instanceof
    if (
      image &&
      typeof image.getContext === "function" &&
      image.width &&
      image.height
    ) {
      // eslint-disable-next-line no-console, no-undef
      console.log(`Dimensions du canvas: ${image.width}x${image.height}`);
    }

    // Dans Tesseract.js v6, la méthode recognize retourne directement le résultat
    const result = await worker.recognize(image);

    // eslint-disable-next-line no-console, no-undef
    console.log(`Texte extrait: ${result.data.text.length} caractères`);

    // Afficher un aperçu du texte extrait (premiers 100 caractères)
    if (result.data.text.length > 0) {
      // eslint-disable-next-line no-console, no-undef
      console.log(
        `Aperçu du texte: "${result.data.text.substring(0, 100)}${
          result.data.text.length > 100 ? "..." : ""
        }"`
      );
    }

    return result.data.text;
  } catch (error) {
    // eslint-disable-next-line no-console, no-undef
    console.error("Erreur lors de la reconnaissance de texte:", error);
    // eslint-disable-next-line no-console, no-undef
    console.error("Stack trace:", error.stack);
    return "";
  }
};

/**
 * Convertit une page PDF en image pour l'OCR
 * @param {PDFPageProxy} pdfPage - La page PDF à convertir
 * @param {number} scale - L'échelle de rendu (par défaut 1.5 pour une meilleure qualité OCR)
 * @returns {Promise<HTMLCanvasElement>} Le canvas contenant l'image de la page
 */
export const convertPdfPageToImage = async (pdfPage, scale = 1.5) => {
  try {
    const viewport = pdfPage.getViewport({ scale });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await pdfPage.render({
      canvasContext: context,
      viewport,
    }).promise;

    return canvas;
  } catch (error) {
    // eslint-disable-next-line no-console, no-undef
    console.error(
      "Erreur lors de la conversion de la page PDF en image:",
      error
    );
    throw error;
  }
};

/**
 * Libère les ressources du worker Tesseract
 */
export const terminateTesseractWorker = async () => {
  if (workerInstance) {
    try {
      // eslint-disable-next-line no-console, no-undef
      console.log("Tentative de terminaison du worker Tesseract...");

      // Dans Tesseract.js v6, on utilise toujours terminate()
      await workerInstance.terminate();
      workerInstance = null;

      // eslint-disable-next-line no-console, no-undef
      console.log("Tesseract worker terminé avec succès");
    } catch (error) {
      // eslint-disable-next-line no-console, no-undef
      console.error(
        "Erreur lors de la terminaison du worker Tesseract:",
        error
      );

      // Même en cas d'erreur, on réinitialise l'instance pour éviter de réutiliser un worker potentiellement corrompu
      workerInstance = null;

      // eslint-disable-next-line no-console, no-undef
      console.log("Instance du worker réinitialisée malgré l'erreur");
    }
  } else {
    // eslint-disable-next-line no-console, no-undef
    console.log("Aucun worker Tesseract à terminer");
  }
};
