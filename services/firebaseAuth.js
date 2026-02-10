// src/services/firebaseAuth.js
import { signInWithPopup, signOut as firebaseSignOut, GoogleAuthProvider } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';

class FirebaseAuthService {
  constructor() {
    this.accessToken = null;
    this.tokenExpiry = null;
    this.userInfo = null;
    
    // Try to restore token from localStorage
    this.restoreToken();
  }

  // Restore token from localStorage if available
  restoreToken() {
    try {
      const savedToken = localStorage.getItem('googleAccessToken');
      const savedExpiry = localStorage.getItem('googleTokenExpiry');
      
      if (savedToken && savedExpiry) {
        const expiry = parseInt(savedExpiry);
        if (Date.now() < expiry) {
          this.accessToken = savedToken;
          this.tokenExpiry = expiry;
          console.log('Restored Google access token from localStorage');
        } else {
          // Token expired, clean up
          localStorage.removeItem('googleAccessToken');
          localStorage.removeItem('googleTokenExpiry');
        }
      }
    } catch (error) {
      console.error('Error restoring token:', error);
    }
  }

  // Save token to localStorage
  saveToken(accessToken, expiresIn) {
    this.accessToken = accessToken;
    this.tokenExpiry = Date.now() + (expiresIn * 1000);
    
    localStorage.setItem('googleAccessToken', accessToken);
    localStorage.setItem('googleTokenExpiry', this.tokenExpiry.toString());
  }

