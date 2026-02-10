import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import firebaseAuthService from '../services/firebaseAuth';
import scryfallService from '../services/scryfallService';
import './LiveTrackPage.css';

function LiveTrackPage() {
  const navigate = useNavigate();
  
  // Load game data from localStorage
  const [gameData, setGameData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Game state
  const [players, setPlayers] = useState([]);
  const [startingLife, setStartingLife] = useState(40);
  const [turnNumber, setTurnNumber] = useState(0);
  const [turnTracking, setTurnTracking] = useState(false);
  const [seatRotation, setSeatRotation] = useState(0);
  
  // UI state
  const [showTurnPopup, setShowTurnPopup] = useState(false);
  const [showTurnAdjust, setShowTurnAdjust] = useState(false);
  const [showPlayerPopup, setShowPlayerPopup] = useState(null);
  const [showCommanderDamage, setShowCommanderDamage] = useState(null);
  const [showCommanderDetail, setShowCommanderDetail] = useState(null);
  const [showGameEndPopup, setShowGameEndPopup] = useState(false);
  const [selectedWinCondition, setSelectedWinCondition] = useState('');
  const [showSettingsPopup, setShowSettingsPopup] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [lifeChangeIndicators, setLifeChangeIndicators] = useState({}); // {playerIndex: amount}
  
  // Commander art URLs
  const [commanderArts, setCommanderArts] = useState({});
  
  // Hold interaction timers
  const holdTimerRef = useRef(null);
  const holdIntervalRef = useRef(null);
  const holdCountRef = useRef(0);
  const holdFiredRef = useRef(false); // Track if hold actually triggered
  
  // Debounce and event prevention for life buttons
  const lastTapTimeRef = useRef({}); // Track last tap time per player
  const isProcessingEventRef = useRef(false); // Prevent touch + mouse double fire
  const isInputLockedRef = useRef(false); // Lock all inputs after popup close
  
  // Life change indicator fade timers
  const lifeChangeFadeTimersRef = useRef({});
  const lifeChangeAccumulatorRef = useRef({}); // Accumulate changes before display
  const lifeChangeDebounceTimersRef = useRef({}); // 200ms debounce before showing
  
  // Commander damage hold timer
  const commanderHoldTimerRef = useRef(null);
  const commanderHoldFiredRef = useRef(false);
  const commanderHoldDataRef = useRef(null);
  
  // Track previous active player count for game end detection
  const prevActiveCountRef = useRef(null);
  
  // Start hold on commander damage icon
  const startCommanderHold = (victimIndex, attackerIndex) => {
    commanderHoldFiredRef.current = false;
    commanderHoldDataRef.current = { victimIndex, attackerIndex };
    
    commanderHoldTimerRef.current = setTimeout(() => {
      // Open detail popup after 500ms hold
      commanderHoldFiredRef.current = true;
      setShowCommanderDetail({ victim: victimIndex, attacker: attackerIndex });
    }, 500);
  };
  
  // Stop hold on commander damage icon
  const stopCommanderHold = () => {
    if (commanderHoldTimerRef.current) {
      clearTimeout(commanderHoldTimerRef.current);
      commanderHoldTimerRef.current = null;
    }
    
    // If hold didn't fire (quick click), add 1 damage to primary
    if (!commanderHoldFiredRef.current && commanderHoldDataRef.current) {
      const { victimIndex, attackerIndex } = commanderHoldDataRef.current;
      adjustCommanderDamage(victimIndex, attackerIndex, 1, 'primary');
    }
    
    commanderHoldDataRef.current = null;
  };
  
  // Wake Lock
  const wakeLockRef = useRef(null);

  // Load game data on mount
  useEffect(() => {
    const loadGameData = () => {
      const saved = localStorage.getItem('liveTrackGame');
      if (!saved) {
        // No live game found
        navigate('/');
        return;
      }

      const data = JSON.parse(saved);
      
      // Check if state was already initialized
      if (data.players && data.players[0].life !== undefined) {
        // Restore saved state
        setGameData(data);
        setPlayers(data.players);
        setStartingLife(data.startingLife || 40);
        setTurnNumber(data.turnNumber || 0);
        setTurnTracking(data.turnTracking || false);
        setSeatRotation(data.seatRotation || 0);
        
        // Fetch commander arts for resumed game
        data.players.forEach((p) => {
          fetchCommanderArt(p.commander, p.index);
        });
      } else {
        // Initialize new game
        setGameData(data);
        
        const initialPlayers = data.playerRows.map((pr, i) => ({
          player: pr.player,
          commander: pr.commander,
          rowNumber: pr.rowNumber,
          index: i,
          life: 40,
          commanderDamage: {},
          poison: 0,
          eliminated: false,
          isWinner: false
        }));

        setPlayers(initialPlayers);
        
        // Fetch commander arts for new game
        data.playerRows.forEach((pr, i) => {
          fetchCommanderArt(pr.commander, i);
        });
      }
      
      setIsLoading(false);
    };

    loadGameData();
  }, [navigate]);

  // Save state to localStorage whenever it changes
  useEffect(() => {
    if (gameData && players.length > 0) {
      const stateToSave = {
        ...gameData,
        players: players,
        startingLife,
        turnNumber,
        turnTracking,
        seatRotation
      };
      localStorage.setItem('liveTrackGame', JSON.stringify(stateToSave));
    }
  }, [players, startingLife, turnNumber, turnTracking, seatRotation, gameData]);

  // Request wake lock
  useEffect(() => {
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
          console.log('Wake Lock active');
        }
      } catch (err) {
        console.error('Wake Lock error:', err);
      }
    };

    requestWakeLock();

    // Re-acquire wake lock when page becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && wakeLockRef.current === null) {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
        wakeLockRef.current = null;
        console.log('Wake Lock released');
      }
    };
  }, []);

  // Request fullscreen
  useEffect(() => {
    const requestFullscreen = async () => {
      try {
        const elem = document.documentElement;
        
        // Try standard fullscreen API
        if (elem.requestFullscreen) {
          await elem.requestFullscreen();
          console.log('Fullscreen active');
        } 
        // Try webkit fullscreen (Safari)
        else if (elem.webkitRequestFullscreen) {
          await elem.webkitRequestFullscreen();
          console.log('Fullscreen active (webkit)');
        }
      } catch (err) {
        // User denied or not supported - continue in normal view
        console.log('Fullscreen not available or denied:', err.message);
      }
    };

    requestFullscreen();

    // Exit fullscreen on unmount
    return () => {
      try {
        if (document.fullscreenElement || document.webkitFullscreenElement) {
          if (document.exitFullscreen) {
            document.exitFullscreen();
          } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
          }
          console.log('Fullscreen exited');
        }
      } catch (err) {
        console.log('Fullscreen exit error:', err.message);
      }
    };
  }, []);

  // Automatically check for game end when players state changes
  // Only triggers on TRANSITIONS, not just current state
  useEffect(() => {
    const activePlayers = players.filter(p => !p.eliminated);
    const currentCount = activePlayers.length;
    const prevCount = prevActiveCountRef.current;
    
    // Only trigger popup on transition FROM 2+ TO 1
    if (prevCount !== null && prevCount >= 2 && currentCount === 1) {
      setShowGameEndPopup(true);
    }
    // Only hide popup on transition FROM 1 TO 2+
    else if (prevCount === 1 && currentCount >= 2 && showGameEndPopup) {
      setShowGameEndPopup(false);
    }
    
    // Update previous count
    prevActiveCountRef.current = currentCount;
  }, [players, showGameEndPopup]);

  // Fetch commander art from Scryfall
  const fetchCommanderArt = async (commanderName, playerIndex) => {
    try {
      // Handle partners (split by //)
      if (commanderName.includes(' // ')) {
        const [cmd1, cmd2] = commanderName.split(' // ').map(s => s.trim());
        
        const card1 = await scryfallService.getCommanderByName(cmd1);
        const card2 = await scryfallService.getCommanderByName(cmd2);
        
        const art1 = card1.image_uris?.art_crop || card1.card_faces?.[0]?.image_uris?.art_crop;
        const art2 = card2.image_uris?.art_crop || card2.card_faces?.[0]?.image_uris?.art_crop;
        
        setCommanderArts(prev => ({
          ...prev,
          [playerIndex]: { 
            primary: art1, 
            partner: art2, 
            isPartner: true,
            name1: cmd1,
            name2: cmd2
          }
        }));
      } else {
        const card = await scryfallService.getCommanderByName(commanderName);
        const art = card.image_uris?.art_crop || card.card_faces?.[0]?.image_uris?.art_crop;
        
        setCommanderArts(prev => ({
          ...prev,
          [playerIndex]: { 
            primary: art, 
            isPartner: false,
            name: commanderName
          }
        }));
      }
    } catch (error) {
      console.error(`Error fetching art for ${commanderName}:`, error);
    }
  };

  // Haptic feedback helper
  const triggerHaptic = useCallback((duration = 15) => {
    if ('vibrate' in navigator) {
      navigator.vibrate(duration);
    }
  }, []);

  // Life adjustment with hold support
  const startLifeHold = useCallback((playerIndex, direction, e) => {
    // Check if inputs are locked (250ms after popup close)
    if (isInputLockedRef.current) {
      return;
    }
    
    // Check if any popup is open - block input if so
    if (showPlayerPopup !== null || showCommanderDamage !== null || showCommanderDetail || 
        showTurnPopup || showTurnAdjust || showSettingsPopup || showCancelConfirm || showGameEndPopup) {
      return;
    }
    
    // Prevent double-firing from both touch and mouse events
    if (isProcessingEventRef.current) {
      return;
    }
    isProcessingEventRef.current = true;
    
    // Debounce: Check if enough time has passed since last tap for this player (100ms)
    const now = Date.now();
    const lastTapTime = lastTapTimeRef.current[playerIndex] || 0;
    if (now - lastTapTime < 100) {
      // Too soon, ignore this tap
      setTimeout(() => {
        isProcessingEventRef.current = false;
      }, 10);
      return;
    }
    lastTapTimeRef.current[playerIndex] = now;
    
    // Reset hold flag - will be set to true if hold fires
    holdFiredRef.current = false;
    holdCountRef.current = 0;
    
    // Wait 500ms before starting hold adjustments
    holdTimerRef.current = setTimeout(() => {
      // Mark that hold has fired
      holdFiredRef.current = true;
      
      let interval = 500; // Start at 500ms intervals
      
      const adjustWithAcceleration = () => {
        // Always add 10 for holds
        const adjustmentAmount = direction * 10;
        
        // Vibrate and adjust simultaneously
        triggerHaptic(40);
        adjustLife(playerIndex, adjustmentAmount);
        
        holdCountRef.current += 10;
        
        // Accelerate after 50 life
        if (holdCountRef.current > 50) {
          const newInterval = Math.max(50, interval * 0.8); // Logarithmic speedup, min 50ms
          if (newInterval !== interval) {
            clearInterval(holdIntervalRef.current);
            interval = newInterval;
            holdIntervalRef.current = setInterval(adjustWithAcceleration, interval);
          }
        }
      };
      
      // Call immediately for the first +10
      adjustWithAcceleration();
      
      // Then set up interval for subsequent +10s
      holdIntervalRef.current = setInterval(adjustWithAcceleration, interval);
    }, 500);
  }, [triggerHaptic, showPlayerPopup, showCommanderDamage, showCommanderDetail, showTurnPopup, showTurnAdjust, showSettingsPopup, showCancelConfirm, showGameEndPopup]);

  const stopLifeHold = useCallback((playerIndex, direction) => {
    // Clear timers
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
    
    // If hold didn't fire (quick tap), add +1
    if (!holdFiredRef.current) {
      adjustLife(playerIndex, direction);
    }
    
    holdCountRef.current = 0;
    holdFiredRef.current = false;
    
    // Clear event processing flag after a small delay
    setTimeout(() => {
      isProcessingEventRef.current = false;
    }, 50);
  }, []);

  // Helper functions for popup interactions (handles both click and touch)
  const createOverlayHandler = useCallback((closeFn) => {
    return (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeFn();
    };
  }, []);

  const createContentHandler = useCallback(() => {
    return (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
  }, []);

  // Lock inputs for 250ms after popup close to prevent accidental taps
  const lockInputsAfterPopupClose = useCallback(() => {
    isInputLockedRef.current = true;
    setTimeout(() => {
      isInputLockedRef.current = false;
    }, 250);
  }, []);

  // Helper for click handlers that respect input lock and popup state
  const createLockedClickHandler = useCallback((handler) => {
    return () => {
      if (isInputLockedRef.current) return;
      // Don't allow opening new popups if any popup is already open
      if (showPlayerPopup !== null || showCommanderDamage !== null || showCommanderDetail || 
          showTurnPopup || showTurnAdjust || showSettingsPopup || showCancelConfirm || showGameEndPopup) {
        return;
      }
      handler();
    };
  }, [showPlayerPopup, showCommanderDamage, showCommanderDetail, showTurnPopup, showTurnAdjust, showSettingsPopup, showCancelConfirm, showGameEndPopup]);

  // Wrapper to handle both click and touch consistently
  const handleOverlayClose = useCallback((closeFn, e) => {
    e.preventDefault();
    e.stopPropagation();
    lockInputsAfterPopupClose(); // Lock inputs before closing
    closeFn();
  }, [lockInputsAfterPopupClose]);

  const handleContentClick = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // Life adjustment
  const adjustLife = (playerIndex, amount) => {
    setPlayers(prev => prev.map((p, i) => {
      if (i === playerIndex) {
        const newLife = p.life + amount;
        const eliminatedByLife = newLife <= 0;
        return { ...p, life: newLife, eliminated: eliminatedByLife || p.eliminated };
      }
      return p;
    }));
    
    // Determine if this is a hold increment (multiples of 10) or single click
    const isHoldIncrement = Math.abs(amount) >= 9; // Hold increments are 9 or 10
    
    if (isHoldIncrement) {
      // Hold increments - update displayed value immediately
      setLifeChangeIndicators(prev => {
        const currentDisplayed = prev[playerIndex] || 0;
        return { ...prev, [playerIndex]: currentDisplayed + amount };
      });
      
      // Clear any pending debounce
      if (lifeChangeDebounceTimersRef.current[playerIndex]) {
        clearTimeout(lifeChangeDebounceTimersRef.current[playerIndex]);
        delete lifeChangeDebounceTimersRef.current[playerIndex];
      }
      
      // Clear accumulator since we just displayed
      delete lifeChangeAccumulatorRef.current[playerIndex];
      
    } else {
      // Single click - accumulate for 200ms debounce
      const currentAccumulated = lifeChangeAccumulatorRef.current[playerIndex] || 0;
      lifeChangeAccumulatorRef.current[playerIndex] = currentAccumulated + amount;
      
      // Clear existing debounce timer
      if (lifeChangeDebounceTimersRef.current[playerIndex]) {
        clearTimeout(lifeChangeDebounceTimersRef.current[playerIndex]);
      }
      
      // Set 200ms debounce - then add batch to displayed value
      lifeChangeDebounceTimersRef.current[playerIndex] = setTimeout(() => {
        const batchAmount = lifeChangeAccumulatorRef.current[playerIndex];
        
        // Add batch to current displayed value (read from prev state)
        setLifeChangeIndicators(prev => ({
          ...prev,
          [playerIndex]: (prev[playerIndex] || 0) + batchAmount
        }));
        
        // Clear accumulator and debounce timer
        delete lifeChangeAccumulatorRef.current[playerIndex];
        delete lifeChangeDebounceTimersRef.current[playerIndex];
      }, 200);
    }
    
    // Always reset 3-second fade timer on any change
    if (lifeChangeFadeTimersRef.current[playerIndex]) {
      clearTimeout(lifeChangeFadeTimersRef.current[playerIndex]);
    }
    
    lifeChangeFadeTimersRef.current[playerIndex] = setTimeout(() => {
      setLifeChangeIndicators(prev => {
        const updated = { ...prev };
        delete updated[playerIndex];
        return updated;
      });
      delete lifeChangeFadeTimersRef.current[playerIndex];
    }, 3000);
  };

  // Commander damage
  const adjustCommanderDamage = (victimIndex, attackerIndex, amount, source = 'primary') => {
    setPlayers(prev => prev.map((p, i) => {
      if (i === victimIndex) {
        const damageData = p.commanderDamage[attackerIndex] || { primary: 0, partner: 0 };
        
        // Handle legacy format (just a number)
        const currentPrimary = typeof damageData === 'number' ? damageData : (damageData.primary || 0);
        const currentPartner = typeof damageData === 'number' ? 0 : (damageData.partner || 0);
        
        // Update the specified source
        const newPrimary = source === 'primary' ? Math.max(0, currentPrimary + amount) : currentPrimary;
        const newPartner = source === 'partner' ? Math.max(0, currentPartner + amount) : currentPartner;
        
        const totalDamage = newPrimary + newPartner;
        const oldTotalDamage = currentPrimary + currentPartner;
        const damageDiff = totalDamage - oldTotalDamage;
        
        const newLife = p.life - damageDiff;
        const eliminatedByDamage = totalDamage >= 21;
        const eliminatedByLife = newLife <= 0;
        
        return {
          ...p,
          commanderDamage: { 
            ...p.commanderDamage, 
            [attackerIndex]: { primary: newPrimary, partner: newPartner }
          },
          life: newLife,
          eliminated: eliminatedByDamage || eliminatedByLife || p.eliminated
        };
      }
      return p;
    }));
  };

  // Poison
  const adjustPoison = (playerIndex, amount) => {
    setPlayers(prev => prev.map((p, i) => {
      if (i === playerIndex) {
        const newPoison = Math.max(0, Math.min(10, p.poison + amount));
        const eliminatedByPoison = newPoison >= 10;
        return { ...p, poison: newPoison, eliminated: eliminatedByPoison || p.eliminated };
      }
      return p;
    }));
  };

  // Eliminate player (skull button)
  const toggleElimination = (playerIndex) => {
    setPlayers(prev => prev.map((p, i) => 
      i === playerIndex ? { ...p, eliminated: !p.eliminated } : p
    ));
  };

  // Rotate seats
  const rotateSeats = () => {
    setSeatRotation(prev => (prev + 1) % players.length);
  };

  // Start turn tracking
  const startTurnTracking = () => {
    setTurnTracking(true);
    setTurnNumber(1);
    setShowTurnPopup(true);
  };

  // Advance turn
  const advanceTurn = () => {
    setTurnNumber(prev => prev + 1);
  };

  // Adjust turn (from hold popup)
  const adjustTurn = (amount) => {
    setTurnNumber(prev => Math.max(0, prev + amount));
  };

  // Change starting life total
  const changeStartingLife = (amount) => {
    const lifeValues = [20, 25, 30, 40, 50, 60];
    const currentIndex = lifeValues.indexOf(startingLife);
    const newIndex = currentIndex + amount;
    
    // Check bounds
    if (newIndex < 0 || newIndex >= lifeValues.length) return;
    
    const newLife = lifeValues[newIndex];
    setStartingLife(newLife);
    
    // Update all players' life totals
    setPlayers(prev => prev.map(p => ({ ...p, life: newLife })));
  };

  // Pause tracking - save state and return home
  const pauseTracking = () => {
    // State is already being saved to localStorage on every change
    // Just navigate home
    navigate('/');
  };

  // Cancel tracking - delete tracking data and return home
  const cancelTracking = () => {
    setShowCancelConfirm(true);
  };

  // Confirm cancel tracking
  const confirmCancelTracking = async () => {
    setShowCancelConfirm(false);
    
    try {
      // Delete rows from Google Sheets
      console.log('Deleting game rows from Google Sheets...');
      const result = await firebaseAuthService.deleteGameRows(gameData.spreadsheetId, gameData.gameId);
      console.log(`Deleted ${result.deletedCount} rows from Google Sheets`);
      
      // Delete Firestore tracking
      const { deleteLiveGameTracking } = await import('../utils/firestoreHelpers');
      await deleteLiveGameTracking(gameData.spreadsheetId, gameData.gameId);
      
      // Clear localStorage
      localStorage.removeItem('liveTrackGame');
      
      // Navigate home
      navigate('/');
    } catch (error) {
      console.error('Error canceling tracking:', error);
      alert('Failed to cancel tracking: ' + error.message);
    }
  };

  // Complete game
  const completeGame = async () => {
    if (!selectedWinCondition && gameData.advancedStatsEnabled) {
      alert('Please select a win condition');
      return;
    }

    try {
      const winnerIndex = players.findIndex(p => !p.eliminated);
      
      if (winnerIndex === -1) {
        alert('No winner found - please restore a player');
        return;
      }

      // Update each player's row in Sheets
      for (let i = 0; i < players.length; i++) {
        const player = players[i];

        await firebaseAuthService.completeLiveGame(
          gameData.spreadsheetId,
          player.rowNumber,
          {
            result: i === winnerIndex ? 'Win' : 'Loss',
            lastTurn: i === winnerIndex && turnNumber > 0 ? turnNumber : null,
            winCondition: i === winnerIndex ? selectedWinCondition : ''
          }
        );
      }

      // Delete Firestore tracking
      const { deleteLiveGameTracking } = await import('../utils/firestoreHelpers');
      await deleteLiveGameTracking(gameData.spreadsheetId, gameData.gameId);

      // Clear localStorage
      localStorage.removeItem('liveTrackGame');

      // Navigate home
      navigate('/');
    } catch (error) {
      console.error('Error completing game:', error);
      alert('Failed to save game: ' + error.message);
    }
  };

  // Calculate rotated seat positions
  const getRotatedPlayers = () => {
    const rotated = [...players];
    for (let i = 0; i < seatRotation; i++) {
      rotated.push(rotated.shift());
    }
    return rotated;
  };

  if (isLoading || !gameData) {
    return (
      <div className="live-track-page">
        <div className="loading">Loading game...</div>
      </div>
    );
  }

  const rotatedPlayers = getRotatedPlayers();
  const playerCount = players.length;
  const advancedStats = gameData.advancedStatsEnabled;
  const winConditions = ['Combo', 'Mill', 'Poison', 'Commander Damage', 'Alt. Win-Con'];

  // Fixed grid positions for 3-player layout
  const gridPositions3P = {
    A: { column: 4, row: 2, rotation: 'right' },   // top-right (right side)
    E: { column: '2 / 5', row: 4, rotation: 'normal' }, // bottom-center (spans)
    D: { column: 2, row: 2, rotation: 'left' }     // top-left (left side)
  };

  // Position cycle for 3-player rotation: A→E→D→A
  const positionCycle3P = ['A', 'E', 'D'];

  // Fixed grid positions for 4-player layout
  const gridPositions4P = {
    A: { column: 4, row: 2, rotation: 'right' },  // top-right
    B: { column: 4, row: 4, rotation: 'right' },  // bottom-right
    C: { column: 2, row: 4, rotation: 'left' },   // bottom-left
    D: { column: 2, row: 2, rotation: 'left' }    // top-left
  };

  // Position cycle for rotation: A→B→C→D→A
  const positionCycle4P = ['A', 'B', 'C', 'D'];

  // Fixed grid positions for 5-player layout
  const gridPositions5P = {
    A: { column: 4, row: 2, rotation: 'right' },   // top-right
    B: { column: 4, row: 4, rotation: 'right' },   // mid-right
    E: { column: '2 / 5', row: 6, rotation: 'normal' }, // bottom-center (spans)
    C: { column: 2, row: 4, rotation: 'left' },    // mid-left
    D: { column: 2, row: 2, rotation: 'left' }     // top-left
  };

  // Position cycle for 5-player rotation: A→B→E→C→D→A
  const positionCycle5P = ['A', 'B', 'E', 'C', 'D'];

  // Get grid position for a player based on rotation count
  const getPlayerGridPosition = (playerIndex) => {
    if (playerCount === 3) {
      // 3-player: P0→A, P1→E, P2→D
      const initialPosition = positionCycle3P[playerIndex];
      const initialIndex = positionCycle3P.indexOf(initialPosition);
      
      // Apply rotation: move through position cycle
      const rotatedIndex = (initialIndex + seatRotation) % 3;
      const currentPosition = positionCycle3P[rotatedIndex];
      
      return gridPositions3P[currentPosition];
    } else if (playerCount === 4) {
      // 4-player: P0→A, P1→B, P2→C, P3→D
      const initialPosition = positionCycle4P[playerIndex];
      const initialIndex = positionCycle4P.indexOf(initialPosition);
      
      // Apply rotation: move clockwise through position cycle
      const rotatedIndex = (initialIndex + seatRotation) % 4;
      const currentPosition = positionCycle4P[rotatedIndex];
      
      return gridPositions4P[currentPosition];
    } else if (playerCount === 5) {
      // 5-player: P0→A, P1→B, P2→E, P3→C, P4→D
      // Human perspective: Player 1→A, Player 2→B, Player 3→E, Player 4→C, Player 5→D
      const initialPosition = positionCycle5P[playerIndex];
      const initialIndex = positionCycle5P.indexOf(initialPosition);
      
      // Apply rotation: move through position cycle
      const rotatedIndex = (initialIndex + seatRotation) % 5;
      const currentPosition = positionCycle5P[rotatedIndex];
      
      return gridPositions5P[currentPosition];
    }
    
    return null;
  };

  // Get commander damage display order based on current seat position
  const getCommanderDamageOrder = (playerIndex) => {
    if (playerCount === 3) {
      // Get the current seat position of this player
      const gridPos = getPlayerGridPosition(playerIndex);
      
      // Determine which seat this player is in
      let currentSeat = '';
      if (gridPos.column === 4 && gridPos.row === 2) currentSeat = 'A'; // top-right
      else if (gridPos.column === '2 / 5' && gridPos.row === 4) currentSeat = 'E'; // bottom-center
      else if (gridPos.column === 2 && gridPos.row === 2) currentSeat = 'D'; // top-left
      
      // Define the display order based on current seat
      let seatOrder;
      if (currentSeat === 'A') {
        // Seat A: E (left column, spans vertical), D (top-right), A (bottom-right)
        seatOrder = ['E', 'D', 'A'];
      } else if (currentSeat === 'D') {
        // Seat D: A (top-left), E (right column, spans vertical), D (bottom-left)
        seatOrder = ['A', 'E', 'D'];
      } else {
        // Seat E: D (top-left), A (top-right), E (bottom row, spans horizontal)
        seatOrder = ['D', 'A', 'E'];
      }
      
      // Map seat order to actual players currently in those seats
      return seatOrder.map(seat => {
        const playerInSeat = players.find((p, idx) => {
          const pos = getPlayerGridPosition(idx);
          if (seat === 'A') return pos.column === 4 && pos.row === 2;
          if (seat === 'E') return pos.column === '2 / 5' && pos.row === 4;
          if (seat === 'D') return pos.column === 2 && pos.row === 2;
          return false;
        });
        return playerInSeat;
      }).filter(Boolean);
    } else if (playerCount === 4) {
      // Get the current seat position of this player
      const gridPos = getPlayerGridPosition(playerIndex);
      
      // Determine which seat this player is in based on their grid position
      let currentSeat = '';
      if (gridPos.column === 4 && gridPos.row === 2) currentSeat = 'A'; // top-right
      else if (gridPos.column === 4 && gridPos.row === 4) currentSeat = 'B'; // bottom-right
      else if (gridPos.column === 2 && gridPos.row === 4) currentSeat = 'C'; // bottom-left
      else if (gridPos.column === 2 && gridPos.row === 2) currentSeat = 'D'; // top-left
      
      // Define the display order based on current seat
      let seatOrder;
      if (currentSeat === 'A' || currentSeat === 'B') {
        // Right side seats: C, D, B, A
        seatOrder = ['C', 'D', 'B', 'A'];
      } else {
        // Left side seats (C or D): A, B, C, D
        seatOrder = ['A', 'B', 'C', 'D'];
      }
      
      // Map seat order to actual players currently in those seats
      return seatOrder.map(seat => {
        // Find which player is currently in this seat
        const playerInSeat = players.find((p, idx) => {
          const pos = getPlayerGridPosition(idx);
          if (seat === 'A') return pos.column === 4 && pos.row === 2;
          if (seat === 'B') return pos.column === 4 && pos.row === 4;
          if (seat === 'C') return pos.column === 2 && pos.row === 4;
          if (seat === 'D') return pos.column === 2 && pos.row === 2;
          return false;
        });
        return playerInSeat;
      }).filter(Boolean);
    } else if (playerCount === 5) {
      // Get the current seat position of this player
      const gridPos = getPlayerGridPosition(playerIndex);
      
      // Determine which seat this player is in
      let currentSeat = '';
      if (gridPos.column === 4 && gridPos.row === 2) currentSeat = 'A'; // top-right
      else if (gridPos.column === 4 && gridPos.row === 4) currentSeat = 'B'; // mid-right
      else if (gridPos.column === '2 / 5' && gridPos.row === 6) currentSeat = 'E'; // bottom-center
      else if (gridPos.column === 2 && gridPos.row === 4) currentSeat = 'C'; // mid-left
      else if (gridPos.column === 2 && gridPos.row === 2) currentSeat = 'D'; // top-left
      
      // Define the display order based on current seat
      let seatOrder;
      if (currentSeat === 'A' || currentSeat === 'B') {
        // Seats A & B (right side): 3x2 grid
        // Line 1: E, C, D
        // Line 2: E(continuation), B, A
        seatOrder = ['E', 'C', 'D', 'B', 'A'];
      } else if (currentSeat === 'C' || currentSeat === 'D') {
        // Seats C & D (left side): 3x2 grid
        // Line 1: A, B, E
        // Line 2: D, C, E(continuation)
        seatOrder = ['A', 'B', 'E', 'D', 'C'];
      } else {
        // Seat E (bottom): 2x3 grid
        // Line 1: D, A
        // Line 2: C, B
        // Line 3: E, E(continuation)
        seatOrder = ['D', 'A', 'C', 'B', 'E'];
      }
      
      // Map seat order to actual players currently in those seats
      return seatOrder.map(seat => {
        const playerInSeat = players.find((p, idx) => {
          const pos = getPlayerGridPosition(idx);
          if (seat === 'A') return pos.column === 4 && pos.row === 2;
          if (seat === 'B') return pos.column === 4 && pos.row === 4;
          if (seat === 'E') return pos.column === '2 / 5' && pos.row === 6;
          if (seat === 'C') return pos.column === 2 && pos.row === 4;
          if (seat === 'D') return pos.column === 2 && pos.row === 2;
          return false;
        });
        return playerInSeat;
      }).filter(Boolean);
    }
    
    // For other counts, show all players in rotatedPlayers order
    return rotatedPlayers;
  };


  return (
    <div className="live-track-page">
      {/* Player Frames */}
      <div className={`player-grid player-count-${playerCount}`}>
        {players.map((player, playerIndex) => {
          // Get grid position for this player
          let rotation = 'normal';
          let gridColumn, gridRow;
          
          if (playerCount === 3 || playerCount === 4 || playerCount === 5) {
            const gridPos = getPlayerGridPosition(playerIndex);
            rotation = gridPos.rotation;
            gridColumn = gridPos.column;
            gridRow = gridPos.row;
          }

          const art = commanderArts[player.index];
          
          // Determine seat position class
          let seatPosClass = '';
          if (playerCount === 3) {
            if (gridColumn === 4 && gridRow === 2) seatPosClass = 'pos-seat-a';
            else if (gridColumn === '2 / 5' && gridRow === 4) seatPosClass = 'pos-seat-e';
            else if (gridColumn === 2 && gridRow === 2) seatPosClass = 'pos-seat-d';
          } else if (playerCount === 4) {
            if (gridColumn === 4 && gridRow === 2) seatPosClass = 'pos-seat-a';
            else if (gridColumn === 4 && gridRow === 4) seatPosClass = 'pos-seat-b';
            else if (gridColumn === 2 && gridRow === 4) seatPosClass = 'pos-seat-c';
            else if (gridColumn === 2 && gridRow === 2) seatPosClass = 'pos-seat-d';
          } else if (playerCount === 5) {
            if (gridColumn === 4 && gridRow === 2) seatPosClass = 'pos-seat-a';
            else if (gridColumn === 4 && gridRow === 4) seatPosClass = 'pos-seat-b';
            else if (gridColumn === '2 / 5' && gridRow === 6) seatPosClass = 'pos-seat-e';
            else if (gridColumn === 2 && gridRow === 4) seatPosClass = 'pos-seat-c';
            else if (gridColumn === 2 && gridRow === 2) seatPosClass = 'pos-seat-d';
          }

          return (
            <div
              key={player.index}
              className={`player-frame rotation-${rotation} ${player.eliminated ? 'eliminated' : ''}`}
              style={(playerCount === 3 || playerCount === 4 || playerCount === 5) ? { gridColumn, gridRow } : undefined}
            >
              {/* Background Art */}
              <div className="commander-art-background">
                {art?.isPartner ? (
                  <>
                    <div className="art-half art-primary" style={{ backgroundImage: `url(${art.primary})` }} />
                    <div className="art-half art-partner" style={{ backgroundImage: `url(${art.partner})` }} />
                  </>
                ) : (
                  <div className="art-full" style={{ backgroundImage: `url(${art?.primary})` }} />
                )}
              </div>

              {/* Player Name */}
              <div className="player-name-label" onClick={createLockedClickHandler(() => setShowPlayerPopup(player.index))}>
                {player.player}
              </div>

              {/* Life Total */}
              <div className="life-total-container">
                <div 
                  className="life-adjust life-decrease"
                  onTouchStart={(e) => {
                    e.preventDefault();
                    startLifeHold(player.index, -1, e);
                  }}
                  onTouchEnd={() => stopLifeHold(player.index, -1)}
                >
                  <span>−</span>
                </div>
                <div className="life-total">
                  {/* Life change indicator - left side for negative */}
                  {lifeChangeIndicators[player.index] !== undefined && lifeChangeIndicators[player.index] < 0 && (
                    <span 
                      key={`neg-${player.index}-${lifeChangeIndicators[player.index]}`}
                      className="life-change-indicator negative"
                    >
                      {lifeChangeIndicators[player.index]}
                    </span>
                  )}
                  
                  <span className="life-number">{player.life}</span>
                  
                  {/* Life change indicator - right side for positive or zero */}
                  {lifeChangeIndicators[player.index] !== undefined && lifeChangeIndicators[player.index] >= 0 && (
                    <span 
                      key={`pos-${player.index}-${lifeChangeIndicators[player.index]}`}
                      className="life-change-indicator positive"
                    >
                      {lifeChangeIndicators[player.index] > 0 ? '+' : ''}{lifeChangeIndicators[player.index]}
                    </span>
                  )}
                </div>
                <div 
                  className="life-adjust life-increase"
                  onTouchStart={(e) => {
                    e.preventDefault();
                    startLifeHold(player.index, 1, e);
                  }}
                  onTouchEnd={() => stopLifeHold(player.index, 1)}
                >
                  <span>+</span>
                </div>
              </div>

              {/* Poison Counter - spans full width */}
              {player.poison > 0 && (
                <div className={`poison-counter ${seatPosClass}`}>
                  {Array.from({ length: Math.min(player.poison, 10) }).map((_, i) => {
                    // Calculate color gradient: green (#04bd1c) to black (#000000)
                    // Position 0 = green, Position 9 = black
                    const percentage = i / 9;
                    const r = Math.round(4 * (1 - percentage));
                    const g = Math.round(189 * (1 - percentage));
                    const b = Math.round(28 * (1 - percentage));
                    const color = `rgb(${r}, ${g}, ${b})`;
                    
                    return (
                      <span 
                        key={i} 
                        className="phi phi-button"
                        style={{ color }}
                        onClick={() => adjustPoison(player.index, 1)}
                      >
                        Φ
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Commander Damage Grid */}
              <div className={`commander-damage-box grid-${playerCount} ${seatPosClass}`} onClick={createLockedClickHandler(() => setShowCommanderDamage(player.index))}>
                {getCommanderDamageOrder(playerIndex).map((opp) => {
                  const damageData = player.commanderDamage[opp.index] || { primary: 0, partner: 0 };
                  // Handle legacy format
                  const primaryDamage = typeof damageData === 'number' ? damageData : (damageData.primary || 0);
                  const partnerDamage = typeof damageData === 'number' ? 0 : (damageData.partner || 0);
                  const totalDamage = primaryDamage + partnerDamage;
                  const oppArt = commanderArts[opp.index];
                  
                  return (
                    <div key={opp.index} className="mini-commander">
                      {oppArt && (
                        <>
                          <img src={oppArt.primary} alt="" />
                          <span className="damage-number">{totalDamage}</span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        
        {/* Options Bar - for 3, 4, and 5 player */}
        {(playerCount === 3 || playerCount === 4 || playerCount === 5) && (() => {
          // Determine Player 1's position for turn counter rotation
          let p1Position = 'bottom'; // default for P1 on bottom
          
          if (playerCount === 3 || playerCount === 4 || playerCount === 5) {
            const p1GridPos = getPlayerGridPosition(0); // Player 0 is always index 0
            if (p1GridPos.row === 2) { // Top row
              p1Position = p1GridPos.column === 2 ? 'left' : 'right';
            } else if (p1GridPos.row === 4) { // Mid row (5-player only)
              p1Position = p1GridPos.column === 2 ? 'left' : 'right';
            }
            // else p1Position stays 'bottom'
          }
          
          return (
            <div className="options-bar">
              {/* Seat Swap Button - Always on left side */}
              <div className="options-btn-container seat-swap-container left-side">
                <div className="options-btn-label">SEAT</div>
                <button className="options-btn-icon seat-swap-btn" onClick={createLockedClickHandler(rotateSeats)}>
                  <svg viewBox="0 0 100 100" className="seat-swap-icon">
                    {/* Step arrow pointing left */}
                    <path 
                      d="M 20 40 L 80 40 L 80 70 L 50 70" 
                      fill="none" 
                      stroke="white" 
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {/* Larger arrow head pointing left */}
                    <polygon points="50,62 35,70 50,78" fill="white" />
                  </svg>
                </button>
              </div>

              {/* Settings Button - Center */}
              <div className="options-btn-container settings-container">
                <button className="options-btn-icon settings-btn" onClick={createLockedClickHandler(() => setShowSettingsPopup(true))}>
                  <svg viewBox="0 0 100 100" className="settings-icon">
                    {/* Three horizontal lines */}
                    <line x1="30" y1="35" x2="70" y2="35" stroke="white" strokeWidth="6" strokeLinecap="round" />
                    <line x1="30" y1="50" x2="70" y2="50" stroke="white" strokeWidth="6" strokeLinecap="round" />
                    <line x1="30" y1="65" x2="70" y2="65" stroke="white" strokeWidth="6" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              {/* Turn Counter Button - Always on right side, rotates to face P1 (Advanced Stats Only) */}
              {advancedStats && (
                <div className={`options-btn-container turn-counter-container ${
                  playerCount === 3 ? '' : `right-side rotate-${p1Position}`
                }`}>
                  <div className="options-btn-label turn-label">
                    <div>P1</div>
                    <div>TURN</div>
                  </div>
                  <button 
                    className="options-btn-icon turn-counter-btn" 
                    onClick={createLockedClickHandler(turnTracking ? advanceTurn : startTurnTracking)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (!isInputLockedRef.current && turnTracking) setShowTurnAdjust(true);
                    }}
                  >
                    {turnTracking ? turnNumber : 'GO'}
                  </button>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Turn Tracking Start Popup */}
      {showTurnPopup && (
        <div 
          className="popup-overlay"
          onTouchStart={(e) => handleOverlayClose(() => setShowTurnPopup(false), e)}
        >
          <div 
            className="popup-content"
            onTouchStart={handleContentClick}
          >
            <h3>Turn Tracking</h3>
            <p>Player 1 - advance turn # on your upkeep</p>
            <button className="play-btn" onClick={() => setShowTurnPopup(false)}>
              PLAY
            </button>
          </div>
        </div>
      )}

      {/* Turn Adjust Popup (Hold) */}
      {showTurnAdjust && (
        <div 
          className="popup-overlay"
          onTouchStart={(e) => handleOverlayClose(() => setShowTurnAdjust(false), e)}
        >
          <div 
            className="popup-content turn-adjust-popup"
            onTouchStart={handleContentClick}
          >
            <h3>Adjust Turn Number</h3>
            <div className="turn-adjuster">
              <button className="adjust-btn" onClick={() => adjustTurn(-1)}>−</button>
              <span className="turn-display">{turnNumber}</span>
              <button className="adjust-btn" onClick={() => adjustTurn(1)}>+</button>
            </div>
            <button className="close-btn" onClick={() => setShowTurnAdjust(false)}>Done</button>
          </div>
        </div>
      )}

      {/* Settings Popup */}
      {showSettingsPopup && (
        <div 
          className="popup-overlay"
          onTouchStart={(e) => handleOverlayClose(() => setShowSettingsPopup(false), e)}
        >
          <div 
            className="popup-content settings-popup"
            onTouchStart={handleContentClick}
          >
            <h3>Game Settings</h3>
            
            {/* Action Buttons */}
            <div className="settings-actions">
              <button className="settings-action-btn cancel-btn" onClick={cancelTracking}>
                Cancel Tracking
              </button>
              <button className="settings-action-btn pause-btn" onClick={pauseTracking}>
                Pause Tracking
              </button>
            </div>

            {/* Starting Life Selector */}
            <div className="life-selector">
              <h4>Starting Life Total</h4>
              <div className="life-selector-controls">
                <button 
                  className="life-selector-btn minus-btn" 
                  onClick={() => changeStartingLife(-1)}
                  disabled={startingLife === 20}
                >
                  −
                </button>
                <span className="life-selector-value">{startingLife}</span>
                <button 
                  className="life-selector-btn plus-btn" 
                  onClick={() => changeStartingLife(1)}
                  disabled={startingLife === 60}
                >
                  +
                </button>
              </div>
            </div>

            <button className="close-btn" onClick={() => setShowSettingsPopup(false)}>Close</button>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Popup */}
      {showCancelConfirm && (
        <div 
          className="popup-overlay"
          onTouchStart={(e) => handleOverlayClose(() => setShowCancelConfirm(false), e)}
        >
          <div 
            className="popup-content"
            onTouchStart={handleContentClick}
          >
            <h3>Delete all game data?</h3>
            <div className="game-end-actions">
              <button className="back-btn" onClick={() => setShowCancelConfirm(false)}>
                Nevermind
              </button>
              <button className="settings-action-btn cancel-btn" onClick={confirmCancelTracking}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Player Popup (Poison/Eliminate) */}
      {showPlayerPopup !== null && (() => {
        let popupRotation = '';
        
        if (playerCount === 3 || playerCount === 4 || playerCount === 5) {
          const gridPos = getPlayerGridPosition(showPlayerPopup);
          if (gridPos.rotation === 'left') popupRotation = 'rotate-left';
          else if (gridPos.rotation === 'right') popupRotation = 'rotate-right';
          else popupRotation = ''; // normal rotation
        }
        
        return (
          <div 
            className={`popup-overlay ${popupRotation}`}
            onTouchStart={(e) => handleOverlayClose(() => setShowPlayerPopup(null), e)}
          >
            <div 
              className="popup-content player-popup"
              onTouchStart={handleContentClick}
            >
              <h3>{players[showPlayerPopup].player}</h3>
              <div className="player-actions">
                <div className="poison-control">
                  <button className="poison-btn-adjust" onClick={() => adjustPoison(showPlayerPopup, -1)}>−</button>
                  <div className="poison-display">
                    <span className="phi-large">Φ</span>
                    <span className="poison-label">Poison</span>
                    <span className="poison-count">{players[showPlayerPopup].poison}</span>
                  </div>
                  <button className="poison-btn-adjust" onClick={() => adjustPoison(showPlayerPopup, 1)}>+</button>
                </div>
                <button
                  className={`skull-btn ${players[showPlayerPopup].eliminated ? 'active' : ''}`}
                  onClick={() => {
                    toggleElimination(showPlayerPopup);
                    setShowPlayerPopup(null);
                  }}
                >
                  ☠
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Commander Damage Popup */}
      {showCommanderDamage !== null && !showCommanderDetail && (() => {
        let popupRotation = '';
        
        if (playerCount === 3 || playerCount === 4 || playerCount === 5) {
          // Get grid position of this player to determine popup rotation
          const gridPos = getPlayerGridPosition(showCommanderDamage);
          if (gridPos.rotation === 'left') popupRotation = 'rotate-left';
          else if (gridPos.rotation === 'right') popupRotation = 'rotate-right';
          else popupRotation = ''; // normal rotation
        }
        
        return (
          <div 
            className={`popup-overlay ${popupRotation}`}
            onTouchStart={(e) => handleOverlayClose(() => setShowCommanderDamage(null), e)}
          >
            <div 
              className="popup-content commander-damage-popup"
              onTouchStart={handleContentClick}
            >
              <h3>Commander Damage to {players[showCommanderDamage].player}</h3>
              <div className={`commander-grid grid-${playerCount}`}>
                {getCommanderDamageOrder(showCommanderDamage).map(attacker => {
                  const damageData = players[showCommanderDamage].commanderDamage[attacker.index] || { primary: 0, partner: 0 };
                  // Handle legacy format
                  const primaryDamage = typeof damageData === 'number' ? damageData : (damageData.primary || 0);
                  const partnerDamage = typeof damageData === 'number' ? 0 : (damageData.partner || 0);
                  const totalDamage = primaryDamage + partnerDamage;
                  const art = commanderArts[attacker.index];
                  
                  return (
                    <div 
                      key={attacker.index} 
                      className="commander-damage-item"
                      onTouchStart={() => startCommanderHold(showCommanderDamage, attacker.index)}
                      onTouchEnd={stopCommanderHold}
                      onContextMenu={(e) => e.preventDefault()}
                      style={{ WebkitTouchCallout: 'none', userSelect: 'none' }}
                    >
                      {art && (
                        <>
                          <img 
                            src={art.primary} 
                            alt="" 
                            draggable="false"
                            onContextMenu={(e) => e.preventDefault()}
                          />
                          <span className="damage-display">{totalDamage}</span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Commander Detail Popup (Adjust Damage) */}
      {showCommanderDetail && (() => {
        let popupRotation = '';
        
        if (playerCount === 3 || playerCount === 4 || playerCount === 5) {
          const gridPos = getPlayerGridPosition(showCommanderDetail.victim);
          if (gridPos.rotation === 'left') popupRotation = 'rotate-left';
          else if (gridPos.rotation === 'right') popupRotation = 'rotate-right';
          else popupRotation = ''; // normal rotation
        }
        
        const damageData = players[showCommanderDetail.victim].commanderDamage[showCommanderDetail.attacker] || { primary: 0, partner: 0 };
        const primaryDamage = typeof damageData === 'number' ? damageData : (damageData.primary || 0);
        const partnerDamage = typeof damageData === 'number' ? 0 : (damageData.partner || 0);
        const art = commanderArts[showCommanderDetail.attacker];
        const isPartner = art?.isPartner;
        
        return (
          <div 
            className={`popup-overlay ${popupRotation}`}
            onTouchStart={(e) => handleOverlayClose(() => {
              setShowCommanderDetail(null);
              setShowCommanderDamage(null);
            }, e)}
          >
            <div 
              className="popup-content commander-detail-popup"
              onTouchStart={handleContentClick}
            >
              <h3>Commander Damage</h3>
              <div className={`commander-damage-adjusters ${isPartner ? 'partner-layout' : 'single-layout'}`}>
                
                {/* Primary Commander */}
                <div className="commander-adjuster-section">
                  <div className="commander-adjuster">
                    <button 
                      className="adjust-btn"
                      onClick={() => adjustCommanderDamage(showCommanderDetail.victim, showCommanderDetail.attacker, 1, 'primary')}
                    >
                      +
                    </button>
                    <div className="commander-display-vertical">
                      <img 
                        src={art?.primary} 
                        alt="" 
                        draggable="false"
                        onContextMenu={(e) => e.preventDefault()}
                      />
                      <div className="damage-amount">{primaryDamage}</div>
                    </div>
                    <button 
                      className="adjust-btn"
                      onClick={() => adjustCommanderDamage(showCommanderDetail.victim, showCommanderDetail.attacker, -1, 'primary')}
                    >
                      −
                    </button>
                  </div>
                </div>
                
                {/* Partner Commander (if exists) */}
                {isPartner && (
                  <div className="commander-adjuster-section">
                    <div className="commander-adjuster">
                      <button 
                        className="adjust-btn"
                        onClick={() => adjustCommanderDamage(showCommanderDetail.victim, showCommanderDetail.attacker, 1, 'partner')}
                      >
                        +
                      </button>
                      <div className="commander-display-vertical">
                        <img 
                          src={art?.partner} 
                          alt="" 
                          draggable="false"
                          onContextMenu={(e) => e.preventDefault()}
                        />
                        <div className="damage-amount">{partnerDamage}</div>
                      </div>
                      <button 
                        className="adjust-btn"
                        onClick={() => adjustCommanderDamage(showCommanderDetail.victim, showCommanderDetail.attacker, -1, 'partner')}
                      >
                        −
                      </button>
                    </div>
                  </div>
                )}
                
              </div>
            </div>
          </div>
        );
      })()}

      {/* Game End Popup */}
      {showGameEndPopup && (
        <div 
          className="popup-overlay game-end-overlay"
          onTouchStart={handleContentClick}
        >
          <div 
            className="popup-content game-end-popup"
            onTouchStart={handleContentClick}
          >
            <h3>Game Complete!</h3>
            <p className="winner-name">Winner: {players.find(p => !p.eliminated)?.player}</p>
            
            {advancedStats && (
              <div className="win-conditions">
                <h4>Special Win Condition</h4>
                <div className="condition-pills">
                  {winConditions.map(condition => (
                    <button
                      key={condition}
                      className={`condition-pill ${selectedWinCondition === condition ? 'selected' : ''}`}
                      onClick={() => setSelectedWinCondition(condition)}
                    >
                      {condition}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="game-end-actions">
              <button className="back-btn" onClick={() => setShowGameEndPopup(false)}>
                Back
              </button>
              <button 
                className="confirm-btn" 
                onClick={completeGame}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default LiveTrackPage;
