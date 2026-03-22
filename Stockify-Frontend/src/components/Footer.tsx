import { Link } from "react-router-dom";
import "../Styles/PolicyPages.css";

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <nav className="site-footer-links" aria-label="Legal links">
        <Link to="/privacy-policy">Privacy Policy</Link>
        <Link to="/terms">Terms &amp; Conditions</Link>
        <Link to="/cookie-policy">Cookie Policy</Link>
        <Link to="/disclaimer">Disclaimer</Link>
      </nav>
      <p className="site-footer-copy">
        © {currentYear} Stockify India. All rights reserved. &nbsp;|&nbsp; Paper trading for education only. Not SEBI registered.
      </p>
    </footer>
  );
};

export default Footer;
