import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import googleAuthService from '../services/firebaseAuth';
import './LoginPage.css';

function LoginPage({ onLoginSuccess }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await googleAuthService.signIn();
      
      // Store user info in localStorage
      localStorage.setItem('userInfo', JSON.stringify(result.userInfo));
      
      // Call parent callback
      if (onLoginSuccess) {
        onLoginSuccess(result);
      }

      // Navigate to homepage
      navigate('/');
    } catch (err) {
      console.error('Login error:', err);
      setError('Failed to sign in. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <svg className="login-icon" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            {/* Simple silver sphere */}
            <defs>
              {/* Silver gradient */}
              <radialGradient id="silverGradient">
                <stop offset="0%" style={{stopColor: '#e5e7eb', stopOpacity: 1}} />
                <stop offset="50%" style={{stopColor: '#9ca3af', stopOpacity: 1}} />
                <stop offset="100%" style={{stopColor: '#4b5563', stopOpacity: 1}} />
              </radialGradient>
              {/* Highlight */}
              <radialGradient id="highlight">
                <stop offset="0%" style={{stopColor: '#ffffff', stopOpacity: 0.9}} />
                <stop offset="100%" style={{stopColor: '#ffffff', stopOpacity: 0}} />
              </radialGradient>
            </defs>
            
            {/* Main silver sphere */}
            <circle cx="50" cy="50" r="45" fill="url(#silverGradient)" />
            
            {/* Bright highlight at top-left (2 o'clock) */}
            <ellipse cx="32" cy="32" rx="18" ry="22" fill="url(#highlight)" opacity="0.8" />

            
          </svg>
          <h1 className="login-title">Commander's Sphere Pod Tracker</h1>
          <p className="login-subtitle">Track your Magic: The Gathering Commander games</p>
        </div>

        <div className="login-content">
          <h2 className="login-prompt">Sign in to get started</h2>
          <p className="login-description">
            Connect your Google account to create or join a playgroup
          </p>

          <button 
            className="google-signin-button"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <div className="spinner"></div>
                Signing in...
              </>
            ) : (
              <>
                <svg className="google-icon" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Sign in with Google
              </>
            )}
          </button>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}
        </div>

        <div className="login-footer">
          <p className="login-footer-text">
            By signing in, you agree to allow Commander Tracker to access your Google Sheets
          </p>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
