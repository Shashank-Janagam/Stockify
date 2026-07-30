import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';

const token = process.env.TELEGRAM_BOT_TOKEN;
console.log("Token is:", token ? "Found" : "Missing");

const bot = new TelegramBot(token, { polling: true });

bot.on('polling_error', (error) => {
  console.log('POLLING ERROR:', error.code, error.message);
});

bot.on('message', (msg) => {
  console.log('Received message:', msg.text);
});

console.log("Bot test script started. Waiting 5 seconds...");
setTimeout(() => {
  console.log("Shutting down test script.");
  process.exit(0);
}, 5000);
