import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { DocumentMagnifyingGlassIcon } from "@heroicons/react/24/outline";
import * as pdfjsLib from "pdfjs-dist";

// Initialiser le worker PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

function BankMatcher({ transactions, folderHandle, selectedFolders, onClose }) {
  const [matchingStatus, setMatchingStatus] = useState("idle"); // idle, matching, done
  const [matches, setMatches] = useState(new Map()); // Map<transactionRef, {pdfHandle, score}>
  const [progress, setProgress] = useState(0);
  const [pdfCache, setPdfCache] = useState(new Map()); // Cache pour stocker le contenu des PDF
  const [dateRange, setDateRange] = useState({ start: null, end: null });

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
        // eslint-disable-next-line no-console, no-undef
        console.log(`- Entrée trouvée: ${entry.name} (${entry.kind})`);

        if (
          entry.kind === "file" &&
          entry.name.toLowerCase().endsWith(".pdf")
        ) {
          files.push({
            handle: entry,
            path: path ? `${path}/${entry.name}` : entry.name,
          });
          // eslint-disable-next-line no-console, no-undef
          console.log(`  → PDF ajouté: ${path}/${entry.name}`);
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
      // eslint-disable-next-line no-console, no-undef
      console.log("Début de la lecture du PDF");

      // Convertir le FileHandle en ArrayBuffer
      const file = await fileHandle.getFile();
      const arrayBuffer = await file.arrayBuffer();

      // eslint-disable-next-line no-console, no-undef
      console.log("PDF chargé en mémoire, création du document...");

      // Charger le PDF
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = "";

      // eslint-disable-next-line no-console, no-undef
      console.log(`PDF chargé, lecture des ${pdf.numPages} pages...`);

      // Extraire le texte de chaque page
      for (let i = 1; i <= pdf.numPages; i++) {
        // eslint-disable-next-line no-console, no-undef
        console.log(`Lecture de la page ${i}...`);
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item) => item.str).join(" ");
        fullText += pageText + "\n";
        // eslint-disable-next-line no-console, no-undef
        console.log(`Page ${i} : ${pageText.substring(0, 100)}...`);
      }

      // Rechercher des montants dans le texte (format: 123,45 ou 123.45)
      const amounts =
        fullText
          .replace(/(\d+),(\d{2})/g, "$1.$2") // Convertir toutes les virgules en points
          .match(/\d+\.\d{2}/g) || [];
      const parsedAmounts = amounts.map((amount) => parseFloat(amount));

      // eslint-disable-next-line no-console, no-undef
      console.log("Montants trouvés dans le PDF:", parsedAmounts);
      // eslint-disable-next-line no-console, no-undef
      console.log("Texte extrait:", fullText.substring(0, 200) + "...");

      return {
        text: fullText,
        amounts: parsedAmounts,
      };
    } catch (err) {
      // eslint-disable-next-line no-console, no-undef
      console.error("Erreur détaillée lors de la lecture du PDF:", {
        message: err.message,
        stack: err.stack,
        name: err.name,
      });
      return null;
    }
  };

  const findMatchingFiles = async (transaction, pdfFiles, cache, dateRange) => {
    // eslint-disable-next-line no-console, no-undef
    console.log("\n=== Nouvelle recherche ===");
    // eslint-disable-next-line no-console, no-undef
    console.log("Transaction:", {
      date: transaction.date,
      libelle: transaction.libelle,
      montant: transaction.montant,
      detail: transaction.detail,
    });

    const formattedDate = formatDate(transaction.date);
    const transactionDate = new Date(formattedDate);
    const amount = Math.abs(transaction.montant);

    // eslint-disable-next-line no-console, no-undef
    console.log("Critères de recherche:", {
      dateFormatee: formattedDate,
      montant: amount,
    });

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

    for (const pdf of pdfFiles) {
      try {
        // eslint-disable-next-line no-console, no-undef
        console.log("\nAnalyse du fichier:", pdf.path);

        // Utiliser le contenu en cache
        const pdfContent = cache.get(pdf.path);
        if (!pdfContent) {
          // eslint-disable-next-line no-console, no-undef
          console.log("→ Fichier ignoré : contenu non trouvé dans le cache");
          continue;
        }

        // eslint-disable-next-line no-console, no-undef
        console.log("Contenu du PDF:", {
          taille: pdfContent.text.length,
          extrait: pdfContent.text.substring(0, 100),
          montantsTrouves: pdfContent.amounts,
        });

        // 1. Vérifier le montant
        const hasMatchingAmount = pdfContent.amounts.some(
          (pdfAmount) => Math.abs(pdfAmount - amount) < 0.01
        );

        if (!hasMatchingAmount) {
          // eslint-disable-next-line no-console, no-undef
          console.log("→ Fichier ignoré : montant non trouvé");
          // eslint-disable-next-line no-console, no-undef
          console.log("  Montants PDF:", pdfContent.amounts);
          // eslint-disable-next-line no-console, no-undef
          console.log("  Montant recherché:", amount);
          continue;
        }

        // 2. Vérifier la date
        let fileDate = null;
        let dateSource = "";

        // Chercher dans le nom du fichier d'abord
        const fileNameMatch = pdf.path.match(/\d{4}[-]?\d{2}[-]?\d{2}/);
        if (fileNameMatch) {
          const possibleDate = parseDate(fileNameMatch[0].replace(/-/g, "-"));
          if (possibleDate) {
            fileDate = possibleDate;
            dateSource = "nom du fichier";
          }
        }

        // Si pas de date dans le nom, chercher dans le contenu
        if (!fileDate) {
          // Chercher tous les formats possibles de date dans le texte
          const dateMatches =
            pdfContent.text.match(/\d{1,4}[/-]\d{1,2}[/-]\d{1,4}/g) || [];

          for (const dateStr of dateMatches) {
            const possibleDate = parseDate(dateStr);
            if (possibleDate) {
              // Si on n'a pas encore de date ou si cette date est plus proche de la date de transaction
              if (
                !fileDate ||
                Math.abs(possibleDate - transactionDate) <
                  Math.abs(fileDate - transactionDate)
              ) {
                fileDate = possibleDate;
                dateSource = "contenu";
              }
            }
          }
        }

        if (!fileDate) {
          // eslint-disable-next-line no-console, no-undef
          console.log("→ Fichier ignoré : pas de date valide trouvée");
          continue;
        }

        // eslint-disable-next-line no-console, no-undef
        console.log(
          `- Date trouvée dans ${dateSource}:`,
          fileDate.toISOString().split("T")[0]
        );

        // Vérifier si la date est dans la plage du CSV
        if (
          fileDate &&
          dateRange.start &&
          dateRange.end &&
          fileDate >= dateRange.start &&
          fileDate <= dateRange.end
        ) {
          // eslint-disable-next-line no-console, no-undef
          console.log("→ Match trouvé ! Date et montant correspondent.");
          return {
            handle: pdf.handle,
            path: pdf.path,
            score: 100,
            fileDate: fileDate,
          };
        } else {
          // eslint-disable-next-line no-console, no-undef
          console.log(
            `→ Fichier ignoré : date ${
              fileDate ? "hors plage" : "invalide"
            } (plage attendue : ${
              dateRange.start
                ? dateRange.start.toISOString().split("T")[0]
                : "non définie"
            } - ${
              dateRange.end
                ? dateRange.end.toISOString().split("T")[0]
                : "non définie"
            })`
          );
        }
      } catch (err) {
        // eslint-disable-next-line no-console, no-undef
        console.error("Erreur lors de l'analyse du fichier:", pdf.path, err);
      }
    }

    // eslint-disable-next-line no-console, no-undef
    console.log("\nAucun match trouvé");
    return null;
  };

  const startMatching = async () => {
    setMatchingStatus("matching");
    setProgress(0);

    try {
      // Calculer la plage de dates du CSV
      const dates = transactions.map((t) => new Date(formatDate(t.date)));
      const endDate = new Date(Math.max(...dates));
      const startDate = new Date(Math.min(...dates));

      // Étendre la date de début de 45 jours dans le passé
      startDate.setDate(startDate.getDate() - 45);

      // Définir la plage de dates localement plutôt que dans l'état
      const localDateRange = { start: startDate, end: endDate };

      // eslint-disable-next-line no-console, no-undef
      console.log("Plage de dates du CSV (étendue):", {
        début: startDate.toISOString().split("T")[0],
        fin: endDate.toISOString().split("T")[0],
      });

      // Récupérer tous les fichiers PDF des dossiers sélectionnés
      const pdfFiles = [];
      // eslint-disable-next-line no-console, no-undef
      console.log("Dossiers sélectionnés:", [...selectedFolders]);
      // eslint-disable-next-line no-console, no-undef
      console.log("Handle du dossier racine:", folderHandle);

      for (const folderName of selectedFolders) {
        try {
          // eslint-disable-next-line no-console, no-undef
          console.log("Scan du dossier:", folderName);
          const dirHandle = await folderHandle.getDirectoryHandle(folderName);
          const files = await scanFolder(dirHandle, folderName);
          // eslint-disable-next-line no-console, no-undef
          console.log(`Fichiers trouvés dans ${folderName}:`, files);
          pdfFiles.push(...files);
        } catch (err) {
          // eslint-disable-next-line no-console, no-undef
          console.error(`Erreur lors du scan de ${folderName}:`, err);
        }
      }

      // eslint-disable-next-line no-console, no-undef
      console.log("Total des fichiers PDF trouvés:", pdfFiles.length);

      // Pré-charger tous les PDF
      const newPdfCache = new Map();
      let loadedPdfs = 0;

      // eslint-disable-next-line no-console, no-undef
      console.log("Chargement initial des PDF...");

      for (const pdf of pdfFiles) {
        const content = await extractPdfContent(pdf.handle);
        if (content) {
          newPdfCache.set(pdf.path, content);
        }
        loadedPdfs++;
        setProgress(Math.round((loadedPdfs / pdfFiles.length) * 50)); // 50% de la barre de progression pour le chargement
      }

      setPdfCache(newPdfCache);

      // eslint-disable-next-line no-console, no-undef
      console.log(`${newPdfCache.size} PDF chargés en mémoire`);

      // Pour chaque transaction, chercher les fichiers correspondants
      const newMatches = new Map();
      let processed = 0;

      for (const transaction of transactions) {
        const match = await findMatchingFiles(
          transaction,
          pdfFiles,
          newPdfCache,
          localDateRange
        );
        if (match) {
          newMatches.set(transaction.reference, match);
        }
        processed++;
        setProgress(50 + Math.round((processed / transactions.length) * 50));
      }

      setMatches(newMatches);
      // Mettre à jour dateRange à la fin
      setDateRange(localDateRange);
    } catch (err) {
      // eslint-disable-next-line no-console, no-undef
      console.error("Erreur lors du rapprochement:", err);
    } finally {
      setMatchingStatus("done");
    }
  };

  const formatAmount = (amount) => {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
    }).format(amount);
  };

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
                      return (
                        <tr key={transaction.reference}>
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
                              transaction.montant < 0
                                ? "text-error"
                                : "text-success"
                            }`}
                          >
                            {formatAmount(transaction.montant)}
                          </td>
                          <td>
                            {matchingStatus === "matching" ? (
                              <div className="loading loading-dots loading-xs" />
                            ) : match ? (
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-success" />
                                <div className="truncate text-sm">
                                  {match.path.split("/").pop()}
                                  <span className="text-xs text-neutral/50 ml-2">
                                    ({Math.round(match.score)}%)
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-error" />
                                <span className="text-sm text-neutral/50">
                                  Aucune correspondance
                                </span>
                              </div>
                            )}
                          </td>
                          <td>
                            <button
                              className="btn btn-ghost btn-sm"
                              disabled={!match}
                              onClick={() => {
                                if (match) {
                                  // TODO: Afficher le PDF
                                }
                              }}
                            >
                              Voir
                            </button>
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
