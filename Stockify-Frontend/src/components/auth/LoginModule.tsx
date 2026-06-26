import { useEffect, useState } from "react";
import "../../Styles/LoginModule.css"
import google from "../../assets/google.png";
import { loginWithEmail,loginWithGoogle , getSignInMethods} from "../../auth/login";
// import { useNavigate } from "react-router-dom";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../../firebase"; // adjust path if needed
import { useNavigate, Link } from "react-router-dom";
import { AuthContext } from "../../auth/AuthProvider";
import { useContext } from "react";
// import { EmailAuthProvider, linkWithCredential } from "firebase/auth";

interface LoginModalProps {
  onClose: () => void;
}

function LoginModal({ onClose }: LoginModalProps) {
  const [visible, setVisible] = useState(false);
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const {  } = useContext(AuthContext);

  // const [step,setStep]=useState<"email"|"password">("email");
  const [isLoading,setIsloading]=useState(false);
  const [withEmail,setWithEmail]=useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate=useNavigate();
  const handleForgotPassword = async () => {
    if (!email) return;

    try {
      setIsloading(true);
      setError(null);
      await sendPasswordResetEmail(auth, email);
      // alert("Password reset email sent. Check your inbox.");
      setError("Password reset email sent. Check your inbox.");
    } catch (error: any) {
      console.error(error);
      setError(error.message || "Failed to send reset email");
    } finally {
      setIsloading(false);
    }
  };
  



  const handleEmailSubmit = async () => {
    if (!email) return;
    setIsloading(true);
    setError(null);
    try {
      // 1. Check existing sign-in methods
      const methods = await getSignInMethods(email);
      console.log("methods", methods);

      // 2. Identify Google-only users (no password set)
      // NOTE: If Firebase "Email Enumeration Protection" is enabled, 'methods' will always be empty [].
      // You must disable it in Firebase Console -> Authentication -> Settings -> User actions to use this feature.
      const hasGoogle = methods.includes("google.com");
      const hasPassword = methods.includes("password");

      if (hasGoogle && !hasPassword) {
        setError("Account exists with Google. Please use 'Continue with Google'.");
        return; 
      }
      if (!hasGoogle && !hasPassword) {
        setError("Account does not exist. Please use 'Continue with Google'.");
        return; 
      }

      
      // If methods is empty, we can't tell if user exists or not (unless protection is off).
      // If protection is OFF and methods is empty, it means user doesn't exist.
      // If protection is ON and methods is empty, it means we don't know.
      // We will proceed to let them try password. 
      // If they are new, they should probably go to a Signup flow, but here we only have Login flow?

      setWithEmail(true);
    } catch(error) {
      console.error(error);
      setError("Something went wrong");
    } finally {
      setIsloading(false)
    }
  }

  const handlePasswordSubmit = async () => {
    if (!password) return;
    setError(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setIsloading(true);
    try {
      // 🔐 LOGIN FLOW
      const userCredentials = await loginWithEmail(email, password);
      const idToken = await userCredentials.user.getIdToken()

      await fetch(`${HOST}/api/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify({ token: idToken })
      });
      navigate("/dashboard");
      handleClose();
    } catch (error: any) {
      console.error("Auth error:", error);

      if (error.code === "auth/invalid-credential") {
        setError("Incorrect password or account used Google Login.");
      } else if (error.code === "auth/email-already-in-use") {
        setError("Account already exists. Please login.");
      }else if(error.code=="auth/user-not-found"){
        setError("Account not found. Please login using Google");
      }
    } finally {
      setIsloading(false);
    }
  };
  const HOST = import.meta.env.VITE_HOST_ADDRESS || ""

  const handleWithgoogle = async () => {
    try {
      setIsloading(true)
      setError(null);
      const userCredentials = await loginWithGoogle();
      const idToken = await userCredentials.user.getIdToken()

      await fetch(`${HOST}/api/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify({ token: idToken })
      });
      navigate("/dashboard");
      handleClose();
    } catch (error) {
      console.log(error);
      setError("Google Login Failed. Please Try Again");
    } finally {
      setIsloading(false);
    }
  }

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [error]);





  useEffect(() => {
    document.body.classList.add("modal-open");

    // trigger enter animation
    requestAnimationFrame(() => setVisible(true));

    return () => {
      document.body.classList.remove("modal-open");
    };
  }, []);

  const handleClose = () => {
    setIsloading(false); // stop any spinner on close
    setVisible(false); // trigger exit animation
    setTimeout(onClose, 250); // match CSS duration
  };

  return (
    <div className={`modal-overlay ${visible ? "show" : ""}`}>
      <div className="login-modal">
        {/* LEFT */}
        <div className="modal-left">
        
          <h2>Practice trading. Risk-free.</h2>
          <p>Paper trading with virtual money</p>
        </div>

        {/* RIGHT */}

        {!withEmail&&(
          <>
                    <div className="modal-right">
          <button className="close-btn" onClick={handleClose}>×</button>

            <div className="title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                Welcome to
              <div style={{ display: "flex", alignItems: "center" }}>
                <span className="logo-text" style={{ color: "#051b3dff", fontWeight: "bold" }}>PAPER</span>
                <span className="logo-text" style={{ color: "#0ea659", fontWeight: "bold" }}>BULL</span>
              </div>
            </div>
          

            <button className="google-btn" onClick={handleWithgoogle}>
            <img
                src={google}
                alt="Google"
                className="google-icon"
            />
            Continue with Google
            </button>

            <div className="or-divider">
            <span className="line"></span>
            <span className="or">Or</span>
            <span className="line"></span>
            </div>


          <div className="input-group">
            <input
                type="email"
                className="email-input"
                placeholder="Your Email Address"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleEmailSubmit();
                  }
                }}
            />
          </div>



          <button
            className="continue-btn"
             data-cy="email-continue-btn"
            onClick={handleEmailSubmit}
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="btn-loader">
              </span>
            ) : (
              "Continue"
            )}
          </button>

          <p className="terms">
            By proceeding, I agree to{" "}
            <Link to="/terms" onClick={handleClose}>T&C</Link>,{" "}
            <Link to="/privacy-policy" onClick={handleClose}>Privacy Policy</Link>
          </p>
          {error && <div className="error-popup">⚠️ {error}</div>}
        </div>
            
          </>
        )}

        {withEmail && (
  <div className="modal-right">
    <button className="close-btn" onClick={handleClose}>×</button>

    <div className="title">
      { "Login to PaperBull"}
    </div>

    {/* EMAIL (READ ONLY) */}
    <div className="input-group email-row">
      <input
        type="email"
        className="email-input"
        value={email}
        disabled
      />
      <button
        type="button"
        className="edit-btn"
        onClick={() => {
          setWithEmail(false);
          setPassword("");
          setIsloading(false);
        }}
      >
        Edit
      </button>
    </div>

    {/* PASSWORD */}
    <div className="input-group">
      <input
        type="password"
        className="email-input"
        placeholder={
            "Enter your password"
        }
        value={password}
        onChange={(e) => { setPassword(e.target.value); setError(null); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            handlePasswordSubmit();
          }
        }}
      />
    </div>

     {withEmail && (
       <button
        type="button"
        className="forgot-password-btn"
        onClick={handleForgotPassword}
      >
          Forgot password?
      </button>

      )}


     
   <button
  className="continue-btn"
    data-cy="password-submit-btn"

  onClick={handlePasswordSubmit}
  disabled={isLoading || !password}
>
  {isLoading ? (
    <span className="btn-loader">
    </span>
  ) : (
    "Login"
  )}
</button>


    <p className="terms">
      By proceeding, I agree to{" "}
      <Link to="/terms" onClick={handleClose}>T&C</Link>,{" "}
      <Link to="/privacy-policy" onClick={handleClose}>Privacy Policy</Link>
    </p>
    {error && <div className="error-popup">⚠️ {error}</div>}
  </div>
)}





      </div>
    </div>
  );
}

export default LoginModal;
