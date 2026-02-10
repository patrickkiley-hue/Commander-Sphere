import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSheetData } from '../context/SheetDataContext';
import { getLastSession } from '../utils/statsCalculations';
import { getDisplayName } from '../utils/deckNameUtils';
import ColorMana from '../components/ColorMana';
import scryfallService from '../services/scryfallService';
import './BlankPage.css';
import './UniqueDecksPage.css';

function UniqueDecksPage() {
  const navigate = useNavigate();
  const { games, isLoading } = useSheetData();
  const [commanderArts, setCommanderArts] = useState({});
  
  const lastSessionGames = getLastSession(games);
  
  // Track decks with first appearance and all pilots
  const deckMap = {};
  const deckOrder = [];
  
  // Sort games by gameId and turn order to ensure proper appearance order
  const sortedGames = [...lastSessionGames].sort((a, b) => {
    if (a.gameId !== b.gameId) {
      return a.gameId.localeCompare(b.gameId);
    }
    return (a.turnOrder || 999) - (b.turnOrder || 999);
  });
  
  sortedGames.forEach(game => {
    const commander = game.commander;
    if (!commander) return;
    
    if (!deckMap[commander]) {
      deckMap[commander] = {
        name: commander,
        colors: game.colorId || [],
        pilots: [],
        firstAppearance: deckOrder.length
      };
      deckOrder.push(commander);
    }
    
    // Add pilot if not already in list
    if (!deckMap[commander].pilots.includes(game.player)) {
      deckMap[commander].pilots.push(game.player);
    }
  });
  
  // Get decks in order of first appearance
  const decks = deckOrder.map(name => deckMap[name]);

  // Fetch commander art from Scryfall
  useEffect(() => {
    const fetchCommanderArts = async () => {
      const arts = {};
      
      for (const deck of decks) {
        try {
          // Check if this is a partner/background combo (contains " // ")
          const commanders = deck.name.split(' // ').map(name => name.trim());
          
          if (commanders.length === 2) {
            // Two commanders - fetch both arts
            const [art1, art2] = await Promise.all([
              scryfallService.getCommanderByName(commanders[0]),
              scryfallService.getCommanderByName(commanders[1])
            ]);
            
            arts[deck.name] = {
              type: 'dual',
              art1: scryfallService.getArtCrop(art1),
              art2: scryfallService.getArtCrop(art2)
            };
          } else {
            // Single commander
            const card = await scryfallService.getCommanderByName(deck.name);
            arts[deck.name] = {
              type: 'single',
              art: scryfallService.getArtCrop(card)
            };
          }
        } catch (error) {
          console.error(`Failed to fetch art for ${deck.name}:`, error);
          // Don't set art for this commander - will show without image
        }
      }
      
      setCommanderArts(arts);
    };
    
    if (decks.length > 0) {
      fetchCommanderArts();
    }
  }, [decks.length]); // Only re-fetch if number of decks changes

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
