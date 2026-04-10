import "../Styles/PolicyPages.css";
import "../Styles/CustomerSupport.css";
import { Link } from "react-router-dom";

const CustomerSupport = () => {
  return (
    <div className="policy-page support-page">
      <div className="policy-container">

        {/* Header */}
        <div className="policy-header">
          <div className="policy-badge support-badge">Support</div>
          <h1 className="policy-title">Customer Support</h1>
          <p className="policy-meta">
            We're here for you — <span className="support-24x7-label">24 × 7</span>, every day of the year
          </p>
        </div>

        {/* Intro */}
        <div className="policy-intro">
          <p>
            Have a question, concern, or issue with your <strong>Stockify</strong> account? Our support
            team is always available to help. Reach out to us through any of the channels below and we
            will get back to you as quickly as possible.
          </p>
        </div>

        {/* Contact Cards */}
        <div className="support-contact-grid">

          <div className="support-contact-card">
            <div className="support-contact-icon">✉️</div>
            <div className="support-contact-label">Email Support</div>
            <div className="support-contact-value">
              <a href="mailto:shashankjanagam04@gmail.com">shashankjanagam04@gmail.com</a>
            </div>
            <p className="support-contact-note">
              Send us an email anytime. We typically respond within <strong>24 hours</strong>.
            </p>
          </div>

          <div className="support-contact-card">
            <div className="support-contact-icon">🌐</div>
            <div className="support-contact-label">Website</div>
            <div className="support-contact-value">
              <a href="https://stockifyindia.shop" target="_blank" rel="noreferrer">
                stockifyindia.shop
              </a>
            </div>
            <p className="support-contact-note">
              Visit our website for platform updates, announcements, and more.
            </p>
          </div>

          <div className="support-contact-card">
            <div className="support-contact-icon">📞</div>
            <div className="support-contact-label">Phone Support</div>
            <div className="support-contact-value">
              <a href="tel:+918001234567">+91 957 398 6621</a>
            </div>
            <p className="support-contact-note">
              Available <strong>24 × 7</strong>. For urgent account or payment issues.
            </p>
          </div>

        </div>

        {/* FAQ Highlights */}
        <section className="policy-section">
          <h2>Frequently Asked Questions</h2>

          <div className="support-faq-list">

            <div className="support-faq-item">
              <div className="support-faq-q">How do I add virtual funds to my wallet?</div>
              <div className="support-faq-a">
                Go to <strong>Funds</strong> in the navbar and use the Razorpay-powered top-up flow to add
                virtual money. Use any test card for demo payment.
              </div>
            </div>

            <div className="support-faq-item">
              <div className="support-faq-q">How do I reset my password?</div>
              <div className="support-faq-a">
                If you signed up via Google, click <strong>Set Password</strong> in your profile dropdown.
                Otherwise, use the "Forgot Password" link on the login screen to receive a reset email.
              </div>
            </div>

            <div className="support-faq-item">
              <div className="support-faq-q">Can I delete my account and data?</div>
              <div className="support-faq-a">
                Yes. Email us at{" "}
                <a href="mailto:shashankjanagam04@gmail.com">shashankjanagam04@gmail.com</a> with your
                registered email address and we will permanently delete your account and data within
                30 days, as per our{" "}
                <Link to="/privacy-policy">Privacy Policy</Link>.
              </div>
            </div>

            <div className="support-faq-item">
              <div className="support-faq-q">My order did not execute — what should I do?</div>
              <div className="support-faq-a">
                Check your <strong>Order History</strong> in the Dashboard. If the issue persists, contact
                us with your order details and we'll investigate promptly.
              </div>
            </div>

            <div className="support-faq-item">
              <div className="support-faq-q">Is Stockify safe? How is my data handled?</div>
              <div className="support-faq-a">
                Absolutely. All data is encrypted via TLS, and authentication is powered by Firebase.
                Read our full <Link to="/privacy-policy">Privacy Policy</Link> for complete details.
              </div>
            </div>

          </div>
        </section>

        {/* Response Time Banner */}
        <div className="support-response-banner">
          <span className="support-response-icon">⚡</span>
          <span>
            Average response time: <strong>Under 24 hours</strong> via email ·{" "}
            <strong>Immediate</strong> via phone
          </span>
        </div>

        {/* Policy footer nav */}
        <div className="policy-footer-nav">
          <Link to="/privacy-policy">Privacy Policy</Link>
          <Link to="/terms">Terms &amp; Conditions</Link>
          <Link to="/cookie-policy">Cookie Policy</Link>
          <Link to="/disclaimer">Disclaimer</Link>
        </div>

      </div>
    </div>
  );
};

export default CustomerSupport;
