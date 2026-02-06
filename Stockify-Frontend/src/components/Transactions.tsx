import "../Styles/Transactions.css";

export type Transaction = {
  id: string;
  type: "CREDIT" | "DEBIT";
  title: string;
  amount: number;
  created_at: string;
};


type Props = {
  transactions: Transaction[];
};

export default function Transactions({ transactions }: Props) {
  if (!transactions.length) {
    return <p className="txn-empty">No transactions yet</p>;
  }

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
                  {new Date(txn.created_at).toLocaleString("en-IN", {
                              timeZone: "Asia/Kolkata"
                            })
                            }
                </div>
              </div>
            </div>

            <div className="txn-right">
              <div className={`txn-amount ${isCredit ? "credit" : "debit"}`}>
                {isCredit ? "+" : "-"}₹{txn.amount.toFixed(2)}
              </div>
            
            </div>
          </div>
        );
      })}
    </div>
    </div>
  );
}
