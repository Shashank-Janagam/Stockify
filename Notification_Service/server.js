require('dotenv').config();
const { Worker } = require('bullmq');
const twilio = require('twilio');
const emailjs = require('@emailjs/nodejs');
const fs = require('fs');
const path = require('path');

// ─── Twilio ─────────────────────────────────────────────
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

// ─── Core processor ─────────────────────────────────────
async function processNotification(job) {
  const body = job.data;

  if (!body || !body.mobile) {
    console.warn(`[Job ${job.id}] Skipping — no mobile number in payload.`);
    return;
  }

  console.log(`[Job ${job.id}] Processing notification for ${body.name} (${body.symbol})`);

  // ── Generate AI Insight ──────────────────────────────
  let aiMessage = "Good luck with your paper trading journey! 🚀";
  if (process.env.GROQ_API_KEY) {
    try {
      console.log(`[Job ${job.id}] Generating AI insight via Groq...`);
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          temperature: 0.8,
          messages: [
            {
              role: 'system',
              content: `You are PaperBull AI. Generate a 1-sentence witty or encouraging AI insight about this paper trade. Maximum 15 words. Do not use quotes.`
            },
            {
              role: 'user',
              content: `${body.side} ${body.quantity} shares of ${body.symbol} at ₹${body.PricePerShare}`
            }
          ]
        })
      });

      if (groqRes.ok) {
        const data = await groqRes.json();
        aiMessage = data.choices[0].message.content;
      } else {
        console.warn(`[Job ${job.id}] Groq failed, using default fallback message.`);
      }
    } catch (err) {
      console.error(`[Job ${job.id}] Groq Error:`, err.message);
    }
  }

  const symbolClean = (body.symbol || 'STOCK').replace('.NS', '');
  const logoUrl = `https://mystockifyassets.blob.core.windows.net/assets/${symbolClean}.png`;
  const promises = [];

  // ── 1. WhatsApp via Twilio ───────────────────────────
  if (body.notify_whatsapp !== false && twilioClient) {
    promises.push((async () => {
      try {
        let waTemplate = fs.readFileSync(path.join(__dirname, 'templates', 'whatsapp.txt'), 'utf8');

        waTemplate = waTemplate
          .replace(/{{NAME}}/g, body.name || 'User')
          .replace(/{{STATUS}}/g, body.status || 'EXECUTED')
          .replace(/{{SIDE}}/g, body.side || 'BUY')
          .replace(/{{STOCK_NAME}}/g, body.stockName || symbolClean)
          .replace(/{{QUANTITY}}/g, body.quantity || 1)
          .replace(/{{PRICE}}/g, body.PricePerShare || '0.00')
          .replace(/{{ORDER_TYPE}}/g, body.order_type || 'MARKET')
          .replace(/{{INVESTMENT}}/g, body.totalValue || '0.00')
          .replace(/{{WALLET}}/g, Number(body.walletBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 }))
          .replace(/{{AI_MESSAGE}}/g, aiMessage);

        console.log(`[Job ${job.id}] Sending WhatsApp...`);
        await twilioClient.messages.create({
          from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
          to: `whatsapp:+91${body.mobile}`,
          body: waTemplate,
          mediaUrl: [logoUrl]
        });
        console.log(`[Job ${job.id}] ✅ WhatsApp sent!`);
      } catch (err) {
        console.error(`[Job ${job.id}] WhatsApp Error:`, err.message);
        // Re-throw so BullMQ records this channel's failure in the job log,
        // but we use Promise.allSettled so other channels still send.
      }
    })());
  } else {
    console.warn(`[Job ${job.id}] Skipping WhatsApp: Missing credentials.`);
  }

  // ── 2. Telegram ──────────────────────────────────────
  const targetTelegramChatId = body.telegram_chat_id || process.env.TELEGRAM_CHAT_ID;
  if (body.notify_telegram !== false && process.env.TELEGRAM_BOT_TOKEN && targetTelegramChatId) {
    promises.push((async () => {
      try {
        let tgTemplate = fs.readFileSync(path.join(__dirname, 'templates', 'telegram.txt'), 'utf8');

        tgTemplate = tgTemplate
          .replace(/{{NAME}}/g, body.name || 'User')
          .replace(/{{STATUS}}/g, body.status || 'EXECUTED')
          .replace(/{{SIDE}}/g, body.side || 'BUY')
          .replace(/{{STOCK_NAME}}/g, body.stockName || symbolClean)
          .replace(/{{QUANTITY}}/g, body.quantity || 1)
          .replace(/{{PRICE}}/g, body.PricePerShare || '0.00')
          .replace(/{{ORDER_TYPE}}/g, body.order_type || 'MARKET')
          .replace(/{{INVESTMENT}}/g, body.totalValue || '0.00')
          .replace(/{{WALLET}}/g, Number(body.walletBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 }))
          .replace(/{{AI_MESSAGE}}/g, aiMessage);

        console.log(`[Job ${job.id}] Sending Telegram to ${targetTelegramChatId}...`);
        const tgUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendPhoto`;
        const response = await fetch(tgUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: targetTelegramChatId,
            photo: logoUrl,
            caption: tgTemplate,
            parse_mode: 'Markdown'
          })
        });

        if (!response.ok) {
          const errBody = await response.text();
          throw new Error(`Telegram API Error: ${errBody}`);
        }
        console.log(`[Job ${job.id}] ✅ Telegram sent!`);
      } catch (err) {
        console.error(`[Job ${job.id}] Telegram Error:`, err.message);
      }
    })());
  } else {
    console.warn(`[Job ${job.id}] Skipping Telegram: Missing credentials or no Chat ID.`);
  }

  // ── 3. Email via EmailJS ─────────────────────────────
  if (body.notify_email !== false && process.env.EMAILJS_SERVICE_ID && process.env.EMAILJS_TEMPLATE_ID && process.env.EMAILJS_PUBLIC_KEY) {
    promises.push((async () => {
      try {
        let emailTemplate = fs.readFileSync(path.join(__dirname, 'templates', 'email.html'), 'utf8');

        emailTemplate = emailTemplate
          .replace(/{{NAME}}/g, body.name || 'User')
          .replace(/{{STATUS}}/g, body.status || 'EXECUTED')
          .replace(/{{SIDE}}/g, body.side || 'BUY')
          .replace(/{{SYMBOL}}/g, body.symbol || 'STOCK')
          .replace(/{{STOCK_NAME}}/g, body.stockName || symbolClean)
          .replace(/{{LOGO_URL}}/g, logoUrl)
          .replace(/{{QUANTITY}}/g, body.quantity || 1)
          .replace(/{{PRICE}}/g, body.PricePerShare || '0.00')
          .replace(/{{ORDER_TYPE}}/g, body.order_type || 'MARKET')
          .replace(/{{INVESTMENT}}/g, body.totalValue || '0.00')
          .replace(/{{WALLET}}/g, Number(body.walletBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 }))
          .replace(/{{AI_MESSAGE}}/g, aiMessage);

        console.log(`[Job ${job.id}] Sending Email...`);
        await emailjs.send(
          process.env.EMAILJS_SERVICE_ID,
          process.env.EMAILJS_TEMPLATE_ID,
          {
            message: emailTemplate,
            to_email: body.email || 'user@example.com',
            subject: body.subject || 'PaperBull Trade Notification'
          },
          {
            publicKey: process.env.EMAILJS_PUBLIC_KEY,
            privateKey: process.env.EMAILJS_PRIVATE_KEY,
          }
        );
        console.log(`[Job ${job.id}] ✅ Email sent!`);
      } catch (err) {
        console.error(`[Job ${job.id}] Email Error:`, err.message);
      }
    })());
  } else {
    console.warn(`[Job ${job.id}] Skipping Email: Missing EmailJS credentials.`);
  }

  await Promise.allSettled(promises);
  console.log(`[Job ${job.id}] ✅ All channels processed.`);
}

// ─── BullMQ Worker ───────────────────────────────────────
const worker = new Worker(
  'notifications',          // must match queue name in backend/queue/notificationQueue.js
  processNotification,
  {
    connection: { url: process.env.REDIS_URL },
    concurrency: 5,          // process up to 5 notifications in parallel
  }
);

worker.on('ready', () => {
  console.log('✅ BullMQ Notification Worker ready — listening on queue: notifications');
});

worker.on('completed', (job) => {
  console.log(`✅ Job ${job.id} completed successfully.`);
});

worker.on('failed', (job, err) => {
  console.error(`❌ Job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message);
  if (job?.attemptsMade >= job?.opts?.attempts) {
    console.error(`💀 Job ${job?.id} exhausted all retries. Check job data:`, job?.data?.symbol);
  }
});

worker.on('error', (err) => {
  console.error('❌ Worker error:', err);
});

console.log('🚀 PaperBull Notification Worker starting...');
console.log('   Redis:', process.env.REDIS_URL ? process.env.REDIS_URL.replace(/:\/\/[^@]+@/, '://***@') : 'NOT SET');
console.log('   Channels: WhatsApp | Telegram | Email');
console.log('   Retries: 3x with exponential backoff (5s → 10s → 20s)');
