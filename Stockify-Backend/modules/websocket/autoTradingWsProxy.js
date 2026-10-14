import WebSocket, { WebSocketServer } from 'ws';

export function createAutoTradingWsProxy() {
  const wss = new WebSocketServer({ noServer: true });

  return function handleAutoTradingUpgrade(req, socket, head, url) {
    wss.handleUpgrade(req, socket, head, (clientWs) => {
      const baseWsUrl = (process.env.AUTOTRADING_WS_URL || process.env.AUTOTRADING_URL || 'ws://127.0.0.1:8000')
        .replace(/^http/, 'ws')
        .replace(/\/$/, '');
      const targetWsUrl = `${baseWsUrl}/live${url.search || ''}`;
      
      console.log(`[AutoTradingWsProxy] Connecting client to ${targetWsUrl}`);
      let targetWs;
      try {
        targetWs = new WebSocket(targetWsUrl);
      } catch (err) {
        console.error('[AutoTradingWsProxy] Failed to instantiate target WebSocket:', err);
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.close(1011, 'Target connection error');
        }
        return;
      }

      const pendingMessages = [];

      targetWs.on('open', () => {
        console.log('[AutoTradingWsProxy] Target connected, flushing buffer');
        while (pendingMessages.length > 0) {
          const { data, isBinary } = pendingMessages.shift();
          try {
            targetWs.send(data, { binary: isBinary });
          } catch (e) {
            console.error('[AutoTradingWsProxy] Error sending buffered message:', e);
          }
        }
      });

      clientWs.on('message', (data, isBinary) => {
        if (targetWs.readyState === WebSocket.OPEN) {
          try {
            targetWs.send(data, { binary: isBinary });
          } catch (e) {
            console.error('[AutoTradingWsProxy] Error sending to target:', e);
          }
        } else {
          pendingMessages.push({ data, isBinary });
        }
      });

      targetWs.on('message', (data, isBinary) => {
        if (clientWs.readyState === WebSocket.OPEN) {
          try {
            clientWs.send(data, { binary: isBinary });
          } catch (e) {
            console.error('[AutoTradingWsProxy] Error sending to client:', e);
          }
        }
      });

      const cleanup = () => {
        try {
          if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
        } catch (e) {}
        try {
          if (targetWs && targetWs.readyState === WebSocket.OPEN) targetWs.close();
        } catch (e) {}
      };

      clientWs.on('close', cleanup);
      targetWs.on('close', cleanup);
      clientWs.on('error', (err) => {
        console.error('[AutoTradingWsProxy] Client error:', err.message);
        cleanup();
      });
      targetWs.on('error', (err) => {
        console.error('[AutoTradingWsProxy] Target error:', err.message);
        cleanup();
      });
    });
  };
}

export function setupAutoTradingWsProxy(server) {
  const handler = createAutoTradingWsProxy();
  if (server) {
    server.on('upgrade', (req, socket, head) => {
      try {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        if (url.pathname === '/api/autotrading/live' || url.pathname === '/autotrading/live') {
          handler(req, socket, head, url);
        }
      } catch (e) {
        console.error('[AutoTradingWsProxy] Upgrade error:', e);
      }
    });
  }
  return handler;
}

