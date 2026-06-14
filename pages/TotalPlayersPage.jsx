import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSheetData } from '../context/GameDataContext';
import { getLastSession } from '../utils/statsCalculations';
import './BlankPage.css';
import './TotalPlayersPage.css';

function TotalPlayersPage() {
  const navigate = useNavigate();
  const { rawDocs: games, isLoading } = useSheetData();
  
  const lastSessionGames = getLastSession(games);
  
  // Calculate player stats
  const playerStats = {};
  lastSessionGames.forEach(game => {
    game.players.forEach(p => {
      if (!p.player) return;
      if (!playerStats[p.player]) {
        playerStats[p.player] = {
          name: p.player,
          games: 0,
          wins: 0,
          decks: new Set()
        };
      }
      playerStats[p.player].games++;
      if (p.isWin) playerStats[p.player].wins++;
      if (p.commander) playerStats[p.player].decks.add(p.commander);
    });
  });
  
  // Convert to array and sort: by games (desc), then alphabetically
  const players = Object.values(playerStats)
    .map(p => ({ ...p, deckCount: p.decks.size }))
    .sort((a, b) => {
      if (b.games !== a.games) return b.games - a.games;
      return a.name.localeCompare(b.name);
    });

  return (
    <div className="blank-page">
      <button className="back-button" onClick={() => navigate('/')}>
        ← Back to Home
      </button>
      
      <div className="page-content">
        <h1 className="players-page-title">Players This Week</h1>

        {isLoading ? (
          <p className="loading-message">Loading...</p>
        ) : players.length === 0 ? (
          <p className="empty-message">No players yet</p>
        ) : (
          <div className="players-list">
            {players.map((player, index) => (
              <div key={index} className="player-card">
                <div className="player-name">{player.name}</div>
                <div className="player-stats">
                  <span className="stat-games">{player.games} games</span>
                  <span className="stat-decks">{player.deckCount} decks</span>
                  <span className="stat-wins">{player.wins} wins</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default TotalPlayersPage;
