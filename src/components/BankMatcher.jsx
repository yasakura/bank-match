import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { DocumentMagnifyingGlassIcon } from "@heroicons/react/24/outline";
import * as pdfjsLib from "pdfjs-dist";
import {
  convertPdfPageToImage,
  recognizeText,
  terminateTesseractWorker,
} from "../utils/tesseract-utils";
import {
  loadIgnoredPatterns,
  shouldIgnoreTransaction,
} from "../utils/config-utils";
import ignoredTransactionsData from "../data/ignored-transactions.json";

// Initialiser le worker PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

function BankMatcher({ transactions, folderHandle, selectedFolders, onClose }) {
  const [matchingStatus, setMatchingStatus] = useState("idle"); // idle, matching, done
  const [matches, setMatches] = useState(new Map()); // Map<transactionRef, {pdfHandle, path, fileDate}>
  const [progress, setProgress] = useState(0);
  const [pdfCache, setPdfCache] = useState(new Map()); // Cache pour stocker le contenu des PDF
  const [dateRange, setDateRange] = useState({ start: null, end: null });
  const [manuallyMarked, setManuallyMarked] = useState(new Set()); // Ensemble des transactions marquées manuellement comme traitées
  const [ignoredPatterns, setIgnoredPatterns] = useState(
    ignoredTransactionsData.ignoredPatterns || []
  );

  // Charger les patterns ignorés au démarrage
  useEffect(() => {
    const fetchIgnoredPatterns = async () => {
      const patterns = await loadIgnoredPatterns();
      console.log("Patterns ignorés chargés:", patterns);
      setIgnoredPatterns(patterns);
    };

    fetchIgnoredPatterns();
  }, []);

  // Désactiver le scroll du body quand la modale est ouverte
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, []);

  const scanFolder = async (handle, path = "") => {
    const files = [];
    // eslint-disable-next-line no-console, no-undef
    console.log(`Début du scan pour ${path || "dossier racine"}`);

    try {
      for await (const entry of handle.values()) {
        if (
          entry.kind === "file" &&
          entry.name.toLowerCase().endsWith(".pdf")
        ) {
          files.push({
            handle: entry,
            path: path ? `${path}/${entry.name}` : entry.name,
          });
        } else if (entry.kind === "directory") {
          try {
            const subHandle = await handle.getDirectoryHandle(entry.name);
            const subFiles = await scanFolder(
              subHandle,
              path ? `${path}/${entry.name}` : entry.name
            );
            files.push(...subFiles);
          } catch (err) {
            // eslint-disable-next-line no-console, no-undef
            console.error(
              `  → Erreur dans le sous-dossier ${entry.name}:`,
              err
            );
          }
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console, no-undef
      console.error(`Erreur lors du scan de ${path}:`, err);
    }

    // eslint-disable-next-line no-console, no-undef
    console.log(
      `Fin du scan pour ${path || "dossier racine"}, ${
        files.length
      } fichiers trouvés`
    );
    return files;
  };

  const formatDate = (dateStr) => {
    const [day, month, year] = dateStr.split("/");
    // Convertir l'année à 2 chiffres en année à 4 chiffres
    const fullYear = year.length === 2 ? "20" + year : year;
    return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  };

  const extractPdfContent = async (fileHandle) => {
    try {
      // Convertir le FileHandle en ArrayBuffer
      const file = await fileHandle.getFile();
      const arrayBuffer = await file.arrayBuffer();
      const fileName = file.name;

      // eslint-disable-next-line no-console, no-undef
      console.log(
        `Lecture du PDF: ${fileName} (taille: ${Math.round(
          arrayBuffer.byteLength / 1024
        )} KB)`
      );

      // Charger le PDF
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = "";
      let usedOcr = false;

      // eslint-disable-next-line no-console, no-undef
      console.log(`PDF chargé: ${fileName}, ${pdf.numPages} page(s)`);

      // Extraire le texte de chaque page
      for (let i = 1; i <= pdf.numPages; i++) {
        try {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          let pageText = textContent.items.map((item) => item.str).join(" ");

          // eslint-disable-next-line no-console, no-undef
          console.log(
            `Page ${i}/${pdf.numPages} de ${fileName}: ${textContent.items.length} éléments de texte`
          );

          // Si le texte est vide ou très court, essayer d'extraire le texte via OCR
          if (pageText.trim().length < 10) {
            // eslint-disable-next-line no-console, no-undef
            console.log(
              `⚠️ Texte très court détecté dans ${fileName}, page ${i}: "${pageText}". Tentative d'OCR...`
            );

            try {
              // Convertir la page PDF en image pour l'OCR
              const canvas = await convertPdfPageToImage(page);

              // Effectuer l'OCR sur l'image
              const ocrText = await recognizeText(canvas);

              // eslint-disable-next-line no-console, no-undef
              console.log(
                `OCR effectué sur la page ${i} de ${fileName}. Texte extrait: ${ocrText.length} caractères`
              );

              // Remplacer le texte de la page par celui obtenu via OCR
              pageText = ocrText;
              usedOcr = true;
            } catch (ocrErr) {
              // eslint-disable-next-line no-console, no-undef
              console.error(
                `Erreur lors de l'OCR sur la page ${i} de ${fileName}:`,
                ocrErr.message
              );
            }
          }

          fullText += pageText + "\n";
        } catch (pageErr) {
          // eslint-disable-next-line no-console, no-undef
          console.error(
            `Erreur lors de la lecture de la page ${i} de ${fileName}:`,
            pageErr.message
          );
        }
      }

      // Vérifier si le texte extrait est vide ou très court
      if (fullText.trim().length < 20 && !usedOcr) {
        // eslint-disable-next-line no-console, no-undef
        console.warn(
          `⚠️ PDF probablement scanné ou image: ${fileName}. Texte extrait: "${fullText.trim()}". Tentative d'OCR sur toutes les pages...`
        );

        // Essayer d'extraire le texte via OCR sur toutes les pages
        try {
          let ocrFullText = "";

          for (let i = 1; i <= pdf.numPages; i++) {
            try {
              const page = await pdf.getPage(i);
              const canvas = await convertPdfPageToImage(page);
              const ocrText = await recognizeText(canvas);

              // eslint-disable-next-line no-console, no-undef
              console.log(
                `OCR effectué sur la page ${i} de ${fileName}. Texte extrait: ${ocrText.length} caractères`
              );

              ocrFullText += ocrText + "\n";
            } catch (ocrErr) {
              // eslint-disable-next-line no-console, no-undef
              console.error(
                `Erreur lors de l'OCR sur la page ${i} de ${fileName}:`,
                ocrErr.message
              );
            }
          }

          if (ocrFullText.trim().length > fullText.trim().length) {
            // eslint-disable-next-line no-console, no-undef
            console.log(
              `Utilisation du texte OCR pour ${fileName} (${ocrFullText.length} caractères vs ${fullText.length})`
            );
            fullText = ocrFullText;
            usedOcr = true;
          }
        } catch (ocrErr) {
          // eslint-disable-next-line no-console, no-undef
          console.error(
            `Erreur lors de l'OCR global sur ${fileName}:`,
            ocrErr.message
          );
        }
      }

      // Rechercher des montants dans le texte (format: 123,45 ou 123.45 ou 123,456)
      const amounts =
        fullText
          .replace(/(\d+)[,.](\d{2,3})/g, "$1.$2") // Convertir les virgules en points et accepter 2 ou 3 décimales
          .match(/\d+\.\d{2,3}/g) || [];

      // Normaliser et arrondir tous les montants à 2 décimales
      const parsedAmounts = [
        ...new Set(
          amounts.map((amount) => Math.round(parseFloat(amount) * 100) / 100)
        ),
      ];

      // eslint-disable-next-line no-console, no-undef
      console.log(
        `Montants trouvés dans ${fileName}:`,
        parsedAmounts.map((m) => m.toFixed(2))
      );

      // Si aucun montant n'est trouvé, avertir mais ne pas essayer d'extraire du nom de fichier
      if (parsedAmounts.length === 0) {
        // eslint-disable-next-line no-console, no-undef
        console.warn(
          `⚠️ Aucun montant trouvé dans le texte du PDF ${fileName}`
        );
      }

      return {
        text: fullText,
        amounts: parsedAmounts,
        isScanned: !usedOcr && fullText.trim().length < 20,
        usedOcr,
      };
    } catch (err) {
      // eslint-disable-next-line no-console, no-undef
      console.error("Erreur lors de la lecture du PDF:", err.message);
      return null;
    }
  };

  const parseDate = (dateStr) => {
    try {
      // Format ISO YYYY-MM-DD
      if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return new Date(dateStr);
      }

      // Format DD/MM/YYYY ou DD-MM-YYYY
      const match1 = dateStr.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
      if (match1) {
        const [, day, month, year] = match1;
        return new Date(year, month - 1, day);
      }

      // Format DD/MM/YY ou DD-MM-YY
      const match2 = dateStr.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/);
      if (match2) {
        const [, day, month, year] = match2;
        return new Date("20" + year, month - 1, day);
      }

      return null;
    } catch (err) {
      return null;
    }
  };

  // Extraire le nom du fournisseur du libellé de la transaction
  const extractVendorName = (libelle) => {
    // Pour les transactions CB, extraire le nom après "CB "
    if (libelle.startsWith("CB ")) {
      // Prendre le texte entre "CB " et le premier espace ou caractère spécial
      const match = libelle.substring(3).match(/^([A-Za-z0-9\.\-\_]+)/);
      if (match) {
        return match[1].toLowerCase();
      }
    }
    return null;
  };

  // Vérifier si un nom de fichier contient le nom du fournisseur
  const fileNameContainsVendor = (fileName, vendorName) => {
    if (!vendorName) return false;

    // Normaliser le nom de fichier (enlever les extensions, convertir en minuscules)
    const normalizedFileName = fileName.split(".")[0].toLowerCase();

    // Vérifier si le nom du fournisseur est présent dans le nom de fichier
    return normalizedFileName.includes(vendorName);
  };

  const startMatching = async () => {
    setMatchingStatus("matching");
    setProgress(0);

    try {
      // 1. Parsing du CSV et calcul de la plage de dates
      const parsedTransactions = transactions.map((t) => {
        const formattedDate = formatDate(t.date);
        let transactionDate = new Date(formattedDate);

        // S'assurer que le montant est un nombre et préserver son signe
        const amount =
          typeof t.montant === "string" ? parseFloat(t.montant) : t.montant;

        const isCBTransaction = t.libelle.startsWith("CB");
        let cbDate = null;
        const vendorName = extractVendorName(t.libelle);
        const isIgnored = shouldIgnoreTransaction(t.libelle, ignoredPatterns);

        // eslint-disable-next-line no-console, no-undef
        console.log(
          `Analyse transaction: "${t.libelle}" - Montant original: ${
            t.montant
          } (${typeof t.montant}), Montant traité: ${amount} - Ignorée: ${isIgnored}`
        );

        // Extraire la date des opérations CB si présente
        if (isCBTransaction) {
          // Format [JJMMAA]
          let cbDateMatch = t.libelle.match(/\[(\d{6})\]/);

          // Si pas de correspondance, chercher n'importe quel format JJMMAA dans le libellé
          if (!cbDateMatch) {
            // Rechercher un groupe de 6 chiffres qui pourrait être une date
            const matches = t.libelle.match(/\b(\d{6})\b/g);

            if (matches && matches.length > 0) {
              // Prendre le premier groupe de 6 chiffres trouvé
              // On pourrait aussi prendre le dernier avec matches[matches.length - 1]
              cbDateMatch = [matches[0], matches[0]];

              // eslint-disable-next-line no-console, no-undef
              console.log(
                `Format JJMMAA trouvé dans le libellé: ${matches[0]}`
              );
            }
          }

          if (cbDateMatch) {
            const [, cbDateStr] = cbDateMatch;
            const day = cbDateStr.substring(0, 2);
            const month = cbDateStr.substring(2, 4);
            const year = "20" + cbDateStr.substring(4, 6);

            // Vérifier que les valeurs extraites forment une date valide
            if (
              parseInt(day) >= 1 &&
              parseInt(day) <= 31 &&
              parseInt(month) >= 1 &&
              parseInt(month) <= 12 &&
              parseInt(year) >= 2000
            ) {
              cbDate = new Date(year, parseInt(month) - 1, parseInt(day));
              transactionDate = cbDate;

              // eslint-disable-next-line no-console, no-undef
              console.log(
                `Date extraite du libellé CB: ${day}/${month}/${year} (${cbDateStr})`
              );
            } else {
              // eslint-disable-next-line no-console, no-undef
              console.log(
                `Format JJMMAA trouvé (${cbDateStr}) mais ne semble pas être une date valide`
              );
            }
          }
        }

        return {
          ...t,
          parsedDate: transactionDate,
          amount,
          isCBTransaction,
          cbDate,
          vendorName,
          isIgnored,
        };
      });

      // Filtrer les transactions à ignorer
      const transactionsToProcess = parsedTransactions.filter(
        (t) => !t.isIgnored
      );

      // eslint-disable-next-line no-console, no-undef
      console.log(
        `${
          parsedTransactions.length - transactionsToProcess.length
        } transactions ignorées sur ${parsedTransactions.length} au total`
      );

      // 2. Calcul de la plage de dates du CSV
      const dates = transactionsToProcess.map((t) => t.parsedDate);
      const endDate = new Date(Math.max(...dates));
      const startDate = new Date(Math.min(...dates));
      startDate.setDate(startDate.getDate() - 45); // Étendre la date de début de 45 jours dans le passé

      // eslint-disable-next-line no-console, no-undef
      console.log("Plage de dates du CSV (étendue):", {
        début: startDate.toISOString().split("T")[0],
        fin: endDate.toISOString().split("T")[0],
      });

      // 3. Récupérer tous les fichiers PDF des dossiers sélectionnés
      const pdfFiles = [];
      for (const folderName of selectedFolders) {
        try {
          const dirHandle = await folderHandle.getDirectoryHandle(folderName);
          const files = await scanFolder(dirHandle, folderName);
          pdfFiles.push(...files);
        } catch (err) {
          // eslint-disable-next-line no-console, no-undef
          console.error(`Erreur lors du scan de ${folderName}:`, err);
        }
      }

      // eslint-disable-next-line no-console, no-undef
      console.log("Total des fichiers PDF trouvés:", pdfFiles.length);

      // 4. Pré-charger tous les PDF et créer un tableau structuré
      const newPdfCache = new Map();
      let loadedPdfs = 0;
      const structuredPdfData = [];

      for (const pdf of pdfFiles) {
        const content = await extractPdfContent(pdf.handle);
        if (content) {
          newPdfCache.set(pdf.path, content);

          // Extraire la date du nom du fichier
          let fileDate = null;
          const fileNameMatch = pdf.path.match(/\d{4}[-]?\d{2}[-]?\d{2}/);
          if (fileNameMatch) {
            const possibleDate = parseDate(fileNameMatch[0].replace(/-/g, "-"));
            if (possibleDate) {
              fileDate = possibleDate;
            }
          }

          // Si pas de date dans le nom du fichier, essayer d'extraire du nom du fichier au format JJ_MM_YY
          if (!fileDate) {
            const altDateMatch = pdf.path.match(/(\d{2})_(\d{2})_(\d{2})/);
            if (altDateMatch) {
              const [, day, month, year] = altDateMatch;
              fileDate = new Date(
                `20${year}`,
                parseInt(month) - 1,
                parseInt(day)
              );
              // eslint-disable-next-line no-console, no-undef
              console.log(
                `Date alternative trouvée dans ${pdf.path}: ${
                  fileDate.toISOString().split("T")[0]
                }`
              );
            }
          }

          if (fileDate) {
            structuredPdfData.push({
              handle: pdf.handle,
              path: pdf.path,
              fileName: pdf.path.split("/").pop(),
              fileDate,
              amounts: content.amounts,
              year: fileDate.getFullYear(),
              month: fileDate.getMonth(),
              day: fileDate.getDate(),
              isScanned: content.isScanned,
            });
          } else {
            // eslint-disable-next-line no-console, no-undef
            console.warn(`⚠️ Pas de date trouvée pour ${pdf.path}`);
          }
        } else {
          // eslint-disable-next-line no-console, no-undef
          console.warn(`⚠️ Impossible d'extraire le contenu de ${pdf.path}`);
        }
        loadedPdfs++;
        setProgress(Math.round((loadedPdfs / pdfFiles.length) * 50)); // 50% de la barre de progression pour le chargement
      }

      setPdfCache(newPdfCache);
      // eslint-disable-next-line no-console, no-undef
      console.log(`${newPdfCache.size} PDF chargés en mémoire`);
      // eslint-disable-next-line no-console, no-undef
      console.log("Données PDF structurées:", structuredPdfData.length);

      // 5. Matching des transactions
      const newMatches = new Map();
      let processed = 0;

      for (const transaction of transactionsToProcess) {
        // eslint-disable-next-line no-console, no-undef
        console.log("\n=== Nouvelle recherche ===");
        // eslint-disable-next-line no-console, no-undef
        console.log("Transaction:", {
          date: transaction.parsedDate.toISOString().split("T")[0],
          libelle: transaction.libelle,
          montant: transaction.amount.toFixed(2),
          isCB: transaction.isCBTransaction,
        });

        // Stratégie de matching
        let match = null;

        // Nouvelle approche: d'abord chercher les factures par nom de fournisseur si disponible
        if (transaction.vendorName) {
          // eslint-disable-next-line no-console, no-undef
          console.log(`Nom du fournisseur extrait: ${transaction.vendorName}`);

          // Chercher les factures dont le nom contient le nom du fournisseur
          const vendorMatches = structuredPdfData.filter((pdf) =>
            fileNameContainsVendor(pdf.fileName, transaction.vendorName)
          );

          // eslint-disable-next-line no-console, no-undef
          console.log(
            `Factures correspondant au fournisseur: ${vendorMatches.length}`
          );

          if (vendorMatches.length > 0) {
            // Filtrer par proximité de date (même mois ou mois adjacent)
            const dateFilteredMatches = vendorMatches.filter((pdf) => {
              const pdfMonth = pdf.fileDate.getMonth();
              const pdfYear = pdf.fileDate.getFullYear();
              const refMonth = transaction.parsedDate.getMonth();
              const refYear = transaction.parsedDate.getFullYear();

              // Même mois ou mois adjacent (±1)
              return (
                (pdfMonth === refMonth && pdfYear === refYear) || // Même mois
                (Math.abs(pdfMonth - refMonth) === 1 && pdfYear === refYear) || // Mois adjacent même année
                (pdfMonth === 11 &&
                  refMonth === 0 &&
                  pdfYear === refYear - 1) || // Décembre → Janvier
                (pdfMonth === 0 && refMonth === 11 && pdfYear === refYear + 1) // Janvier → Décembre
              );
            });

            if (dateFilteredMatches.length > 0) {
              // Trier par proximité de date
              const sortedByDateProximity = [...dateFilteredMatches].sort(
                (a, b) => {
                  const aDiff = Math.abs(
                    a.fileDate.getTime() - transaction.parsedDate.getTime()
                  );
                  const bDiff = Math.abs(
                    b.fileDate.getTime() - transaction.parsedDate.getTime()
                  );
                  return aDiff - bDiff;
                }
              );

              match = sortedByDateProximity[0];
              // eslint-disable-next-line no-console, no-undef
              console.log(
                `Match par nom de fournisseur et proximité de date: ${
                  match.fileName
                } (date: ${match.fileDate.toISOString().split("T")[0]})`
              );
            }
          }
        }

        // Si pas de match par nom de fournisseur, continuer avec la stratégie existante
        if (!match) {
          // Nouvelle approche: d'abord chercher les factures par date exacte
          const referenceDate =
            transaction.isCBTransaction && transaction.cbDate
              ? transaction.cbDate
              : transaction.parsedDate;

          // eslint-disable-next-line no-console, no-undef
          console.log(
            `Date de référence: ${referenceDate.toISOString().split("T")[0]}${
              transaction.isCBTransaction && transaction.cbDate
                ? " (extraite du libellé CB)"
                : " (date de transaction)"
            }`
          );

          // 1. Chercher les factures dont la date correspond exactement à la date de référence
          const exactDatePdfs = structuredPdfData.filter(
            (pdf) =>
              pdf.fileDate.getFullYear() === referenceDate.getFullYear() &&
              pdf.fileDate.getMonth() === referenceDate.getMonth() &&
              pdf.fileDate.getDate() === referenceDate.getDate()
          );

          // eslint-disable-next-line no-console, no-undef
          console.log(`Factures avec date exacte: ${exactDatePdfs.length}`);

          // 2. Vérifier si l'une de ces factures contient le montant recherché
          const exactDateAndAmountMatches = exactDatePdfs.filter((pdf) =>
            pdf.amounts.some(
              (amount) => Math.abs(amount - Math.abs(transaction.amount)) < 0.01
            )
          );

          if (exactDateAndAmountMatches.length > 0) {
            match = exactDateAndAmountMatches[0];
            // eslint-disable-next-line no-console, no-undef
            console.log(
              `Match parfait trouvé (date et montant): ${match.fileName}`
            );
          }
          // 3. Si aucune correspondance parfaite, vérifier si une facture avec la date exacte existe
          // même si le montant ne correspond pas exactement
          else if (exactDatePdfs.length > 0) {
            // Trier les factures par proximité de montant
            const sortedByAmountProximity = [...exactDatePdfs].sort((a, b) => {
              const aClosestAmount = a.amounts.reduce(
                (closest, amount) =>
                  Math.abs(amount - Math.abs(transaction.amount)) <
                  Math.abs(closest - Math.abs(transaction.amount))
                    ? amount
                    : closest,
                a.amounts[0]
              );
              const bClosestAmount = b.amounts.reduce(
                (closest, amount) =>
                  Math.abs(amount - Math.abs(transaction.amount)) <
                  Math.abs(closest - Math.abs(transaction.amount))
                    ? amount
                    : closest,
                b.amounts[0]
              );
              return (
                Math.abs(aClosestAmount - Math.abs(transaction.amount)) -
                Math.abs(bClosestAmount - Math.abs(transaction.amount))
              );
            });

            match = sortedByAmountProximity[0];
            const closestAmount = match.amounts.reduce(
              (closest, amount) =>
                Math.abs(amount - Math.abs(transaction.amount)) <
                Math.abs(closest - Math.abs(transaction.amount))
                  ? amount
                  : closest,
              match.amounts[0]
            );

            // eslint-disable-next-line no-console, no-undef
            console.log(
              `Match par date exacte trouvé, mais montant différent: ${
                match.fileName
              } (montant le plus proche: ${closestAmount.toFixed(
                2
              )}, différence: ${Math.abs(
                closestAmount - Math.abs(transaction.amount)
              ).toFixed(2)})`
            );
          }
          // 4. Si toujours aucune correspondance, appliquer la logique existante
          else {
            // a. Chercher une correspondance exacte de date et de montant
            const exactDateAndAmountMatches = structuredPdfData.filter(
              (pdf) =>
                pdf.fileDate.getFullYear() ===
                  transaction.parsedDate.getFullYear() &&
                pdf.fileDate.getMonth() === transaction.parsedDate.getMonth() &&
                pdf.fileDate.getDate() === transaction.parsedDate.getDate() &&
                pdf.amounts.some(
                  (amount) =>
                    Math.abs(amount - Math.abs(transaction.amount)) < 0.01
                )
            );

            if (exactDateAndAmountMatches.length > 0) {
              match = exactDateAndAmountMatches[0];
              // eslint-disable-next-line no-console, no-undef
              console.log(`Match exact trouvé: ${match.fileName}`);
            }
            // b. Si pas de correspondance exacte, chercher par proximité
            else {
              // Filtrer d'abord par montant
              const amountMatches = structuredPdfData.filter((pdf) =>
                pdf.amounts.some(
                  (amount) =>
                    Math.abs(amount - Math.abs(transaction.amount)) < 0.01
                )
              );

              if (amountMatches.length > 0) {
                // Pour les transactions CB, utiliser la logique spéciale
                if (transaction.isCBTransaction) {
                  // Utiliser la date extraite du libellé CB comme référence
                  const cbReferenceDate =
                    transaction.cbDate || transaction.parsedDate;

                  // eslint-disable-next-line no-console, no-undef
                  console.log(
                    `Date de référence pour CB: ${
                      cbReferenceDate.toISOString().split("T")[0]
                    }${
                      transaction.cbDate
                        ? " (extraite du libellé)"
                        : " (date de transaction par défaut)"
                    }`
                  );

                  // Afficher les factures candidates avec leurs dates pour le debug
                  // eslint-disable-next-line no-console, no-undef
                  console.log(
                    `Factures candidates (${amountMatches.length}):`,
                    amountMatches.map((pdf) => ({
                      nom: pdf.fileName,
                      date: pdf.fileDate.toISOString().split("T")[0],
                      mois: pdf.fileDate.getMonth() + 1,
                    }))
                  );

                  // Même mois, jours précédents
                  const sameMonthPrevDays = amountMatches
                    .filter(
                      (pdf) =>
                        pdf.fileDate.getFullYear() ===
                          cbReferenceDate.getFullYear() &&
                        pdf.fileDate.getMonth() ===
                          cbReferenceDate.getMonth() &&
                        pdf.fileDate.getDate() < cbReferenceDate.getDate()
                    )
                    .sort(
                      (a, b) => b.fileDate.getDate() - a.fileDate.getDate()
                    ); // Trier par jour décroissant

                  if (sameMonthPrevDays.length > 0) {
                    match = sameMonthPrevDays[0];
                    // eslint-disable-next-line no-console, no-undef
                    console.log(
                      `Match CB trouvé (même mois, jours précédents): ${match.fileName}`
                    );
                  } else {
                    // Même mois, jours suivants
                    const sameMonthNextDays = amountMatches
                      .filter(
                        (pdf) =>
                          pdf.fileDate.getFullYear() ===
                            cbReferenceDate.getFullYear() &&
                          pdf.fileDate.getMonth() ===
                            cbReferenceDate.getMonth() &&
                          pdf.fileDate.getDate() > cbReferenceDate.getDate()
                      )
                      .sort(
                        (a, b) => a.fileDate.getDate() - b.fileDate.getDate()
                      ); // Trier par jour croissant

                    if (sameMonthNextDays.length > 0) {
                      match = sameMonthNextDays[0];
                      // eslint-disable-next-line no-console, no-undef
                      console.log(
                        `Match CB trouvé (même mois, jours suivants): ${match.fileName}`
                      );
                    } else {
                      // Mois précédent
                      const prevMonth = new Date(cbReferenceDate);
                      prevMonth.setMonth(prevMonth.getMonth() - 1);

                      const prevMonthMatches = amountMatches
                        .filter(
                          (pdf) =>
                            pdf.fileDate.getFullYear() ===
                              prevMonth.getFullYear() &&
                            pdf.fileDate.getMonth() === prevMonth.getMonth()
                        )
                        .sort(
                          (a, b) => b.fileDate.getDate() - a.fileDate.getDate()
                        ); // Trier par jour décroissant

                      if (prevMonthMatches.length > 0) {
                        match = prevMonthMatches[0];
                        // eslint-disable-next-line no-console, no-undef
                        console.log(
                          `Match CB trouvé (mois précédent): ${match.fileName}`
                        );
                      } else {
                        // Mois suivant
                        const nextMonth = new Date(cbReferenceDate);
                        nextMonth.setMonth(nextMonth.getMonth() + 1);

                        const nextMonthMatches = amountMatches
                          .filter(
                            (pdf) =>
                              pdf.fileDate.getFullYear() ===
                                nextMonth.getFullYear() &&
                              pdf.fileDate.getMonth() === nextMonth.getMonth()
                          )
                          .sort(
                            (a, b) =>
                              a.fileDate.getDate() - b.fileDate.getDate()
                          ); // Trier par jour croissant

                        if (nextMonthMatches.length > 0) {
                          match = nextMonthMatches[0];
                          // eslint-disable-next-line no-console, no-undef
                          console.log(
                            `Match CB trouvé (mois suivant): ${match.fileName}`
                          );
                        } else {
                          // Si aucune correspondance n'est trouvée avec la stratégie précédente,
                          // on revient à la méthode de la différence de date la plus proche
                          const matchesWithDiff = amountMatches.map((pdf) => ({
                            ...pdf,
                            dateDiff: Math.abs(
                              pdf.fileDate.getTime() - cbReferenceDate.getTime()
                            ),
                          }));

                          // Trier par différence de date
                          matchesWithDiff.sort(
                            (a, b) => a.dateDiff - b.dateDiff
                          );
                          match = matchesWithDiff[0];

                          // eslint-disable-next-line no-console, no-undef
                          console.log(
                            `Match CB par proximité: ${
                              match.fileName
                            } (différence: ${Math.round(
                              match.dateDiff / (1000 * 60 * 60 * 24)
                            )} jours)`
                          );
                        }
                      }
                    }
                  }
                }
                // Pour les transactions non-CB, chercher par proximité de date
                else {
                  // Même mois, jours précédents
                  const sameMonthPrevDays = amountMatches
                    .filter(
                      (pdf) =>
                        pdf.fileDate.getFullYear() ===
                          transaction.parsedDate.getFullYear() &&
                        pdf.fileDate.getMonth() ===
                          transaction.parsedDate.getMonth() &&
                        pdf.fileDate.getDate() <
                          transaction.parsedDate.getDate()
                    )
                    .sort((a, b) => b.day - a.day); // Trier par jour décroissant

                  if (sameMonthPrevDays.length > 0) {
                    match = sameMonthPrevDays[0];
                    // eslint-disable-next-line no-console, no-undef
                    console.log(
                      `Match trouvé (même mois, jours précédents): ${match.fileName}`
                    );
                  } else {
                    // Même mois, jours suivants
                    const sameMonthNextDays = amountMatches
                      .filter(
                        (pdf) =>
                          pdf.fileDate.getFullYear() ===
                            transaction.parsedDate.getFullYear() &&
                          pdf.fileDate.getMonth() ===
                            transaction.parsedDate.getMonth() &&
                          pdf.fileDate.getDate() >
                            transaction.parsedDate.getDate()
                      )
                      .sort((a, b) => a.day - b.day); // Trier par jour croissant

                    if (sameMonthNextDays.length > 0) {
                      match = sameMonthNextDays[0];
                      // eslint-disable-next-line no-console, no-undef
                      console.log(
                        `Match trouvé (même mois, jours suivants): ${match.fileName}`
                      );
                    } else {
                      // Mois précédent
                      const prevMonth = new Date(transaction.parsedDate);
                      prevMonth.setMonth(prevMonth.getMonth() - 1);

                      const prevMonthMatches = amountMatches
                        .filter(
                          (pdf) =>
                            pdf.fileDate.getFullYear() ===
                              prevMonth.getFullYear() &&
                            pdf.fileDate.getMonth() === prevMonth.getMonth()
                        )
                        .sort((a, b) => b.day - a.day); // Trier par jour décroissant

                      if (prevMonthMatches.length > 0) {
                        match = prevMonthMatches[0];
                        // eslint-disable-next-line no-console, no-undef
                        console.log(
                          `Match trouvé (mois précédent): ${match.fileName}`
                        );
                      } else {
                        // Mois suivant
                        const nextMonth = new Date(transaction.parsedDate);
                        nextMonth.setMonth(nextMonth.getMonth() + 1);

                        const nextMonthMatches = amountMatches
                          .filter(
                            (pdf) =>
                              pdf.fileDate.getFullYear() ===
                                nextMonth.getFullYear() &&
                              pdf.fileDate.getMonth() === nextMonth.getMonth()
                          )
                          .sort((a, b) => a.day - b.day); // Trier par jour croissant

                        if (nextMonthMatches.length > 0) {
                          match = nextMonthMatches[0];
                          // eslint-disable-next-line no-console, no-undef
                          console.log(
                            `Match trouvé (mois suivant): ${match.fileName}`
                          );
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }

        if (match) {
          newMatches.set(transaction.reference, {
            handle: match.handle,
            path: match.path,
            fileDate: match.fileDate,
          });
        } else {
          // eslint-disable-next-line no-console, no-undef
          console.log("Aucun match trouvé");
        }

        processed++;
        setProgress(50 + Math.round((processed / transactions.length) * 50));
      }

      setMatches(newMatches);
      setDateRange({ start: startDate, end: endDate });
    } catch (err) {
      // eslint-disable-next-line no-console, no-undef
      console.error("Erreur lors du rapprochement:", err);
    } finally {
      setMatchingStatus("done");
    }
  };

  const formatAmount = (amount) => {
    // Convertir en nombre si c'est une chaîne
    const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;

    // Log pour déboguer
    // eslint-disable-next-line no-console, no-undef
    console.log(
      `formatAmount - montant reçu: ${amount}, type: ${typeof amount}, converti: ${numAmount}, est négatif: ${
        numAmount < 0
      }`
    );

    const formattedAmount = new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      signDisplay: "never", // Ne pas afficher le signe automatiquement
    }).format(Math.abs(numAmount));

    // Ajouter manuellement le signe + ou -
    const result =
      numAmount < 0 ? `-${formattedAmount}` : `+${formattedAmount}`;
    // eslint-disable-next-line no-console, no-undef
    console.log(`formatAmount - résultat: ${result}`);
    return result;
  };

  // Fonction pour supprimer une correspondance
  const removeMatch = (transactionReference) => {
    const newMatches = new Map(matches);
    newMatches.delete(transactionReference);
    setMatches(newMatches);
  };

  // Fonction pour marquer une transaction comme traitée manuellement
  const markAsManuallyProcessed = (transactionReference) => {
    const newManuallyMarked = new Set(manuallyMarked);
    newManuallyMarked.add(transactionReference);
    setManuallyMarked(newManuallyMarked);
  };

  // Fonction pour annuler le marquage manuel d'une transaction
  const unmarkManuallyProcessed = (transactionReference) => {
    const newManuallyMarked = new Set(manuallyMarked);
    newManuallyMarked.delete(transactionReference);
    setManuallyMarked(newManuallyMarked);
  };

  // Nettoyer les ressources lors de la fermeture de la modale
  useEffect(() => {
    return () => {
      // Nettoyer le worker Tesseract lors du démontage du composant
      // eslint-disable-next-line no-unused-vars
      terminateTesseractWorker().catch((err) => {
        // eslint-disable-next-line no-console, no-undef
        console.error(
          "Erreur lors de la terminaison du worker Tesseract:",
          err
        );
      });
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-base-200/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-base-100 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* En-tête */}
        <div className="p-6 border-b flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-neutral">
              Rapprochement bancaire
            </h2>
            <p className="text-neutral/70 mt-1">
              {transactions.length} transactions à traiter
            </p>
          </div>
          <button onClick={onClose} className="btn btn-ghost">
            Fermer
          </button>
        </div>

        {/* Contenu */}
        <div className="flex-1 overflow-auto p-6">
          {matchingStatus === "idle" ? (
            <div className="text-center py-12">
              <DocumentMagnifyingGlassIcon className="h-16 w-16 mx-auto text-primary/30" />
              <h3 className="text-xl font-semibold mt-4 text-neutral">
                Prêt à démarrer le rapprochement
              </h3>
              <p className="text-neutral/70 mt-2 max-w-md mx-auto">
                L&apos;assistant va analyser vos transactions et tenter de les
                associer aux factures présentes dans les dossiers sélectionnés.
              </p>
              <button onClick={startMatching} className="btn btn-primary mt-8">
                Démarrer l&apos;analyse
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {matchingStatus === "matching" && (
                <div className="w-full bg-base-200 rounded-full h-2 mb-8">
                  <div
                    className="bg-primary h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
              {/* Tableau des transactions */}
              <div className="overflow-x-auto">
                <table className="table table-zebra w-full">
                  <thead>
                    <tr>
                      <th className="w-32">Date de la transaction</th>
                      <th className="w-32">Date de la facture</th>
                      <th className="w-[40%]">Libellé</th>
                      <th className="w-32">Montant</th>
                      <th>Facture trouvée</th>
                      <th className="w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((transaction) => {
                      const match = matches.get(transaction.reference);
                      const isIgnored = shouldIgnoreTransaction(
                        transaction.libelle,
                        ignoredPatterns
                      );

                      // eslint-disable-next-line no-console, no-undef
                      console.log(
                        `Transaction ${transaction.reference}: "${transaction.libelle}" - Ignorée: ${isIgnored}`
                      );

                      return (
                        <tr
                          key={transaction.reference}
                          className={isIgnored ? "opacity-50 bg-base-300" : ""}
                        >
                          <td className="whitespace-nowrap">
                            {formatDate(transaction.date)}
                          </td>
                          <td className="whitespace-nowrap">
                            {match?.fileDate
                              ? match.fileDate.toISOString().split("T")[0]
                              : "-"}
                          </td>
                          <td className="max-w-0">
                            <div className="truncate">
                              {transaction.libelle}
                            </div>
                            {transaction.detail && (
                              <div className="text-xs text-neutral/50 truncate">
                                {transaction.detail}
                              </div>
                            )}
                          </td>
                          <td
                            className={`whitespace-nowrap font-medium ${
                              parseFloat(transaction.montant) < 0
                                ? "text-error"
                                : "text-success"
                            }`}
                          >
                            {/* eslint-disable-next-line no-console, no-undef */}
                            {console.log(
                              `Montant avant formatage: ${
                                transaction.montant
                              }, type: ${typeof transaction.montant}, est négatif: ${
                                parseFloat(transaction.montant) < 0
                              }`
                            )}
                            {formatAmount(transaction.montant)}
                          </td>
                          <td>
                            {matchingStatus === "matching" ? (
                              <div className="loading loading-dots loading-xs" />
                            ) : matchingStatus === "done" ? (
                              isIgnored ? (
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full bg-neutral" />
                                  <span className="text-sm text-neutral/70">
                                    Transaction ignorée
                                  </span>
                                </div>
                              ) : match ? (
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full bg-success" />
                                  <div className="truncate text-sm">
                                    {match.path.split("/").pop()}
                                  </div>
                                </div>
                              ) : manuallyMarked.has(transaction.reference) ? (
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full bg-success" />
                                  <span className="text-sm text-success">
                                    Traité manuellement
                                  </span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full bg-error" />
                                  <span className="text-sm text-neutral/50">
                                    Aucune correspondance
                                  </span>
                                </div>
                              )
                            ) : null}
                          </td>
                          <td>
                            {matchingStatus === "done" ? (
                              isIgnored ? (
                                <span className="text-neutral/50">-</span>
                              ) : match ? (
                                <button
                                  className="btn btn-ghost btn-sm text-error w-32"
                                  onClick={() =>
                                    removeMatch(transaction.reference)
                                  }
                                >
                                  Supprimer
                                </button>
                              ) : manuallyMarked.has(transaction.reference) ? (
                                <button
                                  className="btn btn-ghost btn-sm text-warning w-32"
                                  onClick={() =>
                                    unmarkManuallyProcessed(
                                      transaction.reference
                                    )
                                  }
                                >
                                  Annuler
                                </button>
                              ) : (
                                <button
                                  className="btn btn-ghost btn-sm text-success w-32"
                                  onClick={() =>
                                    markAsManuallyProcessed(
                                      transaction.reference
                                    )
                                  }
                                >
                                  À vérifier
                                </button>
                              )
                            ) : (
                              <span className="text-neutral/50">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

BankMatcher.propTypes = {
  transactions: PropTypes.arrayOf(
    PropTypes.shape({
      date: PropTypes.string.isRequired,
      reference: PropTypes.string.isRequired,
      libelle: PropTypes.string.isRequired,
      montant: PropTypes.number.isRequired,
      detail: PropTypes.string,
    })
  ).isRequired,
  folderHandle: PropTypes.object.isRequired,
  selectedFolders: PropTypes.instanceOf(Set).isRequired,
  onClose: PropTypes.func.isRequired,
};

export default BankMatcher;
