import React, { useState } from "react";
import CsvUploader from "./components/CsvUploader";
import Header from "./components/Header";

function App() {
  const [transactions, setTransactions] = useState([]);

  const handleDataLoaded = (data) => {
    setTransactions(data);
    // eslint-disable-next-line no-console
    console.log("Données chargées:", data);
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

            <div className="bg-base-200/50 rounded-xl p-6">
              <CsvUploader onDataLoaded={handleDataLoaded} />
            </div>

            {transactions.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-success"></div>
                  <h3 className="text-xl font-semibold tracking-tight text-neutral">
                    {transactions.length} transactions chargées
                  </h3>
                </div>
                {/* Nous ajouterons le tableau des transactions ici plus tard */}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
