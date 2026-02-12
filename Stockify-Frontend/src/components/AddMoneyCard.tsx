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

  const handlePay = async () => {

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

    // 1️⃣ Create order from backend
    const res = await fetch(
      `${HOST}/api/payments/create-order`,
      {
        method: "POST",
        credentials:"include",

        headers: { "Content-Type": "application/json",

         },
        body: JSON.stringify({ amount }),
      }
    );

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
        const verify = await fetch(
           `${HOST}/api/payments/verify`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json",
                              Authorization: `Bearer ${token}`

             },
            body: JSON.stringify(response),
          }
        );

        const result = await verify.json();

        if (result.success) {
            onPaymentSuccess(); // 🔥 triggers BalanceCard refetch

        } 
      },

      theme: {
        color: "#4caf8a",
      },
    };

    // 3️⃣ Open Razorpay
    const rzp = new window.Razorpay(options);
    rzp.open();
  };

  return (
    <div className="card add-money-card">
      <div className="tabs">
        <span className="active">Add money</span>
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

      {/* ✅ Razorpay only opens on click */}
      <button className="primary-btn" onClick={handlePay}>
        Add money
      </button>
    </div>
  );
}
