import type { FastifyPluginAsync } from 'fastify';
import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';

/** Map of runId -> Set of connected WebSocket clients */
const runSubscriptions = new Map<string, Set<WebSocket>>();

/** Broadcast a message to all clients subscribed to a specific run */
export function broadcastToRun(runId: string, message: object): void {
  const clients = runSubscriptions.get(runId);
  if (!clients) return;
  const data = JSON.stringify(message);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

/** Get the count of connected clients for a run */
export function getRunSubscriberCount(runId: string): number {
  return runSubscriptions.get(runId)?.size ?? 0;
}

export const wsPlugin: FastifyPluginAsync = async (fastify) => {
  const wss = new WebSocketServer({ noServer: true });

  // Handle upgrade requests for our WebSocket path
  fastify.server.on('upgrade', (request: IncomingMessage, socket, head) => {
    const url = new URL(request.url ?? '', `http://${request.headers.host}`);
    const match = url.pathname.match(/^\/api\/runs\/([^/]+)\/updates$/);

    if (!match) {
      // Not our WebSocket path - let other handlers deal with it or destroy
      socket.destroy();
      return;
    }

    const runId = match[1];

    wss.handleUpgrade(request, socket, head, (ws) => {
      // Add to subscriptions
      if (!runSubscriptions.has(runId)) {
        runSubscriptions.set(runId, new Set());
      }
      runSubscriptions.get(runId)!.add(ws);

      fastify.log.info({ runId }, 'WebSocket client connected for run updates');

      // Handle ping/pong for heartbeat
      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
          }
        } catch {
          // Ignore non-JSON messages
        }
      });

      ws.on('close', () => {
        const clients = runSubscriptions.get(runId);
        if (clients) {
          clients.delete(ws);
          if (clients.size === 0) {
            runSubscriptions.delete(runId);
          }
        }
        fastify.log.info({ runId }, 'WebSocket client disconnected');
      });

      ws.on('error', (err) => {
        fastify.log.error({ runId, err }, 'WebSocket error');
      });

      // Send initial connection acknowledgement
      ws.send(JSON.stringify({ type: 'connected', runId }));
    });
  });

  // Cleanup on server close
  fastify.addHook('onClose', async () => {
    wss.close();
    runSubscriptions.clear();
  });

  fastify.log.info('WebSocket server registered for run updates');
};
