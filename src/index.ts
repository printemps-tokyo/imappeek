/**
 * Public API for imappeek.
 *
 * imappeek connects to an IMAP mailbox over TLS and peeks at recent messages:
 * it lists headers and reads a message as text. The IMAP wire parsing
 * (`scanResponse`, literal extraction) is pure and testable; the only IO is the
 * TLS socket in `ImapClient`.
 */

export {
  scanResponse,
  extractFirstLiteral,
  parseExists,
  parseSearch,
  imapQuote,
  latin1,
} from "./protocol.js";
export type { ScanResult, ImapStatus } from "./protocol.js";

export { ImapClient, ImapError } from "./imap.js";
export type { ImapOptions, CommandResult } from "./imap.js";

export { openMailbox, listRecent, listUnseen, showMessage } from "./session.js";
export type { MessageSummary, Credentials } from "./session.js";

export { renderList, renderMessage } from "./render.js";

export { parseEml } from "./mime.js";
export type { Mail, Header, Attachment } from "./mail.js";
