import React from "react";

function App() {
  return (
    <div className="min-h-screen bg-base-100">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-5xl font-bold text-center mb-8">BankMatch</h1>
        <div className="card bg-base-200 shadow-xl">
          <div className="card-body">
            <h2 className="card-title text-2xl mb-4">
              Rapprochement bancaire simplifié
            </h2>
            <p className="text-lg">
              Importez vos relevés bancaires et vos factures pour un
              rapprochement automatique et intelligent.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
