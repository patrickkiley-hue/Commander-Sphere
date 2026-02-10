// Utility functions for calculating statistics from game data

// Filter out incomplete games (games with no winner)
// This ensures stats only count completed games
export const filterValidGames = (games) => {
  // Group games by gameId
  const gameGroups = games.reduce((acc, game) => {
    if (!acc[game.gameId]) acc[game.gameId] = [];
    acc[game.gameId].push(game);
    return acc;
  }, {});
  
  // Find gameIds that have at least one winner
  const validGameIds = new Set(
    Object.entries(gameGroups)
      .filter(([gameId, rows]) => rows.some(row => row.result === 'Win'))
      .map(([gameId]) => gameId)
  );
  
  // Return only games that belong to valid gameIds
  return games.filter(game => validGameIds.has(game.gameId));
};

// Get unique players from games
export const getPlayers = (games) => {
  const validGames = filterValidGames(games);
  const playerSet = new Set(validGames.map(game => game.player));
  return Array.from(playerSet).sort();
};

// Count unique games (by gameId)
export const countUniqueGames = (games) => {
  const validGames = filterValidGames(games);
  const gameIds = new Set(validGames.map(game => game.gameId));
  return gameIds.size;
};

// Count unique commanders
export const countUniqueCommanders = (games) => {
  const validGames = filterValidGames(games);
  const commanders = new Set(validGames.map(game => game.commander).filter(c => c));
  return commanders.size;
};

// Get games for a specific player
export const getPlayerGames = (games, playerName) => {
  const validGames = filterValidGames(games);
  return validGames.filter(game => game.player === playerName);
};

// Calculate win rate for a player
export const calculateWinRate = (games, playerName) => {
  const playerGames = getPlayerGames(games, playerName);
  if (playerGames.length === 0) return 0;
  
  const wins = playerGames.filter(game => game.isWin).length;
  return (wins / playerGames.length) * 100;
};

// Get games from the last session (most recent date + consecutive prior date if applicable)
// Updates at 7am EST daily
export const getLastSession = (games) => {
  const validGames = filterValidGames(games);
  if (validGames.length === 0) return [];
  
  // Get current time in EST
  const now = new Date();
  const estOffset = -5 * 60; // EST is UTC-5
  const estTime = new Date(now.getTime() + (estOffset + now.getTimezoneOffset()) * 60000);
  
  // If before 7am EST today, use yesterday as cutoff, otherwise use today
  const cutoffHour = 7;
  let effectiveDate = new Date(estTime);
  if (estTime.getHours() < cutoffHour) {
    effectiveDate.setDate(effectiveDate.getDate() - 1);
  }
  effectiveDate.setHours(0, 0, 0, 0);
  
  // Get all unique dates from games, sorted newest first
  const gameDates = [...new Set(validGames
    .filter(g => g.date && g.date < effectiveDate)
    .map(g => g.date.toDateString()))]
    .map(dateStr => new Date(dateStr))
    .sort((a, b) => b - a);
  
  if (gameDates.length === 0) return [];
  
  const mostRecentDate = gameDates[0];
  const sessionDates = [mostRecentDate];
  
  // Check if there's a consecutive prior date
  if (gameDates.length > 1) {
    const priorDate = gameDates[1];
    const daysDiff = Math.floor((mostRecentDate - priorDate) / (1000 * 60 * 60 * 24));
    
    // If exactly 1 day apart, include it in the session
    if (daysDiff === 1) {
      sessionDates.push(priorDate);
    }
  }
  
  // Return all games from session dates
  return validGames.filter(game => {
    if (!game.date) return false;
    const gameDateStr = game.date.toDateString();
    return sessionDates.some(d => d.toDateString() === gameDateStr);
  });
};

// Get games from the last N days (kept for other use cases)
export const getRecentGames = (games, days = 7) => {
  const validGames = filterValidGames(games);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  return validGames.filter(game => game.date && game.date >= cutoffDate);
};

// Get top players by win rate (minimum games threshold)
export const getTopPlayers = (games, minGames = 5) => {
  const validGames = filterValidGames(games);
  const players = getPlayers(validGames);
  
  return players
    .map(player => {
      const playerGames = getPlayerGames(validGames, player);
      const wins = playerGames.filter(game => game.isWin).length;
      const winRate = playerGames.length > 0 ? (wins / playerGames.length) * 100 : 0;
      
      return {
        name: player,
        games: playerGames.length,
        wins,
        winRate,
      };
    })
    .filter(p => p.games >= minGames)
    .sort((a, b) => b.winRate - a.winRate);
};

