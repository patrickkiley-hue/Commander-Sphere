// src/utils/firestoreHelpers.js
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import firebaseAuthService from '../services/firebaseAuth';

/**
 * Generate a random 6-character join code
 * Format: Uppercase letters + numbers (e.g., "K7M3PX")
 */
function generateJoinCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Check if season has expired and auto-roll to next season
 * Returns updated season data if rolled, or original data if not
 */
export async function checkAndRollSeason(spreadsheetId, seasonData) {
  if (!seasonData?.enabled || !seasonData.startDate || !seasonData.duration) {
    return seasonData;
  }

  const now = new Date();
  const startDate = new Date(seasonData.startDate);
  const daysElapsed = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));

  // If season hasn't expired, return original data
  if (daysElapsed < seasonData.duration) {
    return seasonData;
  }

  // Calculate how many full seasons have passed
  const seasonsPassed = Math.floor(daysElapsed / seasonData.duration);
  
  // Calculate new start date
  const newStartDate = new Date(startDate);
  newStartDate.setDate(newStartDate.getDate() + (seasonsPassed * seasonData.duration));

  try {
    // Update Firestore with new start date
    await updateDoc(doc(db, 'playgroups', spreadsheetId), {
      seasonStartDate: newStartDate.toISOString()
    });

    console.log(`Season auto-rolled: ${seasonsPassed} season(s) passed. New start: ${newStartDate.toISOString()}`);

    // Return updated season data
    return {
      ...seasonData,
      startDate: newStartDate.toISOString()
    };
  } catch (error) {
    console.error('Error auto-rolling season:', error);
    return seasonData; // Return original on error
  }
}

/**
 * Save user's playgroups to Firestore
 */
export async function savePlaygroupsToFirestore(userId, playgroups) {
  try {
    await setDoc(doc(db, 'users', userId), {
      joinedPlaygroups: playgroups,
      lastUpdated: new Date().toISOString()
    }, { merge: true }); // merge: true preserves other fields
    
    console.log('Playgroups saved to Firestore');
  } catch (error) {
    console.error('Error saving playgroups:', error);
    throw error;
  }
}

/**
 * Save user's current playgroup to Firestore
 */
export async function saveCurrentPlaygroupToFirestore(userId, playgroup) {
  try {
    await setDoc(doc(db, 'users', userId), {
      currentPlaygroup: playgroup,
      lastUpdated: new Date().toISOString()
    }, { merge: true });
    
    console.log('Current playgroup saved to Firestore');
  } catch (error) {
    console.error('Error saving current playgroup:', error);
    throw error;
  }
}

/**
 * Load user's playgroup data from Firestore
 */
export async function loadPlaygroupsFromFirestore(userId) {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      return {
        joinedPlaygroups: userData.joinedPlaygroups || [],
        currentPlaygroup: userData.currentPlaygroup || null
      };
    } else {
      // User document doesn't exist yet - return empty data
      return {
        joinedPlaygroups: [],
        currentPlaygroup: null
      };
    }
  } catch (error) {
    console.error('Error loading playgroups:', error);
    throw error;
  }
}

/**
 * Save both current playgroup and joined playgroups at once
 */
export async function saveAllPlaygroupData(userId, currentPlaygroup, joinedPlaygroups) {
  try {
    await setDoc(doc(db, 'users', userId), {
      currentPlaygroup: currentPlaygroup,
      joinedPlaygroups: joinedPlaygroups,
      lastUpdated: new Date().toISOString()
    }, { merge: true });
    
    console.log('All playgroup data saved to Firestore');
  } catch (error) {
    console.error('Error saving playgroup data:', error);
    throw error;
  }
}

/**
 * Save user profile data (name, email, phone, discord)
 */
export async function saveUserProfile(userId, profileData) {
  try {
    await setDoc(doc(db, 'users', userId), {
      name: profileData.name,
      email: profileData.email,
      phone: profileData.phone || '',
      discord: profileData.discord || '',
      lastUpdated: new Date().toISOString()
    }, { merge: true });
    
    console.log('User profile saved to Firestore');
  } catch (error) {
    console.error('Error saving user profile:', error);
    throw error;
  }
}

/**
 * Load user profile data
 */
export async function loadUserProfile(userId) {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      return {
        name: userData.name || '',
        email: userData.email || '',
        phone: userData.phone || '',
        discord: userData.discord || '',
        playerMappings: userData.playerMappings || {}
      };
    } else {
      // User document doesn't exist yet
      return {
        name: '',
        email: '',
        phone: '',
        discord: '',
        playerMappings: {}
      };
    }
  } catch (error) {
    console.error('Error loading user profile:', error);
    throw error;
  }
}

