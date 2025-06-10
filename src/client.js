//@ts-check

/**
 * @typedef {Object} Packet
 * @property {number} id
 * @property {string | number} command
 * @property {any} data
 */

class HanauClient {
  /**
   * Create client
   * @param {string} uri
   */
  constructor(uri) {
    this.uri = uri;
    /** @type {WebSocket | null} */
    this.ws = null;
    this.alive = false;
    this.lastSentId = 0;
    this.lastReceivedId = 0;
    this.reconnectCount = 0;
    this.mayReconnect = true;
    this.handshakeComplete = false;

    this.messageListeners = {};
    this.openListeners = [];
    this.closeListeners = [];

    this.extraHandshakeData = {};
    this.unsentQueue = [];

    this.hanauSessionID = `session-${Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)}`;

    this.on("handshake_ack", () => {
      console.log("hanau > handshake acknowledged by server");
      this.handshakeComplete = true;
      clearTimeout(this._handshakeTimeout);

      // send unsent queue
      this.unsentQueue.forEach((packet) => this.ws.send(JSON.stringify(packet)));
      this.unsentQueue = [];
    });
  }

  /**
   * Opens the WebSocket connection
   * @param {any} [extraHandshakeData] Extra data you want to put in the "handshake" command. This persists on reconnection
   */
  open(extraHandshakeData) {
    if (extraHandshakeData !== undefined) {
      this.extraHandshakeData = extraHandshakeData;
    }

    this.ws = new WebSocket(this.uri, "hanau");

    this.ws.onopen = () => {
      this.alive = true;
      this.reconnectCount = 0;
      this.openListeners.forEach((listener) => listener());

      const handshakePayload = {
        sessionId: this.hanauSessionID,
        lastReceivedId: this.lastReceivedId,
        ...this.extraHandshakeData,
      };

      this.handshakeComplete = false;
      this.send("handshake", handshakePayload);
      this._startPing();

      this._handshakeTimeout = setTimeout(() => {
        if (!this.handshakeComplete) {
          console.warn("hanau > handshake ack not received, reconnecting...");
          this._reconnect();
        }
      }, 3000);
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.command == "pong") {
          this.alive = true;
        } else {
          this._handleMessage(msg);
        }
      } catch (err) {
        console.error("hanau > failed to parse JSON message", err);
      }
    };

    this.ws.onclose = (event) => {
      this.alive = false;
      this.closeListeners.forEach((listener) => listener(event.reason || "connection closed"));
      this._stopPing();
      if (this.mayReconnect) {
        this._reconnect();
      }
    };

    this.ws.onerror = (event) => {
      console.error("hanau > WebSocket error:", event);
    };
  }

  /**
   * Close current WebSocket connection
   */
  close() {
    this.mayReconnect = false;
    if (this.ws) this.ws.close();
  }

  /**
   * Handle incoming messages
   * @param {Packet} msg
   */
  _handleMessage(msg) {
    if (msg.id) {
      if (msg.id <= this.lastReceivedId) {
        return;
      }
      this.lastReceivedId = msg.id;
    }

    if (msg.command && this.messageListeners[msg.command]) {
      this.messageListeners[msg.command].forEach((listener) => listener(msg.data));
    }
  }

  /**
   * Send a command with data to the server
   * @param {string | number} command 
   * @param {any} data 
   */
  send(command, data) {
    /** @type {Packet} */
    const packet = {
      id: ++this.lastSentId,
      command,
      data,
    };

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn(`hanau > WebSocket is not open, queueing packet ${command}`);
      this.unsentQueue.push(packet);
      return;
    }

    this.ws.send(JSON.stringify(packet));
  }

  /**
   * Register a listener for a specific command
   * @param {string | number} command
   * @param {(data: any) => void} listener
   */
  on(command, listener) {
    if (!this.messageListeners[command]) {
      this.messageListeners[command] = [];
    }
    this.messageListeners[command].push(listener);
  }

  /**
   * Unregister a listener for a specific command
   * @param {string | number} command
   * @param {(data: any) => void} [listener]
   */
  off(command, listener) {
    if (!this.messageListeners[command]) return;
    if (!listener) {
      this.messageListeners[command] = [];
    } else {
      this.messageListeners[command] = this.messageListeners[command].filter((l) => l !== listener);
    }
  }

  /**
   * This will be called when the WebSocket connection opens
   * @param {Function} listener
   */
  onOpen(listener) {
    this.openListeners.push(listener);
  }

  /**
   * This will be called when the WebSocket connection closes
   * @param {Function} listener
   */
  onClose(listener) {
    this.closeListeners.push(listener);
  }

  /**
   * Destroys Hanau connection
   */
  destroy() {
    this.close();
    this._stopPing();
    this.messageListeners = {};
    this.openListeners = [];
    this.closeListeners = [];
    this.unsentQueue = [];
  }  

  _startPing() {
    if (this.pingInterval) clearInterval(this.pingInterval);

    this.pingInterval = setInterval(() => {
      if (!this.alive) {
        console.warn("hanau > ping timeout, reconnecting...");
        this._reconnect();
      } else {
        this.alive = false;
        this.send("ping", null);
      }
    }, 5000);
  }

  _stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);

      this.pingInterval = null;
    }
  }

  _reconnect() {
    if (!this.mayReconnect) return;

    if (this.reconnectCount > 5) {
      console.error("hanau > too many reconnects, giving up");
      this.mayReconnect = false;
      return;
    }

    this.reconnectCount++;

    setTimeout(() => {
      if (!this.mayReconnect) return;

      console.log("hanau > reconnecting...");
      this.open();
    }, 1000 * this.reconnectCount);
  }
}

export { HanauClient };