// Get most played commanders
export const getMostPlayedCommanders = (games, limit = 10) => {
  const validGames = filterValidGames(games);
  const commanderCounts = {};
  
  validGames.forEach(game => {
    const commander = game.commander;
    if (!commander) return;
    
    if (!commanderCounts[commander]) {
      commanderCounts[commander] = {
        name: commander,
        games: 0,
        wins: 0,
        colors: game.colorId,
      };
    }
    
    commanderCounts[commander].games++;
    if (game.isWin) commanderCounts[commander].wins++;
  });
  
  return Object.values(commanderCounts)
    .sort((a, b) => b.games - a.games)
    .slice(0, limit)
    .map(cmd => ({
      ...cmd,
      winRate: cmd.games > 0 ? (cmd.wins / cmd.games) * 100 : 0,
    }));
};

// Group games by unique game session
export const getGameSessions = (games) => {
  const validGames = filterValidGames(games);
  const sessions = {};
  
  validGames.forEach(game => {
    if (!sessions[game.gameId]) {
      sessions[game.gameId] = {
        gameId: game.gameId,
        date: game.date,
        dateString: game.dateString,
        players: [],
      };
    }
    
    sessions[game.gameId].players.push({
      player: game.player,
      commander: game.commander,
      colorId: game.colorId,
      turnOrder: game.turnOrder,
      result: game.result,
      isWin: game.isWin,
      bracket: game.bracket,
    });
  });
  
  return Object.values(sessions).sort((a, b) => b.date - a.date);
};

// Calculate average game duration (if Last Turn data exists)
export const getAverageGameLength = (games) => {
  const validGames = filterValidGames(games);
  const gamesWithDuration = validGames.filter(game => game.lastTurn && game.lastTurn > 0);
  if (gamesWithDuration.length === 0) return null;
  
  const total = gamesWithDuration.reduce((sum, game) => sum + parseInt(game.lastTurn), 0);
  return Math.round(total / gamesWithDuration.length);
};

// Get win rate by turn order position
export const getWinRateByPosition = (games) => {
  const validGames = filterValidGames(games);
  const positions = {};
  
  validGames.forEach(game => {
    const pos = game.turnOrder;
    if (!pos) return;
    
    if (!positions[pos]) {
      positions[pos] = { position: pos, games: 0, wins: 0 };
    }
    
    positions[pos].games++;
    if (game.isWin) positions[pos].wins++;
  });
  
  return Object.values(positions)
    .map(p => ({
      ...p,
      winRate: p.games > 0 ? (p.wins / p.games) * 100 : 0,
    }))
    .sort((a, b) => a.position - b.position);
};

// Get win rate by color identity
export const getWinRateByColors = (games) => {
  const validGames = filterValidGames(games);
  const colorGroups = {};
  
  validGames.forEach(game => {
    const colorKey = game.colorId.sort().join(',');
    
    if (!colorGroups[colorKey]) {
      colorGroups[colorKey] = {
        colors: game.colorId,
        colorKey,
        games: 0,
        wins: 0,
      };
    }
    
    colorGroups[colorKey].games++;
    if (game.isWin) colorGroups[colorKey].wins++;
  });
  
  return Object.values(colorGroups)
    .map(g => ({
      ...g,
      winRate: g.games > 0 ? (g.wins / g.games) * 100 : 0,
    }))
    .sort((a, b) => b.games - a.games);
};

// Get weekly stats (games per day of week)
export const getWeeklyStats = (games) => {
  const validGames = filterValidGames(games);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const weekData = days.map(day => ({ day, games: 0 }));
  
  validGames.forEach(game => {
    if (game.date) {
      const dayIndex = game.date.getDay();
      weekData[dayIndex].games++;
    }
  });
  
  return weekData;
};

// Get color identity as a string key for comparison
const getColorKey = (colors) => {
  if (!colors || colors.length === 0) return 'colorless';
  return [...colors].sort().join('');
};

