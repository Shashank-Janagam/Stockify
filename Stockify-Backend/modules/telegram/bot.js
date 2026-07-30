import TelegramBot from 'node-telegram-bot-api';
import { db } from '../../db/sql.js';

let bot;

export const initTelegramBot = () => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!token) {
    console.warn('TELEGRAM_BOT_TOKEN not found in .env, Telegram Bot will not start.');
    return;
  }

  // Create a bot that uses 'polling' to fetch new updates
  bot = new TelegramBot(token, { polling: true });

  console.log('Telegram Bot started for PaperBull linking...');

  // Matches /start [uid]
  bot.onText(/\/start (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const uid = match[1]; 

    try {
      const client = await db.connect();
      
      // Update the user's telegram_chat_id in the database
      const res = await client.query(
        'UPDATE users SET telegram_chat_id = $1 WHERE uid = $2 RETURNING *',
        [chatId, uid]
      );
      
      client.release();

      if (res.rowCount > 0) {
        bot.sendMessage(chatId, '✅ *Success!* Your Telegram account has been linked to your PaperBull profile.\n\nYou will now receive instant alerts here whenever your trades execute!', { parse_mode: 'Markdown' });
      } else {
        bot.sendMessage(chatId, '⚠️ Error: We could not find a PaperBull account associated with this link. Please try clicking the link from your Profile page again.');
      }
    } catch (err) {
      console.error('Error linking Telegram account:', err);
      bot.sendMessage(chatId, '❌ An error occurred while trying to link your account. Please contact support.');
    }
  });

  // Handle standard /start without parameters
  bot.onText(/^\/start$/, (msg) => {
    bot.sendMessage(msg.chat.id, 'Welcome to PaperBull! 🚀\n\nTo receive trade alerts here, please go to your PaperBull Profile and click **Link Telegram**.', { parse_mode: 'Markdown' });
  });
};
