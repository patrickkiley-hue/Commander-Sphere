// src/utils/statsCalculations.js
// Stat calculation utilities working natively with Firestore game documents.
//
// Data shape coming in:
//   game = {
//     gameId, date (ISO string), dateString (MM/DD/YYYY),
//     winner, lastTurn, winCondition, bracket,
//     players: [{ player, commander, colorId, turnOrder, result, isWin, lastTurn, winCondition, bracket }]
//   }
//
// All functions accept arrays of game documents unless noted otherwise.

// ─── Core filter ─────────────────────────────────────────────────────────────

/**
 * Filter to completed games only (have a winner).
 * Replaces the old grouping-by-gameId approach — now just a direct check.
 */
export const filterValidGames = (games) =>
  games.filter(g => g.winner && Array.isArray(g.players) && g.players.length > 0);

// ─── Date helpers ─────────────────────────────────────────────────────────────

const parseGameDate = (game) => {
  if (!game.date) return null;
  return game.date instanceof Date ? game.date : new Date(game.date);
};

// ─── Players ──────────────────────────────────────────────────────────────────

/**
 * Get sorted list of unique player names from a set of games.
 */
export const getPlayers = (games) => {
  const valid = filterValidGames(games);
  const names = new Set();
  valid.forEach(g => g.players.forEach(p => { if (p.player) names.add(p.player); }));
  return Array.from(names).sort();
};

// ─── Counts ───────────────────────────────────────────────────────────────────

/** Count unique completed games. */
export const countUniqueGames = (games) => filterValidGames(games).length;

/** Count unique commanders across a set of games. */
export const countUniqueCommanders = (games) => {
  const valid = filterValidGames(games);
  const commanders = new Set();
  valid.forEach(g => g.players.forEach(p => { if (p.commander) commanders.add(p.commander); }));
  return commanders.size;
};

// ─── Session detection ────────────────────────────────────────────────────────

/**
 * Get games from the last session (most recent game date + consecutive prior
 * date if applicable). Updates at 7am EST daily.
 * Returns an array of game documents.
 *
 * Uses dateString (MM/DD/YYYY) for all comparisons to avoid timezone shift
 * issues that occur when parsing ISO date strings into local time.
 */
export const getLastSession = (games) => {
  const valid = filterValidGames(games);
  if (valid.length === 0) return [];

  // Current effective date in EST with 7am cutoff
  const now = new Date();
  const estOffset = -5 * 60;
  const estTime = new Date(now.getTime() + (estOffset + now.getTimezoneOffset()) * 60000);
  const effectiveDate = new Date(estTime);
  if (estTime.getHours() < 7) effectiveDate.setDate(effectiveDate.getDate() - 1);
  effectiveDate.setHours(0, 0, 0, 0);

  // Parse MM/DD/YYYY to a local midnight Date — no timezone shift
  const parseDateString = (str) => {
    if (!str) return null;
    const [month, day, year] = str.split('/').map(Number);
    if (!month || !day || !year) return null;
    return new Date(year, month - 1, day, 0, 0, 0, 0);
  };

  // Get unique dateStrings before the cutoff, sorted newest first
  const uniqueDateStrings = [
    ...new Set(
      valid
        .map(g => g.dateString)
        .filter(ds => {
          if (!ds) return false;
          const d = parseDateString(ds);
          return d && d < effectiveDate;
        })
    ),
  ].sort((a, b) => parseDateString(b) - parseDateString(a));

  if (uniqueDateStrings.length === 0) return [];

  const mostRecentStr = uniqueDateStrings[0];
  const sessionDateStrings = new Set([mostRecentStr]);

  if (uniqueDateStrings.length > 1) {
    const priorStr = uniqueDateStrings[1];
    const mostRecentDate = parseDateString(mostRecentStr);
    const priorDate = parseDateString(priorStr);
    const daysDiff = Math.floor((mostRecentDate - priorDate) / (1000 * 60 * 60 * 24));
    if (daysDiff === 1) sessionDateStrings.add(priorStr);
  }

  return valid.filter(g => g.dateString && sessionDateStrings.has(g.dateString));
};

/**
 * Get games from the last N days.
 */
