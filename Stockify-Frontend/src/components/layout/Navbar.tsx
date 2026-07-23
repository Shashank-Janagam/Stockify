import { NavLink, useNavigate } from "react-router-dom";
import "../../Styles/Navbar.css";
import logo from "../../assets/logos/paperbull.png";
import { AuthContext } from "../../auth/AuthProvider";
import { useContext, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import {  } from "firebase/auth";

import SearchOverlay from "./SearchOverlay";

interface NavbarProps {
  onLoginClick: () => void;
}


const NavBar = ({ onLoginClick }: NavbarProps) => {
  const navigate = useNavigate();
  const { user, loading, logout, isGoogleOnlyUser } = useContext(AuthContext);

  const [openSearch, setOpenSearch] = useState(false);
  const [openProfile, setOpenProfile] = useState(false);
  const [photoLoaded, setPhotoLoaded] = useState(false);

  const [mobile, setMobile] = useState<string | null>(null);
  const [tempMobile, setTempMobile] = useState("");
  const [isEditingMobile, setIsEditingMobile] = useState(false);

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

  /* ---------- FETCH PROFILE MOBILE ---------- */
  useEffect(() => {
    if (user && openProfile) {
      const HOST = import.meta.env.VITE_HOST_ADDRESS || "";
      fetch(`${HOST}/api/user/profile`, {
        credentials: "include"
      })
        .then((res) => {
          if (!res.ok) throw new Error("Failed to fetch profile");
          return res.json();
        })
        .then((data) => {
          setMobile(data.mobile);
          setTempMobile(data.mobile || "");
        })
        .catch((err) => console.error("Error fetching profile mobile:", err));
    }
  }, [user, openProfile]);

  const handleSaveMobile = async () => {
    const trimmed = tempMobile.trim();
    if (trimmed && !/^\+?[0-9]{10,15}$/.test(trimmed)) {
      alert("Please enter a valid mobile number (e.g. +919876543210 or 9876543210)");
      return;
    }

    try {
      const HOST = import.meta.env.VITE_HOST_ADDRESS || "";
      const response = await fetch(`${HOST}/api/user/mobile`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ mobile: trimmed || null }),
        credentials: "include"
      });
      if (!response.ok) {
        throw new Error("Failed to save mobile number");
      }
      const data = await response.json();
      setMobile(data.mobile);
      setIsEditingMobile(false);
    } catch (err) {
      console.error("Error saving mobile:", err);
      alert("Failed to save mobile number. Please try again.");
    }
  };

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
      <nav className="groww-navbar"><div className="nav-inner">
        {/* ---------------- LEFT ---------------- */}
        <div className="nav-left">
          <div
            className="logo"
            onClick={() => navigate("/dashboard")}
            style={{ cursor: "pointer" }}
          >
            <img src={logo} alt="Logo" className="logo-icon" />
            <div className="logo-text-wrapper" style={{ display: "flex", alignItems: "center" }}>
              <span className="logo-text" style={{ color: "#051b3dff", fontWeight: "bold" }}>APER</span>
              <span className="logo-text" style={{ color: "#0ea659", fontWeight: "bold" }}>BULL</span>
            </div>
          </div>

          <div className="main-tabs">
            {user && (
              <>
                <NavLink to="/" className="tab1" end>
                  Home
                </NavLink>
                <NavLink to="/dashboard" className="tab1">
                  Dashboard
                </NavLink>
                <NavLink to="/portfolio" className="tab1">
                  Portfolio
                </NavLink>
                <NavLink to="/dashboard" state={{ tab: "Streaming Algo" }} className="tab1">
                  ⚡ Streaming Algo
                </NavLink>
                <NavLink to="/user/balance" className="tab1">
                  Funds
                </NavLink>
                <NavLink to="/news" className="tab1">
                  News
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
            <input placeholder="Search Stocks..." readOnly />
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

                    {/* MOBILE SETTING SECTION */}
                    <div className="profile-mobile-section">
                      <div className="profile-mobile-label">Mobile Number</div>
                      {isEditingMobile ? (
                        <div className="profile-mobile-input-container">
                          <input
                            type="tel"
                            value={tempMobile}
                            onChange={(e) => setTempMobile(e.target.value)}
                            placeholder="Enter Mobile Number"
                            className="profile-mobile-input"
                            autoFocus
                          />
                          <button onClick={handleSaveMobile} className="profile-mobile-save-btn">
                            Save
                          </button>
                          <button
                            onClick={() => {
                              setIsEditingMobile(false);
                              setTempMobile(mobile || "");
                            }}
                            className="profile-mobile-cancel-btn"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="profile-mobile-display">
                          <span className="profile-mobile-value">
                            {mobile ? mobile : <span className="profile-mobile-placeholder">Not Added</span>}
                          </span>
                          <button onClick={() => setIsEditingMobile(true)} className="profile-mobile-btn">
                            {mobile ? "Change" : "Add"}
                          </button>
                        </div>
                      )}
                      <div className="profile-mobile-hint">
                        <span className="dot">●</span> WhatsApp notifications will be sent
                      </div>
                    </div>

                    <div className="profile-dropdown-divider" />

                    <div className="profile-dropdown-menu">
                      

                      <button
                        className="profile-item"
                        onClick={() => {
                          navigate("/dashboard", { state: { tab: "Orders" } });
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

                      

                      {isGoogleOnlyUser && (
                        <button
                          className="profile-item"
                          onClick={() => {
                            navigate("/set-password");
                            setOpenProfile(false);
                          }}
                        >
                          <span>Set Password</span>
                          <span className="arrow">›</span>
                        </button>
                      )}
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
      </div></nav>

      {/* SEARCH OVERLAY */}
      <SearchOverlay
        isOpen={openSearch}
        onClose={() => setOpenSearch(false)}
      />
    </>
  );
};

export default NavBar;
