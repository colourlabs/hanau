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

work in progress