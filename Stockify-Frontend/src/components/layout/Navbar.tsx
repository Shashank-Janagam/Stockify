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

  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const getProfilePhoto = (user: User | null): string | null => {
  if (!user) return null;
  if (user.photoURL) return user.photoURL;

  const googleProvider = user.providerData.find(
    (p) => p.providerId === "google.com"
  );
  
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

  /* ---------- RENDER ---------- */
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
                  {profilePhoto ? (
                    <img
                      src={profilePhoto}
                      alt="profile"
                      className="profile-img"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="profile-fallback">
                      {(user.displayName?.[0] ?? "U").toUpperCase()}
                    </div>
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
                          navigate("/settings");
                          setOpenProfile(false);
                        }}
                      >
                        <span>⚙️ Settings</span>
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
                      <button className="profile-dropdown-logout" onClick={handleLogout}>
                        Logout
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
