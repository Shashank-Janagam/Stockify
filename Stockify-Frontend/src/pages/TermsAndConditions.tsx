import "../Styles/PolicyPages.css";
import { Link } from "react-router-dom";

const TermsAndConditions = () => {
  const lastUpdated = "March 22, 2025";

  return (
    <div className="policy-page">
      <div className="policy-container">
        {/* Header */}
        <div className="policy-header">
          <div className="policy-badge">Legal</div>
          <h1 className="policy-title">Terms &amp; Conditions</h1>
          <p className="policy-meta">
            Last updated: <span>{lastUpdated}</span> · Please read carefully before using PaperBull
          </p>
        </div>

        <div className="policy-intro">
          <p>
            These Terms and Conditions ("Terms") govern your access to and use of the PaperBull platform
            available at{" "}
            <a href="https://paperbullindia.shop" target="_blank" rel="noreferrer">
              paperbullindia.shop
            </a>{" "}
            ("Platform"), operated by <strong>PaperBull India</strong> ("we", "us", or "our").
          </p>
          <p>
            By creating an account or using any part of this Platform, you agree to be bound by these
            Terms. If you do not agree, please do not use PaperBull.
          </p>
        </div>

        <div className="policy-toc">
          <h3>Table of Contents</h3>
          <ol>
            <li><a href="#nature-of-service">Nature of Service</a></li>
            <li><a href="#eligibility">Eligibility</a></li>
            <li><a href="#account">Account Registration &amp; Responsibilities</a></li>
            <li><a href="#virtual-funds">Virtual Funds &amp; Payments</a></li>
            <li><a href="#trading">Paper Trading Rules</a></li>
            <li><a href="#ai-content">AI-Generated Content</a></li>
            <li><a href="#prohibited">Prohibited Activities</a></li>
            <li><a href="#intellectual-property">Intellectual Property</a></li>
            <li><a href="#disclaimer-of-warranties">Disclaimer of Warranties</a></li>
            <li><a href="#limitation-of-liability">Limitation of Liability</a></li>
            <li><a href="#termination">Termination</a></li>
            <li><a href="#governing-law">Governing Law</a></li>
            <li><a href="#changes">Changes to Terms</a></li>
            <li><a href="#contact-terms">Contact</a></li>
          </ol>
        </div>

        <section id="nature-of-service" className="policy-section">
          <h2>1. Nature of Service</h2>
          <div className="policy-highlight-box">
            <strong>⚠️ PaperBull is a paper trading (simulated trading) platform only.</strong>
            <p>
              All trading activity on PaperBull uses <strong>virtual (simulated) money</strong>. No real
              securities are bought or sold. No real financial gains or losses occur. PaperBull is a
              purely educational tool designed to help users learn trading without financial risk.
            </p>
          </div>
          <ul>
            <li>Market data displayed is sourced from public APIs and may have delays.</li>
            <li>Virtual portfolio performance does not reflect real-world trading outcomes.</li>
            <li>We are <strong>not</strong> a SEBI-registered broker, financial advisor, or investment intermediary.</li>
            <li>Real-money investments in securities must be made through SEBI-registered entities only.</li>
          </ul>
        </section>

        <section id="eligibility" className="policy-section">
          <h2>2. Eligibility</h2>
          <p>To use PaperBull, you must:</p>
          <ul>
            <li>Be at least <strong>18 years of age</strong> or the age of majority in your jurisdiction.</li>
            <li>Have the legal capacity to enter into binding agreements.</li>
            <li>Not be prohibited from using the Platform under applicable laws.</li>
            <li>Provide accurate and truthful information during registration.</li>
          </ul>
          <p>
            By using PaperBull, you represent and warrant that you meet all eligibility requirements. We
            reserve the right to terminate accounts that do not meet these criteria.
          </p>
        </section>

        <section id="account" className="policy-section">
          <h2>3. Account Registration &amp; Responsibilities</h2>
          <h3>3.1 Registration</h3>
          <p>You may create an account using:</p>
          <ul>
            <li><strong>Google Sign-In</strong> via Firebase OAuth</li>
            <li><strong>Email and Password</strong> (with optional password setup post-Google sign-in)</li>
          </ul>

          <h3>3.2 Account Security</h3>
          <ul>
            <li>You are responsible for maintaining the confidentiality of your login credentials.</li>
            <li>You must immediately notify us of any unauthorized account access.</li>
            <li>We are not liable for losses caused by unauthorized access due to your failure to secure credentials.</li>
            <li>You may not share your account with or transfer it to any other person.</li>
          </ul>

          <h3>3.3 Account Accuracy</h3>
          <p>
            You agree to provide accurate, current, and complete information and to update it as necessary.
            We reserve the right to suspend or terminate accounts with false information.
          </p>
        </section>

        <section id="virtual-funds" className="policy-section">
          <h2>4. Virtual Funds &amp; Payments</h2>
          <div className="policy-highlight-box">
            <strong>Important:</strong> Real money deposited into PaperBull is used to purchase
            <em>virtual trading credits</em> only. These credits have no real monetary value and cannot
            be withdrawn, redeemed, or exchanged for real money or assets.
          </div>
          <ul>
            <li>
              Payments are processed through <strong>Razorpay</strong>. By making a payment, you also
              agree to Razorpay's{" "}
              <a href="https://razorpay.com/terms/" target="_blank" rel="noreferrer">Terms of Service</a>.
            </li>
            <li>
              Virtual wallet balance is credited only after successful payment confirmation via Razorpay
              webhooks, verified with cryptographic signatures.
            </li>
            <li>
              <strong>No Refunds:</strong> Payments for virtual credits are non-refundable except as
              required by applicable law or at our sole discretion.
            </li>
            <li>Virtual credits may expire if your account is inactive for more than 12 months.</li>
            <li>We reserve the right to reset virtual balances for maintenance, abuse prevention, or at your request.</li>
          </ul>
        </section>

        <section id="trading" className="policy-section">
          <h2>5. Paper Trading Rules</h2>
          <ul>
            <li>
              <strong>Market Hours:</strong> Paper trades are executed during Indian market hours based
              on real-time NSE/BSE data. Orders placed outside market hours may be queued.
            </li>
            <li>
              <strong>Order Types:</strong> The platform supports buy and sell orders for equities (F&amp;O
              included where available). Intraday positions may be subject to automatic square-off.
            </li>
            <li>
              <strong>Price Accuracy:</strong> Executed prices reflect real-time or near-real-time market
              data. Slight deviations may occur due to data feed latency.
            </li>
            <li>
              <strong>Portfolio Limits:</strong> We may impose virtual fund limits or position limits
              at our discretion to ensure platform fairness.
            </li>
            <li>
              <strong>Data Use:</strong> Your simulated trading activity and portfolio data may be used
              to improve the platform and generate analytics (in anonymized form).
            </li>
          </ul>
        </section>

        <section id="ai-content" className="policy-section">
          <h2>6. AI-Generated Content</h2>
          <p>
            PaperBull provides AI-generated stock insights and analysis powered by <strong>Google Gemini AI</strong>.
          </p>
          <ul>
            <li>AI insights are provided <strong>for educational purposes only</strong> and do not constitute financial advice.</li>
            <li>AI-generated content may be inaccurate, incomplete, or outdated.</li>
            <li>We are not responsible for any decisions made based on AI-generated content.</li>
            <li>AI features are subject to rate limiting (10 requests per minute per user).</li>
            <li>You must not attempt to extract, reproduce, or misuse AI-generated content at scale.</li>
          </ul>
        </section>

        <section id="prohibited" className="policy-section">
          <h2>7. Prohibited Activities</h2>
          <p>You agree not to:</p>
          <ul>
            <li>Use the Platform for any unlawful purpose or in violation of any regulations.</li>
            <li>Attempt to hack, reverse-engineer, or probe the Platform's security.</li>
            <li>Use automated scripts, bots, or scrapers to extract data or abuse APIs.</li>
            <li>Create multiple accounts to gain unfair advantages in virtual trading.</li>
            <li>Attempt to manipulate the virtual market or exploit pricing glitches.</li>
            <li>Misrepresent your identity or impersonate another user or entity.</li>
            <li>Transmit malicious code, viruses, or harmful content through the Platform.</li>
            <li>Interfere with or disrupt the integrity of WebSocket streams or backend services.</li>
            <li>Use the Platform in a way that could damage our reputation or harm other users.</li>
          </ul>
          <p>Violation may result in immediate account suspension or termination without notice.</p>
        </section>

        <section id="intellectual-property" className="policy-section">
          <h2>8. Intellectual Property</h2>
          <ul>
            <li>
              All content, design, code, logos, and trademarks on PaperBull are owned by or licensed to
              PaperBull India. You may not copy, reproduce, or distribute them without written permission.
            </li>
            <li>
              Stock market data displayed on the Platform is sourced from third-party providers and is
              subject to their respective terms and copyrights.
            </li>
            <li>
              By using PaperBull, you grant us a non-exclusive, royalty-free license to use your anonymized
              usage data to improve the Platform.
            </li>
          </ul>
        </section>

        <section id="disclaimer-of-warranties" className="policy-section">
          <h2>9. Disclaimer of Warranties</h2>
          <p>
            THE PLATFORM IS PROVIDED <strong>"AS IS"</strong> AND <strong>"AS AVAILABLE"</strong> WITHOUT
            WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO:
          </p>
          <ul>
            <li>Accuracy or completeness of market data</li>
            <li>Uninterrupted or error-free service (including WebSocket/SSE streams)</li>
            <li>Suitability of the Platform for any particular purpose</li>
            <li>The accuracy of AI-generated insights or analysis</li>
          </ul>
          <p>
            We do not warrant that the Platform will meet your specific requirements or that it will be
            available at all times.
          </p>
        </section>

        <section id="limitation-of-liability" className="policy-section">
          <h2>10. Limitation of Liability</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, PAPERBULL INDIA SHALL NOT BE LIABLE FOR ANY
            INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED
            TO:
          </p>
          <ul>
            <li>Loss of virtual funds due to technical errors</li>
            <li>Decisions made based on Platform data or AI content</li>
            <li>Interruption of service due to maintenance or outages</li>
            <li>Unauthorized access to your account</li>
          </ul>
          <p>
            Our total liability to you shall not exceed the amount you paid in the last 3 months of
            using the Platform. Since PaperBull uses virtual money, this amount may be zero in many cases.
          </p>
        </section>

        <section id="termination" className="policy-section">
          <h2>11. Termination</h2>
          <ul>
            <li>
              <strong>By You:</strong> You may delete your account at any time by contacting us. Upon
              deletion, your personal data will be removed within 30 days, subject to legal retention
              obligations.
            </li>
            <li>
              <strong>By Us:</strong> We may suspend or terminate your account for violation of these
              Terms, suspected fraud or abuse, at our sole discretion, or if required by law.
            </li>
            <li>
              Upon termination, your access to the Platform and your virtual portfolio will be revoked.
            </li>
          </ul>
        </section>

        <section id="governing-law" className="policy-section">
          <h2>12. Governing Law</h2>
          <p>
            These Terms shall be governed by and construed in accordance with the laws of{" "}
            <strong>India</strong>. Any disputes arising from these Terms shall be subject to the exclusive
            jurisdiction of courts located in <strong>India</strong>. You agree to resolve disputes through
            good-faith negotiation before pursuing legal action.
          </p>
        </section>

        <section id="changes" className="policy-section">
          <h2>13. Changes to Terms</h2>
          <p>
            We reserve the right to modify these Terms at any time. Material changes will be communicated
            by updating the "Last updated" date. Your continued use of PaperBull after changes are made
            constitutes your acceptance of the revised Terms.
          </p>
        </section>

        <section id="contact-terms" className="policy-section">
          <h2>14. Contact</h2>
          <p>For questions about these Terms, contact us at:</p>
          <div className="policy-contact-card">
            <div><strong>PaperBull India</strong></div>
            <div>Email: <a href="mailto:shashankjanagam04@gmail.com">shashankjanagam04@gmail.com</a></div>
            <div>Website: <a href="https://paperbullindia.shop" target="_blank" rel="noreferrer">paperbullindia.shop</a></div>
          </div>
        </section>

        <div className="policy-footer-nav">
          <Link to="/privacy-policy">Privacy Policy</Link>
          <Link to="/cookie-policy">Cookie Policy</Link>
          <Link to="/disclaimer">Disclaimer</Link>
        </div>
      </div>
    </div>
  );
};

export default TermsAndConditions;
