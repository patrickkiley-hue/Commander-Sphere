import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSheetData } from '../context/SheetDataContext';
import { loadPlaygroupData, checkAndRollSeason } from '../utils/firestoreHelpers';
import ColorMana from '../components/ColorMana';
import './BlankPage.css';
import './PodStatsPage.css';

function PodStatsPage({ currentPlaygroup }) {
  const navigate = useNavigate();
  const { games, isLoading } = useSheetData();
  
  // Initialize from sessionStorage, default to true (season) if not set
  const [showSeasonStats, setShowSeasonStats] = useState(() => {
    const saved = sessionStorage.getItem('statsViewMode');
    return saved ? saved === 'season' : true;
  });
  
  const [seasonData, setSeasonData] = useState(null);

  // Load season data from Firestore
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

  // Filter games based on season toggle
  const getFilteredGames = () => {
    if (!seasonData?.enabled || !showSeasonStats) {
      return games; // All-time stats
    }

    // Simple calendar-based filtering
    if (seasonData.startDate) {
      return games.filter(g => g.date >= seasonData.startDate);
    }
    
    return games;
  };

  const filteredGames = getFilteredGames();

  // Calculate player stats
  const getPlayerStats = () => {
    const stats = {};
    
    filteredGames.forEach(game => {
      if (!stats[game.player]) {
        stats[game.player] = { games: 0, wins: 0 };
      }
      stats[game.player].games++;
      if (game.isWin) stats[game.player].wins++;
    });
    
    return Object.entries(stats)
      .map(([name, data]) => ({
        name,
        games: data.games,
        wins: data.wins,
        winRate: data.games > 0 ? (data.wins / data.games) * 100 : 0
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  // Calculate turn order win rates
  const getTurnOrderStats = () => {
    const stats = {};
    
    filteredGames.forEach(game => {
      const pos = game.turnOrder;
      if (!pos) return;
      
      if (!stats[pos]) {
        stats[pos] = { games: 0, wins: 0 };
      }
      stats[pos].games++;
      if (game.isWin) stats[pos].wins++;
    });
    
    const results = Object.entries(stats)
      .map(([pos, data]) => ({
        position: parseInt(pos),
        games: data.games,
        winRate: data.games > 0 ? (data.wins / data.games) * 100 : 0
      }))
      .sort((a, b) => a.position - b.position);
    
    // Color code by rank (only seats 1-4, seat 5 is always gray)
    const seats1to4 = results.filter(r => r.position <= 4);
    const sorted = [...seats1to4].sort((a, b) => b.winRate - a.winRate);
    
    results.forEach(r => {
      if (r.position === 5) {
        r.colorClass = 'gray'; // Seat 5 always gray
      } else {
        const rank = sorted.findIndex(s => s.position === r.position);
        // Blue, green, yellow, purple (no red for 4-way)
        r.colorClass = ['blue', 'green', 'yellow', 'purple'][rank] || 'gray';
      }
    });
    
    return results;
  };

  // Calculate color inclusion win rates (W+, U+, B+, R+, G+)
  const getColorInclusionStats = () => {
    const colorMap = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };
    const stats = {};
    
    Object.keys(colorMap).forEach(color => {
      stats[color] = { games: 0, wins: 0 };
    });
    
    filteredGames.forEach(game => {
      const colors = game.colorId || [];
      colors.forEach(color => {
        if (stats[color]) {
          stats[color].games++;
          if (game.isWin) stats[color].wins++;
        }
      });
    });
    
    const results = Object.entries(stats)
      .map(([color, data]) => ({
        color,
        label: colorMap[color] + '+',
        games: data.games,
        winRate: data.games > 0 ? (data.wins / data.games) * 100 : 0
      }))
      .filter(r => r.games > 0) // Only show colors that have been played
      .sort((a, b) => b.winRate - a.winRate);
    
    // Color code by rank: blue, green, yellow, purple, red
    results.forEach((r, index) => {
      r.colorClass = ['blue', 'green', 'yellow', 'purple', 'red'][index] || 'gray';
    });
    
    return results;
  };

  // Calculate color identity win rates
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
    
    identities.forEach(id => {
      const key = id.colors.sort().join('');
      stats[key] = { colors: id.colors, label: id.label, games: 0, wins: 0 };
    });
    
    filteredGames.forEach(game => {
      // Get color identity from game, handling both array and string formats
      let gameColors = game.colorId || [];
      
      // Normalize colorId to array if it's not already
      if (typeof gameColors === 'string') {
        gameColors = gameColors.split('');
      }
      
      // Handle empty array or no colors as colorless
      if (gameColors.length === 0) {
        gameColors = ['C'];
      }
      
      const key = [...gameColors].sort().join('');
      if (stats[key]) {
        stats[key].games++;
        if (game.isWin) stats[key].wins++;
      }
    });
    
    return identities.map(id => {
      const key = id.colors.sort().join('');
      const data = stats[key];
      return {
        colors: id.colors,
        label: id.label,
        games: data.games,
        winRate: data.games > 0 ? (data.wins / data.games) * 100 : null
      };
    });
  };

  const players = getPlayerStats();
  const turnOrderStats = getTurnOrderStats();
  const colorInclusionStats = getColorInclusionStats();
  const colorIdentityStats = getColorIdentityStats();

  // Split color identity into two columns (Bant starts column 2)
  const bantIndex = colorIdentityStats.findIndex(ci => ci.label === 'Bant');
  const col1 = colorIdentityStats.slice(0, bantIndex);
  const col2 = colorIdentityStats.slice(bantIndex);

  return (
    <div className="blank-page">
      <button className="back-button" onClick={() => navigate('/')}>
        ← Back to Home
      </button>
      
      <div className="page-content">
        <div className="pod-stats-header">
          <h1 className="pod-stats-title">Pod Stats</h1>
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

        {isLoading ? (
          <p className="loading-message">Loading...</p>
        ) : (
          <>
            {/* Players List */}
            <div className="players-grid">
              {players.map((player, index) => (
                <button
                  key={index}
                  className="player-stat-button"
                  onClick={() => navigate(`/player/${encodeURIComponent(player.name)}`)}
                >
                  <span className="player-stat-name">{player.name}</span>
                  <div className="player-stat-numbers">
                    <span className="stat-games">{player.games} games</span>
                    <span className="stat-winrate">{player.winRate.toFixed(1)}%</span>
                  </div>
                </button>
              ))}
            </div>

            {/* Full Game History Button */}
            <button 
              className="full-history-button"
              onClick={() => navigate('/pod-history')}
              style={{
                width: '100%',
                margin: '24px 0',
                padding: '16px 32px',
                fontSize: '18px',
                fontWeight: 700,
                color: '#ffffff',
                background: 'linear-gradient(135deg, #3E2723 0%, #5D4037 40%, #8D6E63 70%, #f5e6d3 100%)',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                transition: 'transform 0.2s, box-shadow 0.2s',
                textShadow: '0 2px 4px rgba(0, 0, 0, 0.5)',
                display: 'block'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
              }}
            >
              Full Game History
            </button>

            {/* Turn Order and Color Inclusion Side by Side */}
            <div className="stats-row">
              <div className="stats-box">
                <h3 className="stats-box-title">Turn Order Win Rates</h3>
                <div className="stat-list">
                  {turnOrderStats.map((stat, index) => (
                    <div key={index} className="stat-item">
                      <span className="stat-label">Seat {stat.position}</span>
                      <span className={`stat-value ${stat.colorClass}`}>
                        {stat.winRate.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="stats-box">
                <h3 className="stats-box-title">Color Inclusion Win Rates</h3>
                <div className="stat-list">
                  {colorInclusionStats.map((stat, index) => (
                    <div key={index} className="stat-item">
                      <span className="stat-label">{stat.label}</span>
                      <span className={`stat-value ${stat.colorClass}`}>
                        {stat.winRate.toFixed(1)}%
                      </span>
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
                      <span className="ci-value">
                        {stat.winRate !== null ? `${stat.winRate.toFixed(1)}%` : '-'}
                      </span>
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
                      <span className="ci-value">
                        {stat.winRate !== null ? `${stat.winRate.toFixed(1)}%` : '-'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default PodStatsPage;
