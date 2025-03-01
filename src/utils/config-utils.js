/* global fetch, console */

/**
 * Charge les patterns de transactions à ignorer depuis le fichier JSON
 * @returns {Promise<string[]>} Liste des patterns à ignorer
 */
export const loadIgnoredPatterns = async () => {
  try {
    const response = await fetch("/ignored-patterns.json");
    if (!response.ok) {
      console.error(
        "Erreur lors du chargement des patterns ignorés:",
        response.statusText
      );
      return [];
    }
    const data = await response.json();
    return data.ignoredPatterns || [];
  } catch (error) {
    console.error("Erreur lors du chargement des patterns ignorés:", error);
    return [];
  }
};

/**
 * Vérifie si une transaction doit être ignorée en fonction de son libellé
 * @param {string} libelle - Le libellé de la transaction
 * @param {string[]} ignoredPatterns - Liste des patterns à ignorer
 * @returns {boolean} True si la transaction doit être ignorée
 */
export const shouldIgnoreTransaction = (libelle, ignoredPatterns) => {
  if (!libelle || !ignoredPatterns || !ignoredPatterns.length) return false;

  return ignoredPatterns.some((pattern) => libelle.includes(pattern));
};
