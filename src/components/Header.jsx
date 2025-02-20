import React, { useState } from "react";
import { DocumentCheckIcon } from "@heroicons/react/24/outline";

const baselines = [
  "Automatisez vos rapprochements bancaires en un clic",
  "La réconciliation bancaire, simple et intelligente",
  "Simplifiez votre comptabilité, gagnez du temps",
];

function Header() {
  const [currentBaseline] = useState(0);

  return (
    <header className="relative py-12 overflow-hidden">
      {/* Effet de fond subtil */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-secondary/5" />

      <div className="relative">
        {/* Logo et titre */}
        <div className="flex items-center justify-center gap-3 mb-4">
          <DocumentCheckIcon className="h-12 w-12 text-primary" />
          <h1 className="text-5xl font-extrabold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            BankMatch
          </h1>
        </div>

        {/* Baseline */}
        <p className="text-xl text-center text-base-content/80 font-light max-w-2xl mx-auto">
          {baselines[currentBaseline]}
        </p>
      </div>
    </header>
  );
}

export default Header;
