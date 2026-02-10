import { auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
console.log('Firebase initialized:', auth);
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import MyStatsPage from './pages/MyStatsPage';
import PodStatsPage from './pages/PodStatsPage';
import PlayerStatsPage from './pages/PlayerStatsPage';
import MyDeckPage from './pages/MyDeckPage';
import OpponentDeckPage from './pages/OpponentDeckPage';
import TrackGamePage from './pages/TrackGamePage';
import LiveTrackPage from './pages/LiveTrackPage';
import AdministratorPage from './pages/AdministratorPage';
import GamesPlayedPage from './pages/GamesPlayedPage';
import TotalPlayersPage from './pages/TotalPlayersPage';
import UniqueDecksPage from './pages/UniqueDecksPage';
import firebaseAuthService from './services/firebaseAuth';
import { SheetDataProvider } from './context/SheetDataContext';
import { 
  loadPlaygroupsFromFirestore, 
  saveAllPlaygroupData 
} from './utils/firestoreHelpers';
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPlaygroup, setCurrentPlaygroup] = useState(null);
  const [joinedPlaygroups, setJoinedPlaygroups] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [playerMapping, setPlayerMapping] = useState(null);

  useEffect(() => {
    // Listen for auth state changes
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // User is signed in
        setCurrentUser(user);
        setIsAuthenticated(true);
        
        try {
          // Load playgroups from Firestore
          const playgroupData = await loadPlaygroupsFromFirestore(user.uid);
          
          setJoinedPlaygroups(playgroupData.joinedPlaygroups);
          
          if (playgroupData.currentPlaygroup) {
            setCurrentPlaygroup(playgroupData.currentPlaygroup);
          } else if (playgroupData.joinedPlaygroups.length > 0) {
            // If no current playgroup but user has joined playgroups, set first one as current
            const firstPlaygroup = playgroupData.joinedPlaygroups[0];
            setCurrentPlaygroup(firstPlaygroup);
            // Save it back to Firestore
            await saveAllPlaygroupData(user.uid, firstPlaygroup, playgroupData.joinedPlaygroups);
          }
          
          // Load player mapping for current playgroup
          if (playgroupData.currentPlaygroup?.spreadsheetId) {
            try {
              const { loadPlaygroupData } = await import('./utils/firestoreHelpers');
              const pgData = await loadPlaygroupData(playgroupData.currentPlaygroup.spreadsheetId);
              const mapping = pgData?.playerMappings?.[user.uid];
              if (mapping) {
                setPlayerMapping(mapping);
                console.log('Loaded player mapping:', mapping);
              } else {
                setPlayerMapping(null);
                console.log('No player mapping found for user');
              }
            } catch (error) {
              console.error('Error loading player mapping:', error);
              setPlayerMapping(null);
            }
          }
          
          console.log('Loaded playgroups from Firestore:', playgroupData);
        } catch (error) {
          console.error('Error loading playgroups:', error);
          // Fall back to localStorage if Firestore fails
          const savedPlaygroup = localStorage.getItem('currentPlaygroup');
          const savedPlaygroups = localStorage.getItem('joinedPlaygroups');
          
          if (savedPlaygroup) setCurrentPlaygroup(JSON.parse(savedPlaygroup));
          if (savedPlaygroups) setJoinedPlaygroups(JSON.parse(savedPlaygroups));
        }
      } else {
        // User is signed out
        setCurrentUser(null);
        setIsAuthenticated(false);
        setCurrentPlaygroup(null);
        setJoinedPlaygroups([]);
      }
      
      setIsLoading(false);
    });

    // Cleanup subscription
    return () => unsubscribe();
  }, []);

  // Reload player mapping when playgroup changes
  useEffect(() => {
    const reloadPlayerMapping = async () => {
      if (!currentUser || !currentPlaygroup?.spreadsheetId) {
        setPlayerMapping(null);
        return;
      }

      try {
        const { loadPlaygroupData } = await import('./utils/firestoreHelpers');
        const pgData = await loadPlaygroupData(currentPlaygroup.spreadsheetId);
        const mapping = pgData?.playerMappings?.[currentUser.uid];
        if (mapping) {
          setPlayerMapping(mapping);
          console.log('Reloaded player mapping:', mapping);
        } else {
          setPlayerMapping(null);
          console.log('No player mapping found after playgroup change');
        }
      } catch (error) {
        console.error('Error reloading player mapping:', error);
        setPlayerMapping(null);
      }
    };

    reloadPlayerMapping();
  }, [currentPlaygroup, currentUser]);

  const handleLoginSuccess = async (result) => {
    // Auth state observer will handle the rest
    // This function can remain minimal since onAuthStateChanged does the heavy lifting
    console.log('Login successful');
  };

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0a1628 0%, #132742 100%)',
        color: '#ffffff'
      }}>
        Loading...
      </div>
    );
  }

  return (
    <Router>
      <SheetDataProvider currentPlaygroup={currentPlaygroup}>
        <Routes>
          {/* Public route - Login */}
          <Route 
            path="/login" 
            element={
              isAuthenticated ? 
                <Navigate to="/" /> : 
                <LoginPage onLoginSuccess={handleLoginSuccess} />
            } 
          />

          {/* Protected routes - Main app */}
          <Route 
            path="/" 
            element={
              !isAuthenticated ? (
                <Navigate to="/login" />
              ) : (
                <HomePage 
                  currentPlaygroup={currentPlaygroup}
                  setCurrentPlaygroup={setCurrentPlaygroup}
                  joinedPlaygroups={joinedPlaygroups}
                  setJoinedPlaygroups={setJoinedPlaygroups}
                  currentUser={currentUser}
                />
              )
            } 
          />

          {/* Other protected routes */}
          <Route 
            path="/my-stats" 
            element={isAuthenticated ? <MyStatsPage currentPlaygroup={currentPlaygroup} playerMapping={playerMapping} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/pod-stats" 
            element={isAuthenticated ? <PodStatsPage currentPlaygroup={currentPlaygroup} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/player/:playerName" 
            element={isAuthenticated ? <PlayerStatsPage currentPlaygroup={currentPlaygroup} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/my-deck/:deckName" 
            element={isAuthenticated ? <MyDeckPage currentPlaygroup={currentPlaygroup} playerMapping={playerMapping} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/opponent-deck/:pilotName/:deckName" 
            element={isAuthenticated ? <OpponentDeckPage currentPlaygroup={currentPlaygroup} playerMapping={playerMapping} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/track-game" 
            element={isAuthenticated ? <TrackGamePage currentPlaygroup={currentPlaygroup} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/live-track" 
            element={isAuthenticated ? <LiveTrackPage /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/administrator" 
            element={isAuthenticated ? <AdministratorPage currentPlaygroup={currentPlaygroup} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/games-played" 
            element={isAuthenticated ? <GamesPlayedPage currentPlaygroup={currentPlaygroup} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/total-players" 
            element={isAuthenticated ? <TotalPlayersPage /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/unique-decks" 
            element={isAuthenticated ? <UniqueDecksPage /> : <Navigate to="/login" />} 
          />

          {/* Catch all - redirect to home or login */}
          <Route 
            path="*" 
            element={<Navigate to={isAuthenticated ? "/" : "/login"} />} 
          />
        </Routes>
      </SheetDataProvider>
    </Router>
  );
}

export default App;
