import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { DocumentMagnifyingGlassIcon } from "@heroicons/react/24/outline";

function BankMatcher({ transactions, folderHandle, selectedFolders, onClose }) {
  const [matchingStatus, setMatchingStatus] = useState("idle"); // idle, matching, done
  const [matches, setMatches] = useState([]); // [{transaction, pdfPath, score}]

  // Désactiver le scroll du body quand la modale est ouverte
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, []);

  const startMatching = async () => {
    setMatchingStatus("matching");
    // TODO: Implémenter la logique de rapprochement
    setMatchingStatus("done");
  };

  const formatDate = (dateStr) => {
    const [day, month, year] = dateStr.split("/");
    return `${year}-${month}-${day}`;
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
              {/* Tableau des transactions */}
              <div className="overflow-x-auto">
                <table className="table table-zebra w-full">
                  <thead>
                    <tr>
                      <th className="w-32">Date</th>
                      <th className="w-[40%]">Libellé</th>
                      <th className="w-32">Montant</th>
                      <th>Facture trouvée</th>
                      <th className="w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((transaction) => (
                      <tr key={transaction.reference}>
                        <td className="whitespace-nowrap">
                          {formatDate(transaction.date)}
                        </td>
                        <td className="max-w-0">
                          <div className="truncate">{transaction.libelle}</div>
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
                          ) : (
                            "En attente..."
                          )}
                        </td>
                        <td>
                          <button className="btn btn-ghost btn-sm" disabled>
                            Voir
                          </button>
                        </td>
                      </tr>
                    ))}
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
