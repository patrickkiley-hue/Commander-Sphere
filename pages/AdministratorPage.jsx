import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import firebaseAuthService from '../services/firebaseAuth';
import { 
  saveUserProfile, 
  loadUserProfile,
  loadPlaygroupData,
  loadPlaygroupsFromFirestore,
  saveAllPlaygroupData,
  setPlaygroupPlayerMapping,
  removeMemberFromPlaygroup,
  initializePlaygroup,
  regenerateJoinCode
} from '../utils/firestoreHelpers';
import './BlankPage.css';

function AdministratorPage({ currentPlaygroup }) {
  const navigate = useNavigate();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [saveMessage, setSaveMessage] = useState('');
  
  // Contact form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [discord, setDiscord] = useState('');

  // Admin state
  const [isAdmin, setIsAdmin] = useState(false);
  const [playgroupData, setPlaygroupData] = useState(null);
  const [memberProfiles, setMemberProfiles] = useState({});
  const [playerNames, setPlayerNames] = useState([]);
  const [advancedStatsEnabled, setAdvancedStatsEnabled] = useState(false);
  const [seasonEnabled, setSeasonEnabled] = useState(false);
  const [seasonDuration, setSeasonDuration] = useState('6mos');
  const [seasonStartDate, setSeasonStartDate] = useState('');
  
  // Kick modal state
  const [showKickModal, setShowKickModal] = useState(false);
  const [kickingUser, setKickingUser] = useState(null);

  // Playgroup management state
  const [allPlaygroups, setAllPlaygroups] = useState([]);
  const [showPlaygroupConfirmModal, setShowPlaygroupConfirmModal] = useState(false);
  const [playgroupAction, setPlaygroupAction] = useState(null); // { action: 'leave'|'delete', playgroup: {...} }
  
  // Join code state
  const [joinCode, setJoinCode] = useState('');
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  // Load user profile and playgroup data on mount
  useEffect(() => {
    const loadData = async () => {
      const user = auth.currentUser;
      if (!user) {
        setIsLoading(false);
        return;
      }

      try {
        // Load user profile
        const profile = await loadUserProfile(user.uid);
        setName(profile.name || user.displayName || '');
        setEmail(profile.email || user.email || '');
        setPhone(profile.phone || '');
        setDiscord(profile.discord || '');

        // Load all user's playgroups for management section
        const userData = await loadPlaygroupsFromFirestore(user.uid);
        const playgroupsWithStatus = [];
        
        for (const pg of (userData.joinedPlaygroups || [])) {
          try {
            const pgData = await loadPlaygroupData(pg.spreadsheetId);
            playgroupsWithStatus.push({
              ...pg,
              isAdmin: pgData?.adminUserId === user.uid
            });
          } catch (err) {
            console.error(`Error loading playgroup ${pg.spreadsheetId}:`, err);
            playgroupsWithStatus.push({
              ...pg,
              isAdmin: false
            });
          }
        }
        
        setAllPlaygroups(playgroupsWithStatus);

        // Load playgroup data if user is in a playgroup
        if (currentPlaygroup?.spreadsheetId) {
          let pgData = await loadPlaygroupData(currentPlaygroup.spreadsheetId);
          
          // Initialize playgroup if it doesn't exist and user is admin
          if (!pgData && currentPlaygroup.role === 'admin') {
            await initializePlaygroup(
              currentPlaygroup.spreadsheetId,
              currentPlaygroup.name,
              user.uid
            );
            pgData = await loadPlaygroupData(currentPlaygroup.spreadsheetId);
          }

          if (pgData) {
            setPlaygroupData(pgData);
            setIsAdmin(pgData.adminUserId === user.uid);
            setAdvancedStatsEnabled(pgData.advancedStatsEnabled || false);
            setJoinCode(pgData.joinCode || '');
            
            // Load season settings
            setSeasonEnabled(pgData.seasonEnabled || false);
            if (pgData.seasonStartDate) {
              // Convert Firestore timestamp to YYYY-MM-DD format
              const date = new Date(pgData.seasonStartDate);
              setSeasonStartDate(date.toISOString().split('T')[0]);
            } else {
              // Default to today
              setSeasonStartDate(new Date().toISOString().split('T')[0]);
            }
            // Load duration (now stored as days, not sessions)
            if (pgData.seasonDuration) {
              if (pgData.seasonDuration === 91) setSeasonDuration('3mos');
              else if (pgData.seasonDuration === 182) setSeasonDuration('6mos');
              else if (pgData.seasonDuration === 365) setSeasonDuration('1year');
              else setSeasonDuration('6mos'); // Default
            } else {
              setSeasonDuration('6mos'); // Default
            }

            // Load member profiles
            const profiles = {};
            for (const memberId of (pgData.members || [])) {
              try {
                const memberProfile = await loadUserProfile(memberId);
                profiles[memberId] = memberProfile;
              } catch (err) {
                console.error(`Error loading profile for ${memberId}:`, err);
                profiles[memberId] = { name: 'Not Set Up', email: '' };
              }
            }
            setMemberProfiles(profiles);

            // Load player names from sheet
            try {
              const sheetData = await firebaseAuthService.getSheetData(
                currentPlaygroup.spreadsheetId,
                'Games!C:C'
              );
              
              // Get unique player names (skip header row)
              const names = [...new Set(
                sheetData
                  .slice(1)
                  .map(row => row[0])
                  .filter(name => name && name.trim())
              )].sort();
              
              setPlayerNames(names);
            } catch (err) {
              console.error('Error loading player names:', err);
            }
          }
        }
      } catch (error) {
        console.error('Error loading data:', error);
      }
      
      setIsLoading(false);
    };

    loadData();
  }, [currentPlaygroup]);

  // Format phone number as user types
  const handlePhoneChange = (e) => {
    const input = e.target.value.replace(/\D/g, '');
    let formatted = '';
    
    if (input.length > 0) {
      formatted = input.substring(0, 3);
    }
    if (input.length > 3) {
      formatted += '-' + input.substring(3, 6);
    }
    if (input.length > 6) {
      formatted += '-' + input.substring(6, 10);
    }
    
    setPhone(formatted);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage('');
    
    const user = auth.currentUser;
    if (!user) {
      setSaveMessage('Error: Not signed in');
      setIsSaving(false);
      return;
    }

    try {
      await saveUserProfile(user.uid, { name, email, phone, discord });
      setSaveMessage('✓ Profile saved successfully!');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      console.error('Save error:', error);
      setSaveMessage('✗ Failed to save profile');
    }
    
    setIsSaving(false);
  };

  const handleAdvancedStatsToggle = () => {
    setAdvancedStatsEnabled(!advancedStatsEnabled);
  };

  const handleSeasonToggle = () => {
    setSeasonEnabled(!seasonEnabled);
  };

  const handleSeasonDurationChange = (e) => {
    setSeasonDuration(e.target.value);
  };

  const handleSeasonStartDateChange = (e) => {
    setSeasonStartDate(e.target.value);
  };

  const handleSaveAdminSettings = async () => {
    if (!currentPlaygroup?.spreadsheetId) return;
    
    setIsSaving(true);
    setSaveMessage('');
    
    try {
      const { updateDoc, doc } = await import('firebase/firestore');
      const { db } = await import('../firebase');
      
      // Prepare update object
      const updates = {
        advancedStatsEnabled: advancedStatsEnabled
      };
      
      // Add season settings if enabled
      if (seasonEnabled) {
        let durationDays;
        switch (seasonDuration) {
          case '3mos': durationDays = 91; break;
          case '6mos': durationDays = 182; break;
          case '1year': durationDays = 365; break;
          default: durationDays = 182;
        }
        
        updates.seasonEnabled = true;
        updates.seasonDuration = durationDays;
        updates.seasonStartDate = new Date(seasonStartDate).toISOString();
      } else {
        updates.seasonEnabled = false;
      }
      
      await updateDoc(doc(db, 'playgroups', currentPlaygroup.spreadsheetId), updates);
      
      setSaveMessage('✓ Settings saved successfully!');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      console.error('Error saving admin settings:', error);
      setSaveMessage('✗ Failed to save settings');
    }
    
    setIsSaving(false);
  };

  const handleCopyJoinCode = () => {
    navigator.clipboard.writeText(joinCode);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleRegenerateJoinCode = async () => {
    if (!currentPlaygroup?.spreadsheetId) return;
    
    setIsSaving(true);
    
    try {
      const newCode = await regenerateJoinCode(currentPlaygroup.spreadsheetId);
      setJoinCode(newCode);
      setShowRegenerateModal(false);
      setSaveMessage('✓ Join code regenerated!');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      console.error('Error regenerating join code:', error);
      setSaveMessage('✗ Failed to regenerate code');
    }
    
    setIsSaving(false);
  };

  const handlePlayerMapping = async (userId, playerName) => {
    if (!currentPlaygroup?.spreadsheetId) return;
    
    try {
      await setPlaygroupPlayerMapping(currentPlaygroup.spreadsheetId, userId, playerName);
      
      // Update local state
      setPlaygroupData(prev => ({
        ...prev,
        playerMappings: {
          ...prev.playerMappings,
          [userId]: playerName
        }
      }));
    } catch (error) {
      console.error('Error setting player mapping:', error);
      alert('Failed to set player mapping');
    }
  };

  const handleKickClick = (userId) => {
    setKickingUser(userId);
    setShowKickModal(true);
  };

  const handleKickConfirm = async () => {
    if (!kickingUser || !currentPlaygroup?.spreadsheetId) return;
    
    try {
      await removeMemberFromPlaygroup(currentPlaygroup.spreadsheetId, kickingUser);
      
      // Update local state
      setPlaygroupData(prev => ({
        ...prev,
        members: prev.members.filter(id => id !== kickingUser),
        playerMappings: (() => {
          const updated = { ...prev.playerMappings };
          delete updated[kickingUser];
          return updated;
        })()
      }));
      
      const kickedProfile = { ...memberProfiles };
      delete kickedProfile[kickingUser];
      setMemberProfiles(kickedProfile);
      
      setShowKickModal(false);
      setKickingUser(null);
    } catch (error) {
      console.error('Error kicking member:', error);
      alert('Failed to kick member');
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      // Sign out from Firebase (clears IndexedDB and Google Sheets tokens)
      await firebaseAuthService.signOut();
      // Navigate to login (don't clear ALL localStorage - keeps Google OAuth consent)
      navigate('/login');
    } catch (error) {
      console.error('Sign out error:', error);
      alert('Failed to sign out. Please try again.');
      setIsSigningOut(false);
    }
  };

  const handleLeavePlaygroup = (playgroup) => {
    setPlaygroupAction({ action: 'leave', playgroup });
    setShowPlaygroupConfirmModal(true);
  };

  const handleDeletePlaygroup = (playgroup) => {
    setPlaygroupAction({ action: 'delete', playgroup });
    setShowPlaygroupConfirmModal(true);
  };

  const handlePlaygroupActionConfirm = async () => {
    if (!playgroupAction) return;

    const { action, playgroup } = playgroupAction;
    const user = auth.currentUser;
    if (!user) return;

    setIsSaving(true);

    try {
      if (action === 'leave') {
        // Remove user from playgroup members
        await removeMemberFromPlaygroup(playgroup.spreadsheetId, user.uid);
        
        // Remove from user's joined playgroups
        const updatedPlaygroups = allPlaygroups
          .filter(pg => pg.spreadsheetId !== playgroup.spreadsheetId)
          .map(({ isAdmin, ...pg }) => pg); // Remove isAdmin property
        
        // Determine new current playgroup
        const newCurrentPlaygroup = updatedPlaygroups.length > 0 ? updatedPlaygroups[0] : null;
        
        // Save to Firestore
        await saveAllPlaygroupData(user.uid, newCurrentPlaygroup, updatedPlaygroups);
        
        // Update local state
        setAllPlaygroups(updatedPlaygroups.map(pg => ({
          ...pg,
          isAdmin: false // Will be updated on next load
        })));
        
        setSaveMessage('✓ Left playgroup successfully!');
        
        // Reload page to update current playgroup
        window.location.reload();
        
      } else if (action === 'delete') {
        // Delete playgroup document
        const { deleteDoc, doc } = await import('firebase/firestore');
        const { db } = await import('../firebase');
        await deleteDoc(doc(db, 'playgroups', playgroup.spreadsheetId));
        
        // Remove from user's joined playgroups
        const updatedPlaygroups = allPlaygroups
          .filter(pg => pg.spreadsheetId !== playgroup.spreadsheetId)
          .map(({ isAdmin, ...pg }) => pg);
        
        // Determine new current playgroup
        const newCurrentPlaygroup = updatedPlaygroups.length > 0 ? updatedPlaygroups[0] : null;
        
        // Save to Firestore
        await saveAllPlaygroupData(user.uid, newCurrentPlaygroup, updatedPlaygroups);
        
        // Update local state
        setAllPlaygroups(updatedPlaygroups.map(pg => ({
          ...pg,
          isAdmin: false // Will be updated on next load
        })));
        
        setSaveMessage('✓ Playgroup deleted successfully!');
        
        // Reload page
        window.location.reload();
      }
      
      setShowPlaygroupConfirmModal(false);
      setPlaygroupAction(null);
      
    } catch (error) {
      console.error('Error with playgroup action:', error);
      setSaveMessage('✗ Failed to complete action');
    }
    
    setIsSaving(false);
  };

  // Get unlinked players (in sheet but not mapped to any user)
  const getUnlinkedPlayers = () => {
    if (!playerNames.length || !playgroupData) return [];
    
    const mappedPlayers = new Set(Object.values(playgroupData.playerMappings || {}));
    return playerNames.filter(name => !mappedPlayers.has(name));
  };

  if (isLoading) {
    return (
      <div className="blank-page">
        <div className="page-header">
          <button className="back-button" onClick={() => navigate('/')}>
            ← Back to Home
          </button>
        </div>
        <div className="page-content">
          <p style={{ color: '#ffffff', textAlign: 'center', marginTop: '40px' }}>
            Loading...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="blank-page">
      <div className="page-header">
        <button className="back-button" onClick={() => navigate('/')}>
          ← Back to Home
        </button>
        <button 
          className="sign-out-button" 
          onClick={handleSignOut}
          disabled={isSigningOut}
        >
          {isSigningOut ? 'Signing Out...' : 'Sign Out'}
        </button>
      </div>
      
      <div className="page-content">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Manage your contact information and playgroup</p>
        
        {/* Contact Information Section */}
        <div className="settings-section">
          <h2 className="section-title">Contact Information</h2>
          
          <div className="form-group">
            <label className="form-label">Name</label>
            <input
              type="text"
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your.email@example.com"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Phone Number (Optional)</label>
            <input
              type="tel"
              className="form-input"
              value={phone}
              onChange={handlePhoneChange}
              placeholder="555-123-4567"
              maxLength="12"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Discord (Optional)</label>
            <input
              type="text"
              className="form-input"
              value={discord}
              onChange={(e) => setDiscord(e.target.value)}
              placeholder="@username"
            />
          </div>

          <div className="form-actions">
            <button 
              className="save-button"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
            {saveMessage && (
              <span className={`save-message ${saveMessage.includes('✓') ? 'success' : 'error'}`}>
                {saveMessage}
              </span>
            )}
          </div>
        </div>

        {/* Admin Functions Section */}
        <div className="settings-section">
          <h2 className="section-title">Admin Functions</h2>
          
          {!currentPlaygroup ? (
            <p className="section-description">
              Join a playgroup to access admin functions
            </p>
          ) : !isAdmin ? (
            <p className="section-description">
              Switch to hosted playgroup for administrator functions
            </p>
          ) : (
            <>
              {/* Playgroup Name */}
              <div className="admin-header">
                <h3 className="admin-playgroup-name">{currentPlaygroup.name}</h3>
              </div>

              {/* Join Code Section */}
              <div style={{
                background: 'rgba(96, 165, 250, 0.1)',
                border: '2px solid rgba(96, 165, 250, 0.3)',
                borderRadius: '8px',
                padding: '20px',
                marginBottom: '24px'
              }}>
                <h3 style={{
                  fontSize: '16px',
                  fontWeight: 600,
                  color: '#60a5fa',
                  marginBottom: '12px'
                }}>
                  Playgroup Join Code
                </h3>
                <p style={{
                  fontSize: '14px',
                  color: 'rgba(255, 255, 255, 0.7)',
                  marginBottom: '16px',
                  lineHeight: '1.5'
                }}>
                  Share this code with friends to let them join your playgroup. They can enter it in the Join Playgroup modal.
                </p>
                
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  flexWrap: 'wrap'
                }}>
                  <div style={{
                    background: 'rgba(30, 58, 95, 0.5)',
                    border: '1px solid rgba(96, 165, 250, 0.4)',
                    borderRadius: '6px',
                    padding: '12px 20px',
                    fontSize: '24px',
                    fontWeight: 700,
                    letterSpacing: '4px',
                    color: '#ffffff',
                    fontFamily: 'monospace'
                  }}>
                    {joinCode || '------'}
                  </div>
                  
                  <button
                    onClick={handleCopyJoinCode}
                    style={{
                      background: 'rgba(34, 197, 94, 0.2)',
                      border: '1px solid rgba(34, 197, 94, 0.4)',
                      color: '#4ade80',
                      padding: '10px 20px',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = 'rgba(34, 197, 94, 0.3)';
                      e.target.style.borderColor = 'rgba(34, 197, 94, 0.6)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = 'rgba(34, 197, 94, 0.2)';
                      e.target.style.borderColor = 'rgba(34, 197, 94, 0.4)';
                    }}
                  >
                    {copySuccess ? '✓ Copied!' : 'Copy Code'}
                  </button>
                  
                  <button
                    onClick={() => setShowRegenerateModal(true)}
                    style={{
                      background: 'rgba(251, 191, 36, 0.1)',
                      border: '1px solid rgba(251, 191, 36, 0.3)',
                      color: '#fbbf24',
                      padding: '10px 20px',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = 'rgba(251, 191, 36, 0.2)';
                      e.target.style.borderColor = 'rgba(251, 191, 36, 0.5)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = 'rgba(251, 191, 36, 0.1)';
                      e.target.style.borderColor = 'rgba(251, 191, 36, 0.3)';
                    }}
                  >
                    Regenerate Code
                  </button>
                </div>
              </div>

              {/* Settings Container */}
              <div className="admin-settings-container">
                {/* Left: Toggles */}
                <div className="admin-toggles">
                  {/* Advanced Stats Toggle */}
                  <div className="toggle-row">
                    <label className="toggle-container">
                      <span className="toggle-label">Enable Advanced Stats</span>
                      <input
                        type="checkbox"
                        checked={advancedStatsEnabled}
                        onChange={handleAdvancedStatsToggle}
                        className="toggle-checkbox"
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                  {/* Season Toggle with Settings */}
                  <div className="toggle-row">
                    <label className="toggle-container">
                      <span className="toggle-label">Enable Seasons</span>
                      <input
                        type="checkbox"
                        checked={seasonEnabled}
                        onChange={handleSeasonToggle}
                        className="toggle-checkbox"
                      />
                      <span className="toggle-slider"></span>
                    </label>
                    
                    <div className="season-settings">
                      <div className="season-setting-group">
                        <label className="season-setting-label">Duration</label>
                        <select
                          className="season-dropdown"
                          value={seasonDuration}
                          onChange={handleSeasonDurationChange}
                          disabled={!seasonEnabled}
                        >
                          <option value="3mos">3 Months</option>
                          <option value="6mos">6 Months</option>
                          <option value="1year">1 Year</option>
                        </select>
                      </div>
                      
                      <div className="season-setting-group">
                        <label className="season-setting-label">Start Date</label>
                        <input
                          type="date"
                          className="season-date-input"
                          value={seasonStartDate}
                          onChange={handleSeasonStartDateChange}
                          max={new Date().toISOString().split('T')[0]}
                          disabled={!seasonEnabled}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: Save Button */}
                <div className="admin-save-section">
                  <button 
                    className="admin-save-button"
                    onClick={handleSaveAdminSettings}
                    disabled={isSaving}
                  >
                    {isSaving ? 'SAVING...' : 'SAVE'}
                  </button>
                  <span className="admin-save-subtitle">Save all changes</span>
                  {saveMessage && (
                    <span className={`admin-save-message ${saveMessage.includes('✓') ? 'success' : 'error'}`}>
                      {saveMessage}
                    </span>
                  )}
                </div>
              </div>

              {/* Members List */}
              <div className="members-section">
                <h4 className="subsection-title">Members</h4>
                {playgroupData?.members?.map(memberId => {
                  const profile = memberProfiles[memberId] || {};
                  const isUnmapped = !playgroupData.playerMappings?.[memberId];
                  const currentMapping = playgroupData.playerMappings?.[memberId] || '';
                  
                  return (
                    <div key={memberId} className="member-row">
                      <div className="member-info">
                        {isUnmapped && <span className="warning-icon">⚠️</span>}
                        <span className="member-name">{profile.name || 'Not Set Up'}</span>
                      </div>
                      
                      <select
                        className="player-dropdown"
                        value={currentMapping}
                        onChange={(e) => handlePlayerMapping(memberId, e.target.value)}
                      >
                        <option value="">-- Select Player --</option>
                        {playerNames.map(playerName => (
                          <option key={playerName} value={playerName}>
                            {playerName}
                          </option>
                        ))}
                      </select>
                      
                      <button
                        className="kick-button"
                        onClick={() => handleKickClick(memberId)}
                        disabled={memberId === auth.currentUser?.uid}
                        title={memberId === auth.currentUser?.uid ? "Can't kick yourself" : "Kick member"}
                      >
                        Kick
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Unlinked Players */}
              {getUnlinkedPlayers().length > 0 && (
                <div className="unlinked-section">
                  <h4 className="subsection-title">Unlinked Players</h4>
                  <p className="section-description">
                    Players in the spreadsheet who haven't been linked to a user account
                  </p>
                  <div className="unlinked-list">
                    {getUnlinkedPlayers().map(playerName => (
                      <span key={playerName} className="unlinked-player">
                        {playerName}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Manage Playgroups Section */}
        <div className="settings-section">
          <h2 className="section-title">Manage Playgroups</h2>
          
          {allPlaygroups.length === 0 ? (
            <p className="section-description">
              You are not part of any playgroups yet.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {allPlaygroups.map(playgroup => (
                <div 
                  key={playgroup.spreadsheetId} 
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '16px',
                    background: 'rgba(30, 58, 95, 0.3)',
                    border: '1px solid rgba(96, 165, 250, 0.2)',
                    borderRadius: '8px'
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ 
                      fontSize: '16px', 
                      fontWeight: 500, 
                      color: '#ffffff' 
                    }}>
                      {playgroup.name}
                    </span>
                    <span style={{ 
                      fontSize: '13px', 
                      color: playgroup.isAdmin ? '#60a5fa' : 'rgba(255, 255, 255, 0.5)',
                      fontWeight: 500
                    }}>
                      {playgroup.isAdmin ? '👑 Admin' : 'Member'}
                    </span>
                  </div>
                  
                  {playgroup.isAdmin ? (
                    <button
                      style={{
                        background: 'rgba(239, 68, 68, 0.2)',
                        border: '1px solid rgba(239, 68, 68, 0.4)',
                        color: '#fb7185',
                        padding: '8px 16px',
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onClick={() => handleDeletePlaygroup(playgroup)}
                      onMouseEnter={(e) => {
                        e.target.style.background = 'rgba(239, 68, 68, 0.3)';
                        e.target.style.borderColor = 'rgba(239, 68, 68, 0.6)';
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.background = 'rgba(239, 68, 68, 0.2)';
                        e.target.style.borderColor = 'rgba(239, 68, 68, 0.4)';
                      }}
                    >
                      Delete Group
                    </button>
                  ) : (
                    <button
                      style={{
                        background: 'rgba(96, 165, 250, 0.1)',
                        border: '1px solid rgba(96, 165, 250, 0.3)',
                        color: '#60a5fa',
                        padding: '8px 16px',
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onClick={() => handleLeavePlaygroup(playgroup)}
                      onMouseEnter={(e) => {
                        e.target.style.background = 'rgba(96, 165, 250, 0.2)';
                        e.target.style.borderColor = 'rgba(96, 165, 250, 0.5)';
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.background = 'rgba(96, 165, 250, 0.1)';
                        e.target.style.borderColor = 'rgba(96, 165, 250, 0.3)';
                      }}
                    >
                      Leave Group
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Playgroup Action Confirmation Modal */}
      {showPlaygroupConfirmModal && playgroupAction && (
        <div className="modal-overlay" onClick={() => setShowPlaygroupConfirmModal(false)}>
          <div className="kick-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="kick-modal-title">
              {playgroupAction.action === 'delete' ? 'Delete Playgroup?' : 'Leave Playgroup?'}
            </h3>
            <p className="kick-modal-text">
              {playgroupAction.action === 'delete' 
                ? `Are you sure you want to delete "${playgroupAction.playgroup.name}"? This will remove the playgroup for all members.`
                : `Are you sure you want to leave "${playgroupAction.playgroup.name}"?`
              }
            </p>
            <p className="kick-modal-note">
              {playgroupAction.action === 'delete'
                ? 'The Google Sheet will not be deleted and can be re-added later.'
                : 'You can rejoin this playgroup later if invited.'
              }
            </p>
            <div className="kick-modal-actions">
              <button
                className="kick-cancel-button"
                onClick={() => setShowPlaygroupConfirmModal(false)}
              >
                Cancel
              </button>
              <button
                className="kick-confirm-button"
                onClick={handlePlaygroupActionConfirm}
                disabled={isSaving}
              >
                {isSaving ? 'Processing...' : 'CONFIRM'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Kick Confirmation Modal */}
      {showKickModal && kickingUser && (
        <div className="modal-overlay" onClick={() => setShowKickModal(false)}>
          <div className="kick-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="kick-modal-title">Kick Player?</h3>
            <p className="kick-modal-text">
              Remove {memberProfiles[kickingUser]?.name || 'this member'} from the playgroup?
            </p>
            <p className="kick-modal-note">
              This will not affect their game stats in the spreadsheet.
            </p>
            <div className="kick-modal-actions">
              <button
                className="kick-cancel-button"
                onClick={() => setShowKickModal(false)}
              >
                Cancel
              </button>
              <button
                className="kick-confirm-button"
                onClick={handleKickConfirm}
              >
                CONFIRM
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Regenerate Code Confirmation Modal */}
      {showRegenerateModal && (
        <div className="modal-overlay" onClick={() => setShowRegenerateModal(false)}>
          <div className="kick-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="kick-modal-title">Regenerate Join Code?</h3>
            <p className="kick-modal-text">
              This will invalidate the current code ({joinCode}) and create a new one.
            </p>
            <p className="kick-modal-note">
              Anyone with the old code will no longer be able to join. You'll need to share the new code.
            </p>
            <div className="kick-modal-actions">
              <button
                className="kick-cancel-button"
                onClick={() => setShowRegenerateModal(false)}
              >
                Cancel
              </button>
              <button
                className="kick-confirm-button"
                onClick={handleRegenerateJoinCode}
                disabled={isSaving}
              >
                {isSaving ? 'Generating...' : 'REGENERATE'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdministratorPage;
