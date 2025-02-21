/* global console, setTimeout, clearTimeout */
import React, { useState, useEffect } from "react";
import {
  FolderIcon,
  ChevronRightIcon,
  DocumentIcon,
  XMarkIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import PropTypes from "prop-types";

function FolderBrowser({ onFolderSelect }) {
  const [selectedPath, setSelectedPath] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [showLoader, setShowLoader] = useState(false);
  const [folderStructure, setFolderStructure] = useState(null);
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const [selectedFolders, setSelectedFolders] = useState(new Set());

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

  const toggleFolder = (path) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedFolders(newExpanded);
  };

  const toggleFolderSelection = async (path, event) => {
    event.stopPropagation();
    const newSelected = new Set(selectedFolders);
    if (newSelected.has(path)) {
      newSelected.delete(path);
    } else {
      newSelected.add(path);
    }
    setSelectedFolders(newSelected);

    if (selectedPath) {
      await scanFolder(selectedPath);
    }
  };

  const scanFolder = async (handle) => {
    setIsScanning(true);
    try {
      const structure = {
        years: new Set(),
        folders: 0,
        files: 0,
        tree: {},
      };

      // Fonction pour créer ou obtenir un nœud dans l'arbre
      const getNode = (path) => {
        let current = structure.tree;
        for (const segment of path) {
          if (!current[segment]) {
            current[segment] = { folders: {}, files: [] };
          }
          current = current[segment].folders;
        }
        return current;
      };

      // Parcours récursif du dossier
      async function scanRecursive(handle, currentPath = []) {
        const entries = await handle.values();
        const currentNode = getNode(currentPath);
        const fullPath = currentPath.join("/");

        // Si le dossier n'est pas sélectionné, on ne scanne pas son contenu
        if (currentPath.length > 0 && !selectedFolders.has(fullPath)) {
          return;
        }

        for await (const entry of entries) {
          if (entry.kind === "directory") {
            structure.folders++;
            if (entry.name.match(/^20\d{2}$/)) {
              structure.years.add(entry.name);
            }
            const dirHandle = await handle.getDirectoryHandle(entry.name);
            await scanRecursive(dirHandle, [...currentPath, entry.name]);
          } else if (entry.name.toLowerCase().endsWith(".pdf")) {
            structure.files++;
            if (!currentNode.files) currentNode.files = [];
            currentNode.files.push(entry.name);
          }
        }
      }

      await scanRecursive(handle);

      // Conversion des données pour l'affichage
      const stats = {
        years: Array.from(structure.years).sort(),
        folders: structure.folders,
        files: structure.files,
        tree: structure.tree,
      };

      setFolderStructure(stats);
      onFolderSelect(handle, stats);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Erreur lors du scan du dossier:", err);
    } finally {
      setIsScanning(false);
    }
  };

  const handleFolderSelect = async () => {
    try {
      const handle = await window.showDirectoryPicker();
      setSelectedPath(handle);
      setExpandedFolders(new Set());
      setSelectedFolders(new Set());
      await scanFolder(handle);
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
    setExpandedFolders(new Set());
    setSelectedFolders(new Set());
    onFolderSelect(null, null);
  };

  const renderTree = (node, path = []) => {
    if (!node) return null;

    const currentPath = path.join("/");
    const isExpanded = expandedFolders.has(currentPath);
    const isSelected = selectedFolders.has(currentPath);

    return (
      <div className="space-y-1">
        {/* Afficher d'abord les sous-dossiers */}
        {Object.entries(node).map(([name, content]) => {
          if (!content.folders) return null;

          const newPath = [...path, name];
          const folderPath = newPath.join("/");
          const hasSubItems =
            Object.keys(content.folders).length > 0 ||
            (content.files && content.files.length > 0);

          return (
            <div key={name} className="space-y-1">
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-neutral/80 hover:text-neutral w-full cursor-pointer">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm checkbox-primary"
                    checked={selectedFolders.has(folderPath)}
                    onChange={(e) => toggleFolderSelection(folderPath, e)}
                  />
                  <button
                    onClick={() => toggleFolder(folderPath)}
                    className="flex items-center gap-2 flex-1"
                  >
                    <FolderIcon className="h-5 w-5 shrink-0" />
                    <span className="truncate">{name}</span>
                    {hasSubItems && (
                      <div className="shrink-0">
                        {isExpanded ? (
                          <ChevronDownIcon className="h-4 w-4" />
                        ) : (
                          <ChevronRightIcon className="h-4 w-4" />
                        )}
                      </div>
                    )}
                  </button>
                </label>
              </div>
              {isExpanded && hasSubItems && (
                <div className="pl-6 space-y-1">
                  {/* Afficher les sous-dossiers récursivement */}
                  {renderTree(content.folders, newPath)}
                  {/* Afficher les fichiers du dossier courant si sélectionné */}
                  {isSelected &&
                    content.files &&
                    content.files.map((fileName) => (
                      <div
                        key={fileName}
                        className="flex items-center gap-2 text-neutral/60"
                      >
                        <DocumentIcon className="h-4 w-4" />
                        <span className="text-sm truncate">{fileName}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
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
            {folderStructure && (
              <div className="pl-4 pt-2">
                {renderTree(folderStructure.tree)}
              </div>
            )}
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
          <div className="stat bg-base-200/70 rounded-xl p-4">
            <div className="stat-title text-xs">Années</div>
            <div className="stat-value text-lg">
              {folderStructure.years.length}
            </div>
            <div className="stat-desc">{folderStructure.years.join("-")}</div>
          </div>
          <div className="stat bg-base-200/70 rounded-xl p-4">
            <div className="stat-title text-xs">Dossiers sélectionnés</div>
            <div className="stat-value text-lg">{selectedFolders.size}</div>
            <div className="stat-desc">
              sur {folderStructure.folders} dossiers
            </div>
          </div>
          <div className="stat bg-base-200/70 rounded-xl p-4">
            <div className="stat-title text-xs">Factures</div>
            <div className="stat-value text-lg">{folderStructure.files}</div>
            <div className="stat-desc">PDF détectés</div>
          </div>
        </div>
      )}
    </div>
  );
}

FolderBrowser.propTypes = {
  onFolderSelect: PropTypes.func.isRequired,
};

export default FolderBrowser;
