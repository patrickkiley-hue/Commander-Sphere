import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSheetData } from '../context/SheetDataContext';
import { loadPlaygroupData, checkAndRollSeason } from '../utils/firestoreHelpers';
import { getDisplayName } from '../utils/deckNameUtils';
import scryfallService from '../services/scryfallService';
import ColorMana from '../components/ColorMana';
import './BlankPage.css';
import './PlayerStatsPage.css';

function PlayerStatsPage({ currentPlaygroup }) {
  const navigate = useNavigate();
  const { playerName } = useParams();
  const decodedPlayerName = decodeURIComponent(playerName);
  const { games, isLoading } = useSheetData();
  
  // Initialize from sessionStorage, default to true (season) if not set
  const [showSeasonStats, setShowSeasonStats] = useState(() => {
    const saved = sessionStorage.getItem('statsViewMode');
    return saved ? saved === 'season' : true;
  });
  
  const [seasonData, setSeasonData] = useState(null);
  const [commanderArts, setCommanderArts] = useState({});

  // Load season data
  useEffect(() => {
    const loadSeasonData = async () => {
      if (!currentPlaygroup?.spreadsheetId) return;
      
      try {
        const pgData = await loadPlaygroupData(currentPlaygroup.spreadsheetId);
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
  const playerGames = filteredGames.filter(g => g.player === decodedPlayerName);

  // Calculate header stats
  const totalGames = playerGames.length;
  const totalWins = playerGames.filter(g => g.isWin).length;
  const winRate = totalGames > 0 ? (totalWins / totalGames) * 100 : 0;

  // Get standout decks
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
      
      // Track unique sessions (001-A, 001-B, etc.) - first 5 characters of game ID
      const session = game.gameId?.substring(0, 5); // "001-A", "001-B", etc.
      if (session) deckStats[deck].sessions.add(session);
    });

    // Get last 3 sessions for recent activity tracking
    const allSessions = [...new Set(playerGames.map(g => g.gameId?.substring(0, 5)).filter(Boolean))].sort().reverse();
    const last3Sessions = allSessions.slice(0, 3);
    
    // Count recent session appearances
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

    // 1. ALL-STAR (Best Performing) - must have wins
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
        if (b.games !== a.games) return b.games - a.games; // Prefer more games if tied
        return b.firstGameId.localeCompare(a.firstGameId);
      })[0];
    }

    // Exclude All-Star from remaining categories
    const remainingDecks = decks.filter(d => d.name !== standouts.allStar?.name);

    // 2. FAVORITE (most played) and WORKHORSE (most sessions)
    const favoriteCandidate = [...remainingDecks].sort((a, b) => {
      if (b.games !== a.games) return b.games - a.games;
      return b.firstGameId.localeCompare(a.firstGameId);
    })[0];

    const workhorseCandidate = [...remainingDecks].sort((a, b) => {
      if (b.sessionCount !== a.sessionCount) return b.sessionCount - a.sessionCount;
      return b.firstGameId.localeCompare(a.firstGameId);
    })[0];

    // Check if they're the same deck (and both exist)
    if (favoriteCandidate && workhorseCandidate && favoriteCandidate.name === workhorseCandidate.name) {
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
      
      // Compare recent activity: more recent = Favorite, less recent = Workhorse
      const avgRecentSessions = remainingDecks.length > 0 
        ? remainingDecks.reduce((sum, d) => sum + d.recentSessionCount, 0) / remainingDecks.length 
        : 0;
      
      if (deck.recentSessionCount >= avgRecentSessions) {
        // More recent activity = current Favorite
        standouts.favorite = deck;
        standouts.workhorse = secondMostSessions;
      } else {
        // Less recent = reliable Workhorse
        standouts.workhorse = deck;
        standouts.favorite = secondMostPlayed;
      }
    } else {
      // Different decks - no conflict
      standouts.favorite = favoriteCandidate;
      standouts.workhorse = workhorseCandidate;
    }

    // 3. NEWBIE (newest deck) - exclude if it's the All-Star
    const newbieCandidate = [...remainingDecks].sort((a, b) => {
      if (a.firstDate && b.firstDate && a.firstDate.getTime() !== b.firstDate.getTime()) {
        return b.firstDate - a.firstDate;
      }
      return b.firstGameId.localeCompare(a.firstGameId);
    })[0];
    
    standouts.newbie = newbieCandidate;

    // Build final list
    const result = [];
    if (standouts.allStar) result.push({ ...standouts.allStar, category: 'allStar' });
    if (standouts.favorite) result.push({ ...standouts.favorite, category: 'favorite' });
    if (standouts.workhorse) result.push({ ...standouts.workhorse, category: 'workhorse' });
    if (standouts.newbie) result.push({ ...standouts.newbie, category: 'newbie' });

    return result;
  };

  // Calculate turn order stats
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

  // Calculate color identity stats (only played identities)
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
      .filter(id => id.games > 0); // Only show played identities
  };

  // Calculate pod composition stats
  const getPodCompositionStats = () => {
    const opponentStats = {};
    
    // Get all unique game IDs the player participated in
    const playerGameIds = new Set(playerGames.map(g => g.gameId));
    
    // Find all opponents in those games
    filteredGames.forEach(game => {
      if (playerGameIds.has(game.gameId) && game.player !== decodedPlayerName) {
        if (!opponentStats[game.player]) {
          opponentStats[game.player] = {
            name: game.player,
            games: new Set(),
            playerWins: 0,
            opponentWins: 0
          };
        }
        
        opponentStats[game.player].games.add(game.gameId);
        
        // Check if player won this game
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

  const standoutDecks = getStandoutDecks();
  const turnOrderStats = getTurnOrderStats();
  const colorIdentityStats = getColorIdentityStats();
  const podCompositionStats = getPodCompositionStats();

  // Split color identities into two columns
  const midpoint = Math.ceil(colorIdentityStats.length / 2);
  const col1 = colorIdentityStats.slice(0, midpoint);
  const col2 = colorIdentityStats.slice(midpoint);

  // Fetch commander art for standout decks
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

  return (
    <div className="blank-page">
      <button className="back-button" onClick={() => navigate(-1)}>
        ← Back
      </button>
      
      <div className="page-content">
        {/* Unified Header with player name and stats */}
        <div className="player-stats-header-unified">
          <div className="header-top">
            <h1 className="player-name-header">{decodedPlayerName}</h1>
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

        {isLoading ? (
          <p className="loading-message">Loading...</p>
        ) : (
          <>
            {/* Deck History and Turn Order */}
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
                          <div className="deck-card-name">{getDisplayName(deck.name)}</div>
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

            {/* Color Identity Win Rates */}
            <div className="stats-box full-width">
              <h3 className="stats-box-title">Color Identity Win Rates</h3>
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

            {/* Pod Composition */}
            <div className="stats-box full-width">
              <h3 className="stats-box-title">
                <svg className="title-icon-svg" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
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
          </>
        )}
      </div>
    </div>
  );
}

export default PlayerStatsPage;
