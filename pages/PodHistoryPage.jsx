import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSheetData } from '../context/GameDataContext';
import { filterValidGames } from '../utils/statsCalculations';
import './BlankPage.css';
import './PodHistoryPage.css';

function PodHistoryPage({ currentPlaygroup }) {
  const navigate = useNavigate();
  const { rawDocs: games, isLoading } = useSheetData();

  // Group game documents by session (prefix-letter, e.g., "001-A", "001-B")
  const getSessionData = () => {
    const sessions = {};

    // Only count completed games (have a winner)
    filterValidGames(games).forEach(game => {
      if (!game.gameId) return;

      const parts = game.gameId.split('-');
      if (parts.length !== 2) return;

      const sessionId = `${parts[0]}-${parts[1].charAt(0)}`; // e.g., "001-A"

      // Use dateString (MM/DD/YYYY) to avoid timezone shift issues
      const dateStr = game.dateString || '';

      if (!sessions[sessionId]) {
        sessions[sessionId] = {
          sessionId,
          gameCount: 0,
          dates: new Set(),
          players: new Set(),
          commanders: new Set()
        };
      }

      sessions[sessionId].gameCount++;
      if (dateStr) sessions[sessionId].dates.add(dateStr);

      // Players and commanders come from game.players array
      (game.players || []).forEach(p => {
        if (p.player) sessions[sessionId].players.add(p.player);
        if (p.commander) sessions[sessionId].commanders.add(p.commander);
      });
    });

    // Parse MM/DD/YYYY for sorting
    const parseDate = (str) => {
      const [m, d, y] = str.split('/').map(Number);
      return new Date(y, m - 1, d).getTime();
    };

    return Object.values(sessions)
      .map(session => ({
        ...session,
        dates: Array.from(session.dates).sort((a, b) => parseDate(a) - parseDate(b)),
        minDate: Math.min(...Array.from(session.dates).map(parseDate)),
        uniqueGameIds: session.gameCount,
        uniquePlayers: session.players.size,
        uniqueCommanders: session.commanders.size
      }))
      .sort((a, b) => b.minDate - a.minDate);
  };

  const formatDate = (dateStr) => {
    // dateStr is already MM/DD/YYYY — just trim the year to 2 digits
    const parts = dateStr.split('/');
    if (parts.length !== 3) return dateStr;
    return `${parts[0]}/${parts[1]}/${parts[2].slice(-2)}`;
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
