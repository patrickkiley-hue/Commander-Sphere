import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSheetData } from '../context/GameDataContext';
import { getDisplayName } from '../utils/deckNameUtils';
import { filterValidGames } from '../utils/statsCalculations';
import { loadPlaygroupData } from '../utils/firestoreHelpers';
import ColorMana from '../components/ColorMana';
import './BlankPage.css';
import './GamesPlayedPage.css';

function PodPerformancePage({ currentPlaygroup, playerMapping }) {
  const navigate = useNavigate();
  const { opponent1, opponent2 } = useParams();
  const decodedOpponent1 = decodeURIComponent(opponent1);
  const decodedOpponent2 = decodeURIComponent(opponent2);
  const { rawDocs: games, isLoading } = useSheetData();
  
  const [advancedStatsEnabled, setAdvancedStatsEnabled] = useState(false);
  const [headerArt, setHeaderArt] = useState(null);
  const [artLoading, setArtLoading] = useState(true);
  const playerName = playerMapping;

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

  // Fetch random John Avon land art
  useEffect(() => {
    const fetchArt = async () => {
      try {
        const response = await fetch('https://api.scryfall.com/cards/random?q=type:land+a:avon+isnt:dfc+legal:commander');
        const data = await response.json();
        
        if (data.image_uris?.art_crop) {
          setHeaderArt(data.image_uris.art_crop);
        }
      } catch (error) {
        console.error('Error fetching header art:', error);
      } finally {
        setArtLoading(false);
      }
    };
    
    fetchArt();
  }, []);

  // Games where user AND both opponents were all present
  const relevantGames = filterValidGames(games).filter(g => {
    const playerNames = g.players.map(p => p.player);
    return (
      playerNames.includes(playerName) &&
      playerNames.includes(decodedOpponent1) &&
      playerNames.includes(decodedOpponent2)
    );
  });

  // Calculate record from user's entry in each game
  const wins = relevantGames.filter(g => g.players.find(p => p.player === playerName)?.isWin).length;
  const losses = relevantGames.length - wins;
  const winRate = relevantGames.length > 0 ? ((wins / relevantGames.length) * 100).toFixed(1) : '0.0';

  const parse = (s) => { if (!s) return 0; const [m,d,y] = s.split('/').map(Number); return new Date(y,m-1,d).getTime(); };

  // Build sorted session list — players array already on each game doc
  const sortedSessions = [...relevantGames]
    .map(g => {
      const me = g.players.find(p => p.player === playerName);
      const opponentWon = g.players.some(p =>
        (p.player === decodedOpponent1 || p.player === decodedOpponent2) && p.isWin
      );
      return {
        gameId: g.gameId,
        dateString: g.dateString || '',
        players: g.players,
        lastTurn: g.lastTurn,
        winCondition: g.winCondition,
        userWon: me?.isWin || false,
        opponentWon
      };
    })
    .sort((a, b) => parse(b.dateString) - parse(a.dateString));

  // Format MM/DD/YYYY → M/D/YY
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const parts = dateStr.split('/');
    if (parts.length !== 3) return dateStr;
    return `${parseInt(parts[0])}/${parseInt(parts[1])}/${parts[2].slice(-2)}`;
  };

  // Extract game number from ID
  const getGameNumber = (gameId) => {
    const match = gameId.match(/\d+$/);
    return match ? parseInt(match[0]) : 1;
  };

  // Determine box border color based on game outcome
  const getBorderColor = (session) => {
    if (session.userWon) return '#10b981'; // Green - user won
    if (session.opponentWon) return '#fb7185'; // Red - one of the two opponents won
    return '#60a5fa'; // Blue - 3rd/4th/5th party won
  };

  return (
    <div className="blank-page">
      <button className="back-button" onClick={() => navigate(-1)}>
        ← Back
      </button>
      
      <div className="page-content">
        {/* Header with land art */}
        {!artLoading && (
          <div style={{
            position: 'relative',
            width: '100%',
            paddingBottom: '56.25%', // 16:9 aspect ratio
            borderRadius: '12px',
            overflow: 'hidden',
            marginBottom: '24px',
            background: 'rgba(17, 24, 39, 0.6)'
          }}>
            {/* Background Art */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              backgroundImage: headerArt ? `url(${headerArt})` : 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
              backgroundSize: 'cover',
              backgroundPosition: 'top center',
              filter: 'brightness(0.7)'
            }} />

            {/* Gradient overlay */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              background: 'linear-gradient(to right, rgba(17, 24, 39, 0.85) 0%, rgba(17, 24, 39, 0.4) 100%)',
              zIndex: 1
            }} />

            {/* Content */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 2,
              padding: '24px 32px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}>
              {/* Top left - Title and subtitle */}
              <div>
                <h1 style={{
                  fontSize: 'clamp(24px, 5vw, 42px)',
                  fontWeight: 700,
                  color: '#ffffff',
                  margin: 0,
                  marginBottom: '8px',
                  textShadow: '0 2px 8px rgba(0, 0, 0, 0.8)'
                }}>
                  Performance
                </h1>
                <p style={{
                  fontSize: 'clamp(14px, 3vw, 18px)',
                  color: 'rgba(255, 255, 255, 0.8)',
                  margin: 0,
                  textShadow: '0 2px 8px rgba(0, 0, 0, 0.8)'
                }}>
                  In pods containing {decodedOpponent1} and {decodedOpponent2}
                </p>
              </div>

              {/* Bottom right - Record */}
              <div style={{
                alignSelf: 'flex-end',
                textAlign: 'right',
                marginBottom: '-12px'
              }}>
                <div style={{
                  fontSize: 'clamp(11px, 2vw, 13px)',
                  fontWeight: 300,
                  color: 'rgba(255, 255, 255, 0.6)',
                  textShadow: '0 2px 8px rgba(0, 0, 0, 0.8)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  marginBottom: '8px'
                }}>
                  Your Record <span style={{ fontSize: 'clamp(16px, 3.5vw, 20px)', fontWeight: 600, color: 'rgba(255, 255, 255, 0.9)' }}>{wins}-{losses}</span>
                </div>
                <div style={{
                  fontSize: 'clamp(32px, 7vw, 48px)',
                  fontWeight: 700,
                  color: '#ffffff',
                  lineHeight: 1,
                  textShadow: '0 2px 8px rgba(0, 0, 0, 0.8)'
                }}>
                  {winRate}%
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Games grid */}
        {isLoading ? (
          <p className="loading-message">Loading...</p>
        ) : sortedSessions.length === 0 ? (
          <p className="empty-message">No games found in pods with these players</p>
        ) : (
          <div className="games-grid">
            {sortedSessions.map((session, index) => (
              <div 
                key={index} 
                className="game-box"
                style={{
                  borderColor: getBorderColor(session),
                  borderWidth: '1px'
                }}
              >
                <div className="game-id-header">
                  {formatDate(session.dateString)} - Game {getGameNumber(session.gameId)}
                </div>
                
                <div className="players-list">
                  {session.players
                    .sort((a, b) => (a.turnOrder || 999) - (b.turnOrder || 999))
                    .map((player, pIndex) => (
                      <div key={pIndex} className="player-row">
                        <div className="player-left">
                          <div className="player-name-line">
                            <div 
                              className="seat-badge"
                              style={player.player === playerName ? {
                                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                                boxShadow: '0 0 8px rgba(59, 130, 246, 0.5)'
                              } : {}}
                            >
                              {player.turnOrder || '?'}
                            </div>
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

                {/* Last Turn / Win Condition */}
                {advancedStatsEnabled && session.lastTurn && (
                  <div style={{
                    marginTop: '12px',
                    paddingTop: '12px',
                    borderTop: '1px solid rgba(96, 165, 250, 0.2)',
                    fontSize: '14px',
                    color: 'rgba(255, 255, 255, 0.7)',
                    fontWeight: 500
                  }}>
                    Last Turn {session.lastTurn}
                    {session.winCondition && ` - ${session.winCondition}`}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default PodPerformancePage;
