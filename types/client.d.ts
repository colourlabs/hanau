export type Packet = {
    id: number;
    command: string | number;
    data: any;
};
/**
 * @typedef {Object} Packet
 * @property {number} id
 * @property {string | number} command
 * @property {any} data
 */
export class HanauClient {
    /**
     * Create client
     * @param {string} uri
     */
    constructor(uri: string);
    uri: string;
    /** @type {WebSocket | null} */
    ws: WebSocket | null;
    alive: boolean;
    lastSentId: number;
    lastReceivedId: number;
    reconnectCount: number;
    mayReconnect: boolean;
    messageListeners: {};
    openListeners: any[];
    closeListeners: any[];
    hanauSessionID: string;
    /**
     * Opens the WebSocket connection
     * @param {any} extraHandshakeData
     */
    open(extraHandshakeData?: any): void;
    /**
     * Close current WebSocket connection
     */
    close(): void;
    /**
     * Handle incoming messages
     * @param {Packet} msg
     */
    _handleMessage(msg: Packet): void;
    /**
     * Send a command with data to the server
     * @param {string | number} command
     * @param {any} data
     */
    send(command: string | number, data: any): void;
    /**
     * Register a listener for a specific command
     * @param {string | number} command
     * @param {(data: any) => void} listener
     */
    on(command: string | number, listener: (data: any) => void): void;
    /**
     * Unregister a listener for a specific command
     * @param {string | number} command
     * @param {(data: any) => void} [listener]
     */
    off(command: string | number, listener?: (data: any) => void): void;
    /**
     * This will be called when the WebSocket connection opens
     * @param {Function} listener
     */
    onOpen(listener: Function): void;
    /**
     * This will be called when the WebSocket connection closes
     * @param {Function} listener
     */
    onClose(listener: Function): void;
    _startPing(): void;
    pingInterval: NodeJS.Timeout;
    _stopPing(): void;
    _reconnect(): void;
}
