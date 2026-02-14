import "../Styles/Transactions.css";
import { formatToIST } from "../utils/dateUtils";

export type Transaction = {
  id: string;
  type: "CREDIT" | "DEBIT";
  title: string;
  amount: number;
  created_at: string;
  pnl?: number;
};


type Props = {
  transactions: Transaction[];
};

export default function Transactions({ transactions }: Props) {
  if (!transactions.length) {
    return <p className="txn-empty">No transactions yet</p>;
  }
  console.log(transactions)

  return (
    <div className="transactions">
      <h2 className="transactions-title">Transactions</h2>
            <div className="trans">

      {transactions.map((txn) => {
        const isCredit = txn.type === "CREDIT";

        return (
        <div key={txn.id} className="transaction-row">
            <div className="txn-left">
              <span className={`txn-icon ${isCredit ? "credit" : "debit"}`}>
                {isCredit ? "↘" : "↖"}
              </span>

              <div>
                <div className="txn-title">{txn.title}</div>
                  <div className="txn-date">
                  {formatToIST(txn.created_at)}
                </div>
              </div>
            </div>

            <div className="txn-right">
              <div className={`txn-amount ${isCredit ? "credit" : "debit"}`}>
                {isCredit ? "+" : "-"}₹{txn.amount.toFixed(2)}
              </div>
              
              {txn.pnl !== undefined && txn.pnl !== null && (
                 <div style={{ fontSize: '12px', marginTop: '4px', fontWeight: 500, color: txn.pnl >= 0 ? '#2db783' : '#cf2a2a' }}>
                   PnL: {txn.pnl >= 0 ? "+" : ""}₹{Math.abs(txn.pnl).toFixed(2)}
                 </div>
              )}
            
            </div>
          </div>
        );
      })}
    </div>
    </div>
  );
}
