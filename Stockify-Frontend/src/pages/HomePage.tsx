import "../Styles/HomePage.css"
import homeimage from "../assets/homepage.png"
import {useContext} from "react"
import { useNavigate } from "react-router-dom";

import { AuthContext } from "../auth/AuthProvider";interface HomePageProps {
  onLoginClick: () => void;
}
const HomePage=({ onLoginClick }: HomePageProps)=>{
  // const [token, setToken] = useState<string | null>(null);
    const { user } = useContext(AuthContext);
    const navigate=useNavigate()
    
    function getStarted(){
      if(user){
        navigate("/dashboard");
      }else{
        onLoginClick();
      }
    }
  
  
 return (
 <main className="home">
      {/* HERO CONTENT */}
      <section className="hero">
        <h1 className="hero-title">Trade. Learn. Repeat.</h1>
        <p className="hero-subtitle">Virtual trading with real market experience</p>

        <button className="hero-btn" onClick={getStarted}>Get started</button>
      </section>

      {/* ILLUSTRATION SECTION */}
      <section className="hero-illustration">
        {/* You can replace this with an SVG or image later */}
        <img src={homeimage} alt="Investment illustration" />
      </section>
    
      {/* FOOT NOTE */}
      <section className="hero-footer">
        <p>India’s #1 Paper Trading Broker</p>
        <span>Trusted by 10Mn+ active investors</span>
      </section>
    </main>
  );
   
}



export default HomePage