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

  const onDrop = useCallback(
    (acceptedFiles) => {
      const file = acceptedFiles[0];
      if (file) {
        setIsProcessing(true);
        setCurrentFile(file);

        Papa.parse(file, {
          complete: (results) => {
            const { data, errors } = results;
            if (errors.length === 0) {
              onDataLoaded(data);
            } else {
              // eslint-disable-next-line no-console
              console.error("Erreur lors du parsing du CSV:", errors);
            }
            setIsProcessing(false);
          },
          header: true,
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
    },
    multiple: false,
  });

  const handleReset = (e) => {
    e.stopPropagation();
    setCurrentFile(null);
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
                Fichier chargé avec succès
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
            {isProcessing && (
              <div className="mt-4">
                <div className="loading loading-dots loading-md"></div>
                <p className="text-sm text-neutral/60 mt-2">
                  Analyse du fichier en cours...
                </p>
              </div>
            )}
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
              <p className="text-base text-neutral/60 tracking-wide">
                Format accepté : CSV
              </p>
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
