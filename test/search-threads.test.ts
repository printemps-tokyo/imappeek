import { createServer, type Server, type Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { ImapClient } from "../src/imap.js";
import { listSearch } from "../src/session.js";
import { baseSubject, buildSearch, buildThreads, imapDate, messageIds } from "../src/index.js";

function listen(onConnection: (socket: Socket) => void): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer(onConnection);
    server.listen(0, "127.0.0.1", () => resolve({ server, port: (server.address() as { port: number }).port }));
  });
}

/** Feed a socket's input to `onLine` one CRLF-terminated line at a time. */
function lines(socket: Socket, onLine: (line: string) => void): void {
  let buf = "";
  socket.setEncoding("latin1");
  socket.on("data", (chunk: string) => {
    buf += chunk;
    for (let i = buf.indexOf("\r\n"); i !== -1; i = buf.indexOf("\r\n")) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 2);
      onLine(line);
    }
  });
}

describe("search criteria", () => {
  it("writes dates and quoted ASCII strings", () => {
    expect(imapDate("2026-11-02")).toBe("2-Nov-2026");
    expect(() => imapDate("2026-02-30")).toThrow(/invalid date/);
    expect(buildSearch({ unseen: true, from: 'a "b"', since: "2026-11-01" })).toEqual([
      { text: 'SEARCH UNSEEN SINCE 1-Nov-2026 FROM "a \\"b\\""' },
    ]);
    expect(buildSearch({})).toEqual([{ text: "SEARCH ALL" }]);
  });

  it("sends non-ASCII text as UTF-8 literals", () => {
    const segs = buildSearch({ subject: "請求書", from: "billing" });
    expect(segs.map((s) => s.text)).toEqual(['SEARCH CHARSET UTF-8 FROM "billing" SUBJECT ', ""]);
    expect(new TextDecoder().decode(segs[0]!.literal)).toBe("請求書");
  });
});

describe("threads", () => {
  it("links replies by their headers and orders conversations by their latest message", () => {
    const threads = buildThreads([
      { seq: 1, date: "Mon, 2 Nov 2026 09:00:00 +0900", subject: "Plan", messageId: "<a@x>" },
      { seq: 2, date: "Mon, 2 Nov 2026 10:00:00 +0900", subject: "Re: Plan", messageId: "<b@x>", inReplyTo: "<a@x>", references: ["<a@x>"] },
      { seq: 3, date: "Mon, 2 Nov 2026 11:00:00 +0900", subject: "Lunch", messageId: "<c@x>" },
      { seq: 4, date: "Mon, 2 Nov 2026 12:00:00 +0900", subject: "RE: Re: Plan", messageId: "<d@x>", references: ["<a@x>", "<b@x>"] },
      { seq: 5, date: "Mon, 2 Nov 2026 08:00:00 +0900", subject: "返信: 見積", references: ["<gone@x>"] },
      { seq: 6, date: "Mon, 2 Nov 2026 08:30:00 +0900", subject: "Re: 見積", references: ["<gone@x>", "<e@x>"] },
    ]);
    expect(threads.map((t) => [t.subject, t.items.map((i) => [i.item.seq, i.depth])])).toEqual([
      ["Plan", [[1, 0], [2, 1], [4, 2]]],
      ["Lunch", [[3, 0]]],
      ["見積", [[5, 0], [6, 0]]],
    ]);
  });

  it("reads ids and strips reply prefixes", () => {
    expect(messageIds("<a@x>  <b@y>\r\n <c@z>")).toEqual(["<a@x>", "<b@y>", "<c@z>"]);
    expect(baseSubject("Re: Fwd: RE[2]: 転送: Hello")).toBe("Hello");
  });
});

describe("against a scripted IMAP server", () => {
  let server: Server | undefined;
  afterEach(() => {
    server?.close();
    server = undefined;
  });

  it("logs in with XOAUTH2 and searches with a literal", async () => {
    const seen: string[] = [];
    const started = await listen((socket) => {
      socket.write("* OK ready\r\n");
      let awaitingLiteral: { tag: string; head: string; size: number } | undefined;
      lines(socket, (line) => {
        seen.push(line);
        if (awaitingLiteral) {
          // The literal (bytes) and the rest of the command arrive as one line here.
          const { tag } = awaitingLiteral;
          awaitingLiteral = undefined;
          socket.write(`* SEARCH 2 7\r\n${tag} OK SEARCH done\r\n`);
          return;
        }
        const [tag, cmd] = line.split(" ");
        if (cmd === "AUTHENTICATE") {
          const ir = Buffer.from(line.split(" ")[3]!, "base64").toString("utf8");
          if (ir === "user=me@example.com\x01auth=Bearer good\x01\x01") socket.write(`${tag} OK authenticated\r\n`);
          else {
            socket.write(`+ ${Buffer.from('{"status":"401"}').toString("base64")}\r\n`);
            socket.once("data", () => socket.write(`${tag} NO invalid credentials\r\n`));
          }
        } else if (cmd === "SEARCH") {
          const m = /\{(\d+)\}$/.exec(line);
          if (m) {
            awaitingLiteral = { tag: tag!, head: line, size: Number(m[1]) };
            socket.write("+ go ahead\r\n");
          }
        } else if (cmd === "FETCH") {
          const seq = line.split(" ")[2];
          const head = `Subject: hit ${seq}\r\nMessage-ID: <m${seq}@x>\r\n\r\n`;
          socket.write(`* ${seq} FETCH (FLAGS (\\Seen) BODY[HEADER.FIELDS (SUBJECT)] {${Buffer.byteLength(head)}}\r\n${head})\r\n${tag} OK FETCH done\r\n`);
        } else {
          socket.write(`${tag} OK\r\n`);
        }
      });
    });
    server = started.server;

    const bad = new ImapClient({ host: "127.0.0.1", port: started.port, tls: false });
    await bad.connect();
    await expect(bad.authenticateXoauth2("me@example.com", "wrong")).rejects.toThrow(/AUTHENTICATE failed.*\{"status":"401"\}/);
    await bad.logout();

    const client = new ImapClient({ host: "127.0.0.1", port: started.port, tls: false });
    await client.connect();
    await client.authenticateXoauth2("me@example.com", "good");
    const found = await listSearch(client, { subject: "請求書" }, 10);
    expect(found.map((m) => [m.seq, m.subject, m.messageId])).toEqual([
      [7, "hit 7", "<m7@x>"],
      [2, "hit 2", "<m2@x>"],
    ]);
    expect(seen.some((l) => /SEARCH CHARSET UTF-8 SUBJECT \{9\}$/.test(l))).toBe(true);
    await client.logout();
  });
});
