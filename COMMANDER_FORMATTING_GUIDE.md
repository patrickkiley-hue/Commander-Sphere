# Commander Name Formatting - Usage Guide

## Overview

The app now has centralized logic for handling commander names in two contexts:
1. **Storage** - How commander names are saved to Google Sheets
2. **Display** - How commander names are shown to users in the UI

## Storage Format (`scryfallService.js`)

### New Functions

#### `isDFC(card)`
Detects if a Scryfall card is a double-faced card.

```javascript
import scryfallService from './services/scryfallService';

const card = await scryfallService.getCommanderByName('Etali, Primal Conqueror');
const isDFC = scryfallService.isDFC(card);
// Returns: true (transform layout)
```

**DFC Layouts Detected:**
- `transform` - Transforming DFCs (werewolves, Praetors, etc.)
- `modal_dfc` - Modal DFCs (MDFCs from Zendikar, etc.)
- `double_faced_token` - Double-faced tokens
- `reversible_card` - Reversible cards

#### `getFrontFaceName(card)`
Extracts only the front face name from a card (removes backside for DFCs).

```javascript
const card = await scryfallService.getCommanderByName('Etali, Primal Conqueror');
const frontName = scryfallService.getFrontFaceName(card);
// Returns: "Etali, Primal Conqueror"
// (even if Scryfall returns "Etali, Primal Conqueror // Etali, Primal Sickness")
```

#### `formatCommanderForStorage(cardOrCards)`
**Main function** - Formats commander(s) correctly for Google Sheets storage.

**Single Commander (including DFCs):**
```javascript
// DFC example
const etali = await scryfallService.getCommanderByName('Etali, Primal Conqueror');
const storageName = scryfallService.formatCommanderForStorage(etali);
// Returns: "Etali, Primal Conqueror"

// Regular single commander
const atraxa = await scryfallService.getCommanderByName('Atraxa, Grand Unifier');
const storageName = scryfallService.formatCommanderForStorage(atraxa);
// Returns: "Atraxa, Grand Unifier"
```

**Partner Commanders / Backgrounds:**
```javascript
const ishai = await scryfallService.getCommanderByName('Ishai, Ojutai Dragonspeaker');
const kediss = await scryfallService.getCommanderByName('Kediss, Emberclaw Familiar');

const storageName = scryfallService.formatCommanderForStorage([ishai, kediss]);
// Returns: "Ishai, Ojutai Dragonspeaker // Kediss, Emberclaw Familiar"
```

---

## Display Format (`deckNameUtils.js`)

### Updated Function

#### `getDisplayName(deckName)`
Simplified - no longer needs to check for DFC backsides since they won't be in storage.

**Single Commanders (including DFCs):**
```javascript
import { getDisplayName } from './utils/deckNameUtils';

// DFC - only front face stored
const displayName = getDisplayName('Etali, Primal Conqueror');
// Returns: "Etali, Primal Conqueror"

// Regular commander
const displayName = getDisplayName('Atraxa, Grand Unifier');
// Returns: "Atraxa, Grand Unifier"
```

**Partner Commanders:**
```javascript
const displayName = getDisplayName('Ishai, Ojutai Dragonspeaker // Kediss, Emberclaw Familiar');
// Returns: "Ishai & Kediss"
```

---

## Complete Workflow Examples

### Example 1: Track Game with Single Commander (DFC)

```javascript
import scryfallService from './services/scryfallService';
import firebaseAuthService from './services/firebaseAuth';
import { generateNextGameId } from './utils/firestoreHelpers';

// 1. User searches for commander
const card = await scryfallService.getCommanderByName('Etali, Primal Conqueror');

// 2. Format for storage (removes backside if DFC)
const commanderName = scryfallService.formatCommanderForStorage(card);
// "Etali, Primal Conqueror"

// 3. Get color identity
const colorId = scryfallService.getColorIdentity(card);
// ['R', 'G']

// 4. Generate game ID
const gameId = await generateNextGameId(spreadsheetId, '1/30/2026');

// 5. Save to Sheets
await firebaseAuthService.appendGameToSheet(spreadsheetId, {
  date: new Date('1/30/2026'),
  gameId,
  player: 'Alice',
  commander: commanderName, // "Etali, Primal Conqueror"
  colorId,
  turnOrder: 1,
  result: 'Win',
  lastTurn: 10,
  winCondition: 'Combo',
  bracket: 4
});
```

### Example 2: Track Game with Partner Commanders

