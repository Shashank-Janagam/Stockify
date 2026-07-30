import { useState, useEffect, useContext } from "react";
import { AuthContext } from "../auth/AuthProvider";
import { useNavigate } from "react-router-dom";
import "../Styles/Navbar.css";

const Settings = () => {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const [mobile, setMobile] = useState<string | null>(null);
  const [telegramLinked, setTelegramLinked] = useState<boolean>(false);
  const [notifyEmail, setNotifyEmail] = useState<boolean>(true);
  const [notifyWhatsapp, setNotifyWhatsapp] = useState<boolean>(true);
  const [notifyTelegram, setNotifyTelegram] = useState<boolean>(true);
  
  const [tempMobile, setTempMobile] = useState("");
  const [isEditingMobile, setIsEditingMobile] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const HOST = import.meta.env.VITE_HOST_ADDRESS || "";

  useEffect(() => {
    if (user) {
      fetch(`${HOST}/api/user/profile`, { credentials: "include" })
        .then((res) => {
          if (!res.ok) throw new Error("Failed to fetch profile");
          return res.json();
        })
        .then((data) => {
          setMobile(data.mobile);
          setTelegramLinked(!!data.telegram_chat_id);
          if (data.notify_email !== undefined) setNotifyEmail(data.notify_email);
          if (data.notify_whatsapp !== undefined) setNotifyWhatsapp(data.notify_whatsapp);
          if (data.notify_telegram !== undefined) setNotifyTelegram(data.notify_telegram);
          setTempMobile(data.mobile || "");
          setIsLoading(false);
        })
        .catch((err) => {
          console.error("Error fetching settings:", err);
          setIsLoading(false);
        });
    }
  }, [user, HOST]);

  const handleSaveMobile = async () => {
    const trimmed = tempMobile.trim();
    if (trimmed && !/^\+?[0-9]{10,15}$/.test(trimmed)) {
      alert("Please enter a valid mobile number (e.g. +919876543210)");
      return;
    }

    try {
      const response = await fetch(`${HOST}/api/user/mobile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile: trimmed || null }),
        credentials: "include"
      });
      if (!response.ok) throw new Error("Failed to save mobile number");
      const data = await response.json();
      setMobile(data.mobile);
      setIsEditingMobile(false);
    } catch (err) {
      console.error("Error saving mobile number:", err);
      alert("Failed to save mobile number");
    }
  };

  const handleToggleNotification = async (type: string, value: boolean) => {
    try {
      const response = await fetch(`${HOST}/api/user/notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, value }),
        credentials: "include"
      });
      if (!response.ok) throw new Error("Failed to update preferences");
      
      if (type === 'notify_email') setNotifyEmail(value);
      if (type === 'notify_whatsapp') setNotifyWhatsapp(value);
      if (type === 'notify_telegram') setNotifyTelegram(value);
    } catch (err) {
      console.error("Error updating notification preference:", err);
      alert("Failed to update notification settings");
    }
  };

  if (!user) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f9f9f9', color: '#333' }}>
        <h2>Please log in to view settings.</h2>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9f9f9', color: '#333', padding: '40px 20px' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', backgroundColor: '#fff', borderRadius: '12px', padding: '30px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '30px', borderBottom: '1px solid #eee', paddingBottom: '20px' }}>
          <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: '#666', fontSize: '24px', cursor: 'pointer', marginRight: '20px' }}>←</button>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>Account Settings</h1>
        </div>

        {/* PROFILE OVERVIEW */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '40px', padding: '20px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
          {(() => {
            const googleProvider = user.providerData?.find(p => p.providerId === "google.com");
            const photoUrl = user.photoURL || googleProvider?.photoURL;
            if (photoUrl) {
              return <img src={photoUrl} alt="profile" style={{ width: '60px', height: '60px', borderRadius: '50%', objectFit: 'cover' }} referrerPolicy="no-referrer" />;
            }
            return (
              <div style={{ width: '60px', height: '60px', borderRadius: '50%', backgroundColor: '#0ea659', color: '#fff', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '24px', fontWeight: 'bold' }}>
                {(user.displayName?.[0] ?? "U").toUpperCase()}
              </div>
            );
          })()}
          <div>
            <h2 style={{ margin: '0 0 5px 0', fontSize: '20px', color: '#333' }}>{user.displayName ?? "User"}</h2>
            <p style={{ margin: 0, fontSize: '14px', color: '#666' }}>{user.email ?? ""}</p>
          </div>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', color: '#666' }}>Loading settings...</div>
        ) : (
          <>
            {/* MOBILE SECTION */}
            <div style={{ marginBottom: '40px' }}>
              <h3 style={{ fontSize: '18px', marginBottom: '10px', color: '#333' }}>Mobile Number</h3>
              <p style={{ fontSize: '14px', color: '#666', marginBottom: '15px' }}>Add your mobile number to receive WhatsApp trade alerts.</p>
              
              <div style={{ backgroundColor: '#f5f5f5', padding: '20px', borderRadius: '8px' }}>
                {isEditingMobile ? (
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input
                      type="tel"
                      value={tempMobile}
                      onChange={(e) => setTempMobile(e.target.value)}
                      placeholder="+919876543210"
                      style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #ccc', backgroundColor: '#fff', color: '#333' }}
                      autoFocus
                    />
                    <button onClick={handleSaveMobile} style={{ padding: '10px 20px', backgroundColor: '#0ea659', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Save</button>
                    <button onClick={() => { setIsEditingMobile(false); setTempMobile(mobile || ""); }} style={{ padding: '10px 20px', backgroundColor: '#ddd', color: '#333', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '16px', fontWeight: '500', color: '#333' }}>
                      {mobile ? mobile : <span style={{ color: '#999', fontStyle: 'italic' }}>Not Added</span>}
                    </span>
                    <button onClick={() => setIsEditingMobile(true)} style={{ padding: '8px 16px', backgroundColor: '#e0e0e0', color: '#333', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>
                      {mobile ? "Change" : "Add"}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* TELEGRAM SECTION */}
            <div style={{ marginBottom: '40px' }}>
              <h3 style={{ fontSize: '18px', marginBottom: '10px', color: '#333' }}>Telegram Integration</h3>
              <p style={{ fontSize: '14px', color: '#666', marginBottom: '15px' }}>Link your Telegram account to receive instant notifications via the PaperBull Bot.</p>
              
              <div style={{ backgroundColor: '#f5f5f5', padding: '20px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '16px' }}>Status</span>
                {telegramLinked ? (
                  <div style={{ backgroundColor: '#e2f5ec', color: '#0ea659', padding: '8px 16px', borderRadius: '6px', fontSize: '14px', fontWeight: 'bold' }}>
                    ✅ Linked Successfully
                  </div>
                ) : (
                  <a 
                    href={`https://t.me/${import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'PaperBull_bot'}?start=${user.uid}`} 
                    target="_blank" 
                    rel="noreferrer"
                    style={{ backgroundColor: '#229ED9', color: '#fff', textDecoration: 'none', padding: '10px 20px', borderRadius: '6px', fontSize: '14px', fontWeight: 'bold' }}
                  >
                    Link Telegram
                  </a>
                )}
              </div>
            </div>

            {/* NOTIFICATION PREFERENCES */}
            <div>
              <h3 style={{ fontSize: '18px', marginBottom: '10px', color: '#333' }}>Notification Preferences</h3>
              <p style={{ fontSize: '14px', color: '#666', marginBottom: '15px' }}>Choose how you want to receive trade execution alerts.</p>
              
              <div style={{ backgroundColor: '#f5f5f5', padding: '20px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: '500', color: '#333' }}>Email Alerts</div>
                    <div style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>Sent to your registered email address</div>
                  </div>
                  <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '40px', height: '24px' }}>
                    <input type="checkbox" checked={notifyEmail} onChange={(e) => handleToggleNotification('notify_email', e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                    <span className="slider round" style={{ position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: notifyEmail ? '#0ea659' : '#ccc', transition: '.4s', borderRadius: '34px' }}>
                      <span style={{ position: 'absolute', content: '""', height: '18px', width: '18px', left: notifyEmail ? '19px' : '3px', bottom: '3px', backgroundColor: 'white', transition: '.4s', borderRadius: '50%', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}></span>
                    </span>
                  </label>
                </div>

                <div style={{ borderBottom: '1px solid #eee' }}></div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: '500', color: '#333' }}>WhatsApp Alerts</div>
                    <div style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>Requires a valid mobile number above</div>
                  </div>
                  <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '40px', height: '24px' }}>
                    <input type="checkbox" checked={notifyWhatsapp} onChange={(e) => handleToggleNotification('notify_whatsapp', e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                    <span className="slider round" style={{ position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: notifyWhatsapp ? '#0ea659' : '#ccc', transition: '.4s', borderRadius: '34px' }}>
                      <span style={{ position: 'absolute', content: '""', height: '18px', width: '18px', left: notifyWhatsapp ? '19px' : '3px', bottom: '3px', backgroundColor: 'white', transition: '.4s', borderRadius: '50%', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}></span>
                    </span>
                  </label>
                </div>

                <div style={{ borderBottom: '1px solid #eee' }}></div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: '500', color: '#333' }}>Telegram Alerts</div>
                    <div style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>Requires linked account above</div>
                  </div>
                  <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '40px', height: '24px' }}>
                    <input type="checkbox" checked={notifyTelegram} onChange={(e) => handleToggleNotification('notify_telegram', e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                    <span className="slider round" style={{ position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: notifyTelegram ? '#0ea659' : '#ccc', transition: '.4s', borderRadius: '34px' }}>
                      <span style={{ position: 'absolute', content: '""', height: '18px', width: '18px', left: notifyTelegram ? '19px' : '3px', bottom: '3px', backgroundColor: 'white', transition: '.4s', borderRadius: '50%', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}></span>
                    </span>
                  </label>
                </div>

              </div>
            </div>

            {/* LOGOUT SECTION */}
            <div style={{ marginTop: '40px', paddingTop: '30px', borderTop: '1px solid #eee', textAlign: 'center' }}>
              <button 
                onClick={async () => {
                  try {
                    await logout();
                    navigate("/", { replace: true });
                  } catch (err) {
                    console.error("Logout failed", err);
                  }
                }}
                style={{ padding: '12px 24px', backgroundColor: '#fff', color: '#d93025', border: '1px solid #d93025', borderRadius: '6px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', width: '100%', maxWidth: '200px' }}
              >
                Log Out
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Settings;
