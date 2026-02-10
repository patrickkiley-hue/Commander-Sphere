import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import firebaseAuthService from '../services/firebaseAuth';
import { saveAllPlaygroupData, initializePlaygroup, addMemberToPlaygroup, loadUserProfile, findPlaygroupByJoinCode } from '../utils/firestoreHelpers';
import './JoinHostModal.css';

function JoinHostModal({ onClose, onPlaygroupCreated }) {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showProfilePrompt, setShowProfilePrompt] = useState(false);

  // Join state
  const [joinMethod, setJoinMethod] = useState('code');
  const [joinInput, setJoinInput] = useState('');

  // Host state
  const [playgroupName, setPlaygroupName] = useState('');

  // Check if user has completed their profile (name required)
  const checkProfileComplete = async () => {
    const user = auth.currentUser;
    if (!user) return false;

    try {
      const profile = await loadUserProfile(user.uid);
      return profile.name && profile.name.trim() !== '';
    } catch (err) {
      console.error('Error checking profile:', err);
      return false;
    }
  };

  const handleGoToSettings = () => {
    onClose();
    navigate('/administrator');
  };

  const handleJoin = async () => {
    // Check if profile is complete
    const profileComplete = await checkProfileComplete();
    if (!profileComplete) {
      setShowProfilePrompt(true);
      return;
    }

    if (!joinInput.trim()) {
      setError('Please enter the required information');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let spreadsheetId = null;
      let playgroupInfo = null;

      if (joinMethod === 'code') {
        // Look up playgroup by join code
        const playgroup = await findPlaygroupByJoinCode(joinInput.trim());
        
        if (!playgroup) {
          setError('Invalid join code. Please check and try again.');
          setIsLoading(false);
          return;
        }
        
        spreadsheetId = playgroup.spreadsheetId;
        
        // Create playgroup object
        playgroupInfo = {
          name: playgroup.name,
          spreadsheetId: spreadsheetId,
          spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
          role: 'member',
          joinedAt: new Date().toISOString()
        };
        
      } else if (joinMethod === 'url') {
        // Extract spreadsheet ID from URL
        spreadsheetId = firebaseAuthService.extractSpreadsheetId(joinInput);
        
        if (!spreadsheetId) {
          setError('Invalid Google Sheets URL');
          setIsLoading(false);
          return;
        }

        // Try to fetch sheet data to verify access and get playgroup name
        try {
          await firebaseAuthService.getSheetData(spreadsheetId, 'Games!A1:A1');
          
          // Get the actual sheet title
          const metadata = await firebaseAuthService.getSpreadsheetMetadata(spreadsheetId);
          let sheetTitle = metadata.properties.title;
          
          // Remove " - Commander Tracker" suffix if present
          if (sheetTitle.endsWith(' - Commander Tracker')) {
            sheetTitle = sheetTitle.replace(' - Commander Tracker', '');
          }
          
          // Create playgroup object
          playgroupInfo = {
            name: sheetTitle,
            spreadsheetId: spreadsheetId,
            spreadsheetUrl: joinInput,
            role: 'member',
            joinedAt: new Date().toISOString()
          };
        } catch (err) {
          setError('Unable to access this sheet. Please check that you have permission or ask the admin to share it with you.');
          setIsLoading(false);
          return;
        }
      }

      // Get existing playgroups from localStorage (as backup)
      const existingPlaygroups = JSON.parse(localStorage.getItem('joinedPlaygroups') || '[]');
      
      // Check if already joined
      const alreadyJoined = existingPlaygroups.some(pg => pg.spreadsheetId === spreadsheetId);
      if (alreadyJoined) {
        setError('You have already joined this playgroup');
        setIsLoading(false);
        return;
      }

      existingPlaygroups.push(playgroupInfo);
      
      // Save to Firestore
      const user = auth.currentUser;
      if (user) {
        // Add user to playgroup members
        await addMemberToPlaygroup(spreadsheetId, user.uid);
        
        await saveAllPlaygroupData(user.uid, playgroupInfo, existingPlaygroups);
      }
      
      // Also save to localStorage as backup
      localStorage.setItem('joinedPlaygroups', JSON.stringify(existingPlaygroups));
      localStorage.setItem('currentPlaygroup', JSON.stringify(playgroupInfo));

      // Notify parent and close
      if (onPlaygroupCreated) {
        onPlaygroupCreated(playgroupInfo);
      }
      onClose();
    } catch (err) {
      console.error('Join error:', err);
      setError(err.message || 'Failed to join playgroup');
      setIsLoading(false);
    }
  };

  const handleHost = async () => {
    // Check if profile is complete
    const profileComplete = await checkProfileComplete();
    if (!profileComplete) {
      setShowProfilePrompt(true);
      return;
    }

    if (!playgroupName.trim()) {
      setError('Please enter a playgroup name');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('Creating sheet with name:', `${playgroupName} - Commander Tracker`);
      
      // Create the Google Sheet with proper template
      const sheet = await firebaseAuthService.createSheet(`${playgroupName} - Commander Tracker`);
      
      console.log('Sheet created:', sheet);

      // Create playgroup object
      const playgroupInfo = {
        name: playgroupName,
        spreadsheetId: sheet.spreadsheetId,
        spreadsheetUrl: sheet.spreadsheetUrl,
        role: 'admin',
        createdAt: new Date().toISOString()
      };

      console.log('Playgroup info:', playgroupInfo);

      // Save as first playgroup
      const playgroups = [playgroupInfo];
      
      // Initialize playgroup document in Firestore
      const user = auth.currentUser;
      if (user) {
        await initializePlaygroup(
          sheet.spreadsheetId,
          playgroupName,
          user.uid
        );
        
        await saveAllPlaygroupData(user.uid, playgroupInfo, playgroups);
      }
      
      // Also save to localStorage as backup
      localStorage.setItem('joinedPlaygroups', JSON.stringify(playgroups));
      localStorage.setItem('currentPlaygroup', JSON.stringify(playgroupInfo));

      console.log('Saved to Firestore and localStorage');

      // Notify parent and close
      if (onPlaygroupCreated) {
        onPlaygroupCreated(playgroupInfo);
      }
      onClose();
    } catch (err) {
      console.error('Host error:', err);
      setError(err.message || 'Failed to create playgroup');
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content join-host-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Join / Host Playgroup</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="join-host-grid">
          {/* Join Playgroup - Left Side */}
          <div className="join-host-panel">
            <h3 className="panel-title">Join Playgroup</h3>
            
            <div className="panel-content">
              <div className="join-method-selector">
                <button 
                  className={`method-button ${joinMethod === 'code' ? 'active' : ''}`}
                  onClick={() => setJoinMethod('code')}
                >
                  Join Code
                </button>
                <button 
                  className={`method-button ${joinMethod === 'url' ? 'active' : ''}`}
                  onClick={() => setJoinMethod('url')}
                >
                  Google Sheets URL
                </button>
              </div>

              <input 
                type="text"
                className="modal-input"
                placeholder={
                  joinMethod === 'code' ? 'Enter 6-character join code...' :
                  'Paste Google Sheets URL here...'
                }
                value={joinInput}
                onChange={(e) => setJoinInput(e.target.value)}
                disabled={isLoading}
                maxLength={joinMethod === 'code' ? 6 : undefined}
                style={joinMethod === 'code' ? {
                  textTransform: 'uppercase',
                  letterSpacing: '2px',
                  fontWeight: 600
                } : {}}
              />

              {error && (
                <div className="error-message">{error}</div>
              )}

              <button 
                className="modal-button primary"
                onClick={handleJoin}
                disabled={isLoading}
              >
                {isLoading ? 'Joining...' : 'Join Playgroup'}
              </button>
            </div>
          </div>

          {/* Host Playgroup - Right Side */}
          <div className="join-host-panel">
            <h3 className="panel-title">Host Playgroup</h3>
            
            <div className="panel-content">
              <label className="modal-label">Playgroup Name</label>
              <input 
                type="text"
                className="modal-input"
                placeholder="e.g., Gibson St. Gaming"
                value={playgroupName}
                onChange={(e) => setPlaygroupName(e.target.value)}
                disabled={isLoading}
              />

              <div className="info-box">
                <p>This will create a new Google Sheet in your Drive with the proper format for tracking Commander games.</p>
              </div>

              {error && (
                <div className="error-message">{error}</div>
              )}

              <button 
                className="modal-button primary"
                onClick={handleHost}
                disabled={isLoading}
              >
                {isLoading ? 'Creating...' : 'Create Playgroup'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Profile Setup Prompt */}
      {showProfilePrompt && (
        <div className="modal-overlay" onClick={() => setShowProfilePrompt(false)}>
          <div 
            className="modal-content" 
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '500px' }}
          >
            <div className="modal-header">
              <h2>Profile Setup Required</h2>
              <button className="modal-close" onClick={() => setShowProfilePrompt(false)}>×</button>
            </div>
            
            <div style={{ padding: '20px' }}>
              <p style={{ 
                fontSize: '16px', 
                color: 'rgba(255, 255, 255, 0.8)', 
                lineHeight: '1.6',
                marginBottom: '24px'
              }}>
                Please complete your profile before joining or hosting a playgroup. This helps other players identify you.
              </p>
              
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button 
                  className="modal-button secondary"
                  onClick={() => setShowProfilePrompt(false)}
                >
                  Cancel
                </button>
                <button 
                  className="modal-button primary"
                  onClick={handleGoToSettings}
                >
                  Go to Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default JoinHostModal;
