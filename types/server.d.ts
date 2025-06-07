export type HanauWebSocket = import("ws").WebSocket & {
    sessionId?: string;
    isAlive?: boolean;
    lastSentId?: number;
};
/**
 * Packet type
 */
export type Packet = {
    id: number;
    command: string | number;
    data: any;
};
export type HanauServerOptions = {
    port?: number;
    wss?: WebSocketServer;
};
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
export class HanauServer {
    /**
     * @param {HanauServerOptions} options
     */
    constructor({ port, wss }: HanauServerOptions);
    wss: WebSocketServer;
    /** @type {Map<string, HanauWebSocket>} */
    clients: Map<string, HanauWebSocket>;
    /** @type {Map<string, Map<number, Packet>>} */
    clientHistories: Map<string, Map<number, Packet>>;
    /** @type {Record<string, (data: any, sessionId: string, packetId: number) => void>} */
    messageListeners: Record<string, (data: any, sessionId: string, packetId: number) => void>;
    /** @type {Array<(sessionId: string) => void>} */
    connectionListeners: Array<(sessionId: string) => void>;
    /** @type {Array<(sessionId: string) => void>} */
    disconnectionListeners: Array<(sessionId: string) => void>;
    pingInterval: NodeJS.Timeout;
    /**
     * Register a command handler
     * @template T
     * @param {string} command
     * @param {(data: T, sessionId: string, packetId: number) => void} handler
     */
    on<T>(command: string, handler: (data: T, sessionId: string, packetId: number) => void): void;
    /**
     * Register connection handler
     * @param {(sessionId: string) => void} fn
     */
    onConnection(fn: (sessionId: string) => void): void;
    /**
     * Register disconnection handler
     * @param {(sessionId: string) => void} fn
     */
    onDisconnection(fn: (sessionId: string) => void): void;
    /**
     * Send a packet to a specific client
     * @param {string} sessionId
     * @param {string|number} command
     * @param {any} data
     */
    send(sessionId: string, command: string | number, data: any): void;
    /**
     * Broadcast a packet to all clients
     * @param {string|number} command
     * @param {any} data
     */
    broadcast(command: string | number, data: any): void;
    /**
     * Low-level send helper
     * @param {HanauWebSocket} ws
     * @param {Packet} packet
     */
    _send(ws: HanauWebSocket, packet: Packet): void;
    /**
     * Close server and all clients
     */
    close(): void;
}
import { WebSocketServer } from "ws";