export const getRecentGames = (games, days = 7) => {
  const valid = filterValidGames(games);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return valid.filter(g => {
    const d = parseGameDate(g);
    return d && d >= cutoff;
  });
};

// ─── Top players ──────────────────────────────────────────────────────────────

/**
 * Get top players by win rate from a set of games.
 * minGames = minimum games played to qualify.
 */
export const getTopPlayers = (games, minGames = 5) => {
  const valid = filterValidGames(games);
  const stats = {};

  valid.forEach(game => {
    game.players.forEach(p => {
      if (!p.player) return;
      if (!stats[p.player]) stats[p.player] = { name: p.player, games: 0, wins: 0 };
      stats[p.player].games++;
      if (p.isWin) stats[p.player].wins++;
    });
  });

  return Object.values(stats)
    .filter(p => p.games >= minGames)
    .map(p => ({ ...p, winRate: (p.wins / p.games) * 100 }))
    .sort((a, b) => b.winRate - a.winRate);
};

// ─── Commander stats ──────────────────────────────────────────────────────────

/**
 * Get most played commanders across a set of games.
 */
export const getMostPlayedCommanders = (games, limit = 10) => {
  const valid = filterValidGames(games);
  const counts = {};

  valid.forEach(game => {
    game.players.forEach(p => {
      if (!p.commander) return;
      if (!counts[p.commander]) {
        counts[p.commander] = { name: p.commander, games: 0, wins: 0, colors: p.colorId || [] };
      }
      counts[p.commander].games++;
      if (p.isWin) counts[p.commander].wins++;
    });
  });

  return Object.values(counts)
    .sort((a, b) => b.games - a.games)
    .slice(0, limit)
    .map(cmd => ({ ...cmd, winRate: (cmd.wins / cmd.games) * 100 }));
};

// ─── Game sessions ────────────────────────────────────────────────────────────

/**
 * Return game documents sorted newest first.
 * Players array is already present on each doc — no reconstruction needed.
 */
export const getGameSessions = (games) =>
  filterValidGames(games).sort((a, b) => {
    const dA = parseGameDate(a);
    const dB = parseGameDate(b);
    if (dA && dB) return dB - dA;
    return b.gameId.localeCompare(a.gameId);
  });

// ─── Advanced stats helpers ───────────────────────────────────────────────────

/** Average game length in turns (requires lastTurn on winning player). */
export const getAverageGameLength = (games) => {
  const valid = filterValidGames(games);
  const withTurns = valid.filter(g => g.lastTurn && g.lastTurn > 0);
  if (withTurns.length === 0) return null;
  const total = withTurns.reduce((sum, g) => sum + g.lastTurn, 0);
  return Math.round(total / withTurns.length);
};

/** Win rate by turn order position across all games. */
export const getWinRateByPosition = (games) => {
  const valid = filterValidGames(games);
  const positions = {};

  valid.forEach(game => {
    game.players.forEach(p => {
      const pos = p.turnOrder;
      if (!pos) return;
      if (!positions[pos]) positions[pos] = { position: pos, games: 0, wins: 0 };
      positions[pos].games++;
      if (p.isWin) positions[pos].wins++;
    });
  });

  return Object.values(positions)
    .map(p => ({ ...p, winRate: (p.wins / p.games) * 100 }))
    .sort((a, b) => a.position - b.position);
};

/** Win rate by color identity across all games. */
export const getWinRateByColors = (games) => {
  const valid = filterValidGames(games);
  const groups = {};

  valid.forEach(game => {
    game.players.forEach(p => {
      const colors = Array.isArray(p.colorId) ? p.colorId : [];
      const key = [...colors].sort().join(',');
      if (!groups[key]) groups[key] = { colors, colorKey: key, games: 0, wins: 0 };
      groups[key].games++;
      if (p.isWin) groups[key].wins++;
    });
  });

  return Object.values(groups)
    .map(g => ({ ...g, winRate: (g.wins / g.games) * 100 }))
    .sort((a, b) => b.games - a.games);
};

/** Games per day of week. */
export const getWeeklyStats = (games) => {
  const valid = filterValidGames(games);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const weekData = days.map(day => ({ day, games: 0 }));

  valid.forEach(game => {
    const d = parseGameDate(game);
    if (d) weekData[d.getDay()].games++;
  });

  return weekData;
};

