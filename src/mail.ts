/** The normalized email model that both the .eml and .msg parsers produce. */

/** A single header field, preserving its original name and order. */
export interface Header {
  name: string;
  value: string;
}

/** A described attachment (metadata only; bytes are not retained by default). */
export interface Attachment {
  filename: string;
  contentType?: string;
  size: number;
}

/** A parsed email, source-agnostic. */
export interface Mail {
  /** Where it came from: a MIME .eml file or an Outlook .msg file. */
  format: "eml" | "msg";
  /** All headers in order (from the raw header block or transport headers). */
  headers: Header[];
  subject?: string;
  from?: string;
  to?: string;
  cc?: string;
  date?: string;
  /** Plain-text body, if present or derived from HTML. */
  text?: string;
  /** HTML body, if present. */
  html?: string;
  attachments: Attachment[];
}

/** Case-insensitively find the first header value with the given name. */
export function headerValue(headers: Header[], name: string): string | undefined {
  const lower = name.toLowerCase();
  return headers.find((h) => h.name.toLowerCase() === lower)?.value;
}

/** All header values with the given name (e.g. multiple Received lines). */
export function headerValues(headers: Header[], name: string): string[] {
  const lower = name.toLowerCase();
  return headers.filter((h) => h.name.toLowerCase() === lower).map((h) => h.value);
}
