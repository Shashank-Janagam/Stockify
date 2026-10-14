import express from 'express';

const router = express.Router();
const AUTOTRADING_URL = process.env.AUTOTRADING_URL || 'http://127.0.0.1:8000';

async function forwardToAutoTrading(req, res, subPath) {
  try {
    const url = `${AUTOTRADING_URL}${subPath}`;
    const headers = { ...req.headers };
    delete headers.host;
    delete headers.connection;
    delete headers['content-length'];

    const options = {
      method: req.method,
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/json',
        ...headers,
      },
    };

    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
      options.body = JSON.stringify(req.body);
    }

    const response = await fetch(url, options);
    const contentType = response.headers.get('content-type') || '';

    res.status(response.status);
    if (contentType.includes('application/json')) {
      const data = await response.json();
      return res.json(data);
    } else {
      const text = await response.text();
      return res.send(text);
    }
  } catch (err) {
    console.error(`[AutoTradingProxy] Error forwarding to ${subPath}:`, err.message);
    return res.status(502).json({
      error: 'AutoTrading engine unreachable',
      details: err.message,
    });
  }
}

// Explicit endpoints
router.post('/evaluate', (req, res) => forwardToAutoTrading(req, res, '/evaluate'));
router.get('/health', (req, res) => forwardToAutoTrading(req, res, '/health'));
router.get('/live/sessions', (req, res) => forwardToAutoTrading(req, res, '/live/sessions'));
router.get('/live/sessions/:userId', (req, res) => forwardToAutoTrading(req, res, `/live/sessions/${req.params.userId}`));
router.post('/live/start', (req, res) => forwardToAutoTrading(req, res, '/live/start'));
router.post('/live/stop', (req, res) => forwardToAutoTrading(req, res, '/live/stop'));

// Catch-all forwarder for any other routes (Express 5 compatible)
router.use((req, res) => forwardToAutoTrading(req, res, req.path));

export default router;
