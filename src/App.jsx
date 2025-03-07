import React, { useState } from "react";
import CsvUploader from "./components/CsvUploader";
import FolderBrowser from "./components/FolderBrowser";
import BankMatcher from "./components/BankMatcher";
import Header from "./components/Header";

function App() {
  const [transactions, setTransactions] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [selectedFolders, setSelectedFolders] = useState(new Set());
  const [showMatcher, setShowMatcher] = useState(false);

  const handleDataLoaded = (data) => {
    // Vérifier que les montants sont bien des nombres avec leur signe
    const dataWithCheckedAmounts = data.map((transaction) => {
      // S'assurer que le montant est un nombre
      const montant =
        typeof transaction.montant === "string"
          ? parseFloat(transaction.montant)
          : transaction.montant;

      // eslint-disable-next-line no-console, no-undef
      console.log(
        `Transaction: ${transaction.libelle}, Montant original: ${
          transaction.montant
        }, Type: ${typeof transaction.montant}, Montant vérifié: ${montant}`
      );

      return {
        ...transaction,
        montant: montant,
      };
    });

    setTransactions(dataWithCheckedAmounts);
    // eslint-disable-next-line no-console, no-undef
    console.log("Données chargées:", dataWithCheckedAmounts);
  };

  const handleFolderSelect = (handle, structure) => {
    setSelectedFolder(handle);
    // Réinitialiser les dossiers sélectionnés si on change de dossier racine
    if (!handle) {
      setSelectedFolders(new Set());
    }
  };

  const handleFoldersSelected = (folders) => {
    setSelectedFolders(folders);
  };

  const handleStartMatching = async () => {
    setShowMatcher(true);
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-base-200/50 to-base-100">
      <Header />
      <main className="w-full max-w-5xl mx-auto px-4 py-8">
        <div className="card bg-base-100 shadow-2xl">
          <div className="card-body space-y-8">
            <div className="space-y-3">
              <h2 className="text-3xl font-bold tracking-tight text-neutral">
                Rapprochement bancaire simplifié
              </h2>
              <p className="text-lg text-neutral/80 leading-relaxed max-w-2xl">
                Importez vos relevés bancaires et vos factures pour un
                rapprochement automatique et intelligent.
              </p>
            </div>

            <div className="divider" />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-4">
                <h3 className="text-xl font-semibold text-neutral">
                  1. Import du relevé bancaire
                </h3>
                <div className="bg-base-200/50 rounded-xl p-6">
                  <CsvUploader onDataLoaded={handleDataLoaded} />
                </div>
                {transactions.length > 0 && (
                  <div className="flex items-center gap-2 px-2">
                    <div className="w-2 h-2 rounded-full bg-success"></div>
                    <p className="text-sm text-neutral/70">
                      {transactions.length} transactions chargées
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <h3 className="text-xl font-semibold text-neutral">
                  2. Sélection des factures
                </h3>
                <FolderBrowser
                  onFolderSelect={handleFolderSelect}
                  onFoldersSelected={handleFoldersSelected}
                  hasTransactions={transactions.length > 0}
                  onStartMatching={handleStartMatching}
                />
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Modal de rapprochement */}
      {showMatcher && (
        <BankMatcher
          transactions={transactions}
          folderHandle={selectedFolder}
          selectedFolders={selectedFolders}
          onClose={() => setShowMatcher(false)}
        />
      )}
    </div>
  );
}

export default App;
