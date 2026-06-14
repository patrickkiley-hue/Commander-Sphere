import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
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
    const profileComplete = await checkProfileComplete();
    if (!profileComplete) { setShowProfilePrompt(true); return; }

    if (!joinInput.trim()) {
      setError('Please enter a join code');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const playgroup = await findPlaygroupByJoinCode(joinInput.trim());

      if (!playgroup) {
        setError('Invalid join code. Please check and try again.');
        setIsLoading(false);
        return;
      }

      const { spreadsheetId } = playgroup;
      const existingPlaygroups = JSON.parse(localStorage.getItem('joinedPlaygroups') || '[]');

      if (existingPlaygroups.some(pg => pg.spreadsheetId === spreadsheetId)) {
        setError('You have already joined this playgroup');
        setIsLoading(false);
        return;
      }

      const playgroupInfo = {
        name: playgroup.name,
        spreadsheetId,
        role: 'member',
        joinedAt: new Date().toISOString()
      };

      existingPlaygroups.push(playgroupInfo);

      const user = auth.currentUser;
      if (user) {
        await addMemberToPlaygroup(spreadsheetId, user.uid);
        await saveAllPlaygroupData(user.uid, playgroupInfo, existingPlaygroups);
      }

      localStorage.setItem('joinedPlaygroups', JSON.stringify(existingPlaygroups));
      localStorage.setItem('currentPlaygroup', JSON.stringify(playgroupInfo));

      if (onPlaygroupCreated) onPlaygroupCreated(playgroupInfo);
      onClose();
    } catch (err) {
      console.error('Join error:', err);
      setError(err.message || 'Failed to join playgroup');
      setIsLoading(false);
    }
  };

  const handleHost = async () => {
    const profileComplete = await checkProfileComplete();
    if (!profileComplete) { setShowProfilePrompt(true); return; }

    if (!playgroupName.trim()) {
      setError('Please enter a playgroup name');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Not signed in');

      // Generate a unique playgroup ID (replaces the old spreadsheetId)
      const playgroupId = `pg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // Initialize playgroup document in Firestore
      await initializePlaygroup(playgroupId, playgroupName, user.uid);

      const playgroupInfo = {
        name: playgroupName,
        spreadsheetId: playgroupId,
        role: 'admin',
        createdAt: new Date().toISOString()
      };

      const existingPlaygroups = JSON.parse(localStorage.getItem('joinedPlaygroups') || '[]');
      const updatedPlaygroups = [...existingPlaygroups, playgroupInfo];

      await saveAllPlaygroupData(user.uid, playgroupInfo, updatedPlaygroups);

      localStorage.setItem('joinedPlaygroups', JSON.stringify(updatedPlaygroups));
      localStorage.setItem('currentPlaygroup', JSON.stringify(playgroupInfo));

      if (onPlaygroupCreated) onPlaygroupCreated(playgroupInfo);
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
              <input
                type="text"
                className="modal-input"
                placeholder="Enter 6-character join code..."
                value={joinInput}
                onChange={(e) => setJoinInput(e.target.value.toUpperCase())}
                disabled={isLoading}
                maxLength={6}
                style={{ textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 600 }}
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
                <p>This will create a new playgroup in the database. Share your join code with players so they can join.</p>
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
