import React, { createContext, useState, useEffect, useContext } from 'react';
import firebaseAuthService from '../services/firebaseAuth';

// Create the context
export const SheetDataContext = createContext();

// Custom hook to use the context
export const useSheetData = () => {
  const context = useContext(SheetDataContext);
  if (!context) {
    throw new Error('useSheetData must be used within SheetDataProvider');
  }
  return context;
};

// Parse color ID string into array
const parseColorID = (colorString) => {
  if (!colorString || colorString.trim() === '') return ['C']; // Colorless if empty
  return colorString.split(',').map(c => c.trim()).filter(c => c);
};

// Parse date string (MM/DD/YYYY) to Date object
const parseDate = (dateString) => {
  if (!dateString) return null;
  const [month, day, year] = dateString.split('/');
  return new Date(year, month - 1, day);
};

// Parse last turn value (convert to number, null if empty)
const parseLastTurn = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
};

// Parse bracket value (1-4 as numbers, "cEDH" as string, null if empty)
const parseBracket = (value) => {
  if (value === null || value === undefined || value === '') return null;
  
  // Check if it's the string "cEDH" (case insensitive)
  if (typeof value === 'string' && value.toLowerCase() === 'cedh') return 'cEDH';
  
  // Try to parse as number
  const num = parseFloat(value);
  if (!isNaN(num) && num >= 1 && num <= 4) return Math.round(num);
  
  return null;
};

// Parse win condition (string or null)
const parseWinCondition = (value) => {
  if (value === null || value === undefined || value === '') return null;
  return String(value).trim();
};

// Provider component
export const SheetDataProvider = ({ children, currentPlaygroup }) => {
  const [rawData, setRawData] = useState(null);
  const [games, setGames] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);

  // Fetch and parse sheet data
  const fetchSheetData = async () => {
    if (!currentPlaygroup?.spreadsheetId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('Fetching sheet data for:', currentPlaygroup.name);
      
      // Check if authenticated, if not, show appropriate error
      if (!firebaseAuthService.isAuthenticated()) {
        console.log('Google Sheets access token expired');
        setError('Your Google Sheets session expired. Click "Refresh Session" to continue.');
        setIsLoading(false);
        return;
      }
      
      // Fetch data from Games tab, columns A-J
      const data = await firebaseAuthService.getSheetData(
        currentPlaygroup.spreadsheetId,
        'Games!A:J'
      );

      console.log('Raw sheet data:', data);

      if (!data || data.length === 0) {
        setGames([]);
        setRawData(data);
        setIsLoading(false);
        return;
      }

      // Skip header row (first row)
      const rows = data.slice(1);

      // Parse each row into game object
      const parsedGames = rows
        .filter(row => row[0] && row[1]) // Must have date and game ID
        .map((row, index) => ({
          id: row[1] || `game-${index}`,
          date: parseDate(row[0]),
          dateString: row[0],
          gameId: row[1],
          player: row[2] || '',
          commander: row[3] || '',
          colorId: parseColorID(row[4]),
          colorIdString: row[4] || '',
          turnOrder: parseInt(row[5]) || 0,
          result: row[6] || '', // "Win" or "Loss"
          isWin: row[6] === 'Win',
          // Advanced stats
          lastTurn: parseLastTurn(row[7]),
          winCondition: parseWinCondition(row[8]),
          bracket: parseBracket(row[9]),
        }));

      console.log('Parsed games:', parsedGames.length, 'games');
      
      setGames(parsedGames);
      setRawData(data);
      setLastFetch(new Date());
      setIsLoading(false);
    } catch (err) {
      console.error('Error fetching sheet data:', err);
      setError(err.message);
      setIsLoading(false);
    }
  };

  // Fetch data when playgroup changes
  useEffect(() => {
    fetchSheetData();
  }, [currentPlaygroup?.spreadsheetId]);

  // Refresh function for manual refresh
  const refresh = () => {
    fetchSheetData();
  };

  // Refresh session - specifically for handling expired tokens
  const refreshSession = async () => {
    setError(null);
    setIsLoading(true);
    
    try {
      // Try to refresh the Google Sheets token
      // This will attempt silent refresh first, then show popup if needed
      await firebaseAuthService.refreshTokenIfNeeded();
      
      // Fetch data with new token
      await fetchSheetData();
    } catch (err) {
      console.error('Error refreshing session:', err);
      setError('Unable to refresh session. Please try signing out and back in.');
      setIsLoading(false);
    }
  };

  const value = {
    games,
    rawData,
    isLoading,
    error,
    lastFetch,
    refresh,
    refreshSession,
  };

  return (
    <SheetDataContext.Provider value={value}>
      {children}
    </SheetDataContext.Provider>
  );
};