// Get previous session game IDs for breakout deck detection
const getPreviousSessionIds = (games, currentSessionGames) => {
  if (currentSessionGames.length === 0) return [];
  
  // Get the session identifier (e.g., "001-J" from "001-J01")
  const sampleGameId = currentSessionGames[0].gameId;
  if (!sampleGameId) return [];
  
  // Extract session prefix (e.g., "001-J")
  const match = sampleGameId.match(/^(\d+)-([A-Z])/);
  if (!match) return [];
  
  const [, sessionNum, currentLetter] = match;
  
  // Get previous 3 letters
  const currentCharCode = currentLetter.charCodeAt(0);
  const previousLetters = [];
  for (let i = 1; i <= 3; i++) {
    const prevCharCode = currentCharCode - i;
    if (prevCharCode >= 65) { // 'A' is 65
      previousLetters.push(String.fromCharCode(prevCharCode));
    }
  }
  
  // Get games from previous sessions
  return games.filter(g => {
    const gMatch = g.gameId?.match(/^(\d+)-([A-Z])/);
    if (!gMatch) return false;
    const [, gNum, gLetter] = gMatch;
    return gNum === sessionNum && previousLetters.includes(gLetter);
  });
};

// Get Featured Deck of the Week (3 boxes calculated in specific order)
export const getFeaturedDecks = (allGames, sessionGames) => {
  const validAllGames = filterValidGames(allGames);
  const validSessionGames = filterValidGames(sessionGames);
  
  if (validSessionGames.length === 0) {
    return [
      { name: 'No Games Played', colors: [], games: 0, wins: 0, winRate: 0, category: 'MOST PLAYED' },
      { name: 'No Games Played', colors: [], games: 0, wins: 0, winRate: 0, category: 'BEST PERFORMER' },
      { name: 'No Games Played', colors: [], games: 0, wins: 0, winRate: 0, category: 'SPECIAL' }
    ];
  }
  
  // Build commander stats from session
  const sessionCommanders = {};
  validSessionGames.forEach(game => {
    const cmd = game.commander;
    if (!cmd) return;
    
    if (!sessionCommanders[cmd]) {
      sessionCommanders[cmd] = {
        name: cmd,
        colors: game.colorId || [],
        games: 0,
        wins: 0,
        pilots: new Set(),
        appearances: []
      };
    }
    
    sessionCommanders[cmd].games++;
    if (game.isWin) sessionCommanders[cmd].wins++;
    sessionCommanders[cmd].pilots.add(game.player);
    sessionCommanders[cmd].appearances.push(game);
  });
  
  // Calculate win rates
  Object.values(sessionCommanders).forEach(cmd => {
    cmd.winRate = cmd.games > 0 ? (cmd.wins / cmd.games) * 100 : 0;
    cmd.pilotCount = cmd.pilots.size;
  });
  
  const excludedDecks = new Set();
  
  // ==================== BOX 2: BEST PERFORMER ====================
  // Weighted to prefer multiple wins over 100% with 1 win
  let bestPerformer = null;
  const performers = Object.values(sessionCommanders)
    .filter(cmd => cmd.wins > 0)
    .sort((a, b) => {
      // Prefer commanders with multiple wins
      if (a.wins >= 2 && b.wins < 2) return -1;
      if (b.wins >= 2 && a.wins < 2) return 1;
      
      // Then by win rate
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      
      // Then by total wins
      return b.wins - a.wins;
    });
  
  if (performers.length > 0) {
    bestPerformer = { ...performers[0], category: 'BEST PERFORMER' };
    excludedDecks.add(performers[0].name);
  } else {
    bestPerformer = { name: 'No Games Played', colors: [], games: 0, wins: 0, winRate: 0, category: 'BEST PERFORMER' };
  }
  
  // ==================== BOX 3: SPECIAL FEATURES ====================
  let specialFeature = null;
  const specialOptions = [];
  
  // Option A: Breakout Deck
  const previousSessionGames = getPreviousSessionIds(validAllGames, validSessionGames);
  const previousWinningColors = new Set(
    previousSessionGames
      .filter(g => g.isWin)
      .map(g => getColorKey(g.colorId))
  );
  
  const breakoutDecks = Object.values(sessionCommanders)
    .filter(cmd => {
      if (cmd.wins === 0) return false;
      if (excludedDecks.has(cmd.name)) return false;
      const colorKey = getColorKey(cmd.colors);
      return !previousWinningColors.has(colorKey);
    });
  
  if (breakoutDecks.length > 0) {
    specialOptions.push({
      type: 'breakout',
      deck: { ...breakoutDecks[0], category: 'BREAKOUT DECK' }
    });
  }
  
  // Option B: Underdog Win
  // Calculate all-time win rates for all commanders
  const allTimeCommanders = {};
  validAllGames.forEach(game => {
    const cmd = game.commander;
    if (!cmd) return;
    
    if (!allTimeCommanders[cmd]) {
      allTimeCommanders[cmd] = { games: 0, wins: 0 };
    }
    allTimeCommanders[cmd].games++;
    if (game.isWin) allTimeCommanders[cmd].wins++;
  });
  
  const underdogDecks = Object.values(sessionCommanders)
    .filter(cmd => {
      if (cmd.wins === 0) return false;
      if (excludedDecks.has(cmd.name)) return false;
      
      const allTimeStats = allTimeCommanders[cmd.name];
      if (!allTimeStats || allTimeStats.games === 0) return false;
      
      const allTimeWinRate = (allTimeStats.wins / allTimeStats.games) * 100;
      return allTimeWinRate < 20;
    });
  
  if (underdogDecks.length > 0) {
    specialOptions.push({
      type: 'underdog',
      deck: { ...underdogDecks[0], category: 'UNDERDOG WIN' }
    });
  }
  
  // Option C: Beginner's Luck
  const allTimeCommanderNames = new Set(Object.keys(allTimeCommanders));
  const beginnerDecks = Object.values(sessionCommanders)
    .filter(cmd => {
      if (cmd.wins === 0) return false;
      if (excludedDecks.has(cmd.name)) return false;
      
      // Check if this commander appeared before this session
      const priorGames = validAllGames.filter(g => 
        g.commander === cmd.name && 
        !validSessionGames.some(sg => sg.gameId === g.gameId)
      );
      
      return priorGames.length === 0;
    });
  
  if (beginnerDecks.length > 0) {
    specialOptions.push({
      type: 'beginner',
      deck: { ...beginnerDecks[0], category: "BEGINNER'S LUCK" }
    });
  }
  
  // Fallback: "Squeaked One Out!"
  // Find player(s) with fewest wins in session
  const playerWins = {};
  validSessionGames.forEach(game => {
    if (!playerWins[game.player]) {
      playerWins[game.player] = 0;
    }
    if (game.isWin) playerWins[game.player]++;
  });
  
  const minWins = Math.min(...Object.values(playerWins).filter(w => w > 0));
  const playersWithMinWins = Object.entries(playerWins)
    .filter(([_, wins]) => wins === minWins)
    .map(([player, _]) => player);
  
  if (playersWithMinWins.length > 0) {
    // Get decks played by these players
    const squeakedDecks = Object.values(sessionCommanders)
      .filter(cmd => {
        if (excludedDecks.has(cmd.name)) return false;
        // Check if any pilot of this deck is in the min-wins players
        return cmd.appearances.some(game => 
          game.isWin && playersWithMinWins.includes(game.player)
        );
      })
      .sort((a, b) => {
        // Prefer deck with fewer total appearances
        if (a.games !== b.games) return a.games - b.games;
        // Random if still tied
        return Math.random() - 0.5;
      });
    
    if (squeakedDecks.length > 0) {
      specialOptions.push({
        type: 'squeaked',
        deck: { ...squeakedDecks[0], category: 'SQUEAKED ONE OUT!' }
      });
    }
  }
  
  // Select random special option
  if (specialOptions.length > 0) {
    const selected = specialOptions[Math.floor(Math.random() * specialOptions.length)];
    specialFeature = selected.deck;
    excludedDecks.add(selected.deck.name);
  } else {
    specialFeature = { name: 'No Games Played', colors: [], games: 0, wins: 0, winRate: 0, category: 'SPECIAL' };
  }
  
  // ==================== BOX 1: MOST PLAYED ====================
  let mostPlayed = null;
  const mostPlayedCandidates = Object.values(sessionCommanders)
    .filter(cmd => !excludedDecks.has(cmd.name))
    .sort((a, b) => {
      // Sort by games played
      if (b.games !== a.games) return b.games - a.games;
      
      // Tiebreaker: multiple pilots
      if (b.pilotCount !== a.pilotCount) return b.pilotCount - a.pilotCount;
      
      // Random if still tied
      return Math.random() - 0.5;
    });
  
  if (mostPlayedCandidates.length > 0) {
    mostPlayed = { ...mostPlayedCandidates[0], category: 'MOST PLAYED' };
  } else {
    mostPlayed = { name: 'No Games Played', colors: [], games: 0, wins: 0, winRate: 0, category: 'MOST PLAYED' };
  }
  
  return [mostPlayed, bestPerformer, specialFeature];
};