```javascript
// 1. User selects two commanders
const ishai = await scryfallService.getCommanderByName('Ishai, Ojutai Dragonspeaker');
const kediss = await scryfallService.getCommanderByName('Kediss, Emberclaw Familiar');

// 2. Format for storage
const commanderName = scryfallService.formatCommanderForStorage([ishai, kediss]);
// "Ishai, Ojutai Dragonspeaker // Kediss, Emberclaw Familiar"

// 3. Get combined color identity
const colorId1 = scryfallService.getColorIdentity(ishai);
const colorId2 = scryfallService.getColorIdentity(kediss);
const combinedColors = [...new Set([...colorId1, ...colorId2])];
// ['W', 'U', 'R']

// 4. Save to Sheets
await firebaseAuthService.appendGameToSheet(spreadsheetId, {
  date: new Date('1/30/2026'),
  gameId: '001-A01',
  player: 'Bob',
  commander: commanderName, // "Ishai, Ojutai Dragonspeaker // Kediss, Emberclaw Familiar"
  colorId: combinedColors,
  turnOrder: 2,
  result: 'Loss',
  lastTurn: 10,
  winCondition: '',
  bracket: 3
});
```

### Example 3: Display Commanders in UI

```javascript
import { getDisplayName } from './utils/deckNameUtils';
import { useSheetData } from './context/SheetDataContext';

function MyComponent() {
  const { games } = useSheetData();
  
  return (
    <div>
      {games.map(game => (
        <div key={game.id}>
          <h3>{getDisplayName(game.commander)}</h3>
          {/* 
            DFC: "Etali, Primal Conqueror" → "Etali, Primal Conqueror"
            Partners: "Ishai, Ojutai Dragonspeaker // Kediss, Emberclaw Familiar" → "Ishai & Kediss"
            Single: "Atraxa, Grand Unifier" → "Atraxa, Grand Unifier"
          */}
        </div>
      ))}
    </div>
  );
}
```

---

## Testing Checklist

### Storage Tests (scryfallService.js)

- [ ] **isDFC() correctly identifies:**
  - [ ] Transform DFCs (e.g., Etali, Werewolves)
  - [ ] Modal DFCs (e.g., MDFCs from Zendikar)
  - [ ] Returns false for regular commanders
  - [ ] Returns false for partners

- [ ] **getFrontFaceName() returns:**
  - [ ] Front face only for DFCs with " // " in name
  - [ ] Front face from card_faces for DFCs without " // "
  - [ ] Full name for regular commanders

- [ ] **formatCommanderForStorage() returns:**
  - [ ] Front face only for single DFC
  - [ ] Full name for single regular commander
  - [ ] "Card1 // Card2" for partners (array of 2 cards)
  - [ ] Front faces only for partner DFCs (removes backsides)

### Display Tests (deckNameUtils.js)

- [ ] **getDisplayName() returns:**
  - [ ] "Name1 & Name2" for partners
  - [ ] Full name for single commanders
  - [ ] Full name for DFCs (no backside in storage to check)

### Integration Tests

- [ ] Track game with DFC → Sheets contains only front face
- [ ] Track game with partners → Sheets contains "Card1 // Card2"
- [ ] Display shows abbreviated partners correctly
- [ ] Display shows DFCs with full front face name
- [ ] Color identity combines correctly for partners

---

## Important Notes

1. **Always use `formatCommanderForStorage()` before writing to Sheets**
   - This ensures DFC backsides are never stored
   - Handles both single and partner commanders

2. **Partner detection is simple now:**
   - If storage contains " // " → it's partners
   - No need to check matching names (DFCs won't have backsides)

3. **Scryfall API caching:**
   - Cards are cached for 7 days
   - Cache key is the card name
   - Multiple lookups of same card won't hit API

4. **Error handling:**
   - `formatCommanderForStorage()` throws if partners array is invalid
   - Always wrap in try-catch when calling Scryfall API

---

## Migration Notes

If you have existing data in Sheets with DFC backsides (e.g., "Etali, Primal Conqueror // Etali, Primal Sickness"), the display function will still work correctly because it falls back to showing the full name. However, for consistency, you may want to run a cleanup script:

```javascript
// Pseudocode for cleanup script
async function cleanupDFCBacksides(spreadsheetId) {
  const allGames = await firebaseAuthService.getSheetData(spreadsheetId);
  
  for (const row of allGames) {
    const commander = row[3]; // Commander column
    
    if (commander.includes(' // ')) {
      const sides = commander.split(' // ');
      const firstName1 = sides[0].split(',')[0].trim();
      const firstName2 = sides[1].split(',')[0].trim();
      
      // Same first name = DFC, remove backside
      if (firstName1 === firstName2) {
        // Update row to only have front face
        // (implementation depends on your update mechanism)
      }
    }
  }
}
```
