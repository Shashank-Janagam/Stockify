import { useState } from "react";
import WalletTopupModal from "./WalletTopupModal";

type AddMoneyCardProps = {
  onPaymentSuccess: () => void;
  initialAmount: number;
};

export default function AddMoneyCard({ onPaymentSuccess, initialAmount }: AddMoneyCardProps) {
  const [value, setValue] = useState(`${initialAmount}`);
  const [showModal, setShowModal] = useState(false);

  const formatINR = (val: string) =>
    val ? Number(val).toLocaleString("en-IN") : "";

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/,/g, "").replace(/\D/g, "");
    setValue(raw);
  };

  const handleAddMoney = () => {
    const amount = Number(value);
    if (!amount || amount < 1) {
      alert("Please enter a valid amount");
      return;
    }
    setShowModal(true);
  };

  const handleSuccess = () => {
    onPaymentSuccess();
  };

  const amount = Number(value);

  return (
    <>
      <div className="card add-money-card">
        <div style={{ display: "flex", alignItems: "center", marginBottom: "24px", gap: "10px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "32px",
              height: "32px",
              backgroundColor: "rgba(16, 185, 129, 0.1)",
              borderRadius: "8px",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M20 12V8C20 6.89543 19.1046 6 18 6H6C4.89543 6 4 6.89543 4 8V16C4 17.1046 4.89543 18 6 18H18C19.1046 18 20 17.1046 20 16V14M20 12H17C15.8954 12 15 12.8954 15 14C15 15.1046 15.8954 16 17 16H20M20 12V14"
                stroke="#10b981"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <p className="card-title" style={{ margin: 0, color: "#64748b" }}>
            Wallet Top-up
          </p>
        </div>

        <div className="tabs">
          <span className="active">Deposit</span>
          <span>Withdraw</span>
        </div>

        <div className="amount-input-row">
          <span className="rupee">₹</span>
          <input
            type="text"
            inputMode="numeric"
            value={formatINR(value)}
            onChange={handleChange}
            className="amount-input"
            placeholder="0"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddMoney();
            }}
          />
        </div>

        <div className="quick-add">
          {[1000, 5000, 10000].map((v) => (
            <button
              key={v}
              onClick={() => setValue(String(Number(value || 0) + v))}
            >
              +₹{v.toLocaleString()}
            </button>
          ))}
        </div>

        <button
          className="primary-btn"
          onClick={handleAddMoney}
          disabled={!amount || amount < 1}
        >
          Add Money
        </button>

        <p
          style={{
            fontSize: "12px",
            color: "#94a3b8",
            textAlign: "center",
            marginTop: "20px",
          }}
        >
          🤖 AI-powered behavioral check · Instant settlement to Vault
        </p>
      </div>

      {/* Custom Popup Modal (Razorpay-style) */}
      {showModal && (
        <WalletTopupModal
          amount={amount}
          onClose={() => setShowModal(false)}
          onSuccess={handleSuccess}
        />
      )}
    </>
  );
}
