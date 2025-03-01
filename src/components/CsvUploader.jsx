import React, { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  ArrowUpTrayIcon,
  DocumentTextIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { CheckCircleIcon } from "@heroicons/react/24/solid";
import Papa from "papaparse";
import PropTypes from "prop-types";

function CsvUploader({ onDataLoaded }) {
  const [currentFile, setCurrentFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);

  const processTransactions = (data) => {
    // Trouver l'index de la ligne d'en-tête des colonnes
    const headerIndex = data.findIndex(
      (row) => row && typeof row[0] === "string" && row[0].startsWith("Date")
    );

    if (headerIndex === -1) {
      throw new Error(
        "Format invalide : impossible de trouver les en-têtes des colonnes"
      );
    }

    // eslint-disable-next-line no-console, no-undef
    console.log("En-têtes trouvées à l'index:", headerIndex);
    // eslint-disable-next-line no-console, no-undef
    console.log("En-têtes:", data[headerIndex]);

    // Extraire les transactions (toutes les lignes après l'en-tête)
    const transactions = data
      .slice(headerIndex + 1)
      .filter((row) => row && row.length >= 5) // Vérifier qu'on a au moins les colonnes essentielles
      .map((row) => {
        // Déterminer si c'est un débit ou un crédit
        const debitStr = row[3] && row[3].trim();
        const creditStr = row[4] && row[4].trim();

        // Calculer le montant avec le signe approprié
        let montant = 0;

        if (debitStr) {
          // Pour un débit, le montant doit être négatif
          // Enlever le signe - s'il est déjà présent dans la chaîne
          const debitValue = debitStr.replace(/^-/, "").replace(",", ".");
          montant = -Math.abs(parseFloat(debitValue)); // Assurer que c'est négatif
        } else if (creditStr) {
          // Pour un crédit, le montant doit être positif
          // Enlever le signe + s'il est présent dans la chaîne
          const creditValue = creditStr.replace(/^\+/, "").replace(",", ".");
          montant = Math.abs(parseFloat(creditValue)); // Assurer que c'est positif
        }

        // eslint-disable-next-line no-console, no-undef
        console.log(
          `Transaction: ${
            row[2]
          }, Débit: ${debitStr}, Crédit: ${creditStr}, Montant calculé: ${montant}, Est négatif: ${
            montant < 0
          }`
        );

        return {
          date: row[0],
          reference: row[1],
          libelle: row[2],
          montant: montant,
          detail: row[5] || "",
        };
      });

    if (transactions.length === 0) {
      throw new Error("Aucune transaction trouvée dans le fichier");
    }

    // eslint-disable-next-line no-console, no-undef
    console.log("Transactions traitées:", transactions);

    return transactions;
  };

  const onDrop = useCallback(
    (acceptedFiles) => {
      const file = acceptedFiles[0];
      if (file) {
        setIsProcessing(true);
        setError(null);
        setCurrentFile(file);

        Papa.parse(file, {
          complete: (results) => {
            try {
              const transactions = processTransactions(results.data);
              onDataLoaded(transactions);
              setIsProcessing(false);
            } catch (err) {
              setError(err.message);
              onDataLoaded([]);
              setIsProcessing(false);
            }
          },
          error: (error) => {
            setError(`Erreur de lecture : ${error.message}`);
            setIsProcessing(false);
            onDataLoaded([]);
          },
          delimiter: ";",
          encoding: "UTF-8",
          header: false, // On gère nous-mêmes les en-têtes
          skipEmptyLines: true,
        });
      }
    },
    [onDataLoaded]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "application/vnd.ms-excel": [".csv"],
      "text/plain": [".csv"],
    },
    multiple: false,
  });

  const handleReset = (e) => {
    e.stopPropagation();
    setCurrentFile(null);
    setError(null);
    onDataLoaded([]);
  };

  return (
    <div className="w-full">
      <div
        {...getRootProps()}
        className={`relative border-3 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all
          shadow-sm hover:shadow-md
          ${
            isDragActive
              ? "border-primary bg-primary/5 shadow-primary/20"
              : error
              ? "border-error bg-error/5 shadow-error/20"
              : currentFile
              ? "border-success bg-success/5 shadow-success/20"
              : "border-base-300 hover:border-primary bg-base-100 hover:bg-base-200/50"
          }`}
      >
        <input {...getInputProps()} />

        {currentFile ? (
          <div className="space-y-6">
            <div className="flex items-center justify-center gap-3 text-success">
              <CheckCircleIcon className="h-10 w-10" />
              <span className="text-xl font-semibold tracking-tight">
                {error
                  ? "Erreur de lecture du fichier"
                  : "Fichier chargé avec succès"}
              </span>
            </div>
            <div className="flex items-center justify-center gap-3 text-neutral/70">
              <DocumentTextIcon className="h-6 w-6" />
              <span className="text-lg">{currentFile.name}</span>
              <button
                onClick={handleReset}
                className="ml-2 p-2 rounded-full hover:bg-base-200 text-neutral/40 hover:text-error transition-colors"
                title="Supprimer le fichier"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            {isProcessing ? (
              <div className="mt-4">
                <div className="loading loading-dots loading-md"></div>
                <p className="text-sm text-neutral/60 mt-2">
                  Analyse du fichier en cours...
                </p>
              </div>
            ) : error ? (
              <div className="mt-4 text-error text-sm">{error}</div>
            ) : null}
          </div>
        ) : isDragActive ? (
          <div className="space-y-6">
            <ArrowUpTrayIcon className="h-16 w-16 mx-auto text-primary animate-bounce" />
            <p className="text-xl font-medium tracking-tight text-primary">
              Déposez le fichier ici...
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <ArrowUpTrayIcon className="h-16 w-16 mx-auto text-neutral/30" />
            <div className="space-y-3">
              <p className="text-xl font-medium tracking-tight text-neutral">
                Faites glisser un fichier ou cliquez pour sélectionner
                <br />
                votre relevé bancaire
              </p>
              <div className="text-base text-neutral/60 tracking-wide space-y-2">
                <p>Format accepté : CSV Caisse d&apos;Épargne (UTF-8)</p>
                <p className="text-sm">
                  Colonnes attendues : Date, Numéro d&apos;opération, Libellé,
                  Débit, Crédit, Détail
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

CsvUploader.propTypes = {
  onDataLoaded: PropTypes.func.isRequired,
};

export default CsvUploader;