/**
 * Save player mapping for a specific playgroup
 */
export async function savePlayerMapping(userId, spreadsheetId, playerName) {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    const currentMappings = userDoc.exists() ? (userDoc.data().playerMappings || {}) : {};
    
    await setDoc(doc(db, 'users', userId), {
      playerMappings: {
        ...currentMappings,
        [spreadsheetId]: playerName
      },
      lastUpdated: new Date().toISOString()
    }, { merge: true });
    
    console.log('Player mapping saved to Firestore');
  } catch (error) {
    console.error('Error saving player mapping:', error);
    throw error;
  }
}

/**
 * Load playgroup data from Firestore
 */
export async function loadPlaygroupData(spreadsheetId) {
  try {
    const playgroupDoc = await getDoc(doc(db, 'playgroups', spreadsheetId));
    
    if (playgroupDoc.exists()) {
      return playgroupDoc.data();
    } else {
      // Playgroup document doesn't exist yet
      return null;
    }
  } catch (error) {
    console.error('Error loading playgroup data:', error);
    throw error;
  }
}

/**
 * Create or update playgroup document
 */
export async function savePlaygroupData(spreadsheetId, data) {
  try {
    await setDoc(doc(db, 'playgroups', spreadsheetId), {
      ...data,
      lastUpdated: new Date().toISOString()
    }, { merge: true });
    
    console.log('Playgroup data saved to Firestore');
  } catch (error) {
    console.error('Error saving playgroup data:', error);
    throw error;
  }
}

/**
 * Initialize playgroup document when admin creates it
 */
export async function initializePlaygroup(spreadsheetId, name, adminUserId) {
  try {
    const joinCode = generateJoinCode();
    
    await setDoc(doc(db, 'playgroups', spreadsheetId), {
      name: name,
      adminUserId: adminUserId,
      joinCode: joinCode,
      advancedStatsEnabled: false,
      members: [adminUserId],
      playerMappings: {},
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    });
    
    console.log(`Playgroup initialized with join code: ${joinCode}`);
  } catch (error) {
    console.error('Error initializing playgroup:', error);
    throw error;
  }
}

/**
 * Find playgroup by join code
 * @param {string} joinCode - The 6-character join code
 * @returns {Object|null} Playgroup data with spreadsheetId, or null if not found
 */
export async function findPlaygroupByJoinCode(joinCode) {
  try {
    const playgroupsQuery = query(
      collection(db, 'playgroups'),
      where('joinCode', '==', joinCode.toUpperCase())
    );
    
    const snapshot = await getDocs(playgroupsQuery);
    
    if (snapshot.empty) {
      return null;
    }
    
    // Return first matching playgroup (should only be one)
    const doc = snapshot.docs[0];
    return {
      spreadsheetId: doc.id,
      ...doc.data()
    };
  } catch (error) {
    console.error('Error finding playgroup by code:', error);
    return null;
  }
}

/**
 * Regenerate join code for a playgroup
 * @param {string} spreadsheetId - Spreadsheet ID
 * @returns {string} New join code
 */
export async function regenerateJoinCode(spreadsheetId) {
  try {
    const newCode = generateJoinCode();
    
    await updateDoc(doc(db, 'playgroups', spreadsheetId), {
      joinCode: newCode,
      lastUpdated: new Date().toISOString()
    });
    
    console.log(`Join code regenerated: ${newCode}`);
    return newCode;
  } catch (error) {
    console.error('Error regenerating join code:', error);
    throw error;
  }
}

/**
 * Add user to playgroup members
 */
export async function addMemberToPlaygroup(spreadsheetId, userId) {
  try {
    const playgroupDoc = await getDoc(doc(db, 'playgroups', spreadsheetId));
    const currentMembers = playgroupDoc.exists() ? (playgroupDoc.data().members || []) : [];
    
    if (!currentMembers.includes(userId)) {
      await setDoc(doc(db, 'playgroups', spreadsheetId), {
        members: [...currentMembers, userId],
        lastUpdated: new Date().toISOString()
      }, { merge: true });
      
      console.log('Member added to playgroup');
    }
  } catch (error) {
    console.error('Error adding member:', error);
    throw error;
  }
}

/**
 * Remove user from playgroup members
 */
