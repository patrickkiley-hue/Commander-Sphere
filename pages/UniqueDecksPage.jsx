import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSheetData } from '../context/GameDataContext';
import { getLastSession } from '../utils/statsCalculations';
import { getDisplayName } from '../utils/deckNameUtils';
import ColorMana from '../components/ColorMana';
import scryfallService from '../services/scryfallService';
import './BlankPage.css';
import './UniqueDecksPage.css';

function UniqueDecksPage() {
  const navigate = useNavigate();
  const { rawDocs: games, isLoading } = useSheetData();
  const [commanderArts, setCommanderArts] = useState({});
  
  const lastSessionGames = getLastSession(games);
  
  // Track decks with first appearance and all pilots
  const deckMap = {};
  const deckOrder = [];
  
  // Sort games by gameId and turn order to ensure proper appearance order
  // Games docs are already sorted by gameId; players within each doc are sorted by turnOrder
  const sortedGames = [...lastSessionGames].sort((a, b) => a.gameId.localeCompare(b.gameId));
  
  sortedGames.forEach(game => {
    game.players.forEach(p => {
      const commander = p.commander;
      if (!commander) return;

      if (!deckMap[commander]) {
        deckMap[commander] = {
          name: commander,
          colors: p.colorId || [],
          pilots: [],
          firstAppearance: deckOrder.length
        };
        deckOrder.push(commander);
      }

      if (!deckMap[commander].pilots.includes(p.player)) {
        deckMap[commander].pilots.push(p.player);
      }
    });
  });
  
  // Get decks in order of first appearance
  const decks = deckOrder.map(name => deckMap[name]);

  // Fetch commander art from Scryfall in batches.
  // Batches of 3 with 400ms between batches keeps us well under Scryfall's
  // 10 req/s limit (partners fire 2 requests per deck, so 3 decks = up to 6 req).
  // We use a stable deck name key so the effect only re-runs when the actual
  // deck list changes, not on every render.
  const deckNamesKey = decks.map(d => d.name).join('|');

  useEffect(() => {
    if (decks.length === 0) return;

    let cancelled = false;
    const BATCH_SIZE = 3;
    const BATCH_DELAY_MS = 400;

    const fetchCommanderArts = async () => {
      for (let i = 0; i < decks.length; i += BATCH_SIZE) {
        if (cancelled) break;

        const batch = decks.slice(i, i + BATCH_SIZE);
        const batchArts = {};

        await Promise.all(
          batch.map(async (deck) => {
            try {
              const commanders = deck.name.split(' // ').map(n => n.trim());

              if (commanders.length === 2) {
                const [art1, art2] = await Promise.all([
                  scryfallService.getCommanderByName(commanders[0]),
                  scryfallService.getCommanderByName(commanders[1]),
                ]);
                batchArts[deck.name] = {
                  type: 'dual',
                  art1: scryfallService.getArtCrop(art1),
                  art2: scryfallService.getArtCrop(art2),
                };
              } else {
                const card = await scryfallService.getCommanderByName(deck.name);
                batchArts[deck.name] = {
                  type: 'single',
                  art: scryfallService.getArtCrop(card),
                };
              }
            } catch (error) {
              console.error(`Failed to fetch art for ${deck.name}:`, error);
            }
          })
        );

        if (!cancelled) {
          setCommanderArts(prev => ({ ...prev, ...batchArts }));
        }

        // Delay before next batch (skip delay after the last batch)
        if (!cancelled && i + BATCH_SIZE < decks.length) {
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
        }
      }
    };

    fetchCommanderArts();

    // Cleanup: if the component unmounts or deck list changes mid-fetch, stop
    return () => { cancelled = true; };
  }, [deckNamesKey]); // Re-run only when the actual deck names change

  return (
    <div className="blank-page">
      <button className="back-button" onClick={() => navigate('/')}>
        ← Back to Home
      </button>
      
      <div className="page-content">
        <h1 className="decks-page-title">Decks Played This Week</h1>

        {isLoading ? (
          <p className="loading-message">Loading...</p>
        ) : decks.length === 0 ? (
          <p className="empty-message">No decks played yet</p>
        ) : (
          <div className="decks-list">
            {decks.map((deck, index) => {
              const artData = commanderArts[deck.name];
              
              return (
                <div key={index} className="deck-box">
                  <div className="deck-info">
                    <div className="deck-name-line">
                      <span className="deck-name">{getDisplayName(deck.name)}</span>
                    </div>
                    <div className="deck-colors">
                      <ColorMana colors={deck.colors} size="small" />
                    </div>
                    <div className="deck-pilots">
                      {deck.pilots.join(', ')}
                    </div>
                  </div>
                  
                  {artData && (
                    <div className="deck-art">
                      {artData.type === 'single' ? (
                        <img src={artData.art} alt={deck.name} className="commander-art-single" />
                      ) : (
                        <div className="commander-art-dual">
                          <img src={artData.art1} alt="Commander 1" className="commander-art-left" />
                          <img src={artData.art2} alt="Commander 2" className="commander-art-right" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default UniqueDecksPage;
