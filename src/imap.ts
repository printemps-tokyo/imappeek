/**
 * A minimal IMAP client (RFC 3501) over TLS, dependency-free. It implements
 * just enough to peek at a mailbox: LOGIN, SELECT, SEARCH, FETCH, LOGOUT. Each
 * command waits for its tagged completion using the literal-aware scanner.
 */
import { connect as tlsConnect, type TLSSocket } from "node:tls";
import { connect as netConnect } from "node:net";
import { scanResponse, imapQuote, type ImapStatus } from "./protocol.js";

export interface ImapOptions {
  host: string;
  port?: number;
  /** Use implicit TLS (default true; port 993). */
  tls?: boolean;
  timeoutMs?: number;
}

export interface CommandResult {
  status: ImapStatus;
  statusLine: string;
  /** The full raw response bytes (untagged data plus the tagged line). */
  raw: Uint8Array;
}

export class ImapError extends Error {}

export class ImapClient {
  private socket: TLSSocket | ReturnType<typeof netConnect> | undefined;
  private buffer: Uint8Array = new Uint8Array(0);
  private tagCounter = 0;
  private waiter: { tag: string; resolve: (r: CommandResult) => void; reject: (e: Error) => void } | undefined;
  private readonly timeoutMs: number;

  constructor(private readonly options: ImapOptions) {
    this.timeoutMs = options.timeoutMs ?? 15000;
  }

  /** Open the connection and read the server greeting. */
  connect(): Promise<void> {
    const port = this.options.port ?? (this.options.tls === false ? 143 : 993);
    return new Promise((resolve, reject) => {
      const onError = (err: Error): void => reject(new ImapError(`connection failed: ${err.message}`));
      const greetingWaiter = (): void => {
        // The greeting is an untagged line; treat "* OK" as ready.
        const idx = indexOfCrlf(this.buffer);
        if (idx === -1) return;
        const line = latin1Slice(this.buffer, 0, idx);
        this.buffer = this.buffer.subarray(idx + 2);
        if (/^\* (OK|PREAUTH)/.test(line)) resolve();
        else reject(new ImapError(`server refused: ${line}`));
      };

      const socket =
        this.options.tls === false
          ? netConnect({ host: this.options.host, port })
          : tlsConnect({ host: this.options.host, port, servername: this.options.host });
      this.socket = socket;
      socket.setTimeout(this.timeoutMs, () => socket.destroy(new ImapError("timed out")));
      socket.once("error", onError);
      socket.on("data", (chunk: Buffer) => {
        this.buffer = concat(this.buffer, new Uint8Array(chunk));
        if (this.waiter) this.tryComplete();
        else greetingWaiter();
      });
      const ready = this.options.tls === false ? "connect" : "secureConnect";
      socket.once(ready, () => {
        /* wait for greeting via data handler */
      });
    });
  }

  private tryComplete(): void {
    if (!this.waiter) return;
    const result = scanResponse(this.buffer, this.waiter.tag);
    if (!result.complete) return;
    const consumed = result.consumed!;
    const raw = this.buffer.subarray(0, consumed);
    this.buffer = this.buffer.subarray(consumed);
    const w = this.waiter;
    this.waiter = undefined;
    w.resolve({ status: result.status!, statusLine: result.statusLine!, raw });
  }

  /** Send a command and resolve with its tagged result (rejecting on NO/BAD). */
  command(text: string): Promise<CommandResult> {
    if (!this.socket) throw new ImapError("not connected");
    const tag = `A${String(++this.tagCounter).padStart(4, "0")}`;
    return new Promise<CommandResult>((resolve, reject) => {
      this.waiter = { tag, resolve, reject };
      this.socket!.write(`${tag} ${text}\r\n`, "utf8");
      // In case data already buffered.
      this.tryComplete();
    }).then((r) => {
      if (r.status !== "OK") throw new ImapError(`${text.split(" ")[0]} failed: ${r.statusLine}`);
      return r;
    });
  }

  login(user: string, pass: string): Promise<CommandResult> {
    return this.command(`LOGIN ${imapQuote(user)} ${imapQuote(pass)}`);
  }

  select(mailbox: string): Promise<CommandResult> {
    return this.command(`SELECT ${imapQuote(mailbox)}`);
  }

  examine(mailbox: string): Promise<CommandResult> {
    return this.command(`EXAMINE ${imapQuote(mailbox)}`);
  }

  fetch(sequence: string, items: string): Promise<CommandResult> {
    return this.command(`FETCH ${sequence} ${items}`);
  }

  async logout(): Promise<void> {
    try {
      await this.command("LOGOUT");
    } catch {
      /* ignore */
    }
    this.socket?.end();
    this.socket?.destroy();
  }
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function indexOfCrlf(buf: Uint8Array): number {
  for (let i = 0; i + 1 < buf.length; i++) {
    if (buf[i] === 0x0d && buf[i + 1] === 0x0a) return i;
  }
  return -1;
}

function latin1Slice(buf: Uint8Array, start: number, end: number): string {
  let s = "";
  for (let i = start; i < end; i++) s += String.fromCharCode(buf[i]!);
  return s;
}
