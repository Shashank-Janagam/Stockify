import db from "../db/sql.js";
import redis from "../cache/redisClient.js";
import { getCurrentPrice } from "./priceService.js";

/**
 * Resolves user ID and metadata from message payload.
 */
async function resolveUser(client, { userId, userUid, email, name }) {
  if (userId) {
    const res = await client.query(
      `SELECT id, uid, name, email, "Mobile", telegram_chat_id, notify_email, notify_whatsapp, notify_telegram FROM users WHERE id = $1`,
      [userId]
    );
    if (res.rows.length > 0) return res.rows[0];
  }

  if (userUid) {
    const res = await client.query(
      `SELECT id, uid, name, email, "Mobile", telegram_chat_id, notify_email, notify_whatsapp, notify_telegram FROM users WHERE uid = $1`,
      [userUid]
    );
    if (res.rows.length > 0) return res.rows[0];
  }

  throw new Error(`User not found for userId: ${userId}, userUid: ${userUid}`);
}

/**
 * Resolves stock ID and name from database.
 */
async function resolveStock(client, symbol, priceInfo) {
  const sym = symbol.endsWith(".NS") ? symbol : `${symbol}.NS`;
  let stockRes = await client.query(`SELECT id, stock_name FROM stocks WHERE symbol = $1`, [sym]);

  if (stockRes.rows.length > 0) {
    return { stockId: stockRes.rows[0].id, stockName: stockRes.rows[0].stock_name };
  }

  // Auto-insert if new
  const ins = await client.query(
    `INSERT INTO stocks (symbol, stock_name, exchange, tick_size, lot_size)
     VALUES ($1, $2, $3, $4, 1) RETURNING id, stock_name`,
    [sym, priceInfo.name || sym, priceInfo.exchange || "NSE", priceInfo.tickSize || 0.05]
  );
  return { stockId: ins.rows[0].id, stockName: ins.rows[0].stock_name };
}

/**
 * Central BUY execution function.
 */
