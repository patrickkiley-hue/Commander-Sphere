import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSheetData } from '../context/GameDataContext';
import { getGameSessions } from '../utils/statsCalculations';
import { getDisplayName } from '../utils/deckNameUtils';
import { loadPlaygroupData } from '../utils/firestoreHelpers';
import ColorMana from '../components/ColorMana';
import './BlankPage.css';
import './GamesPlayedPage.css';

function GameNightReportPage({ currentPlaygroup }) {
  const navigate = useNavigate();
  const { sessionId } = useParams(); // e.g., "001-A"
  const { rawDocs: games, isLoading } = useSheetData();
  const [advancedStatsEnabled, setAdvancedStatsEnabled] = useState(false);
  
  // Load advanced stats setting
  useEffect(() => {
    const loadSettings = async () => {
      if (!currentPlaygroup?.spreadsheetId) return;
      
      try {
        const pgData = await loadPlaygroupData(currentPlaygroup.spreadsheetId);
        setAdvancedStatsEnabled(pgData?.advancedStatsEnabled || false);
      } catch (error) {
        console.error('Error loading advanced stats setting:', error);
      }
    };
    
    loadSettings();
  }, [currentPlaygroup]);
  
  // Filter games to only this session
  const sessionGames = games.filter(game => {
    if (!game.gameId) return false;
    const parts = game.gameId.split('-');
    if (parts.length !== 2) return false;
    const gameSessionId = `${parts[0]}-${parts[1].charAt(0)}`;
    return gameSessionId === sessionId;
  });
  
  const gameSessions = getGameSessions(sessionGames);
  
  // Format MM/DD/YYYY to M/D/YY
  const formatDate = (dateStr) => {
    const parts = dateStr.split('/');
    if (parts.length !== 3) return dateStr;
    return `${parseInt(parts[0])}/${parseInt(parts[1])}/${parts[2].slice(-2)}`;
  };

  // Use dateString directly to avoid timezone shift issues
  const parseDate = (str) => {
    const [m, d, y] = str.split('/').map(Number);
    return new Date(y, m - 1, d).getTime();
  };

  const sessionDates = [...new Set(sessionGames.map(g => g.dateString).filter(Boolean))]
    .sort((a, b) => parseDate(a) - parseDate(b));

  const dateRange = sessionDates.length === 1
    ? formatDate(sessionDates[0])
    : `${formatDate(sessionDates[0])} - ${formatDate(sessionDates[sessionDates.length - 1])}`;

  return (
    <div className="blank-page">
      <button className="back-button" onClick={() => navigate('/pod-history')}>
        ← Back to History
      </button>
      
      <div className="page-content">
        <h1 className="games-page-title">Game Night Report - {dateRange}</h1>

        {isLoading ? (
          <p className="loading-message">Loading...</p>
        ) : gameSessions.length === 0 ? (
          <p className="empty-message">No games found for this session</p>
        ) : (
          <div className="games-grid">
            {gameSessions
              .map((session, index) => {
                // Extract game number from ID (e.g., "001-J01" → "1")
                const gameNumber = parseInt(session.gameId.split('-').pop().replace(/[A-Z]/g, '').replace(/^0+/, '') || '1');
                return { ...session, gameNumber };
              })
              .sort((a, b) => a.gameNumber - b.gameNumber)
              .map((session, index) => {
              
              return (
                <div key={index} className="game-box">
                  <div className="game-id-header">Game {session.gameNumber}</div>
                  
                  <div className="players-list">
                    {session.players
                      .sort((a, b) => (a.turnOrder || 999) - (b.turnOrder || 999))
                      .map((player, pIndex) => (
                        <div key={pIndex} className="player-row">
                          <div className="player-left">
                            <div className="player-name-line">
                              <div className="seat-badge">{player.turnOrder || '?'}</div>
                              <span className="player-name">{player.player}</span>
                              {player.isWin && <span className="winner-star">⭐</span>}
                            </div>
                            <div className="commander-line">
                              {advancedStatsEnabled && player.bracket && (
                                <span className="bracket-badge">
                                  {player.bracket === 'cEDH' ? 'cEDH' : `B${player.bracket}`} -
                                </span>
                              )}
                              <span className="commander-name">{getDisplayName(player.commander)}</span>
                              <ColorMana colors={player.colorId} size="small" />
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default GameNightReportPage;
