/**
 * Abbreviate partner deck names for display
 * Takes text before first comma from each commander and joins with " & "
 * 
 * Note: Double-faced cards (DFCs) are stored with only the front face in Sheets,
 * so they will not contain " // " and will display their full name.
 * Only partner/background combinations use " // " separator.
 * 
 * @param {string} deckName - Full deck name from sheets
 * @returns {string} - Abbreviated name for display
 * 
 * Examples:
 * "Yoshimaru, Ever Faithful // Reyhan, Last of the Abzan" → "Yoshimaru & Reyhan" (partners)
 * "Etali, Primal Conqueror" → "Etali, Primal Conqueror" (DFC - only front face stored)
 * "Atraxa, Grand Unifier" → "Atraxa, Grand Unifier" (single card)
 */
export const getDisplayName = (deckName) => {
  if (!deckName) return '';
  
  // Check if it contains " // " (partners/backgrounds only)
  if (deckName.includes(' // ')) {
    const sides = deckName.split(' // ');
    
    // Extract first name (before comma) from each commander
    const firstName1 = sides[0].split(',')[0].trim();
    const firstName2 = sides[1].split(',')[0].trim();
    
    // Return abbreviated partner names
    return `${firstName1} & ${firstName2}`;
  }
  
  // Return full name for single commanders (including DFCs with only front face)
  return deckName;
};
