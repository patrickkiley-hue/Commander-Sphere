import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSheetData } from '../context/SheetDataContext';
import './BlankPage.css';
import './PodHistoryPage.css';

function PodHistoryPage({ currentPlaygroup }) {
  const navigate = useNavigate();
  const { games, isLoading } = useSheetData();

  // Group games by session (prefix-letter, e.g., "001-A", "001-B")
  const getSessionData = () => {
    const sessions = {};
    
    games.forEach(game => {
      if (!game.gameId) return;
      
      // Extract session ID (e.g., "001-A01" -> "001-A")
      const parts = game.gameId.split('-');
      if (parts.length !== 2) return;
      
      const sessionId = `${parts[0]}-${parts[1].charAt(0)}`; // e.g., "001-A"
      
      // Normalize date to YYYY-MM-DD format
      const normalizedDate = new Date(game.date).toISOString().split('T')[0];
      
      if (!sessions[sessionId]) {
        sessions[sessionId] = {
          sessionId,
          games: [],
          dates: new Set(),
          players: new Set(),
          commanders: new Set()
        };
      }
      
      sessions[sessionId].games.push(game);
      sessions[sessionId].dates.add(normalizedDate);
      sessions[sessionId].players.add(game.player);
      sessions[sessionId].commanders.add(game.commander);
    });
    
    // Convert to array and sort by date (most recent first)
    return Object.values(sessions)
      .map(session => ({
        ...session,
        dates: Array.from(session.dates).sort(),
        minDate: Math.min(...Array.from(session.dates).map(d => new Date(d).getTime())),
        uniqueGameIds: new Set(session.games.map(g => g.gameId)).size,
        uniquePlayers: session.players.size,
        uniqueCommanders: session.commanders.size
      }))
      .sort((a, b) => b.minDate - a.minDate);
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const year = date.getFullYear().toString().slice(-2);
    return `${month}/${day}/${year}`;
  };

  const sessions = getSessionData();

  return (
    <div className="blank-page">
      <button className="back-button" onClick={() => navigate('/pod-stats')}>
        ← Back to Pod Stats
      </button>
      
      <div className="page-content">
        <h1 className="history-page-title">Full Game History</h1>

        {isLoading ? (
          <p className="loading-message">Loading...</p>
        ) : sessions.length === 0 ? (
          <p className="empty-message">No game sessions found</p>
        ) : (
          <div className="sessions-grid">
            {sessions.map((session, index) => {
              const dateRange = session.dates.length === 1
                ? formatDate(session.dates[0])
                : `${formatDate(session.dates[0])} - ${formatDate(session.dates[session.dates.length - 1])}`;
              
              return (
                <button
                  key={index}
                  className="session-box"
                  onClick={() => navigate(`/game-night-report/${encodeURIComponent(session.sessionId)}`)}
                >
                  <div className="session-date">{dateRange}</div>
                  <div className="session-stats">
                    <div className="session-stat">
                      <span className="stat-number">{session.uniquePlayers}</span>
                      <span className="stat-label">Players</span>
                    </div>
                    <div className="session-stat">
                      <span className="stat-number">{session.uniqueGameIds}</span>
                      <span className="stat-label">Games</span>
                    </div>
                    <div className="session-stat">
                      <span className="stat-number">{session.uniqueCommanders}</span>
                      <span className="stat-label">Decks</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default PodHistoryPage;
