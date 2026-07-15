import { createServer, type Server, type Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { ImapClient, ImapError } from "../src/imap.js";

/** Start a scripted IMAP server on an ephemeral port. */
function listen(onConnection: (socket: Socket) => void): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer(onConnection);
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, port: (server.address() as { port: number }).port });
    });
  });
}

describe("ImapClient error handling", () => {
  let server: Server | undefined;

  afterEach(() => {
    server?.close();
    server = undefined;
  });

  it("rejects a pending command when the server drops the connection", async () => {
    const started = await listen((socket) => {
      socket.write("* OK ready\r\n");
      socket.once("data", () => socket.destroy());
    });
    server = started.server;

    const client = new ImapClient({ host: "127.0.0.1", port: started.port, tls: false });
    await client.connect();
    await expect(client.command("NOOP")).rejects.toBeInstanceOf(ImapError);
    await client.logout();
  });

  it("rejects a pending command when the server closes cleanly", async () => {
    const started = await listen((socket) => {
      socket.write("* OK ready\r\n");
      socket.once("data", () => socket.end());
    });
    server = started.server;

    const client = new ImapClient({ host: "127.0.0.1", port: started.port, tls: false });
    await client.connect();
    await expect(client.command("NOOP")).rejects.toThrow(/closed/);
    await client.logout();
  });

  it("rejects connect() when the greeting never arrives (timeout)", async () => {
    const started = await listen(() => {
      /* accept but stay silent */
    });
    server = started.server;

    const client = new ImapClient({ host: "127.0.0.1", port: started.port, tls: false, timeoutMs: 100 });
    await expect(client.connect()).rejects.toBeInstanceOf(ImapError);
    await client.logout();
  });

  it("fails later commands fast after a connection error", async () => {
    const started = await listen((socket) => {
      socket.write("* OK ready\r\n");
      socket.once("data", () => socket.destroy());
    });
    server = started.server;

    const client = new ImapClient({ host: "127.0.0.1", port: started.port, tls: false });
    await client.connect();
    await expect(client.command("NOOP")).rejects.toBeInstanceOf(ImapError);
    await expect(client.command("NOOP")).rejects.toBeInstanceOf(ImapError);
    await client.logout();
  });

  it("still completes a normal command exchange", async () => {
    const started = await listen((socket) => {
      socket.write("* OK ready\r\n");
      socket.on("data", (chunk: Buffer) => {
        const tag = chunk.toString("latin1").split(" ")[0];
        socket.write(`${tag} OK done\r\n`);
      });
    });
    server = started.server;

    const client = new ImapClient({ host: "127.0.0.1", port: started.port, tls: false });
    await client.connect();
    const r = await client.command("NOOP");
    expect(r.status).toBe("OK");
    await client.logout();
  });
});
