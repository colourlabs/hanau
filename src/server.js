// @ts-check
import { WebSocketServer } from "ws";
import { IncomingMessage } from "node:http";

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

/**
 * @typedef {Object} HanauServerOptions
 * @property {number} [port]
 * @property {WebSocketServer} [wss]
 */

class HanauServer {
  /**
   * @param {HanauServerOptions} options
   */
  constructor({ port, wss }) {
    if (wss) {
      this.wss = wss;
    } else if (port) {
      this.wss = new WebSocketServer({
        port,
        handleProtocols: (protocols, request) => {
          if (protocols.has("hanau")) {
            return "hanau";
          }
          return false;
        },
      });
    } else {
      throw new Error("must provide a port or a WebSocketServer instance");
    }

    /** @type {Map<string, HanauWebSocket>} */
    this.clients = new Map(); // sessionId -> ws

    /** @type {Map<string, Map<number, Packet>>} */
    this.clientHistories = new Map(); // sessionId -> Map<packetId, Packet>

    /** @type {Record<string, (data: any, sessionId: string, packetId: number) => void>} */
    this.messageListeners = {};

    /** @type {Array<(sessionId: string) => void>} */
    this.connectionListeners = [];

    /** @type {Array<(sessionId: string) => void>} */
    this.disconnectionListeners = [];

    /** @type {Array<(msg: any, request: IncomingMessage) => Promise<true | { code: number, reason: string }>>} */
    this.handshakeListeners = [];

    // Handle new connections
    this.wss.on("connection", (ws, request) => {
      /** @type {HanauWebSocket} */
      const extWs = ws;
      extWs.isAlive = true;
      extWs.lastSentId = 0;

      extWs.on("pong", () => {
        extWs.isAlive = true;
      });

      extWs.on("message", async (raw) => {
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

          for (const hook of this.handshakeListeners) {
            const result = await hook(msg.data, request);
            if (result !== true) {
              extWs.close(result.code, result.reason);
              return;
            }
          }

          if (this.clients.has(sessionId)) {
            const oldWs = this.clients.get(sessionId);
            if (oldWs) {
              oldWs.close(4002, "duplicate session");
            }
          }

          extWs.sessionId = sessionId;
          this.clients.set(sessionId, extWs);

          this._send(extWs, { id: ++extWs.lastSentId, command: "handshake_ack", data: null });

          if (!this.clientHistories.has(sessionId)) {
            this.clientHistories.set(sessionId, new Map());
          }

          // replay missed messages
          setImmediate(() => {
            const history = this.clientHistories.get(sessionId);
            if (!history) return;
          
            for (const [id, packet] of history.entries()) {
              if (id > lastReceivedId) {
                this._send(extWs, packet);
              }
            }
          });

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

        // dispatch commands to listeners
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
          //@ts-ignore
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
            //@ts-ignore
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
   * Register handshake handler (hooks into Hanou's handshake message)
   * @param {(data: any, req: IncomingMessage) => Promise<true | { code: number, reason: string }>} fn
   */
  onHandshake(fn) {
    this.handshakeListeners.push(fn);
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

    // check if backpressure is 5MB and if it is then just nuke the connection
    if (ws.bufferedAmount > 5e6) {
      ws.terminate();
      this.clients.delete(sessionId);
      this.disconnectionListeners.forEach((cb) => cb(sessionId));
      return;
    }

    if (!this.clientHistories.has(sessionId)) {
      this.clientHistories.set(sessionId, new Map());
    }
    const history = this.clientHistories.get(sessionId);

    if (!history) {
      return;
    }

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
   * Low-level send helper
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
