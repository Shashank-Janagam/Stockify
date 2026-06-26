import React, { useState, useContext, useEffect } from "react";
import { AuthContext } from "../../auth/AuthProvider";
import { EmailAuthProvider, linkWithCredential } from "firebase/auth";
import { auth } from "../../firebase"; // adjust path if needed
import { useNavigate } from "react-router-dom";
import "../../Styles/SetPassword.css";

const SetPassword = () => {
  const {  isGoogleOnlyUser } = useContext(AuthContext); 
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isGoogleOnlyUser) {
       // If user already has a password (or logic deems them not needing this), redirect away
       navigate("/dashboard");
    }
  }, [isGoogleOnlyUser, navigate]);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Basic Validation
    if (!password || !confirmPassword) {
      setError("Please fill in both fields.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    try {
      setIsLoading(true);

      const currentUser = auth.currentUser;
      if (!currentUser) {
        setError("User not authenticated. Please log in first.");
        return;
      }
      
      // Ensure we have an email to link with (should be the user's email)
      const userEmail = currentUser.email;
      if (!userEmail) {
         setError("Could not determine user email.");
         return;
      }

      // Create credential
      const credential = EmailAuthProvider.credential(userEmail, password);

      // Link credential to the existing user
      await linkWithCredential(currentUser, credential);

      setSuccess("Password set successfully! You can now log in with your email and password.");
      
      // Redirect after a short delay
      setTimeout(() => {
        navigate("/dashboard");
      }, 2000);

    } catch (err: any) {
      console.error("Set Password Error:", err);
      // specific error handling
      if (err.code === 'auth/credential-already-in-use') {
         setError("This email is already associated with another account.");
      } else if (err.code === 'auth/requires-recent-login') {
         setError("For security, please log out and log in again before setting a password.");
      } else {
         setError(err.message || "Failed to set password. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="set-password-page">
      <div className="set-password-card">
        <h2>Set a Password</h2>
        <p>
          Secure your account by adding a password. You can use this to log in
          along with your Google account.
        </p>

        {success && <div className="success-msg">✅ {success}</div>}
        
        <form onSubmit={handleSetPassword}>
          <div className="input-group">
            <label className="input-label">New Password</label>
            <input
              type="password"
              className="password-input"
              placeholder="Enter new password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className="input-group">
            <label className="input-label">Confirm Password</label>
            <input
              type="password"
              className="password-input"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isLoading}
            />
            {error && <div className="error-msg">⚠️ {error}</div>}
          </div>

          <button type="submit" className="confirm-btn" disabled={isLoading}>
            {isLoading ? <div className="spinner"></div> : "Set Password"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default SetPassword;
