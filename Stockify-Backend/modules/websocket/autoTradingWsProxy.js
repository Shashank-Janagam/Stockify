import WebSocket, { WebSocketServer } from 'ws';

export function setupAutoTradingWsProxy(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      if (url.pathname === '/api/autotrading/live' || url.pathname === '/autotrading/live') {
        wss.handleUpgrade(req, socket, head, (clientWs) => {
          const baseWsUrl = process.env.AUTOTRADING_WS_URL || 'ws://127.0.0.1:8000';
          const targetWsUrl = `${baseWsUrl}/live${url.search || ''}`;
          
          console.log(`[AutoTradingWsProxy] Connecting client to ${targetWsUrl}`);
          const targetWs = new WebSocket(targetWsUrl);

          const pendingMessages = [];

          targetWs.on('open', () => {
            console.log('[AutoTradingWsProxy] Target connected, flushing buffer');
            while (pendingMessages.length > 0) {
              const { data, isBinary } = pendingMessages.shift();
              targetWs.send(data, { binary: isBinary });
            }

            clientWs.on('message', (data, isBinary) => {
              if (targetWs.readyState === WebSocket.OPEN) {
                targetWs.send(data, { binary: isBinary });
              }
            });
          });

          clientWs.on('message', (data, isBinary) => {
            if (targetWs.readyState !== WebSocket.OPEN) {
              pendingMessages.push({ data, isBinary });
            }
          });

          targetWs.on('message', (data, isBinary) => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(data, { binary: isBinary });
            }
          });

          const cleanup = () => {
            if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
            if (targetWs.readyState === WebSocket.OPEN) targetWs.close();
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
      }
    } catch (e) {
      console.error('[AutoTradingWsProxy] Upgrade error:', e);
    }
  });
}
