import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSheetData } from '../context/SheetDataContext';
import { loadPlaygroupData, checkAndRollSeason } from '../utils/firestoreHelpers';
import { getDisplayName } from '../utils/deckNameUtils';
import scryfallService from '../services/scryfallService';
import ColorMana from '../components/ColorMana';
import './BlankPage.css';
import './MyStatsPage.css';

function MyStatsPage({ currentPlaygroup, playerMapping }) {
  const navigate = useNavigate();
  const { games, isLoading } = useSheetData();
  
  // Initialize from sessionStorage, default to true (season) if not set
  const [showSeasonStats, setShowSeasonStats] = useState(() => {
    const saved = sessionStorage.getItem('statsViewMode');
    return saved ? saved === 'season' : true;
  });
  
  const [seasonData, setSeasonData] = useState(null);
  const [commanderArts, setCommanderArts] = useState({});
  const [advancedStatsEnabled, setAdvancedStatsEnabled] = useState(false);
  const [sortColorsByWinRate, setSortColorsByWinRate] = useState(false);

  // Remove the old playerName loading logic - now comes from prop
  const playerName = playerMapping;

  // Load season data and advanced stats setting
  useEffect(() => {
    const loadSeasonData = async () => {
      if (!currentPlaygroup?.spreadsheetId) return;
      
      try {
        const pgData = await loadPlaygroupData(currentPlaygroup.spreadsheetId);
        
        // Load advanced stats setting
        setAdvancedStatsEnabled(pgData?.advancedStatsEnabled || false);
        
        if (pgData?.seasonEnabled && pgData.seasonStartDate && pgData.seasonDuration) {
          let seasonInfo = {
            enabled: true,
            duration: pgData.seasonDuration,
            startDate: pgData.seasonStartDate
          };
          
          // Check and auto-roll season if expired
          seasonInfo = await checkAndRollSeason(currentPlaygroup.spreadsheetId, seasonInfo);
          
          setSeasonData({
            enabled: true,
            duration: seasonInfo.duration,
            startDate: new Date(seasonInfo.startDate)
          });
        }
      } catch (error) {
        console.error('Error loading season data:', error);
      }
    };
    
    loadSeasonData();
  }, [currentPlaygroup]);

  // Filter games
  const getFilteredGames = () => {
    if (!seasonData?.enabled || !showSeasonStats) {
      return games;
    }

    // Simple calendar-based filtering
    if (seasonData.startDate) {
      return games.filter(g => g.date >= seasonData.startDate);
    }
    
    return games;
  };

  const filteredGames = getFilteredGames();
  const playerGames = playerName ? filteredGames.filter(g => g.player === playerName) : [];

  // Calculate header stats
  const totalGames = playerGames.length;
  const totalWins = playerGames.filter(g => g.isWin).length;
  const winRate = totalGames > 0 ? (totalWins / totalGames) * 100 : 0;

  // Get standout decks (same logic as PlayerStatsPage)
  const getStandoutDecks = () => {
    const deckStats = {};
    
    playerGames.forEach(game => {
      const deck = game.commander;
      if (!deck) return;
      
      if (!deckStats[deck]) {
        deckStats[deck] = {
          name: deck,
          colors: game.colorId || [],
          games: 0,
          wins: 0,
          sessions: new Set(),
          recentSessions: new Set(),
          firstGameId: game.gameId,
          firstDate: game.date,
          gameIds: []
        };
      }
      
      deckStats[deck].games++;
      if (game.isWin) deckStats[deck].wins++;
      deckStats[deck].gameIds.push(game.gameId);
      
      const session = game.gameId?.substring(0, 5);
      if (session) deckStats[deck].sessions.add(session);
    });

    const allSessions = [...new Set(playerGames.map(g => g.gameId?.substring(0, 5)).filter(Boolean))].sort().reverse();
    const last3Sessions = allSessions.slice(0, 3);
    
    Object.values(deckStats).forEach(deck => {
      deck.gameIds.forEach(gameId => {
        const session = gameId?.substring(0, 5);
        if (last3Sessions.includes(session)) {
          deck.recentSessions.add(session);
        }
      });
    });

    const decks = Object.values(deckStats).map(d => ({
      ...d,
      winRate: d.games > 0 ? (d.wins / d.games) * 100 : 0,
      sessionCount: d.sessions.size,
      recentSessionCount: d.recentSessions.size
    }));

    const standouts = {};

    const eligibleForAllStar = decks.filter(d => d.wins > 0);
    
    let allStarCandidates = eligibleForAllStar.filter(d => d.games >= 4 && d.wins >= 2);
    if (allStarCandidates.length === 0) {
      allStarCandidates = eligibleForAllStar.filter(d => d.games === 3 && d.wins >= 1);
    }
    if (allStarCandidates.length === 0) {
      allStarCandidates = eligibleForAllStar.filter(d => d.games === 2 && d.wins >= 1);
    }
    if (allStarCandidates.length === 0) {
      allStarCandidates = eligibleForAllStar.filter(d => d.games === 1 && d.wins === 1);
    }
    
    if (allStarCandidates.length > 0) {
      standouts.allStar = allStarCandidates.sort((a, b) => {
        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        if (b.games !== a.games) return b.games - a.games;
        return b.firstGameId.localeCompare(a.firstGameId);
      })[0];
    }

    const remainingDecks = decks.filter(d => d.name !== standouts.allStar?.name);

    const favoriteCandidate = [...remainingDecks].sort((a, b) => {
      if (b.games !== a.games) return b.games - a.games;
      return b.firstGameId.localeCompare(a.firstGameId);
    })[0];

    const workhorseCandidate = [...remainingDecks].sort((a, b) => {
      if (b.sessionCount !== a.sessionCount) return b.sessionCount - a.sessionCount;
      return b.firstGameId.localeCompare(a.firstGameId);
    })[0];

    if (favoriteCandidate && workhorseCandidate && favoriteCandidate?.name === workhorseCandidate?.name) {
      const deck = favoriteCandidate;
      const otherDecks = remainingDecks.filter(d => d.name !== deck.name);
      
      const secondMostPlayed = [...otherDecks].sort((a, b) => {
        if (b.games !== a.games) return b.games - a.games;
        return b.firstGameId.localeCompare(a.firstGameId);
      })[0];
      
      const secondMostSessions = [...otherDecks].sort((a, b) => {
        if (b.sessionCount !== a.sessionCount) return b.sessionCount - a.sessionCount;
        return b.firstGameId.localeCompare(a.firstGameId);
      })[0];
      
      const avgRecentSessions = remainingDecks.length > 0 
        ? remainingDecks.reduce((sum, d) => sum + d.recentSessionCount, 0) / remainingDecks.length 
        : 0;
      
      if (deck.recentSessionCount >= avgRecentSessions) {
        standouts.favorite = deck;
        standouts.workhorse = secondMostSessions;
      } else {
        standouts.workhorse = deck;
        standouts.favorite = secondMostPlayed;
      }
    } else {
      standouts.favorite = favoriteCandidate;
      standouts.workhorse = workhorseCandidate;
    }

    const newbieCandidate = [...remainingDecks].sort((a, b) => {
      if (a.firstDate && b.firstDate && a.firstDate.getTime() !== b.firstDate.getTime()) {
        return b.firstDate - a.firstDate;
      }
      return b.firstGameId.localeCompare(a.firstGameId);
    })[0];
    
    standouts.newbie = newbieCandidate;

    const result = [];
    if (standouts.allStar) result.push({ ...standouts.allStar, category: 'allStar' });
    if (standouts.favorite) result.push({ ...standouts.favorite, category: 'favorite' });
    if (standouts.workhorse) result.push({ ...standouts.workhorse, category: 'workhorse' });
    if (standouts.newbie) result.push({ ...standouts.newbie, category: 'newbie' });

    return result;
  };

  const getTurnOrderStats = () => {
    const stats = {};
    
    playerGames.forEach(game => {
      const pos = game.turnOrder;
      if (!pos) return;
      
      if (!stats[pos]) {
        stats[pos] = { games: 0, wins: 0 };
      }
      stats[pos].games++;
      if (game.isWin) stats[pos].wins++;
    });
    
    return Object.entries(stats)
      .map(([pos, data]) => ({
        position: parseInt(pos),
        games: data.games,
        wins: data.wins,
        winRate: data.games > 0 ? (data.wins / data.games) * 100 : 0
      }))
      .sort((a, b) => a.position - b.position);
  };

  const getColorIdentityStats = () => {
    const identities = [
      { colors: ['W'], label: 'White' },
      { colors: ['U'], label: 'Blue' },
      { colors: ['B'], label: 'Black' },
      { colors: ['R'], label: 'Red' },
      { colors: ['G'], label: 'Green' },
      { colors: ['C'], label: 'Colorless' },
      { colors: ['W', 'U'], label: 'Azorius' },
      { colors: ['U', 'B'], label: 'Dimir' },
      { colors: ['B', 'R'], label: 'Rakdos' },
      { colors: ['R', 'G'], label: 'Gruul' },
      { colors: ['G', 'W'], label: 'Selesnya' },
      { colors: ['W', 'B'], label: 'Orzhov' },
      { colors: ['U', 'R'], label: 'Izzet' },
      { colors: ['B', 'G'], label: 'Golgari' },
      { colors: ['R', 'W'], label: 'Boros' },
      { colors: ['G', 'U'], label: 'Simic' },
      { colors: ['G', 'W', 'U'], label: 'Bant' },
      { colors: ['W', 'U', 'B'], label: 'Esper' },
      { colors: ['U', 'B', 'R'], label: 'Grixis' },
      { colors: ['B', 'R', 'G'], label: 'Jund' },
      { colors: ['R', 'G', 'W'], label: 'Naya' },
      { colors: ['W', 'B', 'G'], label: 'Abzan' },
      { colors: ['U', 'R', 'W'], label: 'Jeskai' },
      { colors: ['B', 'G', 'U'], label: 'Sultai' },
      { colors: ['R', 'W', 'B'], label: 'Mardu' },
      { colors: ['G', 'U', 'R'], label: 'Temur' },
      { colors: ['U', 'B', 'R', 'G'], label: 'sans White' },
      { colors: ['W', 'B', 'R', 'G'], label: 'sans Blue' },
      { colors: ['W', 'U', 'R', 'G'], label: 'sans Black' },
      { colors: ['W', 'U', 'B', 'G'], label: 'sans Red' },
      { colors: ['W', 'U', 'B', 'R'], label: 'sans Green' },
      { colors: ['W', 'U', 'B', 'R', 'G'], label: 'WUBRG' }
    ];

    const stats = {};
    
    playerGames.forEach(game => {
      let gameColors = game.colorId || [];
      if (typeof gameColors === 'string') gameColors = gameColors.split('');
      if (gameColors.length === 0) gameColors = ['C'];
      
      const key = [...gameColors].sort().join('');
      if (!stats[key]) {
        stats[key] = { games: 0, wins: 0 };
      }
      stats[key].games++;
      if (game.isWin) stats[key].wins++;
    });

    return identities
      .map(id => {
        const key = id.colors.sort().join('');
        const data = stats[key];
        return {
          colors: id.colors,
          label: id.label,
          games: data?.games || 0,
          winRate: data && data.games > 0 ? (data.wins / data.games) * 100 : null
        };
      })
      .filter(id => id.games > 0);
  };

  const getPodCompositionStats = () => {
    const opponentStats = {};
    
    const playerGameIds = new Set(playerGames.map(g => g.gameId));
    
    filteredGames.forEach(game => {
      if (playerGameIds.has(game.gameId) && game.player !== playerName) {
        if (!opponentStats[game.player]) {
          opponentStats[game.player] = {
            name: game.player,
            games: new Set(),
            playerWins: 0,
            opponentWins: 0
          };
        }
        
        opponentStats[game.player].games.add(game.gameId);
        
        const playerWon = playerGames.find(g => g.gameId === game.gameId && g.isWin);
        if (playerWon) {
          opponentStats[game.player].playerWins++;
        } else if (game.isWin) {
          opponentStats[game.player].opponentWins++;
        }
      }
    });

    return Object.values(opponentStats)
      .map(opp => ({
        name: opp.name,
        wins: opp.playerWins,
        losses: opp.games.size - opp.playerWins,
        games: opp.games.size,
        winRate: opp.games.size > 0 ? (opp.playerWins / opp.games.size) * 100 : 0
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  // Calculate win rate facing each color
  const getPerformanceFacingColors = () => {
    const colorMap = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };
    const stats = {};
    
    Object.keys(colorMap).forEach(color => {
      stats[color] = { games: 0, wins: 0 };
    });
    
    playerGames.forEach(playerGame => {
      // Get all opponents in this game
      const opponentsInGame = filteredGames.filter(g => 
        g.gameId === playerGame.gameId && g.player !== playerName
      );
      
      // Track which colors are present in opponent decks
      const colorsPresent = new Set();
      opponentsInGame.forEach(opp => {
        const oppColors = opp.colorId || [];
        oppColors.forEach(color => {
          if (stats[color]) colorsPresent.add(color);
        });
      });
      
      // For each color present, count this game
      colorsPresent.forEach(color => {
        stats[color].games++;
        if (playerGame.isWin) stats[color].wins++;
      });
    });
    
    return Object.entries(stats)
      .map(([color, data]) => ({
        color,
        label: colorMap[color] + '+',
        games: data.games,
        winRate: data.games > 0 ? (data.wins / data.games) * 100 : 0
      }))
      .filter(r => r.games > 0)
      .sort((a, b) => b.winRate - a.winRate);
  };

  // Calculate win rate playing each color (player's own decks)
  const getPerformancePlayingColors = () => {
    const colorMap = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };
    const stats = {};
    
    Object.keys(colorMap).forEach(color => {
      stats[color] = { games: 0, wins: 0 };
    });
    
    playerGames.forEach(game => {
      const colors = game.colorId || [];
      colors.forEach(color => {
        if (stats[color]) {
          stats[color].games++;
          if (game.isWin) stats[color].wins++;
        }
      });
    });
    
    return Object.entries(stats)
      .map(([color, data]) => ({
        color,
        label: colorMap[color] + '+',
        games: data.games,
        winRate: data.games > 0 ? (data.wins / data.games) * 100 : 0
      }))
      .filter(r => r.games > 0)
      .sort((a, b) => b.winRate - a.winRate);
  };

  // Calculate opponent pair combinations
  const getOpponentPairStats = () => {
    const pairStats = {};
    
    playerGames.forEach(playerGame => {
      // Get all opponents in this game
      const opponentsInGame = filteredGames
        .filter(g => g.gameId === playerGame.gameId && g.player !== playerName)
        .map(g => g.player);
      
      // Generate all possible pairs
      for (let i = 0; i < opponentsInGame.length; i++) {
        for (let j = i + 1; j < opponentsInGame.length; j++) {
          // Sort names alphabetically for consistent key
          const pair = [opponentsInGame[i], opponentsInGame[j]].sort();
          const pairKey = pair.join(' + ');
          
          if (!pairStats[pairKey]) {
            pairStats[pairKey] = {
              opponents: pair,
              games: 0,
              wins: 0,
              losses: 0
            };
          }
          
          pairStats[pairKey].games++;
          if (playerGame.isWin) {
            pairStats[pairKey].wins++;
          } else {
            pairStats[pairKey].losses++;
          }
        }
      }
    });
    
    return Object.entries(pairStats).map(([key, data]) => ({
      opponents: data.opponents,
      games: data.games,
      wins: data.wins,
      losses: data.losses,
      winRate: data.games > 0 ? (data.wins / data.games) * 100 : 0
    }));
  };

  const performanceFacingColors = playerName ? getPerformanceFacingColors() : [];
  const performancePlayingColors = playerName ? getPerformancePlayingColors() : [];
  const opponentPairStats = playerName ? getOpponentPairStats() : [];
  
  // Filter to top 1/3 by games played to exclude outliers
  const filteredPairStats = opponentPairStats.filter(pair => {
    if (opponentPairStats.length === 0) return false;
    
    // Calculate 67th percentile (top 1/3 threshold)
    const gamesCounts = opponentPairStats.map(p => p.games).sort((a, b) => a - b);
    const index = Math.floor(gamesCounts.length * 0.67);
    const threshold = gamesCounts[index];
    
    // Only include pairs with games >= threshold (top 1/3)
    return pair.games >= threshold;
  });
  
  // Get top 4 and bottom 4 opponent pairs from filtered list
  const favorablePods = [...filteredPairStats]
    .sort((a, b) => {
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      return b.games - a.games; // Tiebreaker: most games
    })
    .slice(0, 4);
    
  const unfavorablePods = [...filteredPairStats]
    .sort((a, b) => {
      if (a.winRate !== b.winRate) return a.winRate - b.winRate;
      return b.games - a.games; // Tiebreaker: most games
    })
    .slice(0, 4);

  // Calculate deck history - player's own decks (Wins)
  const getPlayerDeckHistory = () => {
    const deckStats = {};
    
    playerGames.forEach(game => {
      const deck = game.commander;
      if (!deck) return;
      
      if (!deckStats[deck]) {
        deckStats[deck] = {
          name: deck,
          colors: game.colorId || [],
          games: 0,
          wins: 0,
          losses: 0
        };
      }
      
      deckStats[deck].games++;
      if (game.isWin) {
        deckStats[deck].wins++;
      } else {
        deckStats[deck].losses++;
      }
    });
    
    const allDecks = Object.values(deckStats).map(d => ({
      ...d,
      winRate: d.games > 0 ? (d.wins / d.games) * 100 : 0
    }));
    
    // Separate decks with wins from winless decks
    const decksWithWins = allDecks.filter(d => d.wins > 0);
    const winlessDecks = allDecks.filter(d => d.wins === 0);
    
    // Sort decks with wins: Games DESC → WinRate DESC → Alphabetically
    decksWithWins.sort((a, b) => {
      if (b.games !== a.games) return b.games - a.games;
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      return a.name.localeCompare(b.name);
    });
    
    // Sort winless decks: Games DESC → Alphabetically
    winlessDecks.sort((a, b) => {
      if (b.games !== a.games) return b.games - a.games;
      return a.name.localeCompare(b.name);
    });
    
    // Return decks with wins first, then winless decks
    return [...decksWithWins, ...winlessDecks];
  };

  // Calculate losses - opponent decks that won against player
  const getOpponentDeckLosses = () => {
    const lossStats = {};
    
    // Get all games where player lost
    const playerLosses = playerGames.filter(g => !g.isWin);
    
    playerLosses.forEach(playerGame => {
      // Find the winning opponent deck in this game
      const winner = filteredGames.find(g => 
        g.gameId === playerGame.gameId && 
        g.player !== playerName && 
        g.isWin
      );
      
      if (winner) {
        // Key by deck + pilot (treat separately)
        const key = `${winner.commander}|||${winner.player}`;
        
        if (!lossStats[key]) {
          lossStats[key] = {
            deckName: winner.commander,
            pilot: winner.player,
            colors: winner.colorId || [],
            losses: 0
          };
        }
        
        lossStats[key].losses++;
      }
    });
    
    return Object.values(lossStats)
      .sort((a, b) => {
        // Sort by losses DESC, then alphabetically by deck name
        if (b.losses !== a.losses) return b.losses - a.losses;
        return a.deckName.localeCompare(b.deckName);
      });
  };

  const playerDeckHistory = playerName ? getPlayerDeckHistory() : [];
  const opponentDeckLosses = playerName ? getOpponentDeckLosses() : [];

  const standoutDecks = playerName ? getStandoutDecks() : [];
  const turnOrderStats = playerName ? getTurnOrderStats() : [];
  const colorIdentityStats = playerName ? getColorIdentityStats() : [];
  const podCompositionStats = playerName ? getPodCompositionStats() : [];

  // Advanced Metrics Calculations
  const getAdvancedMetrics = () => {
    if (!playerName || !advancedStatsEnabled) return null;

    const playerGamesWithBracket = filteredGames.filter(g => 
      g.player === playerName && g.bracket !== null
    );

    if (playerGamesWithBracket.length === 0) return null;

    // Helper: Round to one decimal place
    const roundTurn = (num) => {
      return Math.round(num * 10) / 10;
    };

    // Helper: Get game mode bracket (most common bracket, ties go to higher)
    const getGameModeBracket = (gameId) => {
      const gamePlayers = filteredGames.filter(g => g.gameId === gameId && g.bracket !== null);
      
      if (gamePlayers.length === 0) return null;
      
      // Convert cEDH to 5 for counting
      const brackets = gamePlayers.map(g => g.bracket === 'cEDH' ? 5 : g.bracket);
      
      // Count frequency of each bracket
      const frequency = {};
      brackets.forEach(b => {
        frequency[b] = (frequency[b] || 0) + 1;
      });
      
      // Find the highest frequency
      const maxFreq = Math.max(...Object.values(frequency));
      
      // Get all brackets with max frequency (handles ties)
      const modes = Object.keys(frequency)
        .filter(b => frequency[b] === maxFreq)
        .map(b => parseInt(b));
      
      // If tie, return the higher bracket
      return Math.max(...modes);
    };

    // Bracket Breakdown
    const bracketGames = {};
    const bracketWins = {};
    let gamesStrongerDeck = 0;
    let gamesWeakerDeck = 0;
    let gamesMatchedPower = 0;
    let winsWithStrongerDeck = 0;
    let winsWithWeakerDeck = 0;

    playerGamesWithBracket.forEach(game => {
      const playerBracket = game.bracket === 'cEDH' ? 5 : game.bracket;
      const gameMode = getGameModeBracket(game.gameId);
      
      if (gameMode === null) return;

      // Track bracket games and wins
      const bracketKey = game.bracket;
      bracketGames[bracketKey] = (bracketGames[bracketKey] || 0) + 1;
      if (game.isWin) {
        bracketWins[bracketKey] = (bracketWins[bracketKey] || 0) + 1;
      }

      // Compare player bracket to game mode
      if (playerBracket === gameMode) {
        gamesMatchedPower++;
      } else if (playerBracket > gameMode) {
        gamesStrongerDeck++;
        if (game.isWin) winsWithStrongerDeck++;
      } else if (playerBracket < gameMode) {
        gamesWeakerDeck++;
        if (game.isWin) winsWithWeakerDeck++;
      }
    });

    // Calculate bracket list (2+ games or all if <5 total)
    const totalGames = playerGamesWithBracket.length;
    const bracketList = Object.entries(bracketGames)
      .filter(([_, count]) => totalGames < 5 || count >= 2)
      .map(([bracket, count]) => ({
        bracket,
        games: count,
        wins: bracketWins[bracket] || 0,
        winRate: count > 0 ? (bracketWins[bracket] || 0) / count * 100 : 0
      }))
      .sort((a, b) => b.games - a.games);

    // Create bracket list sorted by bracket number for win % display
    const bracketListByNumber = [...bracketList].sort((a, b) => {
      const numA = a.bracket === 'cEDH' ? 5 : a.bracket;
      const numB = b.bracket === 'cEDH' ? 5 : b.bracket;
      return numA - numB;
    });

    // Determine nickname
    let nickname = 'Fair Competition';
    let subtitle = 'You more often match power level';
    
    const totalWins = playerGamesWithBracket.filter(g => g.isWin).length;
    const pubstomperRate = totalWins > 0 ? winsWithStrongerDeck / totalWins : 0;
    const folkHeroRate = totalWins > 0 ? winsWithWeakerDeck / totalWins : 0;
    const smallBeanRate = totalGames > 0 ? gamesStrongerDeck / totalGames : 0;
    const underdogRate = totalGames > 0 ? gamesWeakerDeck / totalGames : 0;
    const fairCompRate = totalGames > 0 ? gamesMatchedPower / totalGames : 0;

    // Priority order with thresholds
    if (pubstomperRate >= 0.15 && winsWithStrongerDeck >= 2) {
      // Must have 15%+ wins with stronger deck AND at least 2 such wins
      nickname = 'Pubstomper';
      subtitle = 'You frequently win with a stronger deck';
    } else if (folkHeroRate >= 0.15 && winsWithWeakerDeck >= 1 && smallBeanRate <= 0.10) {
      // Must have 15%+ wins with weaker deck, at least 1 such win, and ≤10% games with stronger deck
      nickname = 'Folk Hero';
      subtitle = 'You sometimes win with a weaker deck';
    } else if (smallBeanRate >= 0.20) {
      nickname = 'Small Bean';
      subtitle = 'You often play with a stronger deck';
    } else if (underdogRate >= 0.20) {
      nickname = 'Underdog';
      subtitle = 'You often play with a weaker deck';
    } else if (fairCompRate >= 0.90) {
      nickname = 'Fair Competition';
      subtitle = 'You more often match power level';
    }

    // Seat Metrics
    const playerWins = playerGames.filter(g => g.isWin && g.lastTurn !== null);
    const playerLosses = playerGames.filter(g => !g.isWin);
    
    const avgWinTurn = playerWins.length > 0
      ? roundTurn(playerWins.reduce((sum, g) => sum + g.lastTurn, 0) / playerWins.length)
      : null;

    // Get loss turns from winner's lastTurn
    const lossTurns = [];
    playerLosses.forEach(loss => {
      const winner = filteredGames.find(g => 
        g.gameId === loss.gameId && g.isWin && g.lastTurn !== null
      );
      if (winner) lossTurns.push(winner.lastTurn);
    });

    const avgLossTurn = lossTurns.length > 0
      ? roundTurn(lossTurns.reduce((sum, t) => sum + t, 0) / lossTurns.length)
      : null;

    // Fastest and slowest wins
    let fastestWin = null;
    let slowestWin = null;
    if (playerWins.length > 0) {
      const sorted = [...playerWins].sort((a, b) => a.lastTurn - b.lastTurn);
      fastestWin = { 
        turn: sorted[0].lastTurn, 
        deck: sorted[0].commander,
        colors: sorted[0].colorId
      };
      slowestWin = { 
        turn: sorted[sorted.length - 1].lastTurn, 
        deck: sorted[sorted.length - 1].commander,
        colors: sorted[sorted.length - 1].colorId
      };
    }

    // Bracket turn analysis - top 2 most played brackets
    const topBrackets = bracketList.slice(0, 2);
    const bracketTurnAnalysis = topBrackets.map(({ bracket }) => {
      // Find all games where player played at this bracket
      // Note: bracket from bracketList is a string, g.bracket is number or "cEDH"
      const playerGamesAtBracket = playerGamesWithBracket.filter(g => {
        if (bracket === 'cEDH') return g.bracket === 'cEDH';
        return g.bracket == bracket; // Use == for type coercion (3 == "3")
      });
      
      // Get unique game IDs
      const gameIds = [...new Set(playerGamesAtBracket.map(g => g.gameId))];
      
      // For each game, find the winner's lastTurn
      const gameTurns = [];
      gameIds.forEach(gameId => {
        const winner = filteredGames.find(g => 
          g.gameId === gameId && g.isWin && g.lastTurn !== null
        );
        if (winner) {
          gameTurns.push(winner.lastTurn);
        }
      });

      const avgTurn = gameTurns.length > 0
        ? roundTurn(gameTurns.reduce((sum, t) => sum + t, 0) / gameTurns.length)
        : null;

      return { bracket, avgTurn, games: gameTurns.length };
    }).filter(b => b.avgTurn !== null);

    // Win Conditions
    const winConditionWins = {};
    const winConditionLosses = {};
    
    // Count player's wins with win conditions
    playerGames.filter(g => g.isWin && g.winCondition).forEach(game => {
      const condition = game.winCondition;
      winConditionWins[condition] = (winConditionWins[condition] || 0) + 1;
    });

    // Count player's losses to opponents with win conditions
    playerGames.filter(g => !g.isWin).forEach(loss => {
      const winner = filteredGames.find(g => 
        g.gameId === loss.gameId && g.isWin && g.winCondition
      );
      if (winner) {
        const condition = winner.winCondition;
        winConditionLosses[condition] = (winConditionLosses[condition] || 0) + 1;
      }
    });

    const totalWinsForWinCon = playerGames.filter(g => g.isWin).length;
    const totalLossesForWinCon = playerGames.filter(g => !g.isWin).length;

    // Convert to percentages and rank by percentage
    const winConditionWinsList = Object.entries(winConditionWins)
      .map(([condition, count]) => ({
        condition,
        count,
        percentage: totalWinsForWinCon > 0 ? (count / totalWinsForWinCon) * 100 : 0
      }))
      .sort((a, b) => b.percentage - a.percentage);

    const winConditionLossesList = Object.entries(winConditionLosses)
      .map(([condition, count]) => ({
        condition,
        count,
        percentage: totalLossesForWinCon > 0 ? (count / totalLossesForWinCon) * 100 : 0
      }))
      .sort((a, b) => b.percentage - a.percentage);

    // Only return win condition data if there's something to show
    const hasWinConditionData = winConditionWinsList.length > 0 || winConditionLossesList.length > 0;

    return {
      bracketBreakdown: {
        topBrackets: bracketList.filter((_, i) => i < 2 || bracketList.length === 1),
        allBrackets: bracketList,
        allBracketsByNumber: bracketListByNumber,
        nickname,
        subtitle
      },
      seatMetrics: {
        avgWinTurn,
        avgLossTurn,
        fastestWin,
        slowestWin,
        bracketTurnAnalysis
      },
      winConditions: hasWinConditionData ? {
        wins: winConditionWinsList,
        losses: winConditionLossesList
      } : null
    };
  };

  const advancedMetrics = getAdvancedMetrics();

  // Apply sorting to color identity stats if toggle is on
  const displayColorIdentityStats = sortColorsByWinRate
    ? [...colorIdentityStats].sort((a, b) => {
        // Sort by win rate descending, nulls to end
        if (a.winRate === null) return 1;
        if (b.winRate === null) return -1;
        return b.winRate - a.winRate;
      })
    : colorIdentityStats;

  const midpoint = Math.ceil(displayColorIdentityStats.length / 2);
  const col1 = displayColorIdentityStats.slice(0, midpoint);
  const col2 = displayColorIdentityStats.slice(midpoint);

  useEffect(() => {
    const fetchArts = async () => {
      // Clear existing arts immediately to prevent flash of wrong images
      setCommanderArts({});
      
      const arts = {};
      
      for (const deck of standoutDecks) {
        try {
          const commanders = deck.name.split(' // ').map(n => n.trim());
          
          if (commanders.length === 2) {
            const [art1, art2] = await Promise.all([
              scryfallService.getCommanderByName(commanders[0]),
              scryfallService.getCommanderByName(commanders[1])
            ]);
            arts[deck.name] = {
              type: 'dual',
              art1: scryfallService.getArtCrop(art1),
              art2: scryfallService.getArtCrop(art2)
            };
          } else {
            const card = await scryfallService.getCommanderByName(deck.name);
            arts[deck.name] = {
              type: 'single',
              art: scryfallService.getArtCrop(card)
            };
          }
        } catch (error) {
          console.error(`Failed to fetch art for ${deck.name}:`, error);
        }
      }
      
      setCommanderArts(arts);
    };
    
    if (standoutDecks.length > 0) {
      fetchArts();
    } else {
      setCommanderArts({});
    }
  }, [
    standoutDecks.map(d => d.name).join('|'), 
    showSeasonStats,
    filteredGames.length > 0 ? `${filteredGames[0].id}-${filteredGames[filteredGames.length - 1].id}` : 'empty'
  ]);

  const getCategoryLabel = (category) => {
    const labels = {
      allStar: 'All-Star',
      favorite: 'Favorite',
      workhorse: 'Workhorse',
      newbie: 'Newbie'
    };
    return labels[category] || category;
  };

  const getCategoryStat = (deck) => {
    switch (deck.category) {
      case 'allStar':
        return `${deck.winRate.toFixed(1)}% Win Rate`;
      case 'favorite':
        return `${deck.games} Games`;
      case 'workhorse':
        return `${deck.sessionCount} Game Days`;
      case 'newbie':
        return deck.firstDate ? deck.firstDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : 'Recent';
      default:
        return '';
    }
  };

  if (isLoading) {
    return (
      <div className="blank-page">
        <button className="back-button" onClick={() => navigate(-1)}>
          ← Back
        </button>
        <div className="page-content">
          <p className="loading-message">Loading...</p>
        </div>
      </div>
    );
  }

  if (!playerName) {
    return (
      <div className="blank-page">
        <button className="back-button" onClick={() => navigate(-1)}>
          ← Back
        </button>
        <div className="page-content">
          <div className="waiting-message">
            Waiting for playgroup admin to link your player ID
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="blank-page">
      <button className="back-button" onClick={() => navigate(-1)}>
        ← Back
      </button>
      
      <div className="page-content">
        {/* Unified Header with player name and stats - CYAN STYLING */}
        <div className="my-stats-header-unified">
          <div className="header-top">
            <h1 className="my-stats-player-name">{playerName}</h1>
            {seasonData?.enabled && (
              <div className="season-toggle">
                <button
                  className={`toggle-btn ${showSeasonStats ? 'active' : ''}`}
                  onClick={() => {
                    setShowSeasonStats(true);
                    sessionStorage.setItem('statsViewMode', 'season');
                  }}
                >
                  Season
                </button>
                <button
                  className={`toggle-btn ${!showSeasonStats ? 'active' : ''}`}
                  onClick={() => {
                    setShowSeasonStats(false);
                    sessionStorage.setItem('statsViewMode', 'alltime');
                  }}
                >
                  All Time
                </button>
              </div>
            )}
          </div>
          <div className="header-stats-row">
            <div className="header-stat stat-left">
              <div className="header-stat-number purple">{totalGames}</div>
              <div className="header-stat-label">Games</div>
            </div>
            <div className="header-stat stat-center">
              <div className="header-stat-number green">{totalWins}</div>
              <div className="header-stat-label">Wins</div>
            </div>
            <div className="header-stat stat-right">
              <div className="header-stat-number yellow">{winRate.toFixed(1)}%</div>
              <div className="header-stat-label">Win Rate</div>
            </div>
          </div>
        </div>

        {/* Rest of content identical to PlayerStatsPage */}
        <div className="stats-row">
          <div className="stats-box deck-history-box">
            <h3 className="stats-box-title">
              <svg className="title-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                <circle cx="12" cy="13" r="4"></circle>
              </svg>
              Deck Snapshot
            </h3>
            <div className="deck-list">
              {standoutDecks.map((deck, index) => {
                const artData = commanderArts[deck.name];
                
                return (
                  <div key={index} className="deck-card">
                    {artData && (
                      <div className="deck-card-bg">
                        {artData.type === 'single' ? (
                          <img src={artData.art} alt={deck.name} />
                        ) : (
                          <>
                            <img src={artData.art1} alt="Commander 1" className="bg-left" />
                            <img src={artData.art2} alt="Commander 2" className="bg-right" />
                          </>
                        )}
                        <div className="deck-card-overlay"></div>
                      </div>
                    )}
                    <div className="deck-card-content">
                      <div className="deck-card-name">{deck.name}</div>
                      <ColorMana colors={deck.colors} size="small" />
                      <div className="deck-card-category">{getCategoryLabel(deck.category)}</div>
                      <div className="deck-card-stat">{getCategoryStat(deck)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="stats-box">
            <h3 className="stats-box-title">Turn Order Win Rate</h3>
            <div className="turn-order-list">
              {turnOrderStats.map((stat, index) => (
                <div key={index} className="turn-order-item">
                  <div className="turn-order-left">
                    <div className="turn-order-label">Seat {stat.position}</div>
                    <div className="turn-order-record">{stat.wins}-{stat.games - stat.wins} in {stat.games} games</div>
                  </div>
                  <div className="turn-order-rate yellow">{stat.winRate.toFixed(1)}%</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="stats-box full-width">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 className="stats-box-title" style={{ margin: 0 }}>Color Identity Win Rates</h3>
            <button
              onClick={() => setSortColorsByWinRate(!sortColorsByWinRate)}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                background: sortColorsByWinRate ? '#3b82f6' : '#64748b',
                color: '#ffffff',
                transition: 'background 0.2s'
              }}
            >
              Sort by %
            </button>
          </div>
          <div className="color-identity-grid">
            <div className="color-identity-column">
              {col1.map((stat, index) => (
                <div key={index} className="color-identity-item">
                  <div className="ci-left">
                    <ColorMana colors={stat.colors} size="small" />
                    <span className="ci-label">{stat.label}</span>
                  </div>
                  <span className="ci-value">{stat.winRate.toFixed(1)}%</span>
                </div>
              ))}
            </div>
            <div className="color-identity-column">
              {col2.map((stat, index) => (
                <div key={index} className="color-identity-item">
                  <div className="ci-left">
                    <ColorMana colors={stat.colors} size="small" />
                    <span className="ci-label">{stat.label}</span>
                  </div>
                  <span className="ci-value">{stat.winRate.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="stats-box full-width">
          <h3 className="stats-box-title">
            <svg className="title-icon-svg" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
            </svg>
            Win Rate by Pod Composition
          </h3>
          <div className="pod-composition-list">
            {podCompositionStats.map((opp, index) => (
              <div key={index} className="pod-composition-item">
                <div className="pod-comp-left">
                  <div className="pod-comp-name">Featuring {opp.name}</div>
                  <div className="pod-comp-record">{opp.wins}-{opp.losses} in {opp.games} games together</div>
                </div>
                <div className="pod-comp-rate yellow">{opp.winRate.toFixed(1)}%</div>
              </div>
            ))}
          </div>
        </div>

        {/* Performance Stats Row - Cyan themed */}
        <div className="stats-row performance-row">
          <div className="stats-box performance-box cyan-border">
            <h3 className="stats-box-title">
              <svg className="title-icon-svg cyan-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
                <polyline points="17 6 23 6 23 12"></polyline>
              </svg>
              My Performance Playing
            </h3>
            <div className="stats-subtitle cyan-text">Win rate playing each color</div>
            <div className="color-performance-list">
              {performancePlayingColors.map((stat, index) => (
                <div key={index} className="color-performance-item">
                  <div className="color-perf-label">{stat.label}</div>
                  <div className="color-perf-rate yellow">{stat.winRate.toFixed(1)}%</div>
                </div>
              ))}
            </div>
          </div>

          <div className="stats-box performance-box cyan-border">
            <h3 className="stats-box-title">
              <svg className="title-icon-svg cyan-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <circle cx="12" cy="12" r="6"></circle>
                <circle cx="12" cy="12" r="2"></circle>
              </svg>
              My Performance Facing
            </h3>
            <div className="stats-subtitle cyan-text">Win rate facing each color</div>
            <div className="color-performance-list">
              {performanceFacingColors.map((stat, index) => (
                <div key={index} className="color-performance-item">
                  <div className="color-perf-label">{stat.label}</div>
                  <div className="color-perf-rate yellow">{stat.winRate.toFixed(1)}%</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Pod Matchup Stats Row - Green/Red themed */}
        <div className="stats-row matchup-row">
          <div className="stats-box matchup-box green-border">
            <h3 className="stats-box-title">
              <svg className="title-icon-svg green-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
                <path d="M4 22h16"></path>
                <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path>
                <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path>
                <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path>
              </svg>
              Favorable Pods
            </h3>
            <div className="stats-subtitle green-text">Best 2-opponent combinations</div>
            <div className="pod-matchup-list">
              {favorablePods.map((pod, index) => (
                <div 
                  key={index} 
                  className="pod-matchup-item"
                  onClick={() => navigate(`/pod-performance/${encodeURIComponent(pod.opponents[0])}/${encodeURIComponent(pod.opponents[1])}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="pod-matchup-left">
                    <div className="pod-matchup-names">{pod.opponents[0]} + {pod.opponents[1]}</div>
                    <div className="pod-matchup-record">{pod.wins}-{pod.losses} record ({pod.games} games)</div>
                  </div>
                  <div className="pod-matchup-rate green">{pod.winRate.toFixed(1)}%</div>
                </div>
              ))}
              {favorablePods.length === 0 && (
                <div className="no-data-message">Not enough data yet</div>
              )}
            </div>
          </div>

          <div className="stats-box matchup-box red-border">
            <h3 className="stats-box-title">
              <svg className="title-icon-svg red-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <circle cx="12" cy="12" r="6"></circle>
                <circle cx="12" cy="12" r="2"></circle>
              </svg>
              Unfavorable Pods
            </h3>
            <div className="stats-subtitle red-text">Worst 2-opponent combinations</div>
            <div className="pod-matchup-list">
              {unfavorablePods.map((pod, index) => (
                <div 
                  key={index} 
                  className="pod-matchup-item"
                  onClick={() => navigate(`/pod-performance/${encodeURIComponent(pod.opponents[0])}/${encodeURIComponent(pod.opponents[1])}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="pod-matchup-left">
                    <div className="pod-matchup-names">{pod.opponents[0]} + {pod.opponents[1]}</div>
                    <div className="pod-matchup-record">{pod.wins}-{pod.losses} record ({pod.games} games)</div>
                  </div>
                  <div className="pod-matchup-rate red">{pod.winRate.toFixed(1)}%</div>
                </div>
              ))}
              {unfavorablePods.length === 0 && (
                <div className="no-data-message">Not enough data yet</div>
              )}
            </div>
          </div>
        </div>

        {/* Advanced Metrics Section */}
        {advancedMetrics && (
          <div className="stats-box full-width advanced-metrics-section">
            <h3 className="stats-box-title">
              <svg className="title-icon-svg purple-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
              </svg>
              Advanced Metrics
            </h3>
            
            <div className="advanced-metrics-grid">
              {/* Bracket Breakdown */}
              <div className="advanced-metric-box">
                <h4 className="metric-title">Bracket Breakdown</h4>
                
                {/* Top Brackets */}
                <div className="bracket-top-list">
                  {advancedMetrics.bracketBreakdown.topBrackets.map((bracket, idx) => (
                    <div key={idx} className="bracket-item">
                      <span className="bracket-name">
                        {bracket.bracket === 'cEDH' ? 'cEDH' : `Bracket ${bracket.bracket}`}
                      </span>
                      <span className="bracket-games">{bracket.games} games</span>
                    </div>
                  ))}
                </div>

                {/* All Brackets Win% */}
                <div className="bracket-win-list">
                  {advancedMetrics.bracketBreakdown.allBracketsByNumber.map((bracket, idx) => (
                    <div key={idx} className="bracket-win-item">
                      <span className="bracket-label">
                        {bracket.bracket === 'cEDH' ? 'cEDH' : `B${bracket.bracket}`}
                      </span>
                      <span className={`bracket-winrate ${bracket.winRate > 25 ? 'high' : 'low'}`}>
                        {bracket.winRate.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>

                {/* Nickname */}
                <div className="bracket-nickname">
                  <div className="nickname-title">{advancedMetrics.bracketBreakdown.nickname}</div>
                  <div className="nickname-subtitle">{advancedMetrics.bracketBreakdown.subtitle}</div>
                </div>
              </div>

              {/* Game Length */}
              <div className="advanced-metric-box">
                <h4 className="metric-title">Game Length</h4>
                
                {/* Average Turns */}
                <div className="turn-averages">
                  {advancedMetrics.seatMetrics.avgWinTurn !== null && (
                    <div className="turn-stat">
                      <span className="turn-label-large">Your Wins</span>
                      <span className="turn-value-green">Turn {advancedMetrics.seatMetrics.avgWinTurn.toFixed(1)}</span>
                    </div>
                  )}
                  {advancedMetrics.seatMetrics.avgLossTurn !== null && (
                    <div className="turn-stat">
                      <span className="turn-label-large">Your Losses</span>
                      <span className="turn-value-red">Turn {advancedMetrics.seatMetrics.avgLossTurn.toFixed(1)}</span>
                    </div>
                  )}
                </div>

                {/* Bracket Average Turns */}
                {advancedMetrics.seatMetrics.bracketTurnAnalysis.length > 0 && (
                  <div className="bracket-turn-section">
                    {advancedMetrics.seatMetrics.bracketTurnAnalysis.map((b, idx) => (
                      <div key={idx} className="turn-stat">
                        <span className="turn-label-large">
                          {b.bracket === 'cEDH' ? 'cEDH' : `Bracket ${b.bracket}`}
                        </span>
                        <span className="turn-value">Turn {b.avgTurn.toFixed(1)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Fastest/Slowest Wins */}
                {advancedMetrics.seatMetrics.fastestWin && (
                  <>
                    <div className="win-record">
                      <span className="record-label">Fastest Win:</span>
                      <span className="turn-value-green">Turn {advancedMetrics.seatMetrics.fastestWin.turn}</span>
                      <div className="record-deck-line">
                        <span className="record-value">{getDisplayName(advancedMetrics.seatMetrics.fastestWin.deck)}</span>
                        <ColorMana colors={advancedMetrics.seatMetrics.fastestWin.colors} size="small" />
                      </div>
                    </div>
                    <div className="win-record">
                      <span className="record-label">Slowest Win:</span>
                      <span className="turn-value-red">Turn {advancedMetrics.seatMetrics.slowestWin.turn}</span>
                      <div className="record-deck-line">
                        <span className="record-value">{getDisplayName(advancedMetrics.seatMetrics.slowestWin.deck)}</span>
                        <ColorMana colors={advancedMetrics.seatMetrics.slowestWin.colors} size="small" />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Win Conditions Bar */}
            {advancedMetrics.winConditions && (
              <div className="win-conditions-bar">
                {advancedMetrics.winConditions.wins.length > 0 && (
                  <div className="win-conditions-line">
                    <span className="win-condition-label green">Win with: </span>
                    {advancedMetrics.winConditions.wins.map((wc, idx) => (
                      <span key={idx} className="win-condition-item">
                        <span className="win-condition-name">{wc.condition}</span>
                        {' '}
                        <span className="win-condition-percentage green">{wc.percentage.toFixed(1)}%</span>
                      </span>
                    ))}
                  </div>
                )}
                {advancedMetrics.winConditions.losses.length > 0 && (
                  <div className="win-conditions-line">
                    <span className="win-condition-label red">Lose to: </span>
                    {advancedMetrics.winConditions.losses.map((wc, idx) => (
                      <span key={idx} className="win-condition-item">
                        <span className="win-condition-name">{wc.condition}</span>
                        {' '}
                        <span className="win-condition-percentage red">{wc.percentage.toFixed(1)}%</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Deck History Section */}
        <div className="stats-box full-width deck-history-section">
          <h3 className="stats-box-title">
            <svg className="title-icon-svg parchment-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
            </svg>
            Deck History
          </h3>
          
          <div className="deck-history-columns">
            {/* Column Headers */}
            <div className="deck-history-column-header">
              <div className="deck-history-header green-text">Wins</div>
              <div className="deck-history-subtitle">Ranked by performance (weighted by games played)</div>
            </div>
            
            <div className="deck-history-column-header">
              <div className="deck-history-header red-text">Losses</div>
              <div className="deck-history-subtitle">Decks you've lost to most often</div>
            </div>
          </div>
          
          {/* Paired rows for height alignment */}
          {playerDeckHistory.length === 0 && opponentDeckLosses.length === 0 ? (
            <div className="no-data-message">No deck data yet</div>
          ) : (
            <div className="deck-history-rows">
              {Array.from({ length: Math.max(playerDeckHistory.length, opponentDeckLosses.length) }).map((_, index) => {
                const winDeck = playerDeckHistory[index];
                const lossDeck = opponentDeckLosses[index];
                
                return (
                  <div key={index} className="deck-history-row">
                    {/* Wins side */}
                    <div className="deck-history-cell">
                      {winDeck ? (
                        <button
                          className="deck-history-item green-border-thin"
                          onClick={() => navigate(`/my-deck/${encodeURIComponent(winDeck.name)}`)}
                        >
                          <div className="deck-history-left">
                            <div className="deck-history-name">{getDisplayName(winDeck.name)}</div>
                            <ColorMana colors={winDeck.colors} size="small" />
                            <div className="deck-history-record">{winDeck.wins}-{winDeck.losses} record</div>
                          </div>
                          <div className="deck-history-stat green">{winDeck.winRate.toFixed(1)}%</div>
                        </button>
                      ) : (
                        <div className="deck-history-empty"></div>
                      )}
                    </div>
                    
                    {/* Losses side */}
                    <div className="deck-history-cell">
                      {lossDeck ? (
                        <button
                          className="deck-history-item red-border-thin"
                          onClick={() => navigate(`/opponent-deck/${encodeURIComponent(lossDeck.pilot)}/${encodeURIComponent(lossDeck.deckName)}`)}
                        >
                          <div className="deck-history-left">
                            <div className="deck-history-name">{getDisplayName(lossDeck.deckName)}</div>
                            <ColorMana colors={lossDeck.colors} size="small" />
                            <div className="deck-history-record">Piloted by {lossDeck.pilot}</div>
                          </div>
                          <div className="deck-history-stat red">{lossDeck.losses} losses</div>
                        </button>
                      ) : (
                        <div className="deck-history-empty"></div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MyStatsPage;
