import "../Styles/PolicyPages.css";
import { Link } from "react-router-dom";

const PrivacyPolicy = () => {
  const lastUpdated = "March 22, 2025";

  return (
    <div className="policy-page">
      <div className="policy-container">
        {/* Header */}
        <div className="policy-header">
          <div className="policy-badge">Legal</div>
          <h1 className="policy-title">Privacy Policy</h1>
          <p className="policy-meta">
            Last updated: <span>{lastUpdated}</span> · Effective immediately
          </p>
        </div>

        <div className="policy-intro">
          <p>
            Welcome to <strong>PaperBull</strong> ("we", "our", or "us"). Your privacy matters to us. This
            Privacy Policy explains how we collect, use, store, and protect your personal information when
            you use our paper trading platform at{" "}
            <a href="https://paperbullindia.shop" target="_blank" rel="noreferrer">
              paperbullindia.shop
            </a>
            .
          </p>
          <p>
            By accessing or using PaperBull, you agree to the collection and use of information in
            accordance with this policy.
          </p>
        </div>

        {/* TOC */}
        <div className="policy-toc">
          <h3>Table of Contents</h3>
          <ol>
            <li><a href="#information-we-collect">Information We Collect</a></li>
            <li><a href="#how-we-use">How We Use Your Information</a></li>
            <li><a href="#data-storage">Data Storage &amp; Security</a></li>
            <li><a href="#third-party">Third-Party Services</a></li>
            <li><a href="#cookies">Cookies &amp; Local Storage</a></li>
            <li><a href="#user-rights">Your Rights</a></li>
            <li><a href="#data-retention">Data Retention</a></li>
            <li><a href="#childrens-privacy">Children's Privacy</a></li>
            <li><a href="#changes">Changes to This Policy</a></li>
            <li><a href="#contact">Contact Us</a></li>
          </ol>
        </div>

        {/* Sections */}
        <section id="information-we-collect" className="policy-section">
          <h2>1. Information We Collect</h2>

          <h3>1.1 Information You Provide</h3>
          <ul>
            <li><strong>Account Details:</strong> Email address, display name, and profile picture when you sign up via Google OAuth or email/password.</li>
            <li><strong>Password:</strong> If you choose to set a password (in addition to Google login), it is securely hashed via Firebase Authentication.</li>
            <li><strong>Payment Information:</strong> When you add virtual funds using Razorpay, we receive payment confirmation data including order IDs and transaction references. We do not store your raw card or bank account details — these are handled solely by Razorpay.</li>
          </ul>

          <h3>1.2 Information Collected Automatically</h3>
          <ul>
            <li><strong>Usage Data:</strong> Pages visited, features used, stock searches, order history, and session duration.</li>
            <li><strong>Device &amp; Browser Data:</strong> IP address, browser type, operating system, and device identifiers for security and analytics purposes.</li>
            <li><strong>Authentication Tokens:</strong> Firebase ID tokens are exchanged with our backend via secure HTTP-only cookies to maintain your session.</li>
            <li><strong>WebSocket Activity:</strong> Real-time stock price subscription requests you make during your session.</li>
            <li><strong>Cookie Consent:</strong> We store your cookie acceptance preference in <code>localStorage</code> under the key <code>paperbull_cookie_consent</code>.</li>
          </ul>

          <h3>1.3 Information from Third Parties</h3>
          <ul>
            <li><strong>Google OAuth:</strong> When you sign in with Google, we receive your name, email, and profile picture as provided by Google.</li>
            <li><strong>Razorpay:</strong> Payment success/failure webhooks are received from Razorpay to update your virtual wallet balance.</li>
            <li><strong>Market Data Providers:</strong> We fetch real-time and historical stock data from market data APIs (NSE/BSE indices). This data is not tied to your personal identity.</li>
          </ul>
        </section>

        <section id="how-we-use" className="policy-section">
          <h2>2. How We Use Your Information</h2>
          <p>We use the information we collect for the following purposes:</p>
          <table className="policy-table">
            <thead>
              <tr>
                <th>Purpose</th>
                <th>Legal Basis</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Authenticating your identity and maintaining secure sessions</td>
                <td>Contractual necessity</td>
              </tr>
              <tr>
                <td>Processing virtual fund deposits and displaying wallet balance</td>
                <td>Contractual necessity</td>
              </tr>
              <tr>
                <td>Executing paper buy/sell orders and maintaining portfolio records</td>
                <td>Contractual necessity</td>
              </tr>
              <tr>
                <td>Delivering real-time stock data via WebSocket / SSE streams</td>
                <td>Contractual necessity</td>
              </tr>
              <tr>
                <td>Providing AI-generated stock insights and analysis</td>
                <td>Legitimate interest</td>
              </tr>
              <tr>
                <td>Improving platform performance and preventing abuse</td>
                <td>Legitimate interest</td>
              </tr>
              <tr>
                <td>Sending password reset emails (on your request)</td>
                <td>Consent</td>
              </tr>
              <tr>
                <td>Analyzing aggregate usage patterns (non-personal)</td>
                <td>Legitimate interest</td>
              </tr>
            </tbody>
          </table>
          <p>
            We do <strong>not</strong> sell, rent, or trade your personal data to any third party for
            marketing purposes.
          </p>
        </section>

        <section id="data-storage" className="policy-section">
          <h2>3. Data Storage &amp; Security</h2>
          <ul>
            <li>
              <strong>Database:</strong> Your account information, virtual portfolio, order history,
              and wallet balance are stored in a MongoDB database hosted on secure cloud infrastructure.
            </li>
            <li>
              <strong>Authentication:</strong> Managed by <strong>Firebase Authentication</strong> (Google's
              cloud platform), which uses industry-standard encryption and security practices.
            </li>
            <li>
              <strong>Session Tokens:</strong> Authentication tokens are stored in HTTP-only cookies with
              appropriate <code>SameSite</code> and <code>Secure</code> flags to prevent XSS attacks.
            </li>
            <li>
              <strong>HTTPS:</strong> All data transmission between your browser and our servers is
              encrypted using TLS/SSL.
            </li>
            <li>
              <strong>Rate Limiting:</strong> Our API enforces rate limits (10 AI requests per minute
              per IP) to prevent abuse.
            </li>
            <li>
              <strong>Payment Security:</strong> Razorpay webhook signatures are cryptographically
              verified before processing any payment events.
            </li>
          </ul>
          <div className="policy-note">
            <strong>Important:</strong> While we implement strong security measures, no system is 100%
            secure. We encourage you to use a strong, unique password and enable Google Sign-In for
            added security.
          </div>
        </section>

        <section id="third-party" className="policy-section">
          <h2>4. Third-Party Services</h2>
          <p>PaperBull integrates with the following third-party services, each with their own privacy policies:</p>
          <div className="policy-third-party-grid">
            <div className="policy-third-party-card">
              <div className="policy-third-party-name">Firebase (Google)</div>
              <div className="policy-third-party-role">Authentication, Google Sign-In</div>
              <a href="https://firebase.google.com/support/privacy" target="_blank" rel="noreferrer">Privacy Policy →</a>
            </div>
            <div className="policy-third-party-card">
              <div className="policy-third-party-name">Razorpay</div>
              <div className="policy-third-party-role">Payment processing for virtual funds</div>
              <a href="https://razorpay.com/privacy/" target="_blank" rel="noreferrer">Privacy Policy →</a>
            </div>
            <div className="policy-third-party-card">
              <div className="policy-third-party-name">Google APIs</div>
              <div className="policy-third-party-role">OAuth 2.0 login, profile data</div>
              <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Privacy Policy →</a>
            </div>
            <div className="policy-third-party-card">
              <div className="policy-third-party-name">Gemini AI (Google)</div>
              <div className="policy-third-party-role">AI-powered stock insights</div>
              <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Privacy Policy →</a>
            </div>
          </div>
          <p>
            We encourage you to review the privacy policies of these services. We are not responsible
            for the privacy practices of third-party services.
          </p>
        </section>

        <section id="cookies" className="policy-section">
          <h2>5. Cookies &amp; Local Storage</h2>
          <p>We use cookies and browser local storage to operate the platform. See our <Link to="/cookie-policy">Cookie Policy</Link> for full details.</p>
          <table className="policy-table">
            <thead>
              <tr>
                <th>Name / Key</th>
                <th>Type</th>
                <th>Purpose</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Session Cookie (HTTP-only)</td>
                <td>Essential</td>
                <td>Maintains your authenticated session</td>
                <td>Session / 7 days</td>
              </tr>
              <tr>
                <td><code>paperbull_cookie_consent</code></td>
                <td>Preference</td>
                <td>Stores your cookie consent decision</td>
                <td>Persistent (localStorage)</td>
              </tr>
              <tr>
                <td>Firebase Auth State</td>
                <td>Essential</td>
                <td>Maintains Firebase authentication state</td>
                <td>Session</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section id="user-rights" className="policy-section">
          <h2>6. Your Rights</h2>
          <p>Depending on your jurisdiction (including under GDPR and Indian IT Act), you have the following rights:</p>
          <ul>
            <li><strong>Right to Access:</strong> Request a copy of the personal data we hold about you.</li>
            <li><strong>Right to Correction:</strong> Update or correct inaccurate personal information.</li>
            <li><strong>Right to Deletion:</strong> Request deletion of your account and associated data.</li>
            <li><strong>Right to Withdraw Consent:</strong> Withdraw consent for optional data processing at any time.</li>
            <li><strong>Right to Data Portability:</strong> Request your data in a machine-readable format.</li>
            <li><strong>Right to Object:</strong> Object to processing based on legitimate interest.</li>
          </ul>
          <p>
            To exercise any of these rights, please contact us at{" "}
            <a href="mailto:shashankjanagam04@gmail.com">shashankjanagam04@gmail.com</a>. We will respond
            within 30 days.
          </p>
        </section>

        <section id="data-retention" className="policy-section">
          <h2>7. Data Retention</h2>
          <ul>
            <li><strong>Account Data:</strong> Retained for as long as your account is active.</li>
            <li><strong>Order History &amp; Portfolio:</strong> Retained for the lifetime of your account for your reference.</li>
            <li><strong>Transaction Records:</strong> Payment records are retained for up to <strong>7 years</strong> as required by applicable financial regulations.</li>
            <li><strong>After Account Deletion:</strong> Personal data is deleted within 30 days. Anonymized aggregate data may be retained indefinitely for analytics.</li>
          </ul>
        </section>

        <section id="childrens-privacy" className="policy-section">
          <h2>8. Children's Privacy</h2>
          <p>
            PaperBull is not directed at children under the age of <strong>18</strong>. We do not knowingly
            collect personal information from minors. If you believe a child has provided us with personal
            information, please contact us immediately and we will delete that information.
          </p>
        </section>

        <section id="changes" className="policy-section">
          <h2>9. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of significant changes
            by updating the "Last updated" date at the top of this page. Your continued use of PaperBull
            after changes are posted constitutes your acceptance of the updated policy.
          </p>
        </section>

        <section id="contact" className="policy-section">
          <h2>10. Contact Us</h2>
          <p>If you have any questions about this Privacy Policy, please reach out to us:</p>
          <div className="policy-contact-card">
            <div><strong>PaperBull India</strong></div>
            <div>Email: <a href="mailto:shashankjanagam04@gmail.com">shashankjanagam04@gmail.com</a></div>
            <div>Website: <a href="https://paperbullindia.shop" target="_blank" rel="noreferrer">paperbullindia.shop</a></div>
          </div>
        </section>

        {/* Footer nav */}
        <div className="policy-footer-nav">
          <Link to="/terms">Terms &amp; Conditions</Link>
          <Link to="/cookie-policy">Cookie Policy</Link>
          <Link to="/disclaimer">Disclaimer</Link>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
