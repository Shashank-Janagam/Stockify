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
type Trade = {
  side: "BUY" | "SELL";
  quantity: number;
  buy_price_per_share: number;
  created_at: string;
};


  export default function OrderPanel({
    symbol,
    price,
    companyName,
    fullExchangeName,
    onLoginClick,
    changePercent,
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
  const [loading,setLoading]=useState(false)
      const [refresh,setRefresh]=useState(0)
      const {user} = useContext(AuthContext);
      const [token, setToken] = useState<string | null>(null);
      const [balance, setBalance] = useState<Balance | null>(null);
      const [warning,setWarning]=useState<string>("Market order might be subject to price fluctuation")
      const [availableQty, setAvailableQty] = useState<number>(0);
      const [sellValue, setSellValue] = useState<number>(0);
      const [StockChange,setStockChange]=useState<number>(0)
      const [StockChangePercent,setStockChangePercent]=useState<number>(0)
      /* =========================
        FETCH TOKEN
      ========================= */
    async function placeOrder() {
    if (!user || !token) return;

    try {
      setLoading(true);
  const finalQty = parseInt(qty, 10);

  if (isNaN(finalQty) || finalQty <= 0) {
    alert("Enter a valid quantity");
    return;
  } 

      const res = await fetch(
        `${HOST}/api/orderExecution/buy`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            symbol: symbol,          // e.g. "TCS.NS"
            quantity: finalQty    // 🔥 MATCH BACKEND
          })
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Order failed");
      }

      console.log("Order placed:", data);
    } catch (err) {
      console.error("Failed to place order", err);
    } finally {
      setLoading(false);
      setRefresh(prev => prev + 1);
      setQty("")

    }
  }

    async function sellShares() {
    if (!user || !token) return;

    try {
      setLoading(true);
  const finalQty = parseInt(qty, 10);

  if (isNaN(finalQty) || finalQty <= 0) {
    alert("Enter a valid quantity");
    return;
  } 

      const res = await fetch(
        `${HOST}/api/portfolio/sell`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            symbol: symbol,          // e.g. "TCS.NS"
            quantity: finalQty    // 🔥 MATCH BACKEND
          })
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Order failed");
      }

      console.log("Order placed:", data);
    } catch (err) {
      console.error("Failed to place order", err);
    } finally {
      setLoading(false);
      setRefresh(prev => prev + 1);
      setQty("")

    }
  }
      
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
     

    const [trades, setTrades] = useState<Trade[]>([]);


      useEffect(() => {
        if(!token) return;
        fetch(`${HOST}/api/portfolio/holding/${symbol}`,{
          method:"GET", 
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          }
        })
          .then(res => res.json())
          .then(data => {
            setTrades(data.trades);
            setAvailableQty(data.totalQuantity);
          });
      }, [symbol,token,refresh]);

      useEffect(() => {
        if(!trades) return;
        let invested = 0;
        let pnl = 0;

        trades.forEach(t => {
          if (t.side === "BUY") {
            invested += t.buy_price_per_share * t.quantity;
            pnl += (price - t.buy_price_per_share) * t.quantity;
          }
        });

        setStockChange(pnl);
        setStockChangePercent(invested > 0 ? (pnl / invested) * 100 : 0);
      }, [trades, price]);


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

        if (tab === "BUY"){
            if(required > (balance?.cash ?? 0)) {
              setWarning("Available amount is not enough");
            } else {
              setWarning("Market order might be subject to price fluctuation");
            }
        }
          const q = Number(qty || 0);

        if (tab === "SELL") {
          const proceeds = q * price;
          setSellValue(proceeds);

          if (q > availableQty) {
            setWarning("You don’t have enough shares to sell");
          } else {
            setWarning("Market order might be subject to price fluctuation");
          }
        }

  }, [qty, price, balance, tab,availableQty]);


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

            <span>

              {availableQty>0 &&(
                <>
                <br />
                  <div className="holding-info">
  <div className="holding-qty">
    You own <span className="qty">{availableQty}</span> shares
  </div>


  <div className="holding-value">
    Current Value
    <span className="value">
      ₹{(availableQty * price).toFixed(2)}
    </span>
  </div>
</div>

                </>
              )}
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
      <div className="money">
    {availableQty > 0 ? (
      <p
        className={`stock-caption ${
          StockChange >= 0 ? "pos" : "neg"
        }`}
      >
        {StockChange >= 0 ? "You’re up by " : "You’re down by "}
        <strong>
          ₹{Math.abs(StockChange).toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </strong>
        {" "}
        ({StockChangePercent >= 0 ? "+" : "-"}
        {Math.abs(StockChangePercent).toLocaleString("en-IN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
        %)
      </p>
    ) : (
      <p className="muted">
        Buy this stock to track your returns
      </p>
    )}
  </div>


          <div className="op-warning">{warning}</div>
          

          <div className="line"></div>

          <div className="op-footer">
            
            
          <div className="money">

            {tab==="BUY" &&(
              <>
              <p>Balance: ₹{balance?.cash.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? 0}</p>
              <p>Approx req.: ₹{approxReq.toLocaleString("en-IN")}</p>
              </>
            )}

            {tab==="SELL" &&(
              <>
              <p>Available: {availableQty} shares</p>
              <p>Approx value: ₹{sellValue.toLocaleString("en-IN")}</p>
              </>
            )}
              
          </div>

                    <button
            className="cta-button"
            disabled={
  loading ||
  Number(qty) <= 0 ||
  (tab === "SELL" && Number(qty) > availableQty)
}

            onClick={async () => {
              if (loading) return; // 🔒 double safety

              if (tab === "BUY"){
                
                if(approxReq > (balance?.cash ?? 0)) {
                setShowAddMoney(true);
                return;
              }             
               await placeOrder();

            }
             if (tab === "SELL"){
                
                if(Number(qty) > availableQty) {
                return;
              }             
               await sellShares();

            }
            


              onSubmit?.({
                type: tab,
                mode,
                qty: Number(qty),
              });
            }}
          >
            {loading ? (
              <span className="btn-loader" />
            ) : tab === "BUY" ? (
              approxReq > (balance?.cash ?? 0)
                ? "Add Money"
                : "Buy"
            ) : (
              "Sell"
            )}
          </button>



          </div>
        </div>
      </div>
    );
  }
