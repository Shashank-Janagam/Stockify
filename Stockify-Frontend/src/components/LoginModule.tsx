import { useEffect, useState } from "react";
import "../Styles/LoginModule.css"
import google from "../assets/google.png";
import { loginWithEmail,loginWithGoogle,signupWithEmail ,checkEmailExists} from "../auth/login";
// import { useNavigate } from "react-router-dom";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../firebase"; // adjust path if needed
import { useNavigate } from "react-router-dom";
interface LoginModalProps {
  onClose: () => void;
}

function LoginModal({ onClose }: LoginModalProps) {
  const [visible, setVisible] = useState(false);
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");

  // const [step,setStep]=useState<"email"|"password">("email");
  const [isExist,setIsExist]=useState(false)
  const [isLoading,setIsloading]=useState(false);
  const [withEmail,setWithEmail]=useState(false);
  const navigate=useNavigate();
const handleForgotPassword = async () => {
  if (!email) return;

  try {
    setIsloading(true);
    await sendPasswordResetEmail(auth, email);
    alert("Password reset email sent. Check your inbox.");
  } catch (error: any) {
    console.error(error);
    alert(error.message || "Failed to send reset email");
  } finally {
    setIsloading(false);
  }
};

  const handleEmailSubmit=async ()=>{
    if(!email) return ;
    setIsloading(true);
    try{
      const exist=await checkEmailExists(email);
      console.log("email",exist)
      setIsExist(!exist);
      // setStep("password")

      setWithEmail(true); 
    }catch{
      alert("something went wrong")
    }finally{
      setIsloading(false)
    }
  }

 const handlePasswordSubmit = async () => {
  if (!password) return;

  if (password.length < 6) {
    alert("Password must be at least 6 characters");
    return;
  }

  setIsloading(true);
  try {
    if (isExist) {
      // 🔐 LOGIN FLOW
      await loginWithEmail(email, password);
    } else {
      // 🆕 SIGNUP FLOW
      await signupWithEmail(email, password);
    }
    navigate("/dashboard");
    handleClose();
  } catch (error: any) {
    console.error("Auth error:", error);

    if (error.code === "auth/wrong-password") {
      alert("Incorrect password");
    } else if (error.code === "auth/email-already-in-use") {
      alert("Account already exists. Please login.");
    } else {
      alert(error.message || "Authentication failed");
    }
  } finally {
    setIsloading(false);
  }
};


  const handleWithgoogle=async ()=>{
    try{
      setIsloading(true)
      await loginWithGoogle();
      navigate("/dashboard");
      handleClose();
    }catch(error){
      console.log(error);
      alert("Google Login Failed. PLease Try Again");
    }finally{
      setIsloading(false);
    }
  }





  useEffect(() => {
    document.body.classList.add("modal-open");

    // trigger enter animation
    requestAnimationFrame(() => setVisible(true));

    return () => {
      document.body.classList.remove("modal-open");
    };
  }, []);

  const handleClose = () => {
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

            <div className="title">
                Welcome to Stockify
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
                onChange={(e) => setEmail(e.target.value)}
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
                <span className="spinner" /> Loading...
              </span>
            ) : (
              "Continue"
            )}
          </button>

          <p className="terms">
            By proceeding, I agree to T&C, Privacy Policy & Tariff Rates
          </p>
        </div>
            
          </>
        )}

        {withEmail && (
  <div className="modal-right">
    <button className="close-btn" onClick={handleClose}>×</button>

    <div className="title">
      {isExist ? "Login to Stockify" : "Join Stockify"}
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
          isExist
            ? "Enter your password"
            : "Create a password"
        }
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
    </div>

     {isExist && (
        <button
          type="button"
          className="forgot-password-btn"
          onClick={handleForgotPassword}
          disabled={isLoading}
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
      <span className="spinner" /> Loading...
    </span>
  ) : (
    isExist ? "Login" : "Create account"
  )}
</button>


    <p className="terms">
      By proceeding, I agree to T&C, Privacy Policy & Tariff Rates
    </p>
  </div>
)}





      </div>
    </div>
  );
}

export default LoginModal;
