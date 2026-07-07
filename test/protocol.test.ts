import { describe, expect, it } from "vitest";
import {
  scanResponse,
  extractFirstLiteral,
  parseExists,
  parseSearch,
  imapQuote,
} from "../src/protocol.js";

const enc = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, "latin1"));

describe("scanResponse", () => {
  it("detects a simple tagged OK", () => {
    const r = scanResponse(enc("A001 OK LOGIN completed\r\n"), "A001");
    expect(r.complete).toBe(true);
    expect(r.status).toBe("OK");
  });

  it("returns incomplete until the tagged line arrives", () => {
    expect(scanResponse(enc("* 3 EXISTS\r\n"), "A002").complete).toBe(false);
  });

  it("skips a literal whose bytes contain a fake tagged line", () => {
    // The literal payload contains "A003 OK" which must NOT end the scan early.
    const payload = "A003 OK not really done\r\nmore";
    const buf = enc(`* 1 FETCH (BODY[] {${payload.length}}\r\n${payload})\r\nA003 OK FETCH done\r\n`);
    const r = scanResponse(buf, "A003");
    expect(r.complete).toBe(true);
    expect(r.status).toBe("OK");
    // Consumed through the real completion line, not the fake one inside the literal.
    expect(r.consumed).toBe(buf.length);
  });

  it("reports NO / BAD status", () => {
    expect(scanResponse(enc("A004 NO [AUTHENTICATIONFAILED]\r\n"), "A004").status).toBe("NO");
    expect(scanResponse(enc("A005 BAD command\r\n"), "A005").status).toBe("BAD");
  });
});

describe("extractFirstLiteral", () => {
  it("returns exactly the literal octets", () => {
    const body = "Subject: hi\r\n\r\nbody";
    const buf = enc(`* 7 FETCH (BODY[HEADER] {${body.length}}\r\n${body})\r\n`);
    const lit = extractFirstLiteral(buf);
    expect(lit && Buffer.from(lit).toString("latin1")).toBe(body);
  });

  it("returns undefined when there is no literal", () => {
    expect(extractFirstLiteral(enc("* 1 FETCH (FLAGS (\\Seen))\r\n"))).toBeUndefined();
  });
});

describe("parseExists / parseSearch", () => {
  it("reads the EXISTS count", () => {
    expect(parseExists("* 42 EXISTS\r\n* 3 RECENT\r\n")).toBe(42);
    expect(parseExists("* OK done\r\n")).toBeUndefined();
  });

  it("reads SEARCH ids", () => {
    expect(parseSearch("* SEARCH 2 5 9\r\nA001 OK\r\n")).toEqual([2, 5, 9]);
    expect(parseSearch("* SEARCH\r\n")).toEqual([]);
  });
});

describe("imapQuote", () => {
  it("escapes quotes and backslashes", () => {
    expect(imapQuote('a"b\\c')).toBe('"a\\"b\\\\c"');
  });
});
