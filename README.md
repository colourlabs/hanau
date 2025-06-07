# hanau

a wip custom WebSocket wrapper that doesn't suck.

## client example

```js
import { HanauClient } from "hanau";

const conn = new HanauClient("ws://localhost:3005");

conn.onOpen(() => {
  console.log("connection opened!");
});

// this event is called when the server sends a "exampleMessage" 
conn.on("exampleMessage", (data) => {
  console.log(`data sent by server: ${data}`);
});

// open the connection
conn.open();
```

## server example

```js
import { HanauServer } from "hanau";

// HanauServer is based on the node.js WebSocket package
const server = new HanauServer({ port: 3005 });

server.onConnection((sessionId) => {
  console.log(`client connected: ${sessionId}`);
});

server.onDisconnection((sessionId) => {
  console.log(`client disconnected: ${sessionId}`);
});

// this event is called when the client sends a "myCommand" 
server.on("myCommand", (data, sessionId, packetId) => {
  console.log(`received 'myCommand' from ${sessionId}:`, data);

  // respond to client echoing the packetId
  server.send(sessionId, "myResponse", { id: packetId, msg: "hi!" });

  // broadcast to all clients (new packets with new IDs)
  server.broadcast("broadcastMsg", { msg: "hi guys!" });
});
```