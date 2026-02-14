import { useEffect, useState, useContext } from "react";
import { AuthContext } from "../auth/AuthProvider";
import Transactions, { type Transaction } from "./Transactions";

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

  const [balance, setBalance] = useState<Balance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const HOST = import.meta.env.VITE_HOST_ADDRESS;

  /* =========================
     FETCH TRANSACTIONS
  ========================= */
  useEffect(() => {
    if (!user) return;

    fetch(`${HOST}/api/transactions`, {
      credentials: "include",
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch transactions");
        return res.json();
      })
      .then((data: Transaction[]) => {
        setTransactions(data);
      })
      .catch((err) => {
        console.error("Error fetching transactions:", err);
        setTransactions([]);
      });
  }, [user, refreshKey, HOST]);

  /* =========================
     FETCH BALANCE
  ========================= */
  useEffect(() => {
    if (!user) return;

    let mounted = true;

    const fetchBalance = async () => {
      try {
        const res = await fetch(`${HOST}/api/getBalance/getBalance`, {
          credentials: "include",
        });

        if (!res.ok) throw new Error("Failed to fetch balance");

        const data = await res.json();
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
  }, [user, refreshKey, HOST]);

  /* =========================
     UI STATES
  ========================= */
  if (loading) {
    return (
      <div className="card balance-card">
        <div className="funds-skeleton f-sk-title" />
        <div className="funds-skeleton f-sk-balance" />
        <div className="divider" />
        <div className="funds-skeleton f-sk-row" />
        <div className="funds-skeleton f-sk-transactions" />
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

  const cash = Number(balance.cash ?? 0);
  const [rupees, paise] = cash.toFixed(2).split(".");

  return (
    <div className="card balance-card">
      <p className="card-title">Stocks, F&O balance</p>

      <h1 className="balance-amount">
        ₹{Number(rupees).toLocaleString("en-IN")}
        <span>.{paise}</span>
      </h1>

      <div className="divider" />

      <div className="balance-row">
        <span>Cash</span>
        <span className="dashed">
          ₹{cash.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
        </span>
      </div>

      <Transactions transactions={transactions} />
    </div>
  );
}
