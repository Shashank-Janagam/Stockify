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
    rerefresh:()=>void;
    trades: Trade[];
  availableQty:number;
  refresh:number;
  

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
  pricePerShare: number;
  createdAtIST: string;
};



  export default function OrderPanel({
    trades,
    symbol,
    price,
    companyName,
    fullExchangeName,
    onLoginClick,
    changePercent,
    onBuySellChange,
    onModeChange,
    onQtyChange,
    onSubmit,
    availableQty,
    refresh,
    rerefresh
  }: OrderPanelProps) {
    const [tab, setTab] = useState<"BUY" | "SELL">("BUY");
    const [mode, setMode] = useState<"Delivery" | "Intraday">("Delivery");
    const [qty, setQty] = useState<string>("");
    const [approxReq,setApprox]=useState<number>(0)
    const [slEnabled, setSlEnabled] = useState(false);
    const [slType, setSlType] = useState<"PRICE" | "PERCENT">("PERCENT");
    const [slValue, setSlValue] = useState<string>("");

  const HOST=import.meta.env.VITE_HOST_ADDRESS

  const [showAddMoney, setShowAddMoney] = useState(false);
  const [loading,setLoading]=useState(false)
      const {user} = useContext(AuthContext);
      const [token, setToken] = useState<string | null>(null);
      const [balance, setBalance] = useState<Balance | null>(null);
      const [warning,setWarning]=useState<string>("Market order might be subject to price fluctuation")
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

      const val = Number(slValue) || 0;
      let finalSlPrice = 0;

      if (slEnabled && val > 0) {
        if (slType === "PRICE") {
          finalSlPrice = val;
        } else {
          // Calculate price from percentage
          // BUY: Price * (1 - %)
          finalSlPrice = price * (1 - val / 100);
        }
      }

      const res = await fetch(
        `${HOST}/api/orderExecution/buy`,
        {
          method: "POST",
          credentials:"include",
          headers: {
            "Content-Type": "application/json" // ⭐ REQUIRED
          },
          body: JSON.stringify({
            symbol: symbol,          // e.g. "TCS.NS"
            quantity: finalQty,    // 🔥 MATCH BACKEND
            sl_enabled: slEnabled,
            sl_price: Number(finalSlPrice.toFixed(2)) // Send computed PRICE
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
      setQty("")
      rerefresh();

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

      const val = Number(slValue) || 0;
      let finalSlPrice = 0;

      if (slEnabled && val > 0) {
        if (slType === "PRICE") {
          finalSlPrice = val;
        } else {
          // Calculate price from percentage
          // SELL: Price * (1 + %)
          finalSlPrice = price * (1 + val / 100);
        }
      }

      const res = await fetch(
        `${HOST}/api/sellstock/sell`,
        {
          method: "POST",
          credentials:"include",
          headers: {
    "Content-Type": "application/json" // ⭐ REQUIRED
  },
          body: JSON.stringify({
            symbol: symbol,          // e.g. "TCS.NS"
            quantity: finalQty,    // 🔥 MATCH BACKEND
            sl_enabled: slEnabled,
            sl_price: Number(finalSlPrice.toFixed(2)) // Send computed PRICE
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
      setQty("");
      rerefresh();

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
     

   

      useEffect(() => {
  
  if (!trades || availableQty<=0 ) return;



  let remainingQty = availableQty;
  let invested = 0;
  let pnl = 0;

  const buys = trades
    .filter(t => t.side === "BUY")
    .sort((a, b) =>
      new Date(b.createdAtIST).getTime() -
      new Date(a.createdAtIST).getTime()
    );

  for (const lot of buys) {
    if (remainingQty <= 0) break;

    const qty = Math.min(lot.quantity, remainingQty);
    invested += qty * lot.pricePerShare;
    pnl += qty * (price - lot.pricePerShare);
    remainingQty -= qty;
  }

  setStockChange(pnl);
  setStockChangePercent(
    invested > 0 ? (pnl / invested) * 100 : 0
  );
}, [trades, price, availableQty]);



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
              credentials:"include",
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

  }, [qty, price, balance, tab, availableQty]);

  // Stoploss Validation
  // Stoploss Validation (Zerodha/Groww Logic)
  useEffect(() => {
    if (!slEnabled || !slValue) return;

    if (slType === "PRICE") {
      const val = Number(slValue);
      if (tab === "BUY") {
        // Buy Order -> Long Position -> SL Sell must be LOWER
        if (val >= price) {
          setWarning("Stoploss trigger must be lower than buy price");
        } else if (warning.startsWith("Stoploss")) {
          setWarning("Market order might be subject to price fluctuation");
        }
      } else if (tab === "SELL") {
        // Sell Order -> Short Position -> SL Buy must be HIGHER
        if (val <= price) {
          setWarning("Stoploss trigger must be higher than sell price");
        } else if (warning.startsWith("Stoploss")) {
          setWarning("Market order might be subject to price fluctuation");
        }
      }
    } else {
        // Percentage Check (Generic sanity check, e.g. max 50%)
        const val = Number(slValue);
        if(val > 50) {
             setWarning("Stoploss percentage reasonable limit is 50%");
        } else if (warning.startsWith("Stoploss")) {
             setWarning("Market order might be subject to price fluctuation");
        }
    }
  }, [slEnabled, slValue, slType, tab, price]);





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
      rerefresh();
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
          <button
            className={`mtf ${slEnabled ? "selected" : ""}`}
            onClick={() => setSlEnabled(!slEnabled)}
          >
            Stoploss
          </button>

        </div>

        {/* Qty */}
        <div className="op-field">
          <div className="type">
            <div className="Qty">Qty</div>
            <div className="Stype">{fullExchangeName}</div>
          </div>
          <div className="input-wrapper">
            <input
              type="number"
              value={qty}
              inputMode="numeric"
              className="qty-input"
              placeholder="0"
              onChange={(e) => {
                const val = e.target.value;
                if (val === "") {
                  setQty("");
                  onQtyChange?.(0);
                  return;
                }
                if (Number(val) < 0) return;
                setQty(val);
                onQtyChange?.(Number(val));
              }}
            />
          </div>
        </div>


        {/* STOPLOSS INPUT */}
        {slEnabled && (
          <div className="op-field sl-field">
            <div className="type">
              <div className="Qty">SL Trigger</div>
              <div className="sl-toggle" onClick={() => setSlType(slType === "PRICE" ? "PERCENT" : "PRICE")}>
                {slType === "PRICE" ? "Price" : "%"} ⇋
              </div>
            </div>
            <div className="input-wrapper">
              <input
                type="number"
                value={slValue}
                placeholder={slType === "PRICE" ? "Trigger Price" : "Percentage %"}
                className="qty-input"
                onChange={(e) => {
                  if (Number(e.target.value) < 0) return;
                  setSlValue(e.target.value);
                }}
              />
              {slValue && !isNaN(Number(slValue)) && (
                <div className="sl-hint">
                  {(() => {
                    const val = Number(slValue);
                    const tPrice = slType === "PRICE" 
                      ? val 
                      : (tab === "BUY" ? price * (1 - val / 100) : price * (1 + val / 100));
                    
                    if (tab === "BUY") {
                      return `Executes SELL if price drops to ₹${tPrice.toFixed(2)}`;
                    } else {
                      return `Executes BUY if price rises to ₹${tPrice.toFixed(2)}`;
                    }
                  })()}
                </div>
              )}

            </div>
          </div>
        )}




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
