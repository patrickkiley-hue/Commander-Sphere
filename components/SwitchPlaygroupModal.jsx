import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
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
      setError('Please enter a join code');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { findPlaygroupByJoinCode } = await import('../utils/firestoreHelpers');
      const playgroup = await findPlaygroupByJoinCode(joinInput.trim());

      if (!playgroup) {
        setError('Invalid join code. Please check and try again.');
        setIsLoading(false);
        return;
      }

      const { spreadsheetId } = playgroup;

      if (joinedPlaygroups.some(pg => pg.spreadsheetId === spreadsheetId)) {
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

      const updatedPlaygroups = [...joinedPlaygroups, playgroupInfo];
      setJoinedPlaygroups(updatedPlaygroups);

      const user = auth.currentUser;
      if (user) {
        await addMemberToPlaygroup(spreadsheetId, user.uid);
        await saveAllPlaygroupData(user.uid, currentPlaygroup, updatedPlaygroups);
      }

      localStorage.setItem('joinedPlaygroups', JSON.stringify(updatedPlaygroups));
      setJoinInput('');
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
      const user = auth.currentUser;
      if (!user) throw new Error('Not signed in');

      const playgroupId = `pg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      await initializePlaygroup(playgroupId, playgroupName, user.uid);

      const playgroupInfo = {
        name: playgroupName,
        spreadsheetId: playgroupId,
        role: 'admin',
        createdAt: new Date().toISOString()
      };

      const updatedPlaygroups = [...joinedPlaygroups, playgroupInfo];
      setJoinedPlaygroups(updatedPlaygroups);

      await saveAllPlaygroupData(user.uid, playgroupInfo, updatedPlaygroups);

      localStorage.setItem('joinedPlaygroups', JSON.stringify(updatedPlaygroups));
      localStorage.setItem('currentPlaygroup', JSON.stringify(playgroupInfo));

      setCurrentPlaygroup(playgroupInfo);
      setPlaygroupName('');
      setIsLoading(false);
      alert('Playgroup created successfully!');
      onClose();
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
          <h2>Playgroup Select</h2>
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

{error && (
                <div className="error-message">{error}</div>
              )}

              <button 
                className="modal-button primary"
                onClick={handleHost}
                disabled={isLoading}
              >
                {isLoading ? 'Creating...' : 'Create NEW Playgroup'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SwitchPlaygroupModal;
