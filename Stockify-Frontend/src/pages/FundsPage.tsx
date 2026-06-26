import BalanceCard from "../components/funds/BalanceCard";
import AddMoneyCard from "../components/funds/AddMoneyCard";
import "../Styles/funds.css";
import { useState } from "react";
export default function FundsPage() {
    const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="funds-page">
      <BalanceCard refreshKey={refreshKey}/>
      <AddMoneyCard  onPaymentSuccess={() => {
        console.log('🔑 FundsPage: Incrementing refreshKey from', refreshKey, 'to', refreshKey + 1);
        setRefreshKey((k) => k + 1);
      }} initialAmount={100}/>
    </div>
  );
}