export async function removeMemberFromPlaygroup(spreadsheetId, userId) {
  try {
    const playgroupDoc = await getDoc(doc(db, 'playgroups', spreadsheetId));
    
    if (playgroupDoc.exists()) {
      const data = playgroupDoc.data();
      const currentMembers = data.members || [];
      const currentMappings = data.playerMappings || {};
      
      // Remove from members array
      const updatedMembers = currentMembers.filter(id => id !== userId);
      
      // Remove from playerMappings
      const updatedMappings = { ...currentMappings };
      delete updatedMappings[userId];
      
      await setDoc(doc(db, 'playgroups', spreadsheetId), {
        members: updatedMembers,
        playerMappings: updatedMappings,
        lastUpdated: new Date().toISOString()
      }, { merge: true });
      
      console.log('Member removed from playgroup');
    }
  } catch (error) {
    console.error('Error removing member:', error);
    throw error;
  }
}

/**
 * Set player mapping for a user in a playgroup
 */
export async function setPlaygroupPlayerMapping(spreadsheetId, userId, playerName) {
  try {
    const playgroupDoc = await getDoc(doc(db, 'playgroups', spreadsheetId));
    const currentMappings = playgroupDoc.exists() ? (playgroupDoc.data().playerMappings || {}) : {};
    
    await setDoc(doc(db, 'playgroups', spreadsheetId), {
      playerMappings: {
        ...currentMappings,
        [userId]: playerName
      },
      lastUpdated: new Date().toISOString()
    }, { merge: true });
    
    console.log('Player mapping saved');
  } catch (error) {
    console.error('Error saving player mapping:', error);
    throw error;
  }
}

/**
 * Toggle advanced stats for playgroup
 */
export async function toggleAdvancedStats(spreadsheetId, enabled) {
  try {
    await setDoc(doc(db, 'playgroups', spreadsheetId), {
      advancedStatsEnabled: enabled,
      lastUpdated: new Date().toISOString()
    }, { merge: true });
    
    console.log('Advanced stats toggled');
  } catch (error) {
    console.error('Error toggling advanced stats:', error);
    throw error;
  }
}

// ========== GAME ID GENERATION & SESSION TRACKING ==========

/**
 * Parse date string (MM/DD/YYYY) to Date object at midnight
 * @param {string} dateString - Date string in MM/DD/YYYY format
 * @returns {Date} Date object at midnight
 */
