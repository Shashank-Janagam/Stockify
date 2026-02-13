import { NavLink, useNavigate } from "react-router-dom";
import "../Styles/Navbar.css";
import logo from "../assets/StockiftLogo.png";
import { AuthContext } from "../auth/AuthProvider";
import { useContext, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import {  } from "firebase/auth";

import SearchOverlay from "./SearchOverlay";

interface NavbarProps {
  onLoginClick: () => void;
}


const NavBar = ({ onLoginClick }: NavbarProps) => {
  const navigate = useNavigate();
  const { user, loading, logout } = useContext(AuthContext);

  const [openSearch, setOpenSearch] = useState(false);
  const [openProfile, setOpenProfile] = useState(false);
  const [photoLoaded, setPhotoLoaded] = useState(false);

  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const getProfilePhoto = (user: User | null): string | null => {
  if (!user) return null;
  if (user.photoURL) return user.photoURL;

  const googleProvider = user.providerData.find(
    (p) => p.providerId === "google.com"
  );
  setPhotoLoaded(true);
  
  return googleProvider?.photoURL ?? null;
};
  const profilePhoto = getProfilePhoto(user);
  /* ---------- RESET IMAGE STATE WHEN USER CHANGES ---------- */


  /* ---------- CLOSE PROFILE ON OUTSIDE CLICK ---------- */
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpenProfile(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /* ---------- CTRL + K SEARCH ---------- */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpenSearch(true);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  /* ---------- LOGOUT ---------- */
  const handleLogout = async () => {
    try {
      await logout();
      setOpenProfile(false);
      navigate("/", { replace: true });
    } catch (err) {
      console.log("Logout error:", err);
    }
  };

  return (
    <>
      <nav className="groww-navbar">
        {/* ---------------- LEFT ---------------- */}
        <div className="nav-left">
          <div
            className="logo"
            onClick={() => navigate("/dashboard")}
            style={{ cursor: "pointer" }}
          >
            <img src={logo} alt="Logo" className="logo-icon" />
            <span className="logo-text">Stockify</span>
          </div>

          <div className="main-tabs">
            {user && (
              <>
                <NavLink to="/" className="tab" end>
                  Home
                </NavLink>
                <NavLink to="/dashboard" className="tab">
                  Dashboard
                </NavLink>
                <NavLink to="/portfolio" className="tab">
                  Portfolio
                </NavLink>
                <NavLink to="/user/balance" className="tab">
                  Funds
                </NavLink>
              </>
            )}
          </div>
        </div>

        {/* ---------------- RIGHT ---------------- */}
        <div className="nav-right">
          {/* SEARCH */}
          <div
            className="search-box"
            onClick={() => setOpenSearch(true)}
          >
            <input placeholder="Search Stockify..." readOnly />
            <span className="shortcut">Ctrl + K</span>
          </div>

          {/* PROFILE (ONLY THIS IS DELAYED) */}
          <div className="profile-dropdown-container" ref={dropdownRef}>
            {loading ? (
              // ⏳ Only profile placeholder
              <div className="profile-btn">
                <div className="profile-fallback">…</div>
              </div>
            ) : user ? (
              <>
                <button
                  className="profile-btn"
                  onClick={() => setOpenProfile((p) => !p)}
                >
                  {/* fallback always visible first */}
                  <div
                    className="profile-fallback"
                    style={{ display: photoLoaded ? "none" : "flex" }}
                  >
                    {(user.displayName?.[0] ?? "U").toUpperCase()}
                  </div>

                  {profilePhoto && (
                    <img
                      src={profilePhoto}
                      alt="profile"
                      className="profile-img"
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      onLoad={() => setPhotoLoaded(true)}
                      style={{ display: photoLoaded ? "block" : "none" }}
                    />
                  )}
                </button>

                {openProfile && (
                  <div className="profile-dropdown">
                    <div className="profile-dropdown-header">
                      <div className="profile-dropdown-name">
                        {user.displayName ?? "User"}
                      </div>
                      <div className="profile-dropdown-email">
                        {user.email ?? ""}
                      </div>
                    </div>

                    <div className="profile-dropdown-divider" />

                    <div className="profile-dropdown-menu">
                      <button
                        className="profile-item"
                        onClick={() => {
                          navigate("/wallet");
                          setOpenProfile(false);
                        }}
                      >
                        <span>Stocks, F&O balance</span>
                        <span className="arrow">›</span>
                      </button>

                      <button
                        className="profile-item"
                        onClick={() => {
                          navigate("/orders");
                          setOpenProfile(false);
                        }}
                      >
                        <span>All Orders</span>
                        <span className="arrow">›</span>
                      </button>

                      <button
                        className="profile-item"
                        onClick={() => {
                          navigate("/user/balance");
                          setOpenProfile(false);
                        }}
                      >
                        <span>Wallet</span>
                        <span className="arrow">›</span>
                      </button>

                      <button
                        className="profile-item"
                        onClick={() => {
                          navigate("/support");
                          setOpenProfile(false);
                        }}
                      >
                        <span>24 x 7 Customer Support</span>
                        <span className="arrow">›</span>
                      </button>

                      <button
                        className="profile-item"
                        onClick={() => {
                          navigate("/reports");
                          setOpenProfile(false);
                        }}
                      >
                        <span>Reports</span>
                        <span className="arrow">›</span>
                      </button>
                    </div>

                    <div className="profile-dropdown-divider" />

                    <div className="profile-dropdown-footer">
                      <button className="logout-btn" onClick={handleLogout}>
                        Log out
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <button className="login-btn" onClick={onLoginClick}>
                Login / Signup
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* SEARCH OVERLAY */}
      <SearchOverlay
        isOpen={openSearch}
        onClose={() => setOpenSearch(false)}
      />
    </>
  );
};

export default NavBar;
