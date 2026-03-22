import "../Styles/PolicyPages.css";
import { Link } from "react-router-dom";

const CookiePolicy = () => {
  const lastUpdated = "March 22, 2025";

  const handleClearConsent = () => {
    localStorage.removeItem("stockify_cookie_consent");
    alert("Cookie preference cleared. The consent banner will reappear on reload.");
    window.location.reload();
  };

  return (
    <div className="policy-page">
      <div className="policy-container">
        <div className="policy-header">
          <div className="policy-badge">Legal</div>
          <h1 className="policy-title">Cookie Policy</h1>
          <p className="policy-meta">
            Last updated: <span>{lastUpdated}</span> · Applies to stockifyindia.shop
          </p>
        </div>

        <div className="policy-intro">
          <p>
            This Cookie Policy explains how <strong>Stockify India</strong> uses cookies and similar
            browser storage technologies on{" "}
            <a href="https://stockifyindia.shop" target="_blank" rel="noreferrer">
              stockifyindia.shop
            </a>
            . This policy should be read alongside our{" "}
            <Link to="/privacy-policy">Privacy Policy</Link>.
          </p>
        </div>

        <div className="policy-toc">
          <h3>Table of Contents</h3>
          <ol>
            <li><a href="#what-are-cookies">What Are Cookies?</a></li>
            <li><a href="#how-we-use-cookies">How We Use Cookies</a></li>
            <li><a href="#cookie-inventory">Cookie Inventory</a></li>
            <li><a href="#local-storage">Local Storage Usage</a></li>
            <li><a href="#third-party-cookies">Third-Party Cookies</a></li>
            <li><a href="#manage-cookies">Managing Your Preferences</a></li>
            <li><a href="#cookie-contact">Contact</a></li>
          </ol>
        </div>

        <section id="what-are-cookies" className="policy-section">
          <h2>1. What Are Cookies?</h2>
          <p>
            Cookies are small text files that are placed on your device (computer, tablet, or mobile)
            when you visit a website. They are widely used to make websites work efficiently and to
            provide information to website operators.
          </p>
          <p>
            Stockify also uses similar storage technologies such as <strong>localStorage</strong> and
            <strong> sessionStorage</strong> to provide a seamless experience. This policy covers all
            such technologies.
          </p>
        </section>

        <section id="how-we-use-cookies" className="policy-section">
          <h2>2. How We Use Cookies</h2>
          <p>We use cookies and storage technologies for the following purposes:</p>
          <div className="policy-cookie-categories">
            <div className="policy-cookie-category essential">
              <div className="policy-cookie-category-header">
                <span className="policy-cookie-category-badge">Essential</span>
                <span>Always Active</span>
              </div>
              <p>
                These cookies are strictly necessary for Stockify to function. Without them, you cannot
                log in, maintain a session, or use the trading features. They cannot be disabled.
              </p>
            </div>
            <div className="policy-cookie-category preference">
              <div className="policy-cookie-category-header">
                <span className="policy-cookie-category-badge">Preference</span>
                <span>Can be cleared</span>
              </div>
              <p>
                These remember your choices such as your cookie consent decision, so you're not asked
                again on every visit.
              </p>
            </div>
            <div className="policy-cookie-category analytics">
              <div className="policy-cookie-category-header">
                <span className="policy-cookie-category-badge">Analytics</span>
                <span>Third-party</span>
              </div>
              <p>
                Firebase may set analytics cookies to help us understand how users interact with the
                Platform. This data is aggregated and anonymized.
              </p>
            </div>
          </div>
        </section>

        <section id="cookie-inventory" className="policy-section">
          <h2>3. Cookie Inventory</h2>
          <p>Here is a complete list of the cookies and storage items used by Stockify:</p>
          <table className="policy-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Source</th>
                <th>Purpose</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>session</code> (HTTP-only)</td>
                <td>Essential</td>
                <td>Stockify</td>
                <td>Authenticates your session with the backend using Firebase ID token</td>
                <td>7 days or session end</td>
              </tr>
              <tr>
                <td>Firebase Auth Cookie</td>
                <td>Essential</td>
                <td>Firebase (Google)</td>
                <td>Maintains your Firebase Authentication state across page reloads</td>
                <td>Session / persistent</td>
              </tr>
              <tr>
                <td><code>_ga</code>, <code>_gid</code></td>
                <td>Analytics</td>
                <td>Google Analytics (via Firebase)</td>
                <td>Differentiates users and sessions for usage analytics</td>
                <td>2 years / 24 hours</td>
              </tr>
              <tr>
                <td>Razorpay Checkout</td>
                <td>Essential</td>
                <td>Razorpay</td>
                <td>Session state during payment checkout flow</td>
                <td>Session</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section id="local-storage" className="policy-section">
          <h2>4. Local Storage Usage</h2>
          <p>
            In addition to cookies, Stockify uses <code>localStorage</code> (browser-side storage that
            persists after closing the browser) for the following:
          </p>
          <table className="policy-table">
            <thead>
              <tr>
                <th>Key</th>
                <th>Purpose</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>stockify_cookie_consent</code></td>
                <td>Records that you have acknowledged and accepted our cookie policy</td>
                <td>Persistent until manually cleared</td>
              </tr>
              <tr>
                <td>Firebase Auth Persistence</td>
                <td>
                  Firebase stores authentication tokens in localStorage to keep you logged in across
                  sessions (IndexedDB under <code>firebase:authUser:*</code>)
                </td>
                <td>Until logout or token expiry</td>
              </tr>
            </tbody>
          </table>
          <div className="policy-note">
            <strong>Note:</strong> Stockify requires cookies and localStorage to be enabled. If your
            browser has these disabled, you will see a warning asking you to re-enable them.
          </div>
        </section>

        <section id="third-party-cookies" className="policy-section">
          <h2>5. Third-Party Cookies</h2>
          <p>
            Some cookies are placed by third-party services that we use. We do not control these cookies.
          </p>
          <ul>
            <li>
              <strong>Firebase / Google:</strong> Firebase Authentication sets cookies to maintain your
              login state.{" "}
              <a href="https://firebase.google.com/support/privacy" target="_blank" rel="noreferrer">
                Firebase Privacy Policy
              </a>
            </li>
            <li>
              <strong>Razorpay:</strong> The Razorpay Checkout SDK sets session cookies during payment
              flows.{" "}
              <a href="https://razorpay.com/privacy/" target="_blank" rel="noreferrer">
                Razorpay Privacy Policy
              </a>
            </li>
            <li>
              <strong>Google APIs:</strong> Google OAuth may set cookies for sign-in session management.{" "}
              <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">
                Google Privacy Policy
              </a>
            </li>
          </ul>
        </section>

        <section id="manage-cookies" className="policy-section">
          <h2>6. Managing Your Preferences</h2>

          <h3>6.1 Withdraw Consent</h3>
          <p>
            You can withdraw your cookie consent at any time. Clicking the button below will clear your
            stored preference and show the cookie consent banner again on the next page load.
          </p>
          <button className="policy-action-btn" onClick={handleClearConsent}>
            Clear Cookie Consent &amp; Reset Preferences
          </button>

          <h3>6.2 Browser Settings</h3>
          <p>
            Most browsers allow you to control cookies through their settings. However, disabling
            essential cookies will break core Stockify functionality including login and trading.
          </p>
          <p>Browser-specific cookie management guides:</p>
          <ul>
            <li>
              <a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noreferrer">
                Google Chrome
              </a>
            </li>
            <li>
              <a
                href="https://support.mozilla.org/en-US/kb/cookies-information-websites-store-on-your-computer"
                target="_blank"
                rel="noreferrer"
              >
                Mozilla Firefox
              </a>
            </li>
            <li>
              <a
                href="https://support.apple.com/guide/safari/manage-cookies-sfri11471/mac"
                target="_blank"
                rel="noreferrer"
              >
                Apple Safari
              </a>
            </li>
            <li>
              <a
                href="https://support.microsoft.com/en-us/microsoft-edge/delete-cookies-in-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09"
                target="_blank"
                rel="noreferrer"
              >
                Microsoft Edge
              </a>
            </li>
          </ul>

          <h3>6.3 Do Not Track</h3>
          <p>
            Stockify currently does not respond to "Do Not Track" (DNT) browser signals. We will update
            this policy when DNT compliance is implemented.
          </p>
        </section>

        <section id="cookie-contact" className="policy-section">
          <h2>7. Contact</h2>
          <p>For questions about our use of cookies, please contact:</p>
          <div className="policy-contact-card">
            <div><strong>Stockify India</strong></div>
            <div>Email: <a href="mailto:shashankjanagam04@gmail.com">shashankjanagam04@gmail.com</a></div>
            <div>Website: <a href="https://stockifyindia.shop" target="_blank" rel="noreferrer">stockifyindia.shop</a></div>
          </div>
        </section>

        <div className="policy-footer-nav">
          <Link to="/privacy-policy">Privacy Policy</Link>
          <Link to="/terms">Terms &amp; Conditions</Link>
          <Link to="/disclaimer">Disclaimer</Link>
        </div>
      </div>
    </div>
  );
};

export default CookiePolicy;