async function executeBuyOrder(order) {
  const client = await db.connect();
  const startTime = Date.now();

  try {
    const user = await resolveUser(client, order);
    const quantity = Number(order.quantity);
    const productType = order.productType === "Intraday" ? "Intraday" : "Delivery";

    // 1. Resolve live market price
    const priceInfo = order.executionPrice && order.executionPrice > 0
      ? { pricePerShare: Number(order.executionPrice), name: order.symbol, exchange: "NSE" }
      : await getCurrentPrice(order.symbol);

    const pricePerShare = Number(priceInfo.pricePerShare);
    if (!pricePerShare || isNaN(pricePerShare)) {
      throw new Error(`Market price unavailable for ${order.symbol}`);
    }

    const { stockId, stockName } = await resolveStock(client, order.symbol, priceInfo);
    const totalCost = pricePerShare * quantity;

    await client.query("BEGIN");

    // 2. Lock and verify wallet balance
    const walletRes = await client.query(
      `SELECT available_balance FROM wallet_accounts WHERE user_id = $1 AND (account_type = 'LIVE' OR account_type IS NULL) FOR UPDATE`,
      [user.id]
    );

    const currentBalance = Number(walletRes.rows[0]?.available_balance ?? 0);
    if (currentBalance < totalCost) {
      await client.query("ROLLBACK");
      return {
        success: false,
        error: "INSUFFICIENT_FUNDS",
        message: `Insufficient balance. Available: ₹${currentBalance.toFixed(2)}, Required: ₹${totalCost.toFixed(2)}`,
        userId: user.id,
        userUid: user.uid,
        orderId: order.orderId,
      };
    }

    // 3. Debit wallet
    const updatedWalletRes = await client.query(
      `UPDATE wallet_accounts 
       SET available_balance = available_balance - $1, updated_at = NOW() AT TIME ZONE 'Asia/Kolkata' 
       WHERE user_id = $2 AND (account_type = 'LIVE' OR account_type IS NULL) 
       RETURNING available_balance`,
      [totalCost, user.id]
    );
    const newBalance = Number(updatedWalletRes.rows[0].available_balance);

    // 4. Update or insert order row
    let orderId = order.orderId;
    if (orderId) {
      await client.query(
        `UPDATE orders 
         SET price = $1, status = 'EXECUTED', executed_at = NOW() AT TIME ZONE 'Asia/Kolkata', updated_at = NOW() AT TIME ZONE 'Asia/Kolkata' 
         WHERE id = $2`,
        [pricePerShare, orderId]
      );
    } else {
      const orderIns = await client.query(
        `INSERT INTO orders
         (user_id, stock_id, side, order_type, quantity, price, status, created_at, executed_at, updated_at, sell_type, category)
         VALUES ($1, $2, 'BUY', 'MARKET', $3, $4, 'EXECUTED', NOW() AT TIME ZONE 'Asia/Kolkata', NOW() AT TIME ZONE 'Asia/Kolkata', NOW() AT TIME ZONE 'Asia/Kolkata', $5, 'STANDARD')
         RETURNING id`,
        [user.id, stockId, quantity, pricePerShare, productType]
      );
      orderId = orderIns.rows[0].id;
    }

    // 5. Create trade execution record
    const tradeRes = await client.query(
      `INSERT INTO trades (user_id, stock_id, order_id, side, quantity, price, created_at)
       VALUES ($1, $2, $3, 'BUY', $4, $5, NOW() AT TIME ZONE 'Asia/Kolkata')
       RETURNING id, created_at`,
      [user.id, stockId, orderId, quantity, pricePerShare]
    );
    const tradeId = tradeRes.rows[0].id;
    const executedAt = tradeRes.rows[0].created_at;

    // 6. Record open position
    await client.query(
      `INSERT INTO positions
       (user_id, stock_id, position_type, entry_price, total_quantity, remaining_quantity, status, stoploss_enabled, sell_type, created_at, updated_at)
       VALUES ($1, $2, 'LONG', $3, $4, $4, 'OPEN', false, $5, NOW() AT TIME ZONE 'Asia/Kolkata', NOW() AT TIME ZONE 'Asia/Kolkata')`,
      [user.id, stockId, pricePerShare, quantity, productType]
    );

    // 7. Record wallet transaction ledger
    await client.query(
      `INSERT INTO wallet_transactions
       (user_id, reference_type, reference_id, transaction_type, amount, balance_after, created_at)
       VALUES ($1, 'TRADE', $2, 'DEBIT', $3, $4, NOW() AT TIME ZONE 'Asia/Kolkata')`,
      [user.id, String(tradeId), totalCost, newBalance]
    );

    await client.query("COMMIT");

    // 8. Invalidate Redis balance & portfolio caches
    if (user.uid) {
      await redis.del(`wallet:balance:${user.uid}`).catch(() => {});
      await redis.del(`portfolio:summary:${user.uid}`).catch(() => {});
      await redis.del(`portfolio:ai-eval:${user.uid}`).catch(() => {});
      await redis.del(`portfolio:forecasts:${user.uid}`).catch(() => {});
    }

    // 9. Publish ORDER_EXECUTED to Redis for live WebSocket push to Frontend
    let orderCategory = order.category;
    if (!orderCategory && order.orderId) {
      const catRes = await client.query(`SELECT category FROM orders WHERE id = $1`, [order.orderId]);
      if (catRes.rows.length > 0) {
        orderCategory = catRes.rows[0].category;
      }
    }
    orderCategory = orderCategory || "REGULAR";
    const isStoploss = String(orderCategory).toUpperCase() === "STOPLOSS";

    await redis.publish(
      "ORDER_EXECUTED",
      JSON.stringify({
        userId: user.id,
        userUid: user.uid,
        symbol: order.symbol,
        stockName,
        side: "BUY",
        orderId,
        tradeId,
        status: "EXECUTED",
        category: orderCategory,
        isStoploss,
        quantity,
        price: pricePerShare,
        orderType: "Market",
      })
    ).catch(() => {});

    console.log(`[OrderExecutor] ✅ BUY FILLED: User ${user.id} bought ${quantity} ${order.symbol} @ ₹${pricePerShare} (Trade #${tradeId}, Category: ${orderCategory}) in ${Date.now() - startTime}ms`);

    return {
      success: true,
      data: {
        orderId,
        tradeId,
        userId: user.id,
        userUid: user.uid,
        symbol: order.symbol,
        stockName,
        side: "BUY",
        quantity,
        executionPrice: pricePerShare,
        PricePerShare: pricePerShare,
        totalValue: totalCost,
        productType,
        order_type: orderCategory,
        category: orderCategory,
        isStoploss,
        realizedPnl: null,
        walletBalance: newBalance,
        walletBalanceAfter: newBalance,
        status: "EXECUTED",
        executedAt,
        name: user.name,
        email: user.email,
        mobile: user.Mobile,
        telegram_chat_id: user.telegram_chat_id,
        notify_email: user.notify_email,
        notify_whatsapp: user.notify_whatsapp,
        notify_telegram: user.notify_telegram,
        subject: "PaperBull Order Execution",
        userContact: {
          name: user.name,
          mobile: user.Mobile,
          email: user.email,
          telegramChatId: user.telegram_chat_id,
        },
      },
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`[OrderExecutor] ❌ BUY execution error:`, err);
    return {
      success: false,
      error: "EXECUTION_FAILED",
      message: err.message,
      orderId: order.orderId,
      userId: order.userId,
    };
  } finally {
    client.release();
  }
}