// ─── Featured decks ───────────────────────────────────────────────────────────

const getColorKey = (colors) => {
  if (!colors || colors.length === 0) return 'colorless';
  return [...colors].sort().join('');
};

/**
 * Get games from the previous 3 session letters for breakout deck detection.
 * Works on game documents using gameId prefix.
 */
const getPreviousSessionGames = (allGames, currentSessionGames) => {
  if (currentSessionGames.length === 0) return [];

  const sampleId = currentSessionGames[0].gameId;
  const match = sampleId?.match(/^(\d+)-([A-Z])/);
  if (!match) return [];

  const [, sessionNum, currentLetter] = match;
  const currentCode = currentLetter.charCodeAt(0);
  const previousLetters = new Set();

  for (let i = 1; i <= 3; i++) {
    const code = currentCode - i;
    if (code >= 65) previousLetters.add(String.fromCharCode(code));
  }

  return filterValidGames(allGames).filter(g => {
    const m = g.gameId?.match(/^(\d+)-([A-Z])/);
    return m && m[1] === sessionNum && previousLetters.has(m[2]);
  });
};

/**
 * Get Featured Decks of the Week (3 boxes).
 * Now operates on game documents — no flat-row reconstruction needed.
 */
export const getFeaturedDecks = (allGames, sessionGames) => {
  const validAll = filterValidGames(allGames);
  const validSession = filterValidGames(sessionGames);

  const empty = [
    { name: 'No Games Played', colors: [], games: 0, wins: 0, winRate: 0, category: 'MOST PLAYED' },
    { name: 'No Games Played', colors: [], games: 0, wins: 0, winRate: 0, category: 'BEST PERFORMER' },
    { name: 'No Games Played', colors: [], games: 0, wins: 0, winRate: 0, category: 'SPECIAL' },
  ];

  if (validSession.length === 0) return empty;

  // Build commander stats from session game documents
  const sessionCommanders = {};

  validSession.forEach(game => {
    game.players.forEach(p => {
      if (!p.commander) return;
      if (!sessionCommanders[p.commander]) {
        sessionCommanders[p.commander] = {
          name: p.commander,
          colors: p.colorId || [],
          games: 0,
          wins: 0,
          pilots: new Set(),
          // store player name per win for "squeaked" detection
          winningPlayers: [],
        };
      }
      const entry = sessionCommanders[p.commander];
      entry.games++;
      if (p.isWin) {
        entry.wins++;
        entry.winningPlayers.push(p.player);
      }
      entry.pilots.add(p.player);
    });
  });

  Object.values(sessionCommanders).forEach(cmd => {
    cmd.winRate = cmd.games > 0 ? (cmd.wins / cmd.games) * 100 : 0;
    cmd.pilotCount = cmd.pilots.size;
  });

  const excluded = new Set();

  // ── BOX 2: BEST PERFORMER ──
  const performers = Object.values(sessionCommanders)
    .filter(cmd => cmd.wins > 0)
    .sort((a, b) => {
      if (a.wins >= 2 && b.wins < 2) return -1;
      if (b.wins >= 2 && a.wins < 2) return 1;
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      return b.wins - a.wins;
    });

  const bestPerformer = performers.length > 0
    ? (excluded.add(performers[0].name), { ...performers[0], category: 'BEST PERFORMER' })
    : { name: 'No Games Played', colors: [], games: 0, wins: 0, winRate: 0, category: 'BEST PERFORMER' };

  // ── BOX 3: SPECIAL ──
  const specialOptions = [];

  // Option A: Breakout Deck — won this session, color identity didn't win last 3 sessions
  const prevGames = getPreviousSessionGames(validAll, validSession);
  const prevWinningColors = new Set(
    prevGames
      .flatMap(g => g.players.filter(p => p.isWin).map(p => getColorKey(p.colorId)))
  );

  const breakoutDecks = Object.values(sessionCommanders).filter(cmd =>
    cmd.wins > 0 && !excluded.has(cmd.name) && !prevWinningColors.has(getColorKey(cmd.colors))
  );
  if (breakoutDecks.length > 0) {
    specialOptions.push({ type: 'breakout', deck: { ...breakoutDecks[0], category: 'BREAKOUT DECK' } });
  }

  // Option B: Underdog Win — all-time win rate < 20%
  const allTimeStats = {};
  validAll.forEach(game => {
    game.players.forEach(p => {
      if (!p.commander) return;
      if (!allTimeStats[p.commander]) allTimeStats[p.commander] = { games: 0, wins: 0 };
      allTimeStats[p.commander].games++;
      if (p.isWin) allTimeStats[p.commander].wins++;
    });
  });

  const underdogDecks = Object.values(sessionCommanders).filter(cmd => {
    if (cmd.wins === 0 || excluded.has(cmd.name)) return false;
    const at = allTimeStats[cmd.name];
    return at && at.games > 0 && (at.wins / at.games) * 100 < 20;
  });
  if (underdogDecks.length > 0) {
    specialOptions.push({ type: 'underdog', deck: { ...underdogDecks[0], category: 'UNDERDOG WIN' } });
  }

  // Option C: Beginner's Luck — never appeared before this session
  const sessionGameIds = new Set(validSession.map(g => g.gameId));
  const beginnerDecks = Object.values(sessionCommanders).filter(cmd => {
    if (cmd.wins === 0 || excluded.has(cmd.name)) return false;
    return !validAll.some(g => !sessionGameIds.has(g.gameId) &&
      g.players.some(p => p.commander === cmd.name));
  });
  if (beginnerDecks.length > 0) {
    specialOptions.push({ type: 'beginner', deck: { ...beginnerDecks[0], category: "BEGINNER'S LUCK" } });
  }

  // Fallback: Squeaked One Out — player with fewest session wins
  const playerWins = {};
  validSession.forEach(game => {
    game.players.forEach(p => {
      if (!playerWins[p.player]) playerWins[p.player] = 0;
      if (p.isWin) playerWins[p.player]++;
    });
  });
  const winCounts = Object.values(playerWins).filter(w => w > 0);
  if (winCounts.length > 0) {
    const minWins = Math.min(...winCounts);
    const minWinPlayers = new Set(
      Object.entries(playerWins).filter(([, w]) => w === minWins).map(([p]) => p)
    );
    const squeakedDecks = Object.values(sessionCommanders)
      .filter(cmd => !excluded.has(cmd.name) &&
        cmd.winningPlayers.some(p => minWinPlayers.has(p)))
      .sort((a, b) => a.games !== b.games ? a.games - b.games : Math.random() - 0.5);
    if (squeakedDecks.length > 0) {
      specialOptions.push({ type: 'squeaked', deck: { ...squeakedDecks[0], category: 'SQUEAKED ONE OUT!' } });
    }
  }

  let specialFeature;
  if (specialOptions.length > 0) {
    const selected = specialOptions[Math.floor(Math.random() * specialOptions.length)];
    specialFeature = selected.deck;
    excluded.add(selected.deck.name);
  } else {
    specialFeature = { name: 'No Games Played', colors: [], games: 0, wins: 0, winRate: 0, category: 'SPECIAL' };
  }

  // ── BOX 1: MOST PLAYED ──
  const mostPlayedCandidates = Object.values(sessionCommanders)
    .filter(cmd => !excluded.has(cmd.name))
    .sort((a, b) => {
      if (b.games !== a.games) return b.games - a.games;
      if (b.pilotCount !== a.pilotCount) return b.pilotCount - a.pilotCount;
      return Math.random() - 0.5;
    });

  const mostPlayed = mostPlayedCandidates.length > 0
    ? { ...mostPlayedCandidates[0], category: 'MOST PLAYED' }
    : { name: 'No Games Played', colors: [], games: 0, wins: 0, winRate: 0, category: 'MOST PLAYED' };

  return [mostPlayed, bestPerformer, specialFeature];
};

// ─── Player games helper ──────────────────────────────────────────────────────

/**
 * Get all player-entries for a specific player name across a set of games.
 * Returns an array of { game, playerEntry } pairs for pages that need
 * both the game context and the player's individual data.
 */
export const getPlayerEntries = (games, playerName) => {
  const valid = filterValidGames(games);
  const entries = [];
  valid.forEach(game => {
    const p = game.players.find(p => p.player === playerName);
    if (p) entries.push({ game, player: p });
  });
  return entries;
};
