import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { useSheetData } from '../context/SheetDataContext';
import {
  getPlayers,
  getTopPlayers,
  getMostPlayedCommanders,
  getFeaturedDecks,
  getLastSession,
  getWeeklyStats,
  countUniqueGames,
  countUniqueCommanders,
} from '../utils/statsCalculations';
import { loadPlaygroupsFromFirestore, loadPlaygroupData } from '../utils/firestoreHelpers';
import firebaseAuthService from '../services/firebaseAuth';
import { getDisplayName } from '../utils/deckNameUtils';
import ColorMana from '../components/ColorMana';
import SwitchPlaygroupModal from '../components/SwitchPlaygroupModal';
import JoinHostModal from '../components/JoinHostModal';
import './HomePage.css';

function HomePage({ currentPlaygroup, setCurrentPlaygroup, joinedPlaygroups, setJoinedPlaygroups, currentUser }) {
  const navigate = useNavigate();
  const [showSwitchModal, setShowSwitchModal] = useState(false);
  const [showJoinHostModal, setShowJoinHostModal] = useState(false);
  const [unmappedCount, setUnmappedCount] = useState(0);
  const [hasAttemptedRefresh, setHasAttemptedRefresh] = useState(false);
  
  // Get sheet data from Context
  const { games, isLoading, error, refreshSession } = useSheetData();
  
  // Automatically refresh session when error is detected
  useEffect(() => {
    if (error && !hasAttemptedRefresh && !isLoading) {
      setHasAttemptedRefresh(true);
      refreshSession();
    }
  }, [error, hasAttemptedRefresh, isLoading, refreshSession]);
  
  // Check for unmapped users if admin
  useEffect(() => {
    const checkUnmappedUsers = async () => {
      const user = auth.currentUser;
      if (!user || !currentPlaygroup?.spreadsheetId) {
        setUnmappedCount(0);
        return;
      }

      try {
        const pgData = await loadPlaygroupData(currentPlaygroup.spreadsheetId);
        
        // Only show notification if user is admin
        if (!pgData || pgData.adminUserId !== user.uid) {
          setUnmappedCount(0);
          return;
        }

        // Count members without player mappings
        const unmapped = (pgData.members || []).filter(
          memberId => !pgData.playerMappings?.[memberId]
        );
        
        setUnmappedCount(unmapped.length);
      } catch (err) {
        console.error('Error checking unmapped users:', err);
        setUnmappedCount(0);
      }
    };

    checkUnmappedUsers();
  }, [currentPlaygroup]);
  
  // Show loading state while refreshing session
  if (error) {
    return (
      <div className="home-page">
        <header className="header">
          <div className="header-left">
            <h1 className="app-title">Commander's Sphere Pod Tracker</h1>
          </div>
        </header>
        <div className="playgroup-name">{currentPlaygroup?.name || 'Loading...'}</div>
        <div style={{ 
          padding: '40px', 
          textAlign: 'center', 
          color: '#94a3b8' 
        }}>
          <p>Refreshing session...</p>
        </div>
      </div>
    );
  }
  
  // Calculate stats from real data
  const totalGames = games.length;
  const players = getPlayers(games);
  const totalPlayers = players.length;
  
  // Get last session games (most recent date + consecutive prior date if applicable)
  const lastSessionGames = getLastSession(games);
  
  // DEBUG: Log to see what we're working with
  console.log('Last session games:', lastSessionGames.length);
  console.log('Sample game objects:', lastSessionGames.slice(0, 3));
  console.log('Unique gameIds:', [...new Set(lastSessionGames.map(g => g.gameId))]);
  console.log('Unique commanders:', [...new Set(lastSessionGames.map(g => g.commander))]);
  
  const gamesLastSession = countUniqueGames(lastSessionGames);  // Count unique gameIds
  const uniqueCommandersCount = countUniqueCommanders(lastSessionGames);  // Count unique commanders
  
  console.log('Games count:', gamesLastSession);
  console.log('Commanders count:', uniqueCommandersCount);
  
  // Get top performers from last session (min 1 game)
  const topPerformers = getTopPlayers(lastSessionGames, 1).slice(0, 3);
  
  // Get featured decks of the week (3 boxes)
  const featuredDecks = getFeaturedDecks(games, lastSessionGames);
  
  // Get players who participated in last session
  const lastSessionPlayers = getPlayers(lastSessionGames);
  
  // Get weekly game distribution
  const weeklyStats = getWeeklyStats(games);

  const handlePlaygroupCreated = async (playgroupInfo) => {
    setCurrentPlaygroup(playgroupInfo);
    
    // Reload playgroups from Firestore to get the updated list
    if (currentUser) {
      try {
        const playgroupData = await loadPlaygroupsFromFirestore(currentUser.uid);
        setJoinedPlaygroups(playgroupData.joinedPlaygroups);
      } catch (error) {
        console.error('Error reloading playgroups:', error);
        // Fall back to localStorage
        setJoinedPlaygroups(JSON.parse(localStorage.getItem('joinedPlaygroups') || '[]'));
      }
    }
    
    setShowJoinHostModal(false);
    // Don't reload - the SheetDataContext will automatically fetch new data when currentPlaygroup changes
  };

  return (
    <div className="home-page">
      <header className="header">
        <div className="header-left">
          <h1 className="app-title">
            Commander's Sphere<br className="mobile-break" />
            Pod Tracker
          </h1>
        </div>
        <div className="header-buttons">
          <button 
            className="settings-button"
            onClick={() => navigate('/administrator')}
            style={{ position: 'relative' }}
          >
            Settings
            {unmappedCount > 0 && (
              <span style={{
                position: 'absolute',
                top: '-8px',
                right: '-8px',
                background: '#ef4444',
                color: '#ffffff',
                borderRadius: '50%',
                width: '20px',
                height: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                fontWeight: 700,
                border: '2px solid #0f172a'
              }}>
                {unmappedCount}
              </span>
            )}
          </button>
          <button 
            className="switch-playgroup-button"
            onClick={() => setShowSwitchModal(true)}
          >
            Switch Playgroup
          </button>
        </div>
      </header>

      {currentPlaygroup ? (
        <div className="playgroup-name">{currentPlaygroup.name}</div>
      ) : (
        <button 
          className="join-host-button"
          onClick={() => setShowJoinHostModal(true)}
        >
          Join / Host Playgroup
        </button>
      )}

      <div className="action-buttons">
        <button 
          className="stat-button"
          onClick={() => navigate('/my-stats')}
        >
          <svg className="stat-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
          <div className="stat-button-content">
            <div className="stat-button-title">My Stats</div>
            <div className="stat-button-subtitle">View your personal performance</div>
          </div>
        </button>

        <button 
          className="stat-button"
          onClick={() => navigate('/pod-stats')}
        >
          <svg className="stat-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"></circle>
            <circle cx="12" cy="12" r="6"></circle>
            <circle cx="12" cy="12" r="2"></circle>
          </svg>
          <div className="stat-button-content">
            <div className="stat-button-title">Pod Stats</div>
            <div className="stat-button-subtitle">Historical data and trends</div>
          </div>
        </button>
      </div>

      {currentPlaygroup && (
        <button 
          className="track-game-button"
          onClick={() => navigate('/track-game')}
        >
          Track Game+
        </button>
      )}

      <section className="weekly-highlights">
        <h2 className="section-title">📈 Last Week Highlights</h2>
        
        <div 
          className="highlight-card games-played"
          onClick={() => navigate('/games-played')}
          style={{ cursor: 'pointer' }}
        >
          <div className="highlight-number">{isLoading ? '...' : gamesLastSession}</div>
          <div className="highlight-label">Games Played</div>
        </div>

        <div 
          className="highlight-card total-players"
          onClick={() => navigate('/total-players')}
          style={{ cursor: 'pointer' }}
        >
          <div className="highlight-number">{isLoading ? '...' : lastSessionPlayers.length}</div>
          <div className="highlight-label">Total Players</div>
        </div>

        <div 
          className="highlight-card unique-decks"
          onClick={() => navigate('/unique-decks')}
          style={{ cursor: 'pointer' }}
        >
          <div className="highlight-number">{isLoading ? '...' : uniqueCommandersCount}</div>
          <div className="highlight-label">Unique Decks</div>
        </div>
      </section>

      <section className="weekly-participants">
        <h3 className="subsection-title">Weekly Participants</h3>
        <div className="participant-pills">
          {isLoading ? (
            <div className="participant-pill">Loading...</div>
          ) : lastSessionPlayers.length === 0 ? (
            <div className="participant-pill empty-state">No players yet</div>
          ) : (
            lastSessionPlayers.map((participant, index) => (
              <div key={index} className="participant-pill">
                {participant}
              </div>
            ))
          )}
        </div>
      </section>

      <section className="top-performers">
        <h2 className="section-title">🏆 Top Performers This Week</h2>
        {isLoading ? (
          <div className="empty-state">Loading...</div>
        ) : topPerformers.length === 0 ? (
          <div className="empty-state">No games played yet</div>
        ) : (
          topPerformers.map((performer, index) => (
            <div key={index} className={`performer-card rank-${index + 1}`}>
              <div className="performer-header">
                <span className="medal-icon">
                  {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                </span>
                <div className="performer-info">
                  <div className="performer-name">{performer.name}</div>
                  <div className="performer-stats">{performer.wins} wins / {performer.games} games</div>
                </div>
              </div>
              <div className="performer-winrate">{performer.winRate.toFixed(1)}%</div>
            </div>
          ))
        )}
      </section>

      <section className="featured-decks">
        <h2 className="section-title">Featured Deck of the Week</h2>
        {isLoading ? (
          <div className="empty-state">Loading...</div>
        ) : featuredDecks.length === 0 ? (
          <div className="empty-state">No games played yet</div>
        ) : (
          featuredDecks.map((deck, index) => (
            <div key={index} className="featured-deck-card">
              <div className="deck-category">
                {index === 0 ? '🔥' : index === 1 ? '🏆' : '⭐'} {deck.category}
              </div>
              <div className="deck-commander">
                {getDisplayName(deck.name)} <ColorMana colors={deck.colors} size="small" />
              </div>
              <div className="deck-detail">
                {deck.games} {deck.games === 1 ? 'game' : 'games'} • {deck.wins} {deck.wins === 1 ? 'win' : 'wins'} ({deck.winRate.toFixed(1)}%)
              </div>
            </div>
          ))
        )}
      </section>

      {showSwitchModal && (
        <SwitchPlaygroupModal
          currentPlaygroup={currentPlaygroup}
          setCurrentPlaygroup={setCurrentPlaygroup}
          joinedPlaygroups={joinedPlaygroups}
          setJoinedPlaygroups={setJoinedPlaygroups}
          onClose={() => setShowSwitchModal(false)}
        />
      )}

      {showJoinHostModal && (
        <JoinHostModal
          onClose={() => setShowJoinHostModal(false)}
          onPlaygroupCreated={handlePlaygroupCreated}
        />
      )}
    </div>
  );
}

export default HomePage;
