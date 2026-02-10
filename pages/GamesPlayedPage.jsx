import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSheetData } from '../context/SheetDataContext';
import { getLastSession, getGameSessions } from '../utils/statsCalculations';
import { getDisplayName } from '../utils/deckNameUtils';
import { loadPlaygroupData } from '../utils/firestoreHelpers';
import ColorMana from '../components/ColorMana';
import './BlankPage.css';
import './GamesPlayedPage.css';

function GamesPlayedPage({ currentPlaygroup }) {
  const navigate = useNavigate();
  const { games, isLoading } = useSheetData();
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
  
  const lastSessionGames = getLastSession(games);
  const gameSessions = getGameSessions(lastSessionGames);

  return (
    <div className="blank-page">
      <button className="back-button" onClick={() => navigate('/')}>
        ← Back to Home
      </button>
      
      <div className="page-content">
        <h1 className="games-page-title">Games This Week</h1>

        {isLoading ? (
          <p className="loading-message">Loading...</p>
        ) : gameSessions.length === 0 ? (
          <p className="empty-message">No games played yet</p>
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

export default GamesPlayedPage;