function parseDateMidnight(dateString) {
  const [month, day, year] = dateString.split('/').map(n => parseInt(n));
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

/**
 * Check if two dates are consecutive (differ by exactly 1 day)
 * @param {Date} date1 - First date
 * @param {Date} date2 - Second date  
 * @returns {boolean} True if dates are consecutive
 */
function areDatesConsecutive(date1, date2) {
  const diffTime = Math.abs(date2 - date1);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays === 1;
}

/**
 * Determine if a new date starts a new session based on existing game dates
 * Session rules:
 * - Games on consecutive dates (up to 2 dates) are same session
 * - 3rd consecutive date starts new session
 * - Any non-consecutive date starts new session
 * 
 * @param {string} newDateString - New game date (MM/DD/YYYY)
 * @param {string} spreadsheetId - Spreadsheet ID to check existing games
 * @returns {boolean} True if this date should start a new session
 */
async function shouldStartNewSession(newDateString, spreadsheetId) {
  try {
    // Get all games from sheet
    const allGames = await firebaseAuthService.getSheetData(spreadsheetId, 'Games!A:B');
    
    if (allGames.length <= 1) return false; // No games yet (only header)
    
    // Get unique dates from existing games
    const existingDates = [...new Set(allGames.slice(1).map(row => row[0]))].sort((a, b) => {
      const dateA = parseDateMidnight(a);
      const dateB = parseDateMidnight(b);
      return dateB - dateA; // Most recent first
    });
    
    if (existingDates.length === 0) return false;
    
    const newDate = parseDateMidnight(newDateString);
    const mostRecentDate = parseDateMidnight(existingDates[0]);
    
    // If new date equals most recent, continue session
    if (newDate.getTime() === mostRecentDate.getTime()) {
      return false;
    }
    
    // If not consecutive, start new session
    if (!areDatesConsecutive(newDate, mostRecentDate)) {
      return true;
    }
    
    // Check if we already have 2 consecutive dates
    if (existingDates.length >= 2) {
      const secondMostRecent = parseDateMidnight(existingDates[1]);
      
      // If the two most recent dates are consecutive
      if (areDatesConsecutive(mostRecentDate, secondMostRecent)) {
        // This would be the 3rd consecutive date - start new session
        return true;
      }
    }
    
    // Consecutive date and we don't have 2 consecutive dates yet - continue session
    return false;
    
  } catch (error) {
    console.error('Error checking session:', error);
    // Default to not starting new session on error
    return false;
  }
}

/**
 * Get the current solstice number and letter for a playgroup
 * @param {string} spreadsheetId - Spreadsheet ID
 * @returns {Object} { solsticeNumber, sessionLetter } (e.g., { solsticeNumber: '001', sessionLetter: 'A' })
 */
async function getCurrentSolsticeAndSession(spreadsheetId) {
  try {
    // Get all games to find the highest game ID
    const allGames = await firebaseAuthService.getSheetData(spreadsheetId, 'Games!B:B');
    
    if (allGames.length <= 1) {
      // No games yet, start with 001-A
      return { solsticeNumber: '001', sessionLetter: 'A' };
    }
    
    // Get all game IDs (skip header)
    const gameIds = allGames.slice(1).map(row => row[0]).filter(id => id);
    
    if (gameIds.length === 0) {
      return { solsticeNumber: '001', sessionLetter: 'A' };
    }
    
    // Parse game IDs to find highest solstice and session
    let maxSolsticeNum = 1;
    let currentLetter = 'A';
    
    gameIds.forEach(gameId => {
      const match = gameId.match(/^(\d+)-([A-Z])/);
      if (match) {
        const solsticeNum = parseInt(match[1]);
        const letter = match[2];
        
        if (solsticeNum > maxSolsticeNum) {
          maxSolsticeNum = solsticeNum;
          currentLetter = letter;
        } else if (solsticeNum === maxSolsticeNum) {
          // Compare letters
          if (letter.charCodeAt(0) > currentLetter.charCodeAt(0)) {
            currentLetter = letter;
          }
        }
      }
    });
    
    return {
      solsticeNumber: maxSolsticeNum.toString().padStart(3, '0'),
      sessionLetter: currentLetter
    };
    
  } catch (error) {
    console.error('Error getting solstice/session:', error);
    return { solsticeNumber: '001', sessionLetter: 'A' };
  }
}

/**
 * Get the next letter in sequence, rolling to next solstice if needed
 * @param {string} currentLetter - Current session letter
 * @param {string} solsticeNumber - Current solstice number
 * @returns {Object} { solsticeNumber, sessionLetter }
 */
function getNextSession(currentLetter, solsticeNumber) {
  const currentCharCode = currentLetter.charCodeAt(0);
  
  // If we're at Z, roll to next solstice with letter A
  if (currentCharCode === 90) { // 'Z'
    const nextSolsticeNum = parseInt(solsticeNumber) + 1;
    return {
      solsticeNumber: nextSolsticeNum.toString().padStart(3, '0'),
      sessionLetter: 'A'
    };
  }
  
  // Otherwise just increment the letter
  return {
    solsticeNumber: solsticeNumber,
    sessionLetter: String.fromCharCode(currentCharCode + 1)
  };
}

/**
 * Generate the next game ID for a playgroup
 * Format: XXX-YZZ (e.g., 001-A01, 001-A02, 001-B01)
 * 
 * @param {string} spreadsheetId - Spreadsheet ID
 * @param {string} gameDate - Game date (MM/DD/YYYY)
 * @returns {string} Next game ID
 */
export async function generateNextGameId(spreadsheetId, gameDate) {
  try {
    // Check if this date starts a new session
    const startNewSession = await shouldStartNewSession(gameDate, spreadsheetId);
    
    // Get current solstice and session
    const { solsticeNumber, sessionLetter } = await getCurrentSolsticeAndSession(spreadsheetId);
    
    let finalSolsticeNumber = solsticeNumber;
    let finalSessionLetter = sessionLetter;
    
    // If starting new session, advance the letter
    if (startNewSession) {
      const nextSession = getNextSession(sessionLetter, solsticeNumber);
      finalSolsticeNumber = nextSession.solsticeNumber;
      finalSessionLetter = nextSession.sessionLetter;
    }
    
    // Get all game IDs for this solstice-session to find the next game number
    const allGames = await firebaseAuthService.getSheetData(spreadsheetId, 'Games!B:B');
    const sessionPrefix = `${finalSolsticeNumber}-${finalSessionLetter}`;
    
    let maxGameNum = 0;
    
    if (allGames.length > 1) {
      allGames.slice(1).forEach(row => {
        const gameId = row[0];
        if (gameId && gameId.startsWith(sessionPrefix)) {
          const match = gameId.match(/^.+?-[A-Z](\d+)$/);
          if (match) {
            const gameNum = parseInt(match[1]);
            if (gameNum > maxGameNum) {
              maxGameNum = gameNum;
            }
          }
        }
      });
    }
    
    // Next game number
    const nextGameNum = (maxGameNum + 1).toString().padStart(2, '0');
    
    const gameId = `${finalSolsticeNumber}-${finalSessionLetter}${nextGameNum}`;
    console.log(`Generated game ID: ${gameId}`);
    
    return gameId;
    
  } catch (error) {
    console.error('Error generating game ID:', error);
    // Fallback to default
    return '001-A01';
  }
}

// ========== LIVE GAME TRACKING ==========

/**
 * Start tracking a live game in Firestore
 * @param {string} spreadsheetId - Spreadsheet ID
 * @param {string} gameId - Game ID
 * @param {number} rowNumber - Sheet row number where game data is stored
 * @param {Array<Object>} players - Array of player data for this game
 * @returns {string} Tracking ID for this game
 */
export async function startLiveGameTracking(spreadsheetId, gameId, rowNumber, players) {
  try {
    const trackingId = `${spreadsheetId}_${gameId}`;
    
    await setDoc(doc(db, 'liveGames', trackingId), {
      spreadsheetId,
      gameId,
      startRowNumber: rowNumber, // First player's row
      playerCount: players.length,
      players: players.map(p => ({
        name: p.player,
        commander: p.commander,
        rowNumber: p.rowNumber
      })),
      status: 'in-progress',
      startedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    });
    
    console.log(`Live game tracking started: ${trackingId}`);
    return trackingId;
    
  } catch (error) {
    console.error('Error starting live game tracking:', error);
    throw error;
  }
}

/**
 * Get all in-progress games for a playgroup
 * @param {string} spreadsheetId - Spreadsheet ID
 * @returns {Array<Object>} Array of in-progress game data
 */
export async function getInProgressGames(spreadsheetId) {
  try {
    const gamesQuery = query(
      collection(db, 'liveGames'),
      where('spreadsheetId', '==', spreadsheetId),
      where('status', '==', 'in-progress')
    );
    
    const snapshot = await getDocs(gamesQuery);
    const games = [];
    
    snapshot.forEach(doc => {
      games.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return games;
    
  } catch (error) {
    console.error('Error getting in-progress games:', error);
    return [];
  }
}

/**
 * Get a specific live game by tracking ID
 * @param {string} trackingId - Tracking ID
 * @returns {Object|null} Game data or null if not found
 */
export async function getLiveGame(trackingId) {
  try {
    const gameDoc = await getDoc(doc(db, 'liveGames', trackingId));
    
    if (gameDoc.exists()) {
      return {
        id: gameDoc.id,
        ...gameDoc.data()
      };
    }
    
    return null;
    
  } catch (error) {
    console.error('Error getting live game:', error);
    return null;
  }
}

/**
 * Mark a live game as completed
 * @param {string} trackingId - Tracking ID
 * @returns {boolean} Success status
 */
export async function completeLiveGameTracking(trackingId) {
  try {
    await updateDoc(doc(db, 'liveGames', trackingId), {
      status: 'completed',
      completedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    });
    
    console.log(`Live game marked as completed: ${trackingId}`);
    return true;
    
  } catch (error) {
    console.error('Error completing live game tracking:', error);
    return false;
  }
}

/**
 * Delete a live game tracking record
 * @param {string} spreadsheetId - Spreadsheet ID
 * @param {string} gameId - Game ID
 * @returns {boolean} Success status
 */
export async function deleteLiveGameTracking(spreadsheetId, gameId) {
  try {
    const trackingId = `${spreadsheetId}_${gameId}`;
    await deleteDoc(doc(db, 'liveGames', trackingId));
    console.log(`Live game tracking deleted: ${trackingId}`);
    return true;
  } catch (error) {
    console.error('Error deleting live game tracking:', error);
    return false;
  }
}

/**
 * Clean up old completed games (optional maintenance function)
 * @param {number} daysOld - Delete completed games older than this many days
 * @returns {number} Number of games deleted
 */
export async function cleanupOldLiveGames(daysOld = 7) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    const gamesQuery = query(
      collection(db, 'liveGames'),
      where('status', '==', 'completed')
    );
    
    const snapshot = await getDocs(gamesQuery);
    let deleteCount = 0;
    
    const deletePromises = [];
    snapshot.forEach(gameDoc => {
      const data = gameDoc.data();
      const completedAt = new Date(data.completedAt);
      
      if (completedAt < cutoffDate) {
        deletePromises.push(deleteDoc(doc(db, 'liveGames', gameDoc.id)));
        deleteCount++;
      }
    });
    
    await Promise.all(deletePromises);
    console.log(`Cleaned up ${deleteCount} old live games`);
    
    return deleteCount;
    
  } catch (error) {
    console.error('Error cleaning up old live games:', error);
    return 0;
  }
}
