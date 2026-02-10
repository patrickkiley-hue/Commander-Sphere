import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSheetData } from '../context/SheetDataContext';
import { getDisplayName } from '../utils/deckNameUtils';
import { loadPlaygroupData } from '../utils/firestoreHelpers';
import scryfallService from '../services/scryfallService';
import ColorMana from '../components/ColorMana';
import './BlankPage.css';
import './GamesPlayedPage.css';

function MyDeckPage({ currentPlaygroup, playerMapping }) {
  const navigate = useNavigate();
  const { deckName } = useParams();
  const decodedDeckName = decodeURIComponent(deckName);
  const { games, isLoading } = useSheetData();
  
  const [advancedStatsEnabled, setAdvancedStatsEnabled] = useState(false);
  const [commanderArt, setCommanderArt] = useState(null);
  const playerName = playerMapping;

  // Debug logging
  useEffect(() => {
    console.log('MyDeckPage - Player Name:', playerName);
    console.log('MyDeckPage - Deck Name:', decodedDeckName);
    console.log('MyDeckPage - Total games:', games.length);
  }, [playerName, decodedDeckName, games]);

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

  // Fetch commander art
  useEffect(() => {
    const fetchArt = async () => {
      if (!decodedDeckName) return;
      
      try {
        // Check if partner commanders
        if (decodedDeckName.includes(' // ')) {
          const [cmd1, cmd2] = decodedDeckName.split(' // ').map(s => s.trim());
          const [card1, card2] = await Promise.all([
            scryfallService.getCommanderByName(cmd1),
            scryfallService.getCommanderByName(cmd2)
          ]);
          
          setCommanderArt({
            isPartner: true,
            primary: scryfallService.getArtCrop(card1),
            partner: scryfallService.getArtCrop(card2)
          });
        } else {
          const card = await scryfallService.getCommanderByName(decodedDeckName);
          setCommanderArt({
            isPartner: false,
            primary: scryfallService.getArtCrop(card)
          });
        }
      } catch (error) {
        console.error('Error fetching commander art:', error);
      }
    };
    
    fetchArt();
  }, [decodedDeckName]);

  // Filter games where this player piloted this deck
  const deckGames = games.filter(g => 
    g.player === playerName && g.commander === decodedDeckName
  );

  // Debug filtered games
  useEffect(() => {
    console.log('MyDeckPage - Filtered deck games:', deckGames.length);
    if (deckGames.length > 0) {
      console.log('Sample game:', deckGames[0]);
    }
  }, [deckGames]);

  // Calculate record
  const wins = deckGames.filter(g => g.isWin).length;
  const losses = deckGames.filter(g => !g.isWin).length;
  const winRate = deckGames.length > 0 ? ((wins / deckGames.length) * 100).toFixed(1) : '0.0';

  // Group by game session and sort by date (newest first)
  const gameSessions = deckGames.reduce((acc, game) => {
    if (!acc[game.gameId]) {
      acc[game.gameId] = {
        gameId: game.gameId,
        date: game.date,
        dateString: game.dateString,
        players: [],
        lastTurn: game.lastTurn,
        winCondition: game.winCondition,
        userWon: false
      };
    }
    
    // Check if user won this game
    if (game.player === playerName && game.isWin) {
      acc[game.gameId].userWon = true;
    }
    
    return acc;
  }, {});

  // Add all players for each game (not just the user)
  Object.keys(gameSessions).forEach(gameId => {
    const allPlayersInGame = games.filter(g => g.gameId === gameId);
    gameSessions[gameId].players = allPlayersInGame.map(g => ({
      player: g.player,
      commander: g.commander,
      colorId: g.colorId,
      turnOrder: g.turnOrder,
      result: g.result,
      isWin: g.isWin,
      bracket: g.bracket
    }));
  });

  const sortedSessions = Object.values(gameSessions)
    .sort((a, b) => b.date - a.date); // Newest first

  // Format date as MM/DD/YY
  const formatDate = (date) => {
    if (!date) return '';
    const m = parseInt(date.getMonth() + 1);
    const d = parseInt(date.getDate());
    const y = date.getFullYear().toString().slice(-2);
    return `${m}/${d}/${y}`;
  };

  // Extract game number from ID
  const getGameNumber = (gameId) => {
    const match = gameId.match(/\d+$/);
    return match ? parseInt(match[0]) : 1;
  };

  return (
    <div className="blank-page">
      <button className="back-button" onClick={() => navigate(-1)}>
        ← Back
      </button>
      
      <div className="page-content">
        {/* Header with commander art */}
        <div style={{
          position: 'relative',
          width: '100%',
          height: '475px',
          borderRadius: '12px',
          overflow: 'hidden',
          marginBottom: '24px',
          background: 'rgba(17, 24, 39, 0.6)'
        }}>
          {/* Background art */}
          {commanderArt && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              zIndex: 0
            }}>
              {commanderArt.isPartner ? (
                <>
                  <img
                    src={commanderArt.primary}
                    alt="Commander 1"
                    style={{
                      position: 'absolute',
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      objectPosition: 'top center',
                      clipPath: 'polygon(0 0, 100% 0, 0 100%)'
                    }}
                  />
                  <img
                    src={commanderArt.partner}
                    alt="Commander 2"
                    style={{
                      position: 'absolute',
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      objectPosition: 'top center',
                      clipPath: 'polygon(100% 0, 100% 100%, 0 100%)'
                    }}
                  />
                </>
              ) : (
                <img
                  src={commanderArt.primary}
                  alt="Commander"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    objectPosition: 'top center'
                  }}
                />
              )}
            </div>
          )}

          {/* Overlay gradient */}
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
            position: 'relative',
            zIndex: 2,
            height: '100%',
            padding: '24px 32px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            {/* Top left - Commander name */}
            <div>
              <h1 style={{
                fontSize: '42px',
                fontWeight: 700,
                color: '#ffffff',
                margin: 0,
                textShadow: '0 2px 8px rgba(0, 0, 0, 0.8)'
              }}>
                {getDisplayName(decodedDeckName)}
              </h1>
            </div>

            {/* Bottom right - Record */}
            <div style={{
              alignSelf: 'flex-end',
              textAlign: 'right'
            }}>
              <div style={{
                fontSize: '48px',
                fontWeight: 700,
                color: '#ffffff',
                lineHeight: 1,
                marginBottom: '8px',
                textShadow: '0 2px 8px rgba(0, 0, 0, 0.8)'
              }}>
                {winRate}%
              </div>
              <div style={{
                fontSize: '20px',
                fontWeight: 600,
                color: 'rgba(255, 255, 255, 0.9)',
                textShadow: '0 2px 8px rgba(0, 0, 0, 0.8)'
              }}>
                {wins}-{losses}
              </div>
            </div>
          </div>
        </div>

        {/* Games grid */}
        {isLoading ? (
          <p className="loading-message">Loading...</p>
        ) : sortedSessions.length === 0 ? (
          <p className="empty-message">No games found with this deck</p>
        ) : (
          <div className="games-grid">
            {sortedSessions.map((session, index) => (
              <div 
                key={index} 
                className="game-box"
                style={{
                  borderColor: session.userWon ? '#10b981' : '#fb7185',
                  borderWidth: '1px'
                }}
              >
                <div className="game-id-header">
                  {formatDate(session.date)} - Game {getGameNumber(session.gameId)}
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
                              style={player.player === playerName && player.commander === decodedDeckName ? {
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

export default MyDeckPage;