/**
 * Central SELL execution function.
 */
async function executeSellOrder(order) {
  const client = await db.connect();
  const startTime = Date.now();

  try {
    const user = await resolveUser(client, order);
    const quantity = Number(order.quantity);
    const productType = order.productType === "Intraday" ? "Intraday" : "Delivery";

    // 1. Resolve live market price
    const priceInfo = order.executionPrice && order.executionPrice > 0
      ? { pricePerShare: Number(order.executionPrice), name: order.symbol, exchange: "NSE" }
      : await getCurrentPrice(order.symbol);

    const pricePerShare = Number(priceInfo.pricePerShare);
    if (!pricePerShare || isNaN(pricePerShare)) {
      throw new Error(`Market price unavailable for ${order.symbol}`);
    }

    const { stockId, stockName } = await resolveStock(client, order.symbol, priceInfo);
    const sellValue = pricePerShare * quantity;

    await client.query("BEGIN");

    // 2. Lock open positions (FIFO)
    const posRes = await client.query(
      `SELECT id, remaining_quantity, entry_price
       FROM positions
       WHERE user_id = $1 AND stock_id = $2 AND status = 'OPEN' AND sell_type = $3
       ORDER BY created_at ASC
       FOR UPDATE`,
      [user.id, stockId, productType]
    );

    let available = 0;
    posRes.rows.forEach((r) => (available += Number(r.remaining_quantity)));

    if (available < quantity) {
      await client.query("ROLLBACK");
      return {
        success: false,
        error: "INSUFFICIENT_SHARES",
        message: `Insufficient shares to sell. Available: ${available}, Requested: ${quantity}`,
        userId: user.id,
        userUid: user.uid,
        orderId: order.orderId,
      };
    }

    // 3. Decrement / close positions and calculate realized P&L
    let qtyToSell = quantity;
    let totalRealizedPnL = 0;

    for (const pos of posRes.rows) {
      if (qtyToSell <= 0) break;

      const posQty = Number(pos.remaining_quantity);
      const consume = Math.min(posQty, qtyToSell);
      const pnl = (pricePerShare - Number(pos.entry_price)) * consume;
      totalRealizedPnL += pnl;

      const newRemaining = posQty - consume;
      await client.query(
        `UPDATE positions
         SET remaining_quantity = $1, status = $2, updated_at = NOW() AT TIME ZONE 'Asia/Kolkata'
         WHERE id = $3`,
        [newRemaining, newRemaining === 0 ? "CLOSED" : "OPEN", pos.id]
      );

      qtyToSell -= consume;
    }

    // 4. Credit wallet
    const updatedWalletRes = await client.query(
      `UPDATE wallet_accounts 
       SET available_balance = available_balance + $1, updated_at = NOW() AT TIME ZONE 'Asia/Kolkata'
       WHERE user_id = $2 AND (account_type = 'LIVE' OR account_type IS NULL) 
       RETURNING available_balance`,
      [sellValue, user.id]
    );
    const newBalance = Number(updatedWalletRes.rows[0].available_balance);

    // 5. Update or insert order row
    let orderId = order.orderId;
    if (orderId) {
      await client.query(
        `UPDATE orders 
         SET price = $1, status = 'EXECUTED', executed_at = NOW() AT TIME ZONE 'Asia/Kolkata', updated_at = NOW() AT TIME ZONE 'Asia/Kolkata' 
         WHERE id = $2`,
        [pricePerShare, orderId]
      );
    } else {
      const orderIns = await client.query(
        `INSERT INTO orders
         (user_id, stock_id, side, order_type, quantity, price, status, created_at, executed_at, updated_at, sell_type, category)
         VALUES ($1, $2, 'SELL', 'MARKET', $3, $4, 'EXECUTED', NOW() AT TIME ZONE 'Asia/Kolkata', NOW() AT TIME ZONE 'Asia/Kolkata', NOW() AT TIME ZONE 'Asia/Kolkata', $5, 'STANDARD')
         RETURNING id`,
        [user.id, stockId, quantity, pricePerShare, productType]
      );
      orderId = orderIns.rows[0].id;
    }

    // 6. Create trade execution record
    const tradeRes = await client.query(
      `INSERT INTO trades (user_id, stock_id, order_id, side, quantity, price, realized_pnl, created_at)
       VALUES ($1, $2, $3, 'SELL', $4, $5, $6, NOW() AT TIME ZONE 'Asia/Kolkata')
       RETURNING id, created_at`,
      [user.id, stockId, orderId, quantity, pricePerShare, totalRealizedPnL]
    );
    const tradeId = tradeRes.rows[0].id;
    const executedAt = tradeRes.rows[0].created_at;

    // 7. Record wallet transaction ledger
    await client.query(
      `INSERT INTO wallet_transactions
       (user_id, reference_type, reference_id, transaction_type, amount, balance_after, created_at)
       VALUES ($1, 'TRADE', $2, 'CREDIT', $3, $4, NOW() AT TIME ZONE 'Asia/Kolkata')`,
      [user.id, String(tradeId), sellValue, newBalance]
    );

    // 8. Adjust / cancel any pending stop-loss orders for these sold shares
    const slOrdersRes = await client.query(
      `SELECT id, quantity, stop_trigger_price
       FROM orders
       WHERE user_id = $1 AND stock_id = $2 AND side = 'SELL' 
         AND status = 'PENDING' AND sell_type = $3
       ORDER BY created_at ASC
       FOR UPDATE`,
      [user.id, stockId, productType]
    );

    let remainingSellQty = quantity;
    const itemsToNotify = [];

    for (const slOrder of slOrdersRes.rows) {
      if (remainingSellQty <= 0) break;
      const slQty = Number(slOrder.quantity);
      const reduction = Math.min(slQty, remainingSellQty);
      const newSlQty = slQty - reduction;

      if (newSlQty <= 0) {
        await client.query(`DELETE FROM orders WHERE id = $1`, [slOrder.id]);
        itemsToNotify.push({ id: slOrder.id, action: "DELETE" });
      } else {
        await client.query(
          `UPDATE orders SET quantity = $1, updated_at = NOW() AT TIME ZONE 'Asia/Kolkata' WHERE id = $2`,
          [newSlQty, slOrder.id]
        );
        itemsToNotify.push({
          id: slOrder.id, action: "UPDATE",
          newQuantity: newSlQty, stopLoss: slOrder.stop_trigger_price
        });
      }
      remainingSellQty -= reduction;
    }

    await client.query("COMMIT");

    // Publish stoploss cancellations to Redis for live monitor
    for (const item of itemsToNotify) {
      if (item.action === "DELETE") {
        await redis.publish("CANCEL_STOPLOSS", JSON.stringify({ orderId: item.id })).catch(() => {});
      } else {
        await redis.publish("UPDATE_STOPLOSS", JSON.stringify({
          orderId: item.id, newQuantity: item.newQuantity, stopLoss: item.stopLoss
        })).catch(() => {});
      }
    }

    // 9. Invalidate Redis balance cache
    if (user.uid) {
      await redis.del(`wallet:balance:${user.uid}`).catch(() => {});
      await redis.del(`portfolio:summary:${user.uid}`).catch(() => {});
      await redis.del(`portfolio:ai-eval:${user.uid}`).catch(() => {});
      await redis.del(`portfolio:forecasts:${user.uid}`).catch(() => {});
    }

    // 10. Publish ORDER_EXECUTED to Redis for live WebSocket push to Frontend
    let orderCategory = order.category;
    if (!orderCategory && order.orderId) {
      const catRes = await client.query(`SELECT category FROM orders WHERE id = $1`, [order.orderId]);
      if (catRes.rows.length > 0) {
        orderCategory = catRes.rows[0].category;
      }
    }
    orderCategory = orderCategory || "REGULAR";
    const isStoploss = String(orderCategory).toUpperCase() === "STOPLOSS";

    await redis.publish(
      "ORDER_EXECUTED",
      JSON.stringify({
        userId: user.id,
        userUid: user.uid,
        symbol: order.symbol,
        stockName,
        side: "SELL",
        orderId,
        tradeId,
        status: "EXECUTED",
        category: orderCategory,
        isStoploss,
        quantity,
        price: pricePerShare,
        orderType: "Market",
      })
    ).catch(() => {});

    console.log(`[OrderExecutor] ✅ SELL FILLED: User ${user.id} sold ${quantity} ${order.symbol} @ ₹${pricePerShare} (Trade #${tradeId}, Category: ${orderCategory}, PnL: ₹${totalRealizedPnL.toFixed(2)}) in ${Date.now() - startTime}ms`);

    return {
      success: true,
      data: {
        orderId,
        tradeId,
        userId: user.id,
        userUid: user.uid,
        symbol: order.symbol,
        stockName,
        side: "SELL",
        quantity,
        executionPrice: pricePerShare,
        PricePerShare: pricePerShare,
        totalValue: sellValue,
        productType,
        order_type: orderCategory,
        category: orderCategory,
        isStoploss,
        realizedPnl: totalRealizedPnL,
        walletBalance: newBalance,
        walletBalanceAfter: newBalance,
        status: "EXECUTED",
        executedAt,
        name: user.name,
        email: user.email,
        mobile: user.Mobile,
        telegram_chat_id: user.telegram_chat_id,
        notify_email: user.notify_email,
        notify_whatsapp: user.notify_whatsapp,
        notify_telegram: user.notify_telegram,
        subject: "PaperBull Order Execution",
        userContact: {
          name: user.name,
          mobile: user.Mobile,
          email: user.email,
          telegramChatId: user.telegram_chat_id,
        },
      },
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`[OrderExecutor] ❌ SELL execution error:`, err);
    return {
      success: false,
      error: "EXECUTION_FAILED",
      message: err.message,
      orderId: order.orderId,
      userId: order.userId,
    };
  } finally {
    client.release();
  }
}

/**
 * Universal dispatcher for any incoming order message.
 */
export async function executeOrder(order) {
  if (!order || !order.side) {
    return { success: false, error: "INVALID_ORDER", message: "Missing order side" };
  }

  const side = order.side.toUpperCase();
  if (side === "BUY") {
    return await executeBuyOrder(order);
  } else if (side === "SELL") {
    return await executeSellOrder(order);
  } else {
    return { success: false, error: "UNSUPPORTED_SIDE", message: `Invalid side: ${order.side}` };
  }
}
