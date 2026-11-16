import express from 'express';
import requireAuth from '../../Middleware/requireAuth.js';

const router = express.Router();

/* ═══════════════════════════════════════════════════════════
   AEGIS CHAT  —  proxy to Python LangGraph server
   POST /api/ai/aegis/chat  →  http://localhost:5050/chat  (SSE)
═══════════════════════════════════════════════════════════ */

const AEGIS_PYTHON_URL = process.env.AEGIS_PYTHON_URL || 'http://127.0.0.1:5050';

/* POST /api/ai/aegis/chat */
router.post('/aegis/chat', requireAuth, async (req, res) => {
  const { messages, thread_id, mode, displayName, preferences } = req.body;
  const firebaseUid = req.user?.uid || req.user?.id || null; 

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  // Set SSE headers immediately
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    let aegisUid = firebaseUid; // Default to the currently logged in user's Firebase UID

    // Proxy request to Python Aegis server
    const pyRes = await fetch(`${AEGIS_PYTHON_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: messages.map(m => ({
          role: m.role === 'ai' ? 'assistant' : m.role,
          content: m.content
        })),
        thread_id: thread_id || undefined,
        uid: aegisUid, // ← forward internal serial user ID
        displayName: displayName,
        preferences: preferences,
        mode: mode || "deep",
      }),
    });

    if (!pyRes.ok) {
      const errText = await pyRes.text();
      send({ type: 'error', text: `Aegis Python server error ${pyRes.status}: ${errText}` });
      return res.end();
    }

    let aiFullContent = "";
    const decoder = new TextDecoder("utf-8");

    // Pipe the SSE stream from Python server → browser
    for await (const chunk of pyRes.body) {
      res.write(chunk);
      
      const decoded = decoder.decode(chunk, { stream: true });
      const lines = decoded.split('\n');
      for (const line of lines) {
        if (line.trim().startsWith('data: ')) {
          try {
            const data = JSON.parse(line.trim().slice(6));
            if (data.type === 'token' && data.text) {
              aiFullContent += data.text;
            }
          } catch (e) {
            // ignore partial json
          }
        }
      }
    }

    res.end();

    // Auto-save the complete conversation to MongoDB on the backend
    if (thread_id && req.user?.uid) {
       try {
          const { getDb } = await import('../../db/mongo.js');
          const db = getDb();
          
          // req.body.messages already contains the user's latest message
          const finalMessages = [...messages, { 
             id: Date.now().toString(), 
             role: 'assistant', 
             content: aiFullContent,
             time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) 
          }];
          
          // Ensure we don't overwrite the title if it already exists
          const existing = await db.collection('aegis_conversations').findOne({ uid: req.user.uid, id: thread_id });
          const title = existing?.title || "New chat";

          await db.collection('aegis_conversations').updateOne(
              { uid: req.user.uid, id: thread_id },
              { $set: { 
                  uid: req.user.uid, 
                  id: thread_id, 
                  messages: finalMessages, 
                  updatedAt: new Date().toISOString(),
                  title: title
              } },
              { upsert: true }
          );
       } catch (dbErr) {
          console.error("Failed to auto-save to MongoDB", dbErr);
       }
    }

  } catch (err) {
    console.error('[AEGIS proxy error]', err.message);
    // Python server not running — give a clear message
    if (err.code === 'ECONNREFUSED' || err.message.includes('ECONNREFUSED')) {
      send({ type: 'error', text: '⚠️ Aegis Python service is offline. Please start it with: uvicorn server:app --port 5050 (in the Aegis/ directory).' });
    } else {
      send({ type: 'error', text: err.message });
    }
    res.end();
  }
});

import { getDb } from '../../db/mongo.js';

/* ─────────────────────────────────────────────
   AEGIS CONVERSATIONS  (MongoDB Persistent Store)
───────────────────────────────────────────── */

/* GET /api/ai/aegis/conversations */
router.get('/aegis/conversations', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const convs = await db.collection('aegis_conversations')
      .find({ uid: req.user.uid })
      .project({ id: 1, title: 1, updatedAt: 1, _id: 0 })
      .sort({ updatedAt: -1 })
      .limit(50)
      .toArray();
    res.json(convs);
  } catch (err) {
    console.error("Fetch conversations error:", err);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

/* POST /api/ai/aegis/conversations — upsert */
router.post('/aegis/conversations', requireAuth, async (req, res) => {
  try {
    const { uid } = req.user;
    let { id, title, messages, isNew } = req.body;
    if (!id || !title) return res.status(400).json({ error: 'id and title are required' });

    const db = getDb();
    
    // Check if conversation already exists in DB
    const existing = await db.collection('aegis_conversations').findOne({ uid, id });
    const isActuallyNew = !existing;
    
    let generatedTitle = null;
    if (isActuallyNew && messages && messages.length > 0) {
      try {
        const firstUserMsg = messages.find(m => m.role === 'user' || m.role === 'user')?.content;
        if (firstUserMsg) {
          const apiKey = process.env.LLM_API_KEY || process.env.GROK_API_KEY;
          const baseUrl = process.env.LLM_BASE_URL || process.env.GROK_BASE_URL || "https://api.x.ai/v1";
          let modelName = process.env.LLM_MODEL || process.env.GROK_MODEL || "openai/gpt-oss-120b";
          
          // Auto-fix for Groq: if using Groq, 'openai/gpt-oss-120b' will fail. Use llama3-8b-8192 for fast title generation.
          if (baseUrl.includes('groq.com')) {
              modelName = "llama3-8b-8192";
          }
          
          if (apiKey) {
            const prompt = `Generate a very short, concise 3-5 word title for a financial chat starting with this query:\n\n"${firstUserMsg}"\n\nTitle (no quotes):`;
            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: modelName,
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.3,
                    max_tokens: 15
                })
            });
            if (response.ok) {
              const data = await response.json();
              const result = data.choices[0].message.content.trim().replace(/^["']|["']$/g, '');
              if (result) {
                generatedTitle = result;
                title = generatedTitle;
              }
            }
          }
        }
      } catch (e) {
        console.error("Title generation error:", e);
      }
    } else if (existing && existing.title) {
        // If frontend sends the sliced query due to stale React state, always preserve the existing title in the DB.
        title = existing.title;
    }

    const entry = { 
      uid, 
      id, 
      title, 
      messages: messages || [], 
      updatedAt: new Date().toISOString() 
    };
    
    await db.collection('aegis_conversations').updateOne(
      { uid, id },
      { $set: entry },
      { upsert: true }
    );
    res.json({ ok: true, generatedTitle });
  } catch (err) {
    console.error("Save conversation error:", err);
    res.status(500).json({ error: 'Failed to save conversation' });
  }
});

/* GET /api/ai/aegis/conversations/:id */
router.get('/aegis/conversations/:id', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const conv = await db.collection('aegis_conversations').findOne(
      { uid: req.user.uid, id: req.params.id }, 
      { projection: { _id: 0 } }
    );
    if (!conv) return res.status(404).json({ error: 'Not found' });
    res.json(conv);
  } catch (err) {
    console.error("Fetch conversation error:", err);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

/* DELETE /api/ai/aegis/conversations/:id */
router.delete('/aegis/conversations/:id', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    await db.collection('aegis_conversations').deleteOne({ uid: req.user.uid, id: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    console.error("Delete conversation error:", err);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

export default router;
