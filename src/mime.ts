/** Parse a MIME (.eml) message into the normalized Mail model. */
import { decodeBytes } from "./charset.js";
import { parseHeaderBlock, splitHeaderBody } from "./headers.js";
import { htmlToText } from "./html-to-text.js";
import { decodeBase64, decodeQuotedPrintable } from "./quoted-printable.js";
import { headerValue, type Attachment, type Header, type Mail } from "./mail.js";

/**
 * A byte-preserving 1:1 view of the buffer (each byte -> one char code 0-255).
 * TextDecoder("latin1") maps to windows-1252 and mangles 0x80-0x9F, so build it
 * by hand to keep the structural parse lossless.
 */
function bytesToBinaryString(bytes: Uint8Array): string {
  let s = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return s;
}

/** Reinterpret a byte-preserving binary string back to the original bytes. */
function latin1ToBytes(s: string): Uint8Array {
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) & 0xff;
  return bytes;
}

/** Extract the value of a Content-Type / Content-Disposition parameter. */
function param(headerLine: string, name: string): string | undefined {
  const re = new RegExp(`${name}\\s*=\\s*("([^"]*)"|([^;\\s]+))`, "i");
  const m = re.exec(headerLine);
  if (!m) return undefined;
  return m[2] ?? m[3];
}

interface Accum {
  text?: string;
  html?: string;
  attachments: Attachment[];
}

/** Decode a leaf part's body (latin1 string) to bytes per its transfer encoding. */
function decodePartBytes(bodyLatin1: string, cte: string): Uint8Array {
  const enc = cte.trim().toLowerCase();
  if (enc === "base64") return decodeBase64(bodyLatin1);
  if (enc === "quoted-printable") return decodeQuotedPrintable(bodyLatin1);
  return latin1ToBytes(bodyLatin1); // 7bit / 8bit / binary / none.
}

/** Split a multipart body (latin1) into its child parts by boundary. */
function splitMultipart(body: string, boundary: string): string[] {
  const delim = `--${boundary}`;
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const parts: string[] = [];
  let buf: string[] | null = null;
  for (const line of lines) {
    if (line === delim || line === `${delim}--`) {
      if (buf) parts.push(buf.join("\n"));
      buf = line === `${delim}--` ? null : [];
      continue;
    }
    if (buf) buf.push(line);
  }
  return parts;
}

function walk(headers: Header[], body: string, acc: Accum): void {
  const contentType = headerValue(headers, "content-type") ?? "text/plain";
  const mediaType = contentType.split(";")[0]!.trim().toLowerCase();
  const disposition = headerValue(headers, "content-disposition") ?? "";
  const cte = headerValue(headers, "content-transfer-encoding") ?? "";

  if (mediaType.startsWith("multipart/")) {
    const boundary = param(contentType, "boundary");
    if (!boundary) return;
    for (const raw of splitMultipart(body, boundary)) {
      const { header, body: childBody } = splitHeaderBody(raw);
      walk(parseHeaderBlock(header), childBody, acc);
    }
    return;
  }

  const filename = param(disposition, "filename") ?? param(contentType, "name");
  const isAttachment = /attachment/i.test(disposition) || (filename !== undefined && !mediaType.startsWith("text/"));
  const bytes = decodePartBytes(body, cte);

  if (isAttachment && filename) {
    acc.attachments.push({ filename, contentType: mediaType, size: bytes.length });
    return;
  }

  const charset = param(contentType, "charset");
  const text = decodeBytes(bytes, charset);
  if (mediaType === "text/html") {
    if (acc.html === undefined) acc.html = text;
  } else if (mediaType === "text/plain") {
    if (acc.text === undefined) acc.text = text;
  } else if (filename) {
    acc.attachments.push({ filename, contentType: mediaType, size: bytes.length });
  }
}

/** Parse .eml bytes into a Mail. */
export function parseEml(input: Uint8Array): Mail {
  // A byte-preserving view keeps every byte 1:1 for structural parsing.
  const raw = bytesToBinaryString(input);
  const { header, body } = splitHeaderBody(raw);
  const headers = parseHeaderBlock(header);

  const acc: Accum = { attachments: [] };
  walk(headers, body, acc);

  if (acc.text === undefined && acc.html !== undefined) {
    acc.text = htmlToText(acc.html);
  }

  return {
    format: "eml",
    headers,
    subject: headerValue(headers, "subject"),
    from: headerValue(headers, "from"),
    to: headerValue(headers, "to"),
    cc: headerValue(headers, "cc"),
    date: headerValue(headers, "date"),
    text: acc.text,
    html: acc.html,
    attachments: acc.attachments,
  };
}
