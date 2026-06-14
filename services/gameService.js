// src/services/gameService.js
// Handles all game data read/write via Firestore.
// Replaces the Sheets API methods previously in firebaseAuth.js.

import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from '../firebase';

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Parse date string (MM/DD/YYYY) to ISO string at midnight local time
const parseDateToISO = (dateString) => {
  if (!dateString) return null;
  const [month, day, year] = dateString.split('/');
  return new Date(parseInt(year), parseInt(month) - 1, parseInt(day)).toISOString();
};

// Format a Date object to MM/DD/YYYY string
const formatDateString = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
};

// Reference to a playgroup's games subcollection
const gamesCollection = (spreadsheetId) =>
  collection(db, 'playgroups', spreadsheetId, 'games');

const gameDoc = (spreadsheetId, gameId) =>
  doc(db, 'playgroups', spreadsheetId, 'games', gameId);

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Fetch all games for a playgroup.
 * Returns an array of game documents, each with a `players` array.
 */
export async function getAllGames(spreadsheetId) {
  if (!spreadsheetId) throw new Error('spreadsheetId is required');

  const snapshot = await getDocs(
    query(gamesCollection(spreadsheetId), orderBy('date', 'asc'))
  );

  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Fetch a single game by gameId.
 */
export async function getGame(spreadsheetId, gameId) {
  const snap = await getDoc(gameDoc(spreadsheetId, gameId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Save a completed game to Firestore.
 * Called by TrackGamePage after the user fills in all players and marks a winner.
 *
 * @param {string} spreadsheetId
 * @param {string} gameId         - e.g. "001-A01"
 * @param {string} dateString     - MM/DD/YYYY
 * @param {Array}  players        - array of player objects from TrackGamePage state
 * @param {boolean} advancedStatsEnabled
 */
export async function saveCompletedGame(
  spreadsheetId,
  gameId,
  dateString,
  players,
  advancedStatsEnabled = false
) {
  const winner = players.find((p) => p.isWinner);

  const gameData = {
    gameId,
    date: parseDateToISO(dateString),
    dateString,
    bracket: advancedStatsEnabled
      ? (players.find((p) => p.bracket)?.bracket ?? null)
      : null,
    lastTurn:
      advancedStatsEnabled && winner?.lastTurn
        ? parseInt(winner.lastTurn)
        : null,
    winCondition:
      advancedStatsEnabled && winner?.winCondition
        ? winner.winCondition
        : null,
    winner: winner?.player ?? null,
    players: players.map((p, i) => {
      // Build commander name (combine with partner if present)
      let commanderName = p.commander;
      if (p.partnerCommander) {
        commanderName = `${p.commander} // ${p.partnerCommander}`;
      }

      return {
        player: p.player,
        commander: commanderName,
        colorId: p.colorId || [],
        turnOrder: i + 1,
        result: p.isWinner ? 'Win' : 'Loss',
        isWin: p.isWinner,
        lastTurn:
          advancedStatsEnabled && p.isWinner && p.lastTurn
            ? parseInt(p.lastTurn)
            : null,
        winCondition:
          advancedStatsEnabled && p.isWinner && p.winCondition
            ? p.winCondition
            : null,
        bracket: advancedStatsEnabled ? (p.bracket ?? null) : null,
      };
    }),
    createdAt: new Date().toISOString(),
  };

  await setDoc(gameDoc(spreadsheetId, gameId), gameData);
  return gameData;
}

/**
 * Start a live game — saves an in-progress game document.
 * Players have empty result/lastTurn/winCondition fields.
 * Called by TrackGamePage before navigating to LiveTrackPage.
 *
 * @param {string} spreadsheetId
 * @param {string} gameId
 * @param {string} dateString     - MM/DD/YYYY
 * @param {Array}  players        - player objects from TrackGamePage state
 * @param {boolean} advancedStatsEnabled
 */
export async function startLiveGame(
  spreadsheetId,
  gameId,
  dateString,
  players,
  advancedStatsEnabled = false
) {
  const gameData = {
    gameId,
    date: parseDateToISO(dateString),
    dateString,
    bracket: null,
    lastTurn: null,
    winCondition: null,
    winner: null,
    isLive: true,
    players: players.map((p, i) => {
      let commanderName = p.commander;
      if (p.partnerCommander) {
        commanderName = `${p.commander} // ${p.partnerCommander}`;
      }

      return {
        player: p.player,
        commander: commanderName,
        colorId: p.colorId || [],
        turnOrder: i + 1,
        result: '',
        isWin: false,
        lastTurn: null,
        winCondition: null,
        bracket: advancedStatsEnabled ? (p.bracket ?? null) : null,
      };
    }),
    createdAt: new Date().toISOString(),
  };

  await setDoc(gameDoc(spreadsheetId, gameId), gameData);
  return gameData;
}

/**
 * Complete a live game — updates result, lastTurn, winCondition fields.
 * Called by LiveTrackPage when the user confirms the winner.
 *
 * @param {string} spreadsheetId
 * @param {string} gameId
 * @param {number} winnerIndex     - index in the players array
 * @param {number|null} lastTurn
 * @param {string} winCondition
 */
export async function completeLiveGame(
  spreadsheetId,
  gameId,
  winnerIndex,
  lastTurn = null,
  winCondition = ''
) {
  const snap = await getDoc(gameDoc(spreadsheetId, gameId));
  if (!snap.exists()) throw new Error(`Game ${gameId} not found`);

  const existing = snap.data();

  const updatedPlayers = existing.players.map((p, i) => ({
    ...p,
    result: i === winnerIndex ? 'Win' : 'Loss',
    isWin: i === winnerIndex,
    lastTurn: i === winnerIndex ? lastTurn : null,
    winCondition: i === winnerIndex ? winCondition : null,
  }));

  const winner = updatedPlayers[winnerIndex];

  await updateDoc(gameDoc(spreadsheetId, gameId), {
    players: updatedPlayers,
    winner: winner.player,
    lastTurn,
    winCondition: winCondition || null,
    isLive: false,
    completedAt: new Date().toISOString(),
  });
}

/**
 * Delete a game by gameId.
 * Used when discarding a live game or removing a game in the admin editor.
 */
export async function deleteGame(spreadsheetId, gameId) {
  await deleteDoc(gameDoc(spreadsheetId, gameId));
}

/**
 * Update specific fields on a game document.
 * Used by the admin game editor.
 *
 * @param {string} spreadsheetId
 * @param {string} gameId
 * @param {Object} updates         - fields to update on the top-level game doc
 * @param {Array|null} updatedPlayers - pass the full updated players array if players changed
 */
export async function updateGame(spreadsheetId, gameId, updates, updatedPlayers = null) {
  const payload = { ...updates, lastUpdated: new Date().toISOString() };
  if (updatedPlayers !== null) {
    payload.players = updatedPlayers;
  }
  await updateDoc(gameDoc(spreadsheetId, gameId), payload);
}

// ─── Game ID Generation ───────────────────────────────────────────────────────
// Ported from firestoreHelpers.js — now reads from Firestore instead of Sheets.

function parseDateMidnight(dateString) {
  const [month, day, year] = dateString.split('/').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function areDatesConsecutive(date1, date2) {
  const diff = Math.abs(date2 - date1);
  return Math.ceil(diff / (1000 * 60 * 60 * 24)) === 1;
}

async function shouldStartNewSession(newDateString, spreadsheetId) {
  try {
    const allGames = await getAllGames(spreadsheetId);
    if (allGames.length === 0) return false;

    // Get unique date strings
    const existingDates = [
      ...new Set(allGames.map((g) => g.dateString).filter(Boolean)),
    ].sort((a, b) => {
      return parseDateMidnight(b) - parseDateMidnight(a); // most recent first
    });

    if (existingDates.length === 0) return false;

    const newDate = parseDateMidnight(newDateString);
    const mostRecentDate = parseDateMidnight(existingDates[0]);

    if (newDate.getTime() === mostRecentDate.getTime()) return false;
    if (!areDatesConsecutive(newDate, mostRecentDate)) return true;

    if (existingDates.length >= 2) {
      const secondMostRecent = parseDateMidnight(existingDates[1]);
      if (areDatesConsecutive(mostRecentDate, secondMostRecent)) return true;
    }

    return false;
  } catch (error) {
    console.error('Error checking session:', error);
    return false;
  }
}

async function getCurrentSolsticeAndSession(spreadsheetId) {
  try {
    const allGames = await getAllGames(spreadsheetId);
    if (allGames.length === 0) return { solsticeNumber: '001', sessionLetter: 'A' };

    let maxSolsticeNum = 1;
    let currentLetter = 'A';

    allGames.forEach(({ gameId }) => {
      const match = gameId?.match(/^(\d+)-([A-Z])/);
      if (match) {
        const solsticeNum = parseInt(match[1]);
        const letter = match[2];
        if (solsticeNum > maxSolsticeNum) {
          maxSolsticeNum = solsticeNum;
          currentLetter = letter;
        } else if (solsticeNum === maxSolsticeNum) {
          if (letter.charCodeAt(0) > currentLetter.charCodeAt(0)) {
            currentLetter = letter;
          }
        }
      }
    });

    return {
      solsticeNumber: maxSolsticeNum.toString().padStart(3, '0'),
      sessionLetter: currentLetter,
    };
  } catch (error) {
    console.error('Error getting solstice/session:', error);
    return { solsticeNumber: '001', sessionLetter: 'A' };
  }
}

function getNextSession(currentLetter, solsticeNumber) {
  const code = currentLetter.charCodeAt(0);
  if (code === 90) {
    return {
      solsticeNumber: (parseInt(solsticeNumber) + 1).toString().padStart(3, '0'),
      sessionLetter: 'A',
    };
  }
  return { solsticeNumber, sessionLetter: String.fromCharCode(code + 1) };
}

/**
 * Generate the next game ID for a playgroup.
 * Replaces the version in firestoreHelpers.js that called getSheetData().
 *
 * @param {string} spreadsheetId
 * @param {string} gameDate  - MM/DD/YYYY
 * @returns {string} e.g. "001-A03"
 */
export async function generateNextGameId(spreadsheetId, gameDate) {
  try {
    const startNewSession = await shouldStartNewSession(gameDate, spreadsheetId);
    const { solsticeNumber, sessionLetter } = await getCurrentSolsticeAndSession(spreadsheetId);

    let finalSolstice = solsticeNumber;
    let finalLetter = sessionLetter;

    if (startNewSession) {
      const next = getNextSession(sessionLetter, solsticeNumber);
      finalSolstice = next.solsticeNumber;
      finalLetter = next.sessionLetter;
    }

    const allGames = await getAllGames(spreadsheetId);
    const sessionPrefix = `${finalSolstice}-${finalLetter}`;
    let maxGameNum = 0;

    allGames.forEach(({ gameId }) => {
      if (gameId?.startsWith(sessionPrefix)) {
        const match = gameId.match(/^.+?-[A-Z](\d+)$/);
        if (match) {
          const num = parseInt(match[1]);
          if (num > maxGameNum) maxGameNum = num;
        }
      }
    });

    const gameId = `${finalSolstice}-${finalLetter}${(maxGameNum + 1).toString().padStart(2, '0')}`;
    console.log(`Generated game ID: ${gameId}`);
    return gameId;
  } catch (error) {
    console.error('Error generating game ID:', error);
    return '001-A01';
  }
}
