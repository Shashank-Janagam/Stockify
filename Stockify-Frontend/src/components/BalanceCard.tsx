import { useEffect, useState, useContext } from "react";
import { AuthContext } from "../auth/AuthProvider";
import Transactions from "./Transactions";

type Balance = {
  cash: number;
  blocked: number;
};

export default function BalanceCard({
  refreshKey,
}: {
  refreshKey: number;
}) {
  const { user } = useContext(AuthContext);

  const [token, setToken] = useState<string | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
const [transactions, setTransactions] = useState<any[]>([]);
const HOST=import.meta.env.VITE_HOST_ADDRESS
  /* =========================
     FETCH TOKEN
  ========================= */
  console.log("HOST =", HOST);
console.log("Final URL =", `${HOST}/api/searchUpdates/recent`);

  useEffect(() => {
    if (!user || typeof user.getIdToken !== "function") return;

    let mounted = true;

    const fetchToken = async () => {
      try {
        const jwt = await user.getIdToken(true);
        if (mounted) setToken(jwt);
      } catch (err) {
        console.error("Failed to fetch token", err);
        if (mounted) setError("Authentication failed");
      }
    };

    fetchToken();

    return () => {
      mounted = false;
    };
  }, [user,refreshKey]);

  useEffect(() => {
  if (!token) return;

  fetch(`${HOST}/api/transactions`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  })
    .then((res) => res.json())
    .then(setTransactions)
    .catch(console.error);
}, [token, refreshKey]); // 🔥 refresh when payment happens


  /* =========================
     FETCH BALANCE (AFTER TOKEN)
  ========================= */
  useEffect(() => {
    if (!token) return; // 🔥 wait for token

    let mounted = true;

    const fetchBalance = async () => {
      try {
        const res = await fetch( `${HOST}/api/getBalance/getBalance`,
          {
            // method: "GET",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`
            },
            // credentials: "include"
          }
        );

        if (!res.ok) throw new Error("Failed to fetch balance");

        const data = await res.json();
        console.log(data)
        if (mounted) setBalance(data);
      } catch (err) {
        console.error(err);
        if (mounted) setError("Unable to load balance");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchBalance();

    return () => {
      mounted = false;
    };
  }, [token]); // 🔥 DEPENDS ON TOKEN

  /* =========================
     UI STATES
  ========================= */
  if (loading) {
    return (
      <div className="card balance-card">
        <p className="card-title">Stocks, F&O balance</p>
        <h1 className="balance-amount">₹—</h1>
      </div>
    );
  }

  if (error || !balance) {
    return (
      <div className="card balance-card">
        <p className="card-title">Stocks, F&O balance</p>
        <p className="muted">{error ?? "No balance data"}</p>
      </div>
    );
  }

  const cash = balance.cash ?? 0;
  const [rupees, paise] = cash.toFixed(2).split(".");

  return (
    <div className="card balance-card">
      <p className="card-title">Stocks, F&O balance</p>

      <h1 className="balance-amount">
        ₹{Number(rupees).toLocaleString("en-IN")}
        <span>.{paise}</span>
      </h1>

      <div className="divider" />

      <div className="row">
        <span>Cash</span>
        <span className="dashed">
          ₹{cash.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
        </span>
      </div>

      

      <Transactions transactions={transactions} />

    </div>
  );
}
