import { useEffect, useState, useContext } from "react";
import { AuthContext } from "../auth/AuthProvider";
type AddMoneyCardProps = {
  onPaymentSuccess: () => void;
  initialAmount:number
};

export default function AddMoneyCard({onPaymentSuccess,initialAmount}: AddMoneyCardProps) {
        const { user } = useContext(AuthContext);
const HOST=import.meta.env.VITE_HOST_ADDRESS

        const [token, setToken] = useState<string | null>(null);
        

      useEffect(() => {
        if (!user || typeof user.getIdToken !== "function") return;
    
        let mounted = true;
    
        const fetchToken = async () => {
          try {
            const jwt = await user.getIdToken(true);
            if (mounted) setToken(jwt);
          } catch (err) {
            console.error("Failed to fetch token", err);
            if (mounted) console.log("Authentication failed");
          }
        };
    
        fetchToken();
    
        return () => {
          mounted = false;
        };
      }, [user]);


  const [value, setValue] = useState(`${initialAmount}`);

  const formatINR = (val: string) =>
    val ? Number(val).toLocaleString("en-IN") : "";

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/,/g, "").replace(/\D/g, "");
    setValue(raw);
  };

  const [loading, setLoading] = useState(false);

  const handlePay = async () => {
    if (loading) return;

    if (!token) {
        alert("Please login to add money");
        return;
    }

    if (!window.Razorpay) {
      alert("Razorpay not loaded");
      return;
    }

    const amount = Number(value);
    if (!amount || amount < 1) {
      alert("Enter valid amount");
      return;
    }

    try {
        setLoading(true);

        // 1️⃣ Create order from backend
        const res = await fetch(
        `${HOST}/api/payments/create-order`,
        {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amount }),
        }
        );

        if (!res.ok) {
            throw new Error("Failed to create order");
        }

        const order = await res.json();

        // 2️⃣ Razorpay options
        const options = {
        key: "rzp_test_S85ZxvSHIvbK0f", // 🔑 ONLY key_id
        amount: order.amount,
        currency: "INR",
        name: "Stockify Wallet",
        description: "Add Money",
        order_id: order.id,

        handler: async (response: any) => {
            try {
                const verify = await fetch(
                `${HOST}/api/payments/verify`,
                {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(response),
                }
                );

                const result = await verify.json();
                console.log('💳 Payment verification result:', result);

                if (result.success) {
                    console.log('✅ Payment successful, triggering balance refreshes...');
                    onPaymentSuccess(); 
                    setTimeout(() => onPaymentSuccess(), 1000);
                    setTimeout(() => onPaymentSuccess(), 2500);
                    setValue(""); // Clear input
                }
            } catch (error) {
                console.error("Verification failed", error);
            } finally {
                setLoading(false);
            }
        },
        modal: {
            ondismiss: function() {
                setLoading(false);
            }
        },
        theme: {
            color: "#4caf8a",
        },
        };

        // 3️⃣ Open Razorpay
        const rzp = new window.Razorpay(options);
        rzp.open();
    } catch (err) {
        console.error("Payment error:", err);
        setLoading(false);
        alert("Failed to initiate payment");
    }
  };

  return (
    <div className="card add-money-card">
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px', gap: '10px' }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          width: '32px', 
          height: '32px', 
          backgroundColor: 'rgba(16, 185, 129, 0.1)', 
          borderRadius: '8px'
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 12V8C20 6.89543 19.1046 6 18 6H6C4.89543 6 4 6.89543 4 8V16C4 17.1046 4.89543 18 6 18H18C19.1046 18 20 17.1046 20 16V14M20 12H17C15.8954 12 15 12.8954 15 14C15 15.1046 15.8954 16 17 16H20M20 12V14" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <p className="card-title" style={{ margin: 0, color: '#64748b' }}>Wallet Top-up</p>
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
            if (e.key === "Enter") {
              handlePay();
            }
          }}
        />
      </div>

      <div className="quick-add">
        {[1000, 5000, 10000].map((v) => (
          <button
            key={v}
            onClick={() =>
              setValue(String(Number(value || 0) + v))
            }
          >
            +₹{v.toLocaleString()}
          </button>
        ))}
      </div>

      <button 
        className={`primary-btn ${loading ? "btn-loading" : ""}`} 
        onClick={handlePay}
        disabled={loading}
      >
        {loading ? "Initializing..." : "Add Money"}
      </button>

      <p style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', marginTop: '20px' }}>
        Secured by Razorpay. Instant settlement to Vault.
      </p>
    </div>
  );
}
