// @ts-check
import { WebSocketServer } from "ws";

/**
 * @typedef {import("ws").WebSocket & { sessionId?: string, isAlive?: boolean, lastSentId?: number }} HanauWebSocket
 */

/**
 * Packet type
 * @typedef {Object} Packet
 * @property {number} id
 * @property {string|number} command
 * @property {any} data
 */

class HanauServer {
  /**
   * @param {{ port: number }} options
   */
  constructor({ port }) {
    this.wss = new WebSocketServer({ port });

    /** @type {Map<string, HanauWebSocket>} */
    this.clients = new Map(); // sessionId -> ws
    this.clientHistories = new Map(); // sessionId -> Map<packetId, Packet>

    /** @type {Record<string, (data: any, sessionId: string, packetId: number) => void>} */
    this.messageListeners = {};

    this.connectionListeners = [];
    this.disconnectionListeners = [];

    // Handle new connections
    this.wss.on("connection", (ws) => {
      /** @type {HanauWebSocket} */
      const extWs = ws;
      extWs.isAlive = true;
      extWs.lastSentId = 0;

      extWs.on("pong", () => {
        extWs.isAlive = true;
      });

      extWs.on("message", (raw) => {
        let msg;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          extWs.close(1003, "invalid JSON");
          return;
        }

        // require handshake before other commands
        if (msg.command === "handshake") {
          const { sessionId, lastReceivedId = 0 } = msg.data || {};

          if (!sessionId) {
            extWs.close(4001, "handshake missing sessionId");
            return;
          }

          if (this.clients.has(sessionId)) {
            const oldWs = this.clients.get(sessionId);
            if (oldWs) {
              oldWs.close(4002, "duplicate session");
            }
          }

          extWs.sessionId = sessionId;
          this.clients.set(sessionId, extWs);

          if (!this.clientHistories) this.clientHistories = new Map();
          if (!this.clientHistories.has(sessionId)) {
            this.clientHistories.set(sessionId, new Map());
          }
        
          // replay missed messages
          const history = this.clientHistories.get(sessionId);
          for (const [id, packet] of history.entries()) {
            if (id > lastReceivedId) {
              this._send(extWs, packet);
            }
          }

          this.connectionListeners.forEach((fn) => fn(sessionId));
          return;
        }

        if (!extWs.sessionId) {
          extWs.close(4003, "handshake required");
          return;
        }

        if (msg.command === "ping") {
          this._send(extWs, {
            id: msg.id,
            command: "pong",
            data: null,
          });
          return;
        }

        // Dispatch commands to listeners
        const handler = this.messageListeners[msg.command];
        if (handler) {
          handler(msg.data, extWs.sessionId, msg.id);
        } else {
          this._send(extWs, {
            id: msg.id,
            command: "error",
            data: { message: "unknown command" },
          });
        }
      });

      extWs.on("close", () => {
        if (extWs.sessionId) {
          this.clients.delete(extWs.sessionId);
          this.disconnectionListeners.forEach((fn) => fn(extWs.sessionId));
        }
      });
    });

    this.pingInterval = setInterval(() => {
      this.clients.forEach((client) => {
        if (!client.isAlive) {
          client.terminate();
          if (client.sessionId) {
            this.clients.delete(client.sessionId);
            this.disconnectionListeners.forEach((fn) => fn(client.sessionId));
          }
          return;
        }
        client.isAlive = false;
        client.ping();
      });
    }, 30000);
  }

  /**
   * Register a command handler
   * @template T
   * @param {string} command
   * @param {(data: T, sessionId: string, packetId: number) => void} handler
   */
  on(command, handler) {
    this.messageListeners[command] = handler;
  }

  /**
   * Register connection handler
   * @param {(sessionId: string) => void} fn
   */
  onConnection(fn) {
    this.connectionListeners.push(fn);
  }

  /**
   * Register disconnection handler
   * @param {(sessionId: string) => void} fn
   */
  onDisconnection(fn) {
    this.disconnectionListeners.push(fn);
  }

  /**
   * Send a packet to a specific client
   * @param {string} sessionId
   * @param {string|number} command
   * @param {any} data
   */
  send(sessionId, command, data) {
    const ws = this.clients.get(sessionId);
    if (!ws || ws.readyState !== ws.OPEN) return;

    if (!ws.lastSentId) ws.lastSentId = 0;
    ws.lastSentId++;

    const packet = {
      id: ws.lastSentId,
      command,
      data,
    };

    if (!this.clientHistories.has(sessionId)) {
      this.clientHistories.set(sessionId, new Map());
    }
    const history = this.clientHistories.get(sessionId);
    history.set(packet.id, packet);
  
    // history limit is 100
    if (history.size > 100) {
      const oldestId = Math.min(...history.keys());
      history.delete(oldestId);
    }

    this._send(ws, packet);
  }

  /**
   * Broadcast a packet to all clients
   * @param {string|number} command
   * @param {any} data
   */
  broadcast(command, data) {
    this.clients.forEach((ws) => {
      if (ws.readyState !== ws.OPEN) return;

      if (!ws.lastSentId) ws.lastSentId = 0;
      ws.lastSentId++;

      this._send(ws, {
        id: ws.lastSentId,
        command,
        data,
      });
    });
  }

  /**
   * ow-level send helper
   * @param {HanauWebSocket} ws
   * @param {Packet} packet
   */
  _send(ws, packet) {
    ws.send(JSON.stringify(packet));
  }

  /**
   * Close server and all clients
   */
  close() {
    clearInterval(this.pingInterval);
    this.wss.close();
    this.clients.forEach((ws) => ws.close());
    this.clients.clear();
  }
}

export { HanauServer };