  // Sign in with Firebase Google OAuth
  async signIn() {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      
      // Get the Google OAuth credential from the result
      const credential = GoogleAuthProvider.credentialFromResult(result);
      
      if (!credential || !credential.accessToken) {
        throw new Error('Failed to get access token from Google');
      }

      this.saveToken(credential.accessToken, 3600); // Google tokens typically expire in 1 hour
      
      // Get user info from Firebase
      this.userInfo = {
        email: result.user.email,
        name: result.user.displayName,
        picture: result.user.photoURL,
        id: result.user.uid
      };

      return {
        accessToken: this.accessToken,
        userInfo: this.userInfo
      };
    } catch (error) {
      console.error('Sign-in error:', error);
      throw error;
    }
  }

  // Get user information (already available from Firebase)
  async getUserInfo() {
    if (!this.userInfo) {
      throw new Error('Not authenticated');
    }
    return this.userInfo;
  }

  // Check if token is valid
  isAuthenticated() {
    return this.accessToken && Date.now() < this.tokenExpiry;
  }

  // Check if we need to get a fresh token
  async ensureAuthenticated() {
    if (!this.isAuthenticated()) {
      // Need to sign in again to get a fresh access token
      throw new Error('Your session has expired. Please sign in again.');
    }
    return true;
  }

  // Refresh the access token if it's expired or about to expire
  async refreshTokenIfNeeded() {
    // Check if token will expire in the next 5 minutes (300,000 ms)
    const fiveMinutes = 5 * 60 * 1000;
    const willExpireSoon = this.tokenExpiry && (Date.now() + fiveMinutes) >= this.tokenExpiry;
    
    if (!this.accessToken || willExpireSoon) {
      console.log('Google Sheets token expired or expiring soon, refreshing...');
      
      try {
        // Re-authenticate to get a fresh token
        const result = await signInWithPopup(auth, googleProvider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        
        if (credential && credential.accessToken) {
          this.saveToken(credential.accessToken, 3600);
          console.log('Token refreshed successfully');
          return true;
        } else {
          throw new Error('Failed to get new access token');
        }
      } catch (error) {
        console.error('Token refresh error:', error);
        // If popup was blocked or user cancelled, throw error
        throw new Error('Please allow the sign-in popup to continue. Your Google Sheets access token expired.');
      }
    }
    
    return true; // Token is still valid
  }

  // Sign out
  async signOut() {
    await firebaseSignOut(auth);
    this.accessToken = null;
    this.tokenExpiry = null;
    this.userInfo = null;
    
    // Clear stored tokens
    localStorage.removeItem('googleAccessToken');
    localStorage.removeItem('googleTokenExpiry');
  }

  // ========== SHEETS API METHODS (keeping your existing logic) ==========

  // Create a new Google Sheet
  async createSheet(title) {
    // Refresh token if needed before making API call
    await this.refreshTokenIfNeeded();
    
    if (!this.isAuthenticated()) {
      throw new Error('Your Google session has expired. Please sign out and sign in again to refresh your access.');
    }

    const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        properties: {
          title: title
        },
        sheets: [{
          properties: {
            title: 'Games',
            gridProperties: {
              frozenRowCount: 1
            }
          },
          data: [{
            startRow: 0,
            startColumn: 0,
            rowData: [{
              values: [
                { userEnteredValue: { stringValue: 'Date' } },
                { userEnteredValue: { stringValue: 'Game' } },
                { userEnteredValue: { stringValue: 'Player' } },
                { userEnteredValue: { stringValue: 'Commander' } },
                { userEnteredValue: { stringValue: 'Color ID' } },
                { userEnteredValue: { stringValue: 'Turn Order' } },
                { userEnteredValue: { stringValue: 'Win/Loss' } },
                { userEnteredValue: { stringValue: 'Last Turn' } },
                { userEnteredValue: { stringValue: 'Win Condition' } },
                { userEnteredValue: { stringValue: 'Bracket' } }
              ]
            }]
          }]
        }]
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to create sheet: ${error.error.message}`);
    }

    const sheet = await response.json();
    
    // Automatically share the sheet with "anyone with the link can edit"
    try {
      await this.shareSheet(sheet.spreadsheetId);
      console.log('Sheet shared successfully');
    } catch (error) {
      console.error('Warning: Failed to share sheet automatically:', error);
      // Don't throw - sheet was created successfully, just not shared
    }
    
    return {
      spreadsheetId: sheet.spreadsheetId,
      spreadsheetUrl: sheet.spreadsheetUrl
    };
  }

  // Get sheet data
  async getSheetData(spreadsheetId, range = 'Games!A:J') {
    // Refresh token if needed before making API call
    await this.refreshTokenIfNeeded();
    
    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
      {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to get sheet data: ${error.error.message}`);
    }

    const data = await response.json();
    return data.values || [];
  }

  // Get spreadsheet metadata (including title)
  async getSpreadsheetMetadata(spreadsheetId) {
    // Refresh token if needed before making API call
    await this.refreshTokenIfNeeded();
    
    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title`,
      {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to get spreadsheet metadata: ${error.error.message}`);
    }

    const data = await response.json();
    return data;
  }

  // Append data to sheet
  async appendToSheet(spreadsheetId, values, range = 'Games!A:J') {
    // Refresh token if needed before making API call
    await this.refreshTokenIfNeeded();
    
    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: [values]
        })
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to append data: ${error.error.message}`);
    }

    return await response.json();
  }

  // Extract spreadsheet ID from URL
  extractSpreadsheetId(url) {
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  }

  // Share sheet with "anyone with the link can edit"
  async shareSheet(spreadsheetId) {
    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${spreadsheetId}/permissions`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'anyone',
          role: 'writer'
        })
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to share sheet: ${error.error.message}`);
    }

    return await response.json();
  }

  // Delete all rows with matching gameId
  async deleteGameRows(spreadsheetId, gameId) {
    // Refresh token if needed before making API call
    await this.refreshTokenIfNeeded();
    
    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated');
    }

    // First, get all data to find matching rows
    const data = await this.getSheetData(spreadsheetId, 'Games!A:J');
    
    if (!data || data.length <= 1) {
      // No data rows (only header or empty)
      return { deletedCount: 0 };
    }

    // Find row indices with matching gameId (column B, index 1)
    // Skip header row (index 0)
    const rowsToDelete = [];
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] === gameId) { // Column B is index 1
        rowsToDelete.push(i);
      }
    }

    if (rowsToDelete.length === 0) {
      return { deletedCount: 0 };
    }

    // Get sheetId for the Games tab
    const metadata = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
      {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      }
    );

    if (!metadata.ok) {
      throw new Error('Failed to get sheet metadata');
    }

    const metadataJson = await metadata.json();
    const gamesSheet = metadataJson.sheets.find(s => s.properties.title === 'Games');
    
    if (!gamesSheet) {
      throw new Error('Games sheet not found');
    }

    const sheetId = gamesSheet.properties.sheetId;

    // Delete rows in reverse order (bottom to top) so indices don't shift
    const requests = rowsToDelete.reverse().map(rowIndex => ({
      deleteDimension: {
        range: {
          sheetId: sheetId,
          dimension: 'ROWS',
          startIndex: rowIndex,
          endIndex: rowIndex + 1
        }
      }
    }));

    // Execute batch update
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ requests })
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to delete rows: ${error.error.message}`);
    }

    return { 
      deletedCount: rowsToDelete.length,
      deletedRows: rowsToDelete 
    };
  }

  // Start a live game by adding a row to Sheets
  async startLiveGame(spreadsheetId, gameData) {
    // Refresh token if needed before making API call
    await this.refreshTokenIfNeeded();
    
    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated');
    }

    // Format date as MM/DD/YYYY
    const date = new Date(gameData.date);
    const dateString = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;

    // Format colorId array as comma-separated string
    const colorIdString = Array.isArray(gameData.colorId) ? gameData.colorId.join(',') : gameData.colorId;

    // Prepare row data: Date, Game ID, Player, Commander, Color ID, Turn Order, (Win/Loss empty), (Last Turn empty), (Win Condition empty), (Bracket)
    const rowValues = [
      dateString,
      gameData.gameId,
      gameData.player,
      gameData.commander,
      colorIdString,
      gameData.turnOrder,
      '', // Win/Loss - empty for live game
      '', // Last Turn - empty for live game
      '', // Win Condition - empty for live game
      gameData.bracket || '' // Bracket
    ];

    // Get current data to calculate row number
    const currentData = await this.getSheetData(spreadsheetId, 'Games!A:J');
    const nextRowNumber = currentData ? currentData.length + 1 : 2; // +1 for new row (accounting for 0-indexed array)

    // Append the row
    await this.appendToSheet(spreadsheetId, rowValues, 'Games!A:J');

    return {
      rowNumber: nextRowNumber
    };
  }

  // Append a completed game to the sheet (used by TrackGamePage)
  async appendGameToSheet(spreadsheetId, gameData) {
    // Refresh token if needed before making API call
    await this.refreshTokenIfNeeded();
    
    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated');
    }

    // Format date as MM/DD/YYYY
    const date = new Date(gameData.date);
    const dateString = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;

    // Format colorId array as comma-separated string
    const colorIdString = Array.isArray(gameData.colorId) ? gameData.colorId.join(',') : gameData.colorId;

    // Prepare row data: Date, Game ID, Player, Commander, Color ID, Turn Order, Result, Last Turn, Win Condition, Bracket
    const rowValues = [
      dateString,
      gameData.gameId,
      gameData.player,
      gameData.commander,
      colorIdString,
      gameData.turnOrder,
      gameData.result || '', // Win or Loss
      gameData.lastTurn || '', // Last turn (if winner)
      gameData.winCondition || '', // Win condition
      gameData.bracket || '' // Bracket
    ];

    // Append the row
    await this.appendToSheet(spreadsheetId, rowValues, 'Games!A:J');
  }

  // Complete a live game by updating an existing row (used by LiveTrackPage)
  async completeLiveGame(spreadsheetId, rowNumber, updateData) {
    // Refresh token if needed before making API call
    await this.refreshTokenIfNeeded();
    
    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated');
    }

    // Columns: G = Result, H = Last Turn, I = Win Condition
    const updates = [];
    
    // Update Result (column G)
    if (updateData.result) {
      updates.push({
        range: `Games!G${rowNumber}`,
        values: [[updateData.result]]
      });
    }

    // Update Last Turn (column H)
    if (updateData.lastTurn !== null && updateData.lastTurn !== undefined) {
      updates.push({
        range: `Games!H${rowNumber}`,
        values: [[updateData.lastTurn]]
      });
    }

    // Update Win Condition (column I)
    if (updateData.winCondition !== undefined) {
      updates.push({
        range: `Games!I${rowNumber}`,
        values: [[updateData.winCondition]]
      });
    }

    // Batch update all cells
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          valueInputOption: 'RAW',
          data: updates
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to update live game row: ${errorData.error?.message || response.statusText}`);
    }

    return await response.json();
  }
}

// Export singleton instance
const firebaseAuthService = new FirebaseAuthService();
export default firebaseAuthService;
