import "../Styles/orderPanel.css";
import { useState,useEffect } from "react";
import {useContext} from "react"
import { AuthContext } from "../auth/AuthProvider";
import imageinvest from "../assets/imageinv.png"
import AddMoneyCard from "./AddMoneyCard";
type OrderPanelProps = {
  symbol: string;
  companyName:string,
  price: number;
  changePercent: number;
  fullExchangeName: "NSE" | "BSE";
  onLoginClick:()=>void;
 

  onBuySellChange?: (type: "BUY" | "SELL") => void;
  onModeChange?: (mode: "Delivery" | "Intraday") => void;
  onQtyChange?: (qty: number) => void;
  onSubmit?: (data: {
    type: "BUY" | "SELL";
    mode: "Delivery" | "Intraday";
    qty: number;
  }) => void;
};
type Balance = {
  cash: number;
  blocked: number;
};


export default function OrderPanel({
  price,
  companyName,
  changePercent,
  fullExchangeName,
  onLoginClick,
  
  onBuySellChange,
  onModeChange,
  onQtyChange,
  onSubmit
}: OrderPanelProps) {
  const [tab, setTab] = useState<"BUY" | "SELL">("BUY");
  const [mode, setMode] = useState<"Delivery" | "Intraday">("Delivery");
  const [qty, setQty] = useState<string>("");
  const [approxReq,setApprox]=useState<number>(0)
const HOST=import.meta.env.VITE_HOST_ADDRESS

const [showAddMoney, setShowAddMoney] = useState(false);
    const [refresh,setRefresh]=useState(0)
    const [available,setAvailable]=useState(true)
    const {user} = useContext(AuthContext);
    const [token, setToken] = useState<string | null>(null);
    const [balance, setBalance] = useState<Balance | null>(null);
    const [warning,setWarning]=useState<string>("Market order might be subject to price fluctuation")
    /* =========================
       FETCH TOKEN
    ========================= */
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

  useEffect(() => {
    console.log(token)
    if (!token) return; // 🔥 wait for token

    let mounted = true;

    const fetchBalance = async () => {
      console.log("fetching balance",token)
      try {
        const res = await fetch(
           `${HOST}/api/getBalance/getBalance`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`
            },
            credentials: "include"
          }
        );

        if (!res.ok) throw new Error("Failed to fetch balance");

        const data = await res.json();
        if (mounted) setBalance(data);
      } catch (err) {
        console.error(err);
        if (mounted) console.log("Unable to load balance");
      } finally {
        if (mounted) console.log(false);
      }
    };

    fetchBalance();

    return () => {
      mounted = false;
    };
  }, [token,refresh]); // 🔥 DEPENDS ON TOKEN
useEffect(() => {
  const required = Number(qty || 0) * price;
  setApprox(required);

  if (tab === "BUY" && required > (balance?.cash ?? 0)) {
    setAvailable(true)
    setWarning("Available amount is not enough");
  } else {
    setAvailable(false)
    setWarning("Market order might be subject to price fluctuation");
  }
}, [qty, price, balance, tab]);


  if (!user){
    console.log("user loggedout")
    return(
      <div className="login-cta">
      <div className="cta-illustration">
        <img
          src={imageinvest}
          alt="Invest illustration"
        />
      </div>

      <h2 className="cta-title">
        Want to invest in this stock?
      </h2>

      <p className="cta-subtitle">
        Open a free Demat account in minutes to start investing in stocks.
      </p>

      <button className="cta-button" onClick={onLoginClick}>
        Buy now
      </button>
    </div>

    );
  }
  if(showAddMoney){
    return(
<AddMoneyCard
  initialAmount={approxReq - (balance?.cash ?? 0)}
  onPaymentSuccess={() => {
    setShowAddMoney(false);
    setRefresh(prev => prev + 1);
  }}
/>
    );
  }

  return (


    <div className="order-panel">
      {/* Header */}
      <div className="op-header">
        <h2>{companyName}</h2>
        <p>
          {fullExchangeName} : ₹{price.toFixed(2)}  
          <span className={changePercent >= 0 ? "pos" : "neg"}>
            ({changePercent.toFixed(2)}%)
          </span>
        </p>
      </div>

      {/* Buy / Sell */}
      <div className="border-tabs">
        <div className="op-tabs">
          <button
            className={tab === "BUY" ? "active buy" : ""}
            onClick={() => {
              setTab("BUY");
              onBuySellChange?.("BUY");
            }}
          >
            BUY
          </button>
          <button
            className={tab === "SELL" ? "active sell" : ""}
            onClick={() => {
              setTab("SELL");
              onBuySellChange?.("SELL");
            }}
          >
            SELL
          </button>
        </div>
      </div>

      {/* Mode */}
      <div className="op-options">
        <button
          className={mode === "Delivery" ? "selected" : ""}
          onClick={() => {
            setMode("Delivery");
            onModeChange?.("Delivery");
          }}
        >
          Delivery
        </button>
        <button
          className={mode === "Intraday" ? "selected" : ""}
          onClick={() => {
            setMode("Intraday");
            onModeChange?.("Intraday");
          }}
        >
          Intraday
        </button>
        <button className="mtf">MTF 4.35x</button>
        <span className="settings">⚙</span>
      </div>

      {/* Qty */}
      <div className="op-field">
        <div className="type">
          <div className="Qty">Qty</div>
          <div className="Stype">{fullExchangeName}</div>
        </div>
<input
  type="number"
  value={qty}
  inputMode="numeric"
  className="qty-input"
  onChange={(e) => {
    const val = e.target.value;

    // allow empty
    if (val === "") {
      setQty("");
      onQtyChange?.(0);
      return;
    }

    // prevent negatives
    if (Number(val) < 0) return;

    setQty(val);
    onQtyChange?.(Number(val));
  }}
/>


      </div>

      {/* Price */}
      {/* <div className="op-field">
        <div className="type">
          <div className="Qty">Price</div>
          <div className="Stype">Market</div>
        </div>
        <button className="market-btn">At market</button>
      </div> */}

      {/* Footer */}
      <div className="footer">
        <div className="op-warning">{warning}</div>

        <div className="line"></div>

        <div className="op-footer">
          <div className="money">
            <p>Balance: ₹{balance?.cash.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? 0}</p>
            <p>Approx req.: ₹{approxReq.toLocaleString("en-IN")}</p>
          </div>

                  <button
          className="cta-button"
          onClick={() => {
            if (available) {
              setShowAddMoney(true);                           
            }

            onSubmit?.({
              type: tab,
              mode,
              qty:Number(qty),
            });
          }}
        >
          {available
            ? "Add Money"
            : tab === "BUY"
            ? "Buy"
            : "Sell"}
        </button>

        </div>
      </div>
    </div>
  );
}
