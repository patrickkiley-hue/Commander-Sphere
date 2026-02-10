import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import firebaseAuthService from '../services/firebaseAuth';
import { saveAllPlaygroupData, addMemberToPlaygroup, initializePlaygroup } from '../utils/firestoreHelpers';
import './SwitchPlaygroupModal.css';

function SwitchPlaygroupModal({ 
  currentPlaygroup, 
  setCurrentPlaygroup, 
  joinedPlaygroups, 
  setJoinedPlaygroups,
  onClose 
}) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('switch');
  const [selectedPlaygroupIndex, setSelectedPlaygroupIndex] = useState(
    joinedPlaygroups.findIndex(pg => pg.spreadsheetId === currentPlaygroup?.spreadsheetId)
  );
  const [joinMethod, setJoinMethod] = useState('phone');
  const [joinInput, setJoinInput] = useState('');
  const [playgroupName, setPlaygroupName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSwitch = async () => {
    if (selectedPlaygroupIndex >= 0 && selectedPlaygroupIndex < joinedPlaygroups.length) {
      const selectedPlaygroup = joinedPlaygroups[selectedPlaygroupIndex];
      setCurrentPlaygroup(selectedPlaygroup);
      
      // Save to Firestore
      const user = auth.currentUser;
      if (user) {
        await saveAllPlaygroupData(user.uid, selectedPlaygroup, joinedPlaygroups);
      }
      
      // Also save to localStorage as backup
      localStorage.setItem('currentPlaygroup', JSON.stringify(selectedPlaygroup));
      
      onClose();
      // Refresh the page to load new playgroup data
      window.location.reload();
    }
  };

  const handleJoin = async () => {
    if (!joinInput.trim()) {
      setError('Please enter the required information');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let spreadsheetId = null;
      let playgroupInfo = null;

      if (joinMethod === 'url') {
        // Extract spreadsheet ID from URL
        spreadsheetId = firebaseAuthService.extractSpreadsheetId(joinInput);
        
        if (!spreadsheetId) {
          setError('Invalid Google Sheets URL');
          setIsLoading(false);
          return;
        }

        // Try to fetch sheet data to verify access
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
          setError('Unable to access this sheet. Please check that you have permission.');
          setIsLoading(false);
          return;
        }
      } else {
        setError(`Join requests via ${joinMethod} will be available when admin notifications are implemented. Please use Google Sheets URL for now.`);
        setIsLoading(false);
        return;
      }

      // Check if already joined
      const alreadyJoined = joinedPlaygroups.some(pg => pg.spreadsheetId === spreadsheetId);
      if (alreadyJoined) {
        setError('You have already joined this playgroup');
        setIsLoading(false);
        return;
      }

      // Add to joined playgroups
      const updatedPlaygroups = [...joinedPlaygroups, playgroupInfo];
      setJoinedPlaygroups(updatedPlaygroups);
      
      // Save to Firestore
      const user = auth.currentUser;
      if (user) {
        // Add user to playgroup members
        await addMemberToPlaygroup(spreadsheetId, user.uid);
        
        await saveAllPlaygroupData(user.uid, currentPlaygroup, updatedPlaygroups);
      }
      
      // Also save to localStorage as backup
      localStorage.setItem('joinedPlaygroups', JSON.stringify(updatedPlaygroups));

      setJoinInput('');
      setError(null);
      setIsLoading(false);
      alert('Successfully joined playgroup!');
      onClose();
    } catch (err) {
      console.error('Join error:', err);
      setError(err.message || 'Failed to join playgroup');
      setIsLoading(false);
    }
  };

  const handleHost = async () => {
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

      // Add to existing playgroups
      const updatedPlaygroups = [...joinedPlaygroups, playgroupInfo];
      setJoinedPlaygroups(updatedPlaygroups);
      
      // Save to Firestore
      const user = auth.currentUser;
      if (user) {
        // Initialize playgroup document
        await initializePlaygroup(
          sheet.spreadsheetId,
          playgroupName,
          user.uid
        );
        
        await saveAllPlaygroupData(user.uid, playgroupInfo, updatedPlaygroups);
      }
      
      // Also save to localStorage as backup
      localStorage.setItem('joinedPlaygroups', JSON.stringify(updatedPlaygroups));
      localStorage.setItem('currentPlaygroup', JSON.stringify(playgroupInfo));

      console.log('Saved to Firestore and localStorage');

      // Switch to the new playgroup
      setCurrentPlaygroup(playgroupInfo);
      
      setPlaygroupName('');
      setError(null);
      setIsLoading(false);
      alert('Playgroup created successfully!');
      onClose();
      
      // Reload to show new playgroup data
      window.location.reload();
    } catch (err) {
      console.error('Host error:', err);
      setError(err.message || 'Failed to create playgroup');
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Switch Playgroup</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-tabs">
          <button 
            className={`modal-tab ${activeTab === 'switch' ? 'active' : ''}`}
            onClick={() => setActiveTab('switch')}
          >
            Switch Playgroup
          </button>
          <button 
            className={`modal-tab ${activeTab === 'join' ? 'active' : ''}`}
            onClick={() => setActiveTab('join')}
          >
            Join Playgroup
          </button>
          <button 
            className={`modal-tab ${activeTab === 'host' ? 'active' : ''}`}
            onClick={() => setActiveTab('host')}
          >
            Host Playgroup
          </button>
        </div>

        <div className="modal-body">
          {activeTab === 'switch' ? (
            <div className="switch-tab">
              <select 
                className="modal-select"
                value={selectedPlaygroupIndex}
                onChange={(e) => setSelectedPlaygroupIndex(parseInt(e.target.value))}
              >
                {joinedPlaygroups.map((playgroup, index) => (
                  <option key={index} value={index}>
                    {playgroup.name} {playgroup.role === 'admin' ? '(Admin)' : ''}
                  </option>
                ))}
              </select>
              <button 
                className="modal-button primary"
                onClick={handleSwitch}
                disabled={selectedPlaygroupIndex === joinedPlaygroups.findIndex(pg => pg.spreadsheetId === currentPlaygroup?.spreadsheetId)}
              >
                {selectedPlaygroupIndex === joinedPlaygroups.findIndex(pg => pg.spreadsheetId === currentPlaygroup?.spreadsheetId)
                  ? 'Currently Selected'
                  : `Switch to ${joinedPlaygroups[selectedPlaygroupIndex]?.name}`}
              </button>
            </div>
          ) : activeTab === 'join' ? (
            <div className="join-tab">
              <div className="join-method-selector">
                <button 
                  className={`method-button ${joinMethod === 'phone' ? 'active' : ''}`}
                  onClick={() => setJoinMethod('phone')}
                >
                  Phone Number
                </button>
                <button 
                  className={`method-button ${joinMethod === 'discord' ? 'active' : ''}`}
                  onClick={() => setJoinMethod('discord')}
                >
                  Discord
                </button>
                <button 
                  className={`method-button ${joinMethod === 'email' ? 'active' : ''}`}
                  onClick={() => setJoinMethod('email')}
                >
                  Email
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
                  joinMethod === 'phone' ? 'Enter admin phone number...' :
                  joinMethod === 'discord' ? 'Enter admin Discord username...' :
                  joinMethod === 'email' ? 'Enter admin email...' :
                  'Paste Google Sheets URL here...'
                }
                value={joinInput}
                onChange={(e) => setJoinInput(e.target.value)}
                disabled={isLoading}
              />

              {error && (
                <div className="error-message">
                  {error}
                </div>
              )}

              <button 
                className="modal-button primary"
                onClick={handleJoin}
                disabled={isLoading}
              >
                {isLoading ? 'Joining...' : 'Join Playgroup'}
              </button>
            </div>
          ) : (
            <div className="host-tab">
              <input 
                type="text"
                className="modal-input"
                placeholder="Name Your Playgroup"
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
          )}
        </div>
      </div>
    </div>
  );
}

export default SwitchPlaygroupModal;
