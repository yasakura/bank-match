/* global console, setTimeout, clearTimeout */
import React, { useState, useEffect } from "react";
import {
  FolderIcon,
  XMarkIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import PropTypes from "prop-types";

function FolderBrowser({ onFolderSelect, hasTransactions, onStartMatching }) {
  const [selectedPath, setSelectedPath] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [showLoader, setShowLoader] = useState(false);
  const [folderStructure, setFolderStructure] = useState(null);
  const [selectedFolders, setSelectedFolders] = useState(new Set());
  const [needsScan, setNeedsScan] = useState(false);

  useEffect(() => {
    let timeoutId;
    if (isScanning) {
      setShowLoader(true);
    } else {
      timeoutId = setTimeout(() => {
        setShowLoader(false);
      }, 500);
    }
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isScanning]);

  // Effet pour gérer le scan après la mise à jour de selectedFolders
  useEffect(() => {
    const performScan = async () => {
      if (needsScan && selectedPath) {
        const newStructure = await scanFolder(selectedPath);
        setFolderStructure(newStructure);
        onFolderSelect(selectedPath, newStructure);
        setNeedsScan(false);
      }
    };

    performScan();
  }, [selectedFolders, needsScan, selectedPath, onFolderSelect]);

  const toggleFolderSelection = (path, event) => {
    event.stopPropagation();
    const newSelected = new Set(selectedFolders);
    const wasSelected = newSelected.has(path);

    if (wasSelected) {
      newSelected.delete(path);
    } else {
      newSelected.add(path);
    }

    setSelectedFolders(newSelected);
    setNeedsScan(true);
  };

  const scanFolder = async (handle) => {
    setIsScanning(true);
    try {
      const structure = {
        tree: {},
        totalSubFolders: 0,
        totalPdfFiles: 0,
      };

      async function scanRecursive(handle, currentPath = [], isRoot = false) {
        const entries = await handle.values();
        let currentFolderSubCount = 0;

        for await (const entry of entries) {
          const rootFolder = currentPath[0];
          const shouldCount = isRoot || selectedFolders.has(rootFolder);

          if (entry.kind === "directory") {
            const dirHandle = await handle.getDirectoryHandle(entry.name);
            const newPath = [...currentPath, entry.name];

            if (isRoot) {
              // Au premier niveau, on enregistre juste le dossier dans l'arbre
              structure.tree[entry.name] = { folders: {}, files: [] };
            } else if (selectedFolders.has(rootFolder)) {
              // Si le dossier racine est sélectionné, on compte ce sous-dossier
              structure.totalSubFolders++;
            }

            // On continue à scanner récursivement
            const subCount = await scanRecursive(dirHandle, newPath, false);
            currentFolderSubCount += subCount;
          } else if (entry.name.toLowerCase().endsWith(".pdf") && shouldCount) {
            // On compte les PDF si on est dans un dossier sélectionné ou à la racine
            structure.totalPdfFiles++;
          }
        }

        return currentFolderSubCount;
      }

      await scanRecursive(handle, [], true);
      return structure;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Erreur lors du scan du dossier:", err);
      return null;
    } finally {
      setIsScanning(false);
    }
  };

  const handleFolderSelect = async () => {
    try {
      const handle = await window.showDirectoryPicker();
      setSelectedPath(handle);
      setSelectedFolders(new Set());
      const initialStructure = await scanFolder(handle);
      setFolderStructure(initialStructure);
      onFolderSelect(handle, initialStructure);
    } catch (err) {
      if (err.name !== "AbortError") {
        // eslint-disable-next-line no-console
        console.error("Erreur lors de la sélection du dossier:", err);
      }
    }
  };

  const handleReset = () => {
    setSelectedPath(null);
    setFolderStructure(null);
    setSelectedFolders(new Set());
    onFolderSelect(null, null);
  };

  const renderFolders = () => {
    if (!folderStructure?.tree) return null;

    return Object.entries(folderStructure.tree).map(([name]) => {
      const path = name;
      const isSelected = selectedFolders.has(path);

      return (
        <div
          key={path}
          className="flex items-center gap-4 py-2 px-2 hover:bg-base-200/50 rounded-lg"
        >
          <label className="flex items-center gap-2 text-neutral/80 hover:text-neutral w-full cursor-pointer">
            <input
              type="checkbox"
              className="checkbox checkbox-sm checkbox-primary"
              checked={isSelected}
              onChange={(e) => toggleFolderSelection(path, e)}
            />
            <div className="flex items-center gap-2">
              <FolderIcon className="h-5 w-5 shrink-0" />
              <span className="font-medium">{name}</span>
            </div>
          </label>
        </div>
      );
    });
  };

  return (
    <div className="w-full space-y-4">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-neutral">
          Sélection du dossier de factures
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={selectedPath ? handleReset : handleFolderSelect}
            className={`btn btn-sm gap-2 ${
              selectedPath
                ? "btn-error btn-outline hover:bg-error/10"
                : "btn-primary"
            }`}
          >
            {selectedPath ? (
              <>
                <XMarkIcon className="h-5 w-5" />
                Supprimer le dossier
              </>
            ) : (
              <>
                <FolderIcon className="h-5 w-5" />
                Choisir un dossier
              </>
            )}
          </button>
        </div>
      </div>

      {/* Zone de prévisualisation */}
      <div className="border rounded-xl p-4 bg-base-200/50 min-h-[200px] max-h-[400px] overflow-y-auto relative">
        {showLoader && (
          <div className="absolute inset-0 bg-base-100/60 backdrop-blur-sm flex items-center justify-center z-10">
            <div className="text-center">
              <div className="loading loading-spinner loading-lg text-primary"></div>
              <p className="mt-4 text-neutral font-medium">
                Analyse en cours...
              </p>
            </div>
          </div>
        )}
        {selectedPath ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between sticky top-0 bg-base-200/50 backdrop-blur-sm p-2 -m-2 rounded-t-xl">
              <div className="text-sm text-neutral/70">
                Structure détectée :
              </div>
              <div className="text-sm text-neutral/60">{selectedPath.name}</div>
            </div>
            <div className="divide-y divide-base-300/50">{renderFolders()}</div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-[200px] text-neutral/50">
            <FolderIcon className="h-12 w-12 mb-4" />
            <p>Sélectionnez un dossier contenant vos factures</p>
            <p className="text-sm mt-2">
              Structure recommandée : année/mois/factures
            </p>
          </div>
        )}
      </div>

      {/* Informations et statistiques */}
      {folderStructure && (
        <div className="grid grid-cols-3 gap-4">
          <div className="stat bg-base-200/70 rounded-xl p-3">
            <div className="stat-title text-[11px] truncate">
              Dossiers sélectionnés
            </div>
            <div className="stat-value text-lg">{selectedFolders.size}</div>
          </div>
          <div className="stat bg-base-200/70 rounded-xl p-3">
            <div className="stat-title text-[11px] truncate">Sous-dossiers</div>
            <div className="stat-value text-lg">
              {folderStructure.totalSubFolders}
            </div>
          </div>
          <div className="stat bg-base-200/70 rounded-xl p-3">
            <div className="stat-title text-[11px] truncate">Fichiers PDF</div>
            <div className="stat-value text-lg">
              {folderStructure.totalPdfFiles}
            </div>
          </div>
        </div>
      )}

      {/* Bouton de rapprochement */}
      <button
        onClick={onStartMatching}
        className={`btn btn-primary w-full gap-2 ${
          !(hasTransactions && selectedFolders.size > 0) ? "hidden" : ""
        }`}
        disabled={isScanning}
      >
        <ArrowPathIcon className="h-5 w-5" />
        Lancer le rapprochement bancaire
      </button>
    </div>
  );
}

FolderBrowser.propTypes = {
  onFolderSelect: PropTypes.func.isRequired,
  hasTransactions: PropTypes.bool,
  onStartMatching: PropTypes.func,
};

FolderBrowser.defaultProps = {
  hasTransactions: false,
  onStartMatching: () => {},
};

export default FolderBrowser;
