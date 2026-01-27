import { useEffect, useState } from "react";
import "../Styles/LoginModule.css"
import google from "../assets/google.png";
import { loginWithEmail,loginWithGoogle,signupWithEmail ,checkEmailExists} from "../auth/login";
// import { useNavigate } from "react-router-dom";

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


  const handleEmailSubmit=async ()=>{
    if(!email) return ;
    setIsloading(true);
    try{
      const exist=await checkEmailExists(email);
      setIsExist(exist);
      // setStep("password")

      setWithEmail(true);
    }catch{
      alert("something went wrong")
    }finally{
      setIsloading(false)
    }
  }

  const handlePasswordSubmit=async ()=>{
    try{
      if(isExist){
        await loginWithEmail(email,password);
      }else{
        await signupWithEmail(email,password);
      }

    }catch{
      alert(isExist?"login failed":"signup failed")
    }
  }

  const handleWithgoogle=async ()=>{
    try{
      setIsloading(true)
      await loginWithGoogle();
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

            <div className="title">{isExist?"Login To Stockify":"Join Stockify"}</div>

              <div className="input-group" >
              <input
                type="email"
                className="email-input"
                placeholder={email}

                onChange={(e) => setPassword(e.target.value)}
              />

              <button onClick={()=>setWithEmail(false)} >Edit</button>
            </div>

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

            <button
              className="continue-btn"
              onClick={handlePasswordSubmit}
            >
              {isExist ? "Login" : "Create account"}
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
