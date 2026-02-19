import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSheetData } from '../context/SheetDataContext';
import { loadPlaygroupData } from '../utils/firestoreHelpers';
import { generateNextGameId } from '../utils/firestoreHelpers';
import firebaseAuthService from '../services/firebaseAuth';
import scryfallService from '../services/scryfallService';
import ColorMana from '../components/ColorMana';
import './BlankPage.css';
import './TrackGamePage.css';

function TrackGamePage({ currentPlaygroup }) {
  const navigate = useNavigate();
  const { games } = useSheetData();
  
  // Prevent double-trigger of continue game popup
  const hasCheckedExistingGame = useRef(false);
  
  // Settings
  const [advancedStatsEnabled, setAdvancedStatsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Game data
  const [gameDate, setGameDate] = useState(() => {
    // Get today's date with 7am cutoff (games before 7am count as previous day)
    const now = new Date();
    const hour = now.getHours();
    
    // If before 7am, use previous day
    if (hour < 7) {
      now.setDate(now.getDate() - 1);
    }
    
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  const [playerCount, setPlayerCount] = useState(4);
  const [players, setPlayers] = useState([
    { player: '', commander: '', partnerCommander: '', showPartner: false, colorId: [], bracket: null, isWinner: false, lastTurn: '', winCondition: '' },
    { player: '', commander: '', partnerCommander: '', showPartner: false, colorId: [], bracket: null, isWinner: false, lastTurn: '', winCondition: '' },
    { player: '', commander: '', partnerCommander: '', showPartner: false, colorId: [], bracket: null, isWinner: false, lastTurn: '', winCondition: '' },
    { player: '', commander: '', partnerCommander: '', showPartner: false, colorId: [], bracket: null, isWinner: false, lastTurn: '', winCondition: '' },
  ]);
  
  // Autocomplete states
  const [commanderSuggestions, setCommanderSuggestions] = useState([]);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchingPlayerIndex, setSearchingPlayerIndex] = useState(-1);
  const [searchingField, setSearchingField] = useState('commander'); // 'commander' or 'partner'
  
  // Player name autocomplete states
  const [showPlayerSuggestions, setShowPlayerSuggestions] = useState(false);
  const [activePlayerIndex, setActivePlayerIndex] = useState(-1);
  const [filteredPlayerNames, setFilteredPlayerNames] = useState([]);
  
  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalConfig, setModalConfig] = useState({ type: 'alert', title: '', message: '', onConfirm: null, onCancel: null });

  // Continue game popup state
  const [showContinueGamePopup, setShowContinueGamePopup] = useState(false);
  const [existingGameData, setExistingGameData] = useState(null);

  // Device detection for Live Track
  const [isMobileDevice, setIsMobileDevice] = useState(false);

  
  // Get unique player names from games
  const playerNames = React.useMemo(() => {
    return [...new Set(games.map(g => g.player).filter(p => p))].sort();
  }, [games]);

  // Load playgroup settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      if (!currentPlaygroup?.spreadsheetId) {
        setIsLoading(false);
        return;
      }

      try {
        const pgData = await loadPlaygroupData(currentPlaygroup.spreadsheetId);
        if (pgData) {
          setAdvancedStatsEnabled(pgData.advancedStatsEnabled || false);
        }
      } catch (error) {
        console.error('Error loading playgroup settings:', error);
        // Continue anyway - don't block the page
      }
      
      // Check for existing live game
      const existingGame = localStorage.getItem('liveTrackGame');
      if (existingGame && !hasCheckedExistingGame.current) {
        hasCheckedExistingGame.current = true; // Mark as checked to prevent double-trigger
        try {
          const gameData = JSON.parse(existingGame);
          setExistingGameData(gameData);
          setShowContinueGamePopup(true);
          // Don't set loading to false yet - wait for user decision
          return;
        } catch (error) {
          console.error('Error parsing existing game data:', error);
          localStorage.removeItem('liveTrackGame');
        }
      }
      
      setIsLoading(false);
    };

    loadSettings();

    // Safety timeout - force loading to false after 5 seconds
    const timeoutId = setTimeout(() => {
      setIsLoading(false);
    }, 5000);

    return () => clearTimeout(timeoutId);
  }, [currentPlaygroup, navigate]);

  // Detect if device is mobile/tablet for Live Track feature
  useEffect(() => {
    const checkDevice = () => {
      // Check screen width (tablets are typically < 1024px)
      const isMobileWidth = window.innerWidth < 1024;
      
      // Check touch capability
      const hasTouchScreen = ('ontouchstart' in window) || 
                            (navigator.maxTouchPoints > 0) || 
                            (navigator.msMaxTouchPoints > 0);
      
      // Device must have touch AND be mobile-sized
      setIsMobileDevice(isMobileWidth && hasTouchScreen);
    };

    checkDevice();
    
    // Re-check on window resize
    window.addEventListener('resize', checkDevice);
    return () => window.removeEventListener('resize', checkDevice);
  }, []);

  // Update players array when count changes
  useEffect(() => {
    setPlayers(prev => {
      const newPlayers = [...prev];
      if (playerCount > prev.length) {
        // Add players
        for (let i = prev.length; i < playerCount; i++) {
          newPlayers.push({ 
            player: '', 
            commander: '', 
            partnerCommander: '',
            showPartner: false,
            colorId: [], 
            bracket: null, 
            isWinner: false, 
            lastTurn: '', 
            winCondition: '' 
          });
        }
      } else if (playerCount < prev.length) {
        // Remove players
        return newPlayers.slice(0, playerCount);
      }
      return newPlayers;
    });
  }, [playerCount]);

  const handlePlayerCountChange = (delta) => {
    const newCount = playerCount + delta;
    if (newCount >= 3 && newCount <= 5) {
      setPlayerCount(newCount);
    }
  };

  const handlePlayerChange = (index, field, value) => {
    setPlayers(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handlePlayerNameChange = (index, value) => {
    handlePlayerChange(index, 'player', value);
    
    if (value.length === 0) {
      setShowPlayerSuggestions(false);
      setFilteredPlayerNames([]);
      return;
    }
    
    // Filter player names based on input
    const filtered = playerNames.filter(name => 
      name.toLowerCase().includes(value.toLowerCase())
    );
    
    setFilteredPlayerNames(filtered);
    setActivePlayerIndex(index);
    setShowPlayerSuggestions(filtered.length > 0);
  };

  const handlePlayerNameSelect = (index, name) => {
    handlePlayerChange(index, 'player', name);
    setShowPlayerSuggestions(false);
    setActivePlayerIndex(-1);
    setFilteredPlayerNames([]);
  };

  const handleCommanderSearch = async (index, searchText, isPartner = false) => {
    const field = isPartner ? 'partnerCommander' : 'commander';
    handlePlayerChange(index, field, searchText);
    
    if (searchText.length < 3) {
      setShowSuggestions(false);
      return;
    }

    setSearchingPlayerIndex(index);
    setSearchingField(isPartner ? 'partner' : 'commander');
    
    try {
      // Search Scryfall directly
      const suggestions = await scryfallService.getCommanderSuggestions(searchText);
      setCommanderSuggestions(suggestions.slice(0, 10));
      setShowSuggestions(true);
    } catch (error) {
      console.error('Error searching commanders:', error);
      setShowSuggestions(false);
    }
  };

  const handleCommanderSelect = async (index, commanderName) => {
    // Use searchingField to determine which field to fill
    const isPartner = searchingField === 'partner';
    const field = isPartner ? 'partnerCommander' : 'commander';
    
    // Capture current player data BEFORE updating state
    const currentPlayer = players[index];
    const existingCommander = currentPlayer.commander;
    const existingPartner = currentPlayer.partnerCommander;
    
    setShowSuggestions(false);
    setSearchingPlayerIndex(-1);

    // Helper function to sort colors in WUBRG order
    const sortColorsWUBRG = (colors) => {
      const order = { 'W': 0, 'U': 1, 'B': 2, 'R': 3, 'G': 4, 'C': 5 };
      return colors.sort((a, b) => order[a] - order[b]);
    };

    // Fetch card data to get color identity
    try {
      const card = await scryfallService.getCommanderByName(commanderName);
      const colorId = scryfallService.getColorIdentity(card);
      
      // Get the proper name to store (extracts front face for DFCs)
      const nameToStore = scryfallService.getCommanderNameForStorage(card);
      
      let finalColorId;
      
      // If this is a partner, merge with existing commander's colors
      if (isPartner && existingCommander) {
        try {
          const mainCard = await scryfallService.getCommanderByName(existingCommander);
          const mainColorId = scryfallService.getColorIdentity(mainCard);
          
          // Merge and sort color identities in WUBRG order
          const mergedColors = [...new Set([...mainColorId, ...colorId])];
          const sortedColors = sortColorsWUBRG(mergedColors);
          finalColorId = sortedColors.length > 0 ? sortedColors : ['C'];
        } catch (err) {
          console.error('Error fetching main commander:', err);
          const sortedColors = sortColorsWUBRG(colorId);
          finalColorId = sortedColors.length > 0 ? sortedColors : ['C'];
        }
      } 
      // If this is the main commander and a partner exists, merge colors
      else if (!isPartner && existingPartner) {
        try {
          const partnerCard = await scryfallService.getCommanderByName(existingPartner);
          const partnerColorId = scryfallService.getColorIdentity(partnerCard);
          
          // Merge and sort color identities in WUBRG order
          const mergedColors = [...new Set([...colorId, ...partnerColorId])];
          const sortedColors = sortColorsWUBRG(mergedColors);
          finalColorId = sortedColors.length > 0 ? sortedColors : ['C'];
        } catch (err) {
          console.error('Error fetching partner commander:', err);
          const sortedColors = sortColorsWUBRG(colorId);
          finalColorId = sortedColors.length > 0 ? sortedColors : ['C'];
        }
      }
      // Single commander, no partner
      else {
        const sortedColors = sortColorsWUBRG(colorId);
        finalColorId = sortedColors.length > 0 ? sortedColors : ['C'];
      }
      
      // Update both commander name and colorId in a SINGLE state update
      setPlayers(prev => {
        const updated = [...prev];
        updated[index] = { 
          ...updated[index], 
          [field]: nameToStore,
          colorId: finalColorId
        };
        return updated;
      });
    } catch (error) {
      console.error('Error fetching commander data:', error);
      // Still set the commander name even if color fetch fails
      setPlayers(prev => {
        const updated = [...prev];
        updated[index] = { ...updated[index], [field]: commanderName };
        return updated;
      });
    }
  };

  const handleMarkWinner = (index) => {
    setPlayers(prev => prev.map((p, i) => ({
      ...p,
      isWinner: i === index ? !p.isWinner : false
    })));
  };

  const handleBracketSelect = (index, bracket) => {
    handlePlayerChange(index, 'bracket', players[index].bracket === bracket ? null : bracket);
  };

  const showAlert = (title, message) => {
    setModalConfig({ type: 'alert', title, message, onConfirm: null, onCancel: null });
    setShowModal(true);
  };

  const showConfirm = (title, message, onConfirm, onCancel = null) => {
    setModalConfig({ type: 'confirm', title, message, onConfirm, onCancel });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    // Call onCancel if modal is closed without confirming
    if (modalConfig.type === 'confirm' && modalConfig.onCancel) {
      modalConfig.onCancel();
    }
  };

  // Handle continuing existing game
  const handleContinueGame = () => {
    setShowContinueGamePopup(false);
    hasCheckedExistingGame.current = false; // Reset for next visit
    navigate('/live-track');
  };

  // Handle discarding existing game
  const handleDiscardGame = async () => {
    setShowContinueGamePopup(false);
    hasCheckedExistingGame.current = false; // Reset for next visit
    
    if (!existingGameData) {
      console.error('No existing game data found');
      setIsLoading(false);
      return;
    }

    try {
      // Delete rows from Google Sheets
      console.log('Deleting game rows from Google Sheets...');
      const result = await firebaseAuthService.deleteGameRows(
        existingGameData.spreadsheetId,
        existingGameData.gameId
      );
      console.log(`Deleted ${result.deletedCount} rows from Google Sheets`);
      
      // Delete Firestore tracking
      const { deleteLiveGameTracking } = await import('../utils/firestoreHelpers');
      await deleteLiveGameTracking(
        existingGameData.spreadsheetId,
        existingGameData.gameId
      );
      
      // Clear localStorage
      localStorage.removeItem('liveTrackGame');
      
      console.log('Game discarded successfully');
    } catch (error) {
      console.error('Error discarding game:', error);
      showAlert('Error', 'Failed to discard game: ' + error.message);
    }
    
    setIsLoading(false);
  };

  const handleAddPartner = (index) => {
    handlePlayerChange(index, 'showPartner', true);
  };

  const handleRemovePartner = (index) => {
    handlePlayerChange(index, 'showPartner', false);
    handlePlayerChange(index, 'partnerCommander', '');
    
    // Recalculate color identity with just main commander
    if (players[index].commander) {
      handleCommanderSelect(index, players[index].commander, false);
    }
  };

  const validateForm = () => {
    // Check all players have required fields
    for (let i = 0; i < playerCount; i++) {
      if (!players[i].player || !players[i].commander) {
        return { valid: false, message: 'All players must have a name and commander.' };
      }
    }
    
    // Check winner is marked for Submit Game
    const hasWinner = players.some(p => p.isWinner);
    
    return { valid: true, hasWinner };
  };

  const handleCancel = () => {
    showConfirm(
      'Cancel Game Entry',
      'Are you sure you want to cancel? All entered data will be lost.',
      () => navigate('/')
    );
  };

  const handleSubmitGame = async () => {
    const validation = validateForm();
    
    if (!validation.valid) {
      showAlert('WHOOPS!', validation.message);
      return;
    }

    if (!validation.hasWinner) {
      showAlert('No Winner Selected', 'Please mark a winner before submitting the game.');
      return;
    }

    try {
      // Generate game ID
      // Parse date string as local date (not UTC)
      const [year, month, day] = gameDate.split('-').map(Number);
      const localDate = new Date(year, month - 1, day); // month is 0-indexed
      const dateString = localDate.toLocaleDateString('en-US');
      const gameId = await generateNextGameId(currentPlaygroup.spreadsheetId, dateString);

      // Submit each player's data
      for (let i = 0; i < playerCount; i++) {
        const player = players[i];
        
        // Format commander name - combine with partner if exists
        let commanderName = player.commander;
        if (player.partnerCommander) {
          commanderName = `${player.commander} // ${player.partnerCommander}`;
        }
        
        await firebaseAuthService.appendGameToSheet(currentPlaygroup.spreadsheetId, {
          date: localDate, // Use the local date object
          gameId: gameId,
          player: player.player,
          commander: commanderName,
          colorId: player.colorId,
          turnOrder: i + 1,
          result: player.isWinner ? 'Win' : 'Loss',
          lastTurn: player.isWinner && player.lastTurn ? parseInt(player.lastTurn) : null,
          winCondition: player.isWinner && player.winCondition ? player.winCondition : '',
          bracket: player.bracket || ''
        });
      }

      showAlert('Success', 'Game submitted successfully!');
      setTimeout(() => navigate('/'), 1000);
    } catch (error) {
      console.error('Error submitting game:', error);
      showAlert('Error', 'Failed to submit game: ' + error.message);
    }
  };

  const handleLiveTrack = async () => {
    const validation = validateForm();
    
    if (!validation.valid) {
      showAlert('WHOOPS!', validation.message);
      return;
    }

    if (validation.hasWinner) {
      showAlert('Cannot Start Live Tracking', 'A winner is already marked. Use "Submit Game" to save the complete game instead.');
      return;
    }

    try {
      // Generate game ID
      // Parse date string as local date (not UTC)
      const [year, month, day] = gameDate.split('-').map(Number);
      const localDate = new Date(year, month - 1, day); // month is 0-indexed
      const dateString = localDate.toLocaleDateString('en-US');
      const gameId = await generateNextGameId(currentPlaygroup.spreadsheetId, dateString);

      // Start live game for each player
      const playerRows = [];
      for (let i = 0; i < playerCount; i++) {
        const player = players[i];
        
        // Format commander name - combine with partner if exists
        let commanderName = player.commander;
        if (player.partnerCommander) {
          commanderName = `${player.commander} // ${player.partnerCommander}`;
        }
        
        const result = await firebaseAuthService.startLiveGame(currentPlaygroup.spreadsheetId, {
          date: localDate, // Use the local date object
          gameId: gameId,
          player: player.player,
          commander: commanderName,
          colorId: player.colorId,
          turnOrder: i + 1,
          bracket: player.bracket || ''
        });

        playerRows.push({
          player: player.player,
          commander: commanderName,
          rowNumber: result.rowNumber
        });
      }

      // Track in Firestore
      const { startLiveGameTracking } = await import('../utils/firestoreHelpers');
      await startLiveGameTracking(
        currentPlaygroup.spreadsheetId,
        gameId,
        playerRows[0].rowNumber,
        playerRows
      );

      // Save game data to localStorage for LiveTrackPage
      const gameDataForTracking = {
        gameId,
        spreadsheetId: currentPlaygroup.spreadsheetId,
        date: new Date(gameDate).toISOString(),
        playerRows,
        advancedStatsEnabled: advancedStatsEnabled
      };
      localStorage.setItem('liveTrackGame', JSON.stringify(gameDataForTracking));

      // Navigate to LiveTrackPage
      navigate('/live-track');
    } catch (error) {
      console.error('Error starting live tracking:', error);
      showAlert('Error', 'Failed to start live tracking: ' + error.message);
    }
  };

  if (isLoading) {
    return (
      <div className="blank-page">
        <button className="back-button" onClick={() => navigate('/')}>
          ← Back to Home
        </button>
        <div className="page-content">
          <p style={{ color: '#ffffff', textAlign: 'center', marginTop: '40px' }}>
            Loading...
          </p>
        </div>
      </div>
    );
  }

  const allColors = ['W', 'U', 'B', 'R', 'G', 'C'];
  const brackets = [1, 2, 3, 4, 'cEDH'];
  const winConditions = ['Combo', 'Commander Damage', 'Mill', 'Poison', 'Alternate Win-Con'];

  return (
    <div className="blank-page">
      <button className="back-button" onClick={() => navigate('/')}>
        ← Back to Home
      </button>
      
      <div className="page-content track-game-content">
        <h1 className="page-title">Record New Game</h1>

        {/* Game Date and Player Count Row */}
        <div className="date-player-row">
          {/* Game Date */}
          <div className="game-date-section">
            <label className="field-label">Game Date</label>
            <input
              type="date"
              className="date-input"
              value={gameDate}
              onChange={(e) => setGameDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
            />
          </div>

          {/* Number of Players */}
          <div className="player-count-section">
            <label className="field-label">Number of Players</label>
            <div className="player-count-controls">
              <button
                className="player-count-btn decrease"
                onClick={() => handlePlayerCountChange(-1)}
                disabled={playerCount <= 3}
              >
                -
              </button>
              <span className="player-count-display">{playerCount}</span>
              <button
                className="player-count-btn increase"
                onClick={() => handlePlayerCountChange(1)}
                disabled={playerCount >= 5}
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Player Frames */}
        <div className="player-frames">
          {players.slice(0, playerCount).map((player, index) => (
            <div key={index} className="player-frame">
              {/* Seat Indicator */}
              <div className="seat-indicator">
                <span className="seat-text">SEAT</span>
                <span className="seat-number">{index + 1}</span>
              </div>

              {/* Player Name */}
              <div className="player-field">
                <label className="player-field-label">Player</label>
                <div className="commander-search-wrapper">
                  <input
                    type="text"
                    className="player-input"
                    placeholder="Select Player"
                    value={player.player}
                    onChange={(e) => handlePlayerNameChange(index, e.target.value)}
                    onBlur={() => setTimeout(() => setShowPlayerSuggestions(false), 200)}
                    onFocus={() => {
                      if (filteredPlayerNames.length > 0 && activePlayerIndex === index) {
                        setShowPlayerSuggestions(true);
                      }
                    }}
                    autoComplete="off"
                  />
                  {showPlayerSuggestions && activePlayerIndex === index && filteredPlayerNames.length > 0 && (
                    <div className="commander-suggestions">
                      {filteredPlayerNames.map((name, i) => (
                        <div
                          key={i}
                          className="suggestion-item"
                          onClick={() => handlePlayerNameSelect(index, name)}
                        >
                          {name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Commander Search */}
              <div className="commander-field">
                <label className="player-field-label">Commander</label>
                <div className="commander-search-wrapper">
                  <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                  </svg>
                  <input
                    type="text"
                    className="commander-input"
                    placeholder="Search Scryfall"
                    value={player.commander}
                    onChange={(e) => handleCommanderSearch(index, e.target.value, false)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    onFocus={() => {
                      if (commanderSuggestions.length > 0 && searchingPlayerIndex === index) {
                        setShowSuggestions(true);
                      }
                    }}
                  />
                  {!player.showPartner && (
                    <button 
                      className="add-partner-btn"
                      onClick={() => handleAddPartner(index)}
                      type="button"
                    >
                      +
                    </button>
                  )}
                  {showSuggestions && searchingPlayerIndex === index && commanderSuggestions.length > 0 && (
                    <div className="commander-suggestions">
                      {commanderSuggestions.map((suggestion, i) => (
                        <div
                          key={i}
                          className="suggestion-item"
                          onClick={() => handleCommanderSelect(index, suggestion)}
                        >
                          {suggestion}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Partner / Background Field */}
              {player.showPartner && (
                <div className="commander-field partner-field">
                  <label className="player-field-label">Partner / Background</label>
                  <div className="commander-search-wrapper">
                    <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8"></circle>
                      <path d="m21 21-4.35-4.35"></path>
                    </svg>
                    <input
                      type="text"
                      className="commander-input"
                      placeholder="Search Scryfall"
                      value={player.partnerCommander}
                      onChange={(e) => handleCommanderSearch(index, e.target.value, true)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                      onFocus={() => {
                        if (commanderSuggestions.length > 0 && searchingPlayerIndex === index) {
                          setShowSuggestions(true);
                        }
                      }}
                    />
                    <button 
                      className="remove-partner-btn"
                      onClick={() => handleRemovePartner(index)}
                      type="button"
                    >
                      −
                    </button>
                    {showSuggestions && searchingPlayerIndex === index && commanderSuggestions.length > 0 && (
                      <div className="commander-suggestions">
                        {commanderSuggestions.map((suggestion, i) => (
                          <div
                            key={i}
                            className="suggestion-item"
                            onClick={() => handleCommanderSelect(index, suggestion)}
                          >
                            {suggestion}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Color Identity and Bracket */}
              <div className="color-bracket-row">
                <div className="color-identity-field">
                  <label className="player-field-label">Color Identity</label>
                  <div className="color-marbles">
                    {allColors.map(color => (
                      <div
                        key={color}
                        className={`color-marble ${player.colorId.includes(color) ? 'active' : ''}`}
                      >
                        <ColorMana colors={[color]} size="small" />
                      </div>
                    ))}
                  </div>
                </div>

                {advancedStatsEnabled && (
                  <div className="bracket-field">
                    <label className="player-field-label">Bracket</label>
                    <div className="bracket-pills">
                      {brackets.map(bracket => (
                        <button
                          key={bracket}
                          className={`bracket-pill ${player.bracket === bracket ? 'selected' : ''}`}
                          onClick={() => handleBracketSelect(index, bracket)}
                        >
                          {bracket}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Mark as Winner */}
              <button
                className={`mark-winner-btn ${player.isWinner ? 'winner-selected' : ''}`}
                onClick={() => handleMarkWinner(index)}
              >
                {player.isWinner ? '✓ Winner' : 'Mark as Winner'}
              </button>

              {/* Winner Fields (if advanced stats enabled and winner marked) */}
              {advancedStatsEnabled && player.isWinner && (
                <div className="winner-fields">
                  <div className="winner-field">
                    <label className="player-field-label">Final Turn</label>
                    <input
                      type="number"
                      className="final-turn-input"
                      placeholder="turn #"
                      min="1"
                      max="99"
                      value={player.lastTurn}
                      onChange={(e) => handlePlayerChange(index, 'lastTurn', e.target.value)}
                    />
                  </div>
                  <div className="winner-field">
                    <label className="player-field-label">Unique Win Condition</label>
                    <select
                      className="win-condition-select"
                      value={player.winCondition}
                      onChange={(e) => handlePlayerChange(index, 'winCondition', e.target.value)}
                    >
                      <option value="">-- Select --</option>
                      {winConditions.map(condition => (
                        <option key={condition} value={condition}>{condition}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="action-buttons-section">
          <div className="top-buttons">
            <button className="cancel-btn" onClick={handleCancel}>
              Cancel
            </button>
            <button className="submit-btn" onClick={handleSubmitGame}>
              Submit Game
            </button>
          </div>
          
          {/* Live Track Button - Mobile Only */}
          {isMobileDevice ? (
            <button
              className="live-track-btn"
              onClick={handleLiveTrack}
              disabled={players.some(p => p.isWinner)}
            >
              Live Track Game
            </button>
          ) : (
            <div className="live-track-desktop-message">
              <svg 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2"
                className="mobile-icon"
              >
                <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
                <line x1="12" y1="18" x2="12.01" y2="18"></line>
              </svg>
              <p>Live Track is only available on mobile devices</p>
              <span className="desktop-tip">Use your phone or tablet to access this feature</span>
            </div>
          )}
        </div>
      </div>

      {/* Custom Modal */}
      {showModal && (
        <div className="custom-modal-overlay" onClick={closeModal}>
          <div className="custom-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="custom-modal-title">{modalConfig.title}</h3>
            <p className="custom-modal-message">{modalConfig.message}</p>
            <div className="custom-modal-actions">
              {modalConfig.type === 'confirm' && (
                <button className="modal-cancel-btn" onClick={closeModal}>
                  Cancel
                </button>
              )}
              <button 
                className="modal-confirm-btn"
                onClick={() => {
                  if (modalConfig.onConfirm) {
                    modalConfig.onConfirm();
                  }
                  closeModal();
                }}
              >
                {modalConfig.type === 'confirm' ? 'Confirm' : 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Continue Game Popup */}
      {showContinueGamePopup && (
        <div className="custom-modal-overlay">
          <div className="custom-modal continue-game-modal">
            <h3 className="custom-modal-title">Commander's Sphere Live Track</h3>
            <p className="custom-modal-message">
              You have a game in progress - Would you like to continue tracking?
            </p>
            <div className="custom-modal-actions">
              <button 
                className="modal-cancel-btn discard-btn" 
                onClick={handleDiscardGame}
              >
                Discard Game
              </button>
              <button 
                className="modal-confirm-btn continue-btn" 
                onClick={handleContinueGame}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TrackGamePage;
