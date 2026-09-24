// Server-sent events: one long-lived HTTP response per open screen.
// SSE (instead of WebSockets) passes cleanly through Cloudflare Tunnel and needs no library.
import type { ServerResponse } from 'node:http';
import type { ServerEvent } from '../shared/types.ts';

interface Client {
  userId: number;
  res: ServerResponse;
}

export class EventHub {
  private clients = new Set<Client>();
  private heartbeat: NodeJS.Timeout;

  constructor() {
    this.heartbeat = setInterval(() => {
      for (const c of this.clients) c.res.write(': ping\n\n');
    }, 25_000);
    this.heartbeat.unref();
  }

  subscribe(userId: number, res: ServerResponse) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 2000\n\n');
    const client = { userId, res };
    this.clients.add(client);
    res.on('close', () => this.clients.delete(client));
  }

  /** `to` = list of user ids, or 'all'. */
  publish(to: number[] | 'all', event: ServerEvent) {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const c of this.clients) {
      if (to === 'all' || to.includes(c.userId)) c.res.write(data);
    }
  }

  close() {
    clearInterval(this.heartbeat);
    for (const c of this.clients) c.res.end();
    this.clients.clear();
  }
}
