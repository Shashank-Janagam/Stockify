import React, { useState, useEffect } from 'react';
import '../../Styles/CookieConsent.css';

const CookieConsent: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [isCookieDisabled, setIsCookieDisabled] = useState(false);

  useEffect(() => {
    // Check if cookies are enabled in the browser
    if (!navigator.cookieEnabled) {
      setIsCookieDisabled(true);
      setIsVisible(true);
      return;
    }

    // Check if user has already accepted our policy
    const consent = localStorage.getItem('paperbull_cookie_consent');
    if (!consent) {
      setIsVisible(true);
    }
  }, []);

  // Lock body scroll when modal is visible
  useEffect(() => {
    if (isVisible) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isVisible]);

  const handleAccept = () => {
    try {
      localStorage.setItem('paperbull_cookie_consent', 'true');
      setIsVisible(false);
    } catch (e) {
      console.error("Failed to set cookie consent in localStorage", e);
      // Even if it fails (e.g. private mode stricter limits), we let them proceed for now 
      // but warn if persistent storage is broken.
      alert("Unable to save your preference. Please ensure local storage is enabled.");
    }
  };

  if (!isVisible) return null;

  return (
    <div className="cookie-overlay">
      <div className="cookie-modal">
        <div className="cookie-icon">🍪</div>
        
        {isCookieDisabled ? (
          <>
            <h2>Cookies are Disabled</h2>
            <p>
              PaperBull requires cookies to function properly. 
              We noticed that cookies are currently disabled in your browser settings.
            </p>
            <p style={{ color: '#ff6b6b', fontWeight: 'bold' }}>
              Please enable cookies for this site and refresh the page to continue.
            </p>
            {/* No accept button if browser blocks cookies physically */}
            <div className="cookie-actions">
              <button 
                className="cookie-btn-accept" 
                onClick={() => window.location.reload()}
                style={{ background: '#333', color: '#fff' }}
              >
                Reload Page
              </button>
            </div>
          </>
        ) : (
          <>
            <h2>We Value Your Privacy</h2>
            <p>
              To provide the best trading experience, PaperBull uses cookies to personalize content and analyze traffic. 
              By continuing, you agree to our use of cookies.
            </p>
            <div className="cookie-actions">
              <button className="cookie-btn-accept" onClick={handleAccept}>
                Accept Cookies
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CookieConsent;
