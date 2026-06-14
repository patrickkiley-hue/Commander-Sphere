// src/context/GameDataContext.jsx
// Replaces SheetDataContext.jsx
// Fetches game documents from Firestore and exposes a flat `games` array
// with the same shape every stats page already expects — no page changes needed.
//
// HOW TO MIGRATE:
//   1. Drop this file into src/context/
//   2. In App.jsx, replace:
//        import { SheetDataProvider } from './context/SheetDataContext';
//      with:
//        import { SheetDataProvider } from './context/GameDataContext';
//   3. The <SheetDataProvider> tag and all useSheetData() calls stay identical.

import React, { createContext, useState, useEffect, useContext } from 'react';
import { getAllGames } from '../services/gameService';

// ─── Context ──────────────────────────────────────────────────────────────────

export const SheetDataContext = createContext();

export const useSheetData = () => {
  const context = useContext(SheetDataContext);
  if (!context) {
    throw new Error('useSheetData must be used within a SheetDataProvider');
  }
  return context;
};

// ─── Flatten game docs → per-player rows ─────────────────────────────────────
// Each Firestore game doc has a `players` array.
// Stats pages expect one row per player, so we expand them here.
// This preserves all existing stat calculation logic with zero changes.

const flattenGames = (gameDocs) => {
  const rows = [];

  gameDocs.forEach((game) => {
    if (!Array.isArray(game.players)) return;

    game.players.forEach((p) => {
      rows.push({
        // Identity — used as React key and for deduplication
        id: `${game.gameId}-${p.turnOrder}`,

        // Game-level fields
        gameId:     game.gameId,
        date:       game.date ? new Date(game.date) : null,
        dateString: game.dateString || '',
        bracket:    p.bracket ?? game.bracket ?? null,

        // Player-level fields
        player:      p.player || '',
        commander:   p.commander || '',
        colorId:     Array.isArray(p.colorId) ? p.colorId : [],
        colorIdString: Array.isArray(p.colorId) ? p.colorId.join(',') : '',
        turnOrder:   p.turnOrder || 0,
        result:      p.result || '',
        isWin:       p.isWin === true || p.result === 'Win',

        // Advanced stats
        lastTurn:     p.lastTurn ?? null,
        winCondition: p.winCondition ?? null,
      });
    });
  });

  // Sort chronologically (oldest first), matching original Sheets row order
  rows.sort((a, b) => {
    if (a.date && b.date) return a.date - b.date;
    return a.gameId.localeCompare(b.gameId);
  });

  return rows;
};

// ─── Provider ─────────────────────────────────────────────────────────────────

export const SheetDataProvider = ({ children, currentPlaygroup }) => {
  const [games, setGames]       = useState([]);
  const [rawDocs, setRawDocs]   = useState([]);   // raw Firestore docs, for admin editor
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError]       = useState(null);
  const [lastFetch, setLastFetch] = useState(null);

  const fetchGameData = async () => {
    if (!currentPlaygroup?.spreadsheetId) {
      setGames([]);
      setRawDocs([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('Fetching game data from Firestore for:', currentPlaygroup.name);

      const docs = await getAllGames(currentPlaygroup.spreadsheetId);
      const flat = flattenGames(docs);

      console.log(`Loaded ${docs.length} games (${flat.length} player rows) from Firestore`);

      setRawDocs(docs);
      setGames(flat);
      setLastFetch(new Date());
    } catch (err) {
      console.error('Error fetching game data:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Refetch when playgroup changes
  useEffect(() => {
    fetchGameData();
  }, [currentPlaygroup?.spreadsheetId]);

  const refresh = () => fetchGameData();

  // refreshSession kept for API compatibility — no-op now that there's no OAuth token
  const refreshSession = async () => {
    setError(null);
    await fetchGameData();
  };

  const value = {
    games,       // flat per-player rows — same shape as before
    rawDocs,     // raw game documents — used by admin editor (Step 6)
    rawData: rawDocs, // alias for any code that references rawData
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
