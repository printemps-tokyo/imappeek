# imappeek

> Peek at recent messages in an IMAP mailbox from the terminal: list headers, read a message as text. Zero-dependency CLI.

[![CI](https://github.com/printemps-tokyo/imappeek/actions/workflows/ci.yml/badge.svg)](https://github.com/printemps-tokyo/imappeek/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

`imappeek` connects to an IMAP mailbox over TLS and shows the most recent
messages, then reads any one of them as plain text — without a mail client. It
is handy for quickly checking a shared or service mailbox from a shell or a
script.

```console
$ IMAP_PASSWORD=secret imappeek --host imap.example.com --user me@example.com -n 5
* #8105 2026-07-07 14:53   Adobe <message@adobe.com>       Your verification code
  #8104 2026-07-07 12:04   Newsletter <news@example.net>   This week's digest
  ...

5 shown, 1 unread (* = unread)

$ IMAP_PASSWORD=secret imappeek --host imap.example.com --user me@example.com --show 8105
Date:    Mon, 07 Jul 2026 14:53:00 +0900
From:    Adobe <message@adobe.com>
Subject: Your verification code

Your one-time code is 123456 ...
```

The mailbox is opened read-only (`EXAMINE`), so peeking never marks messages as
read. There are no dependencies: the IMAP protocol and MIME parsing are
implemented with Node's built-ins, and the only connection is TLS to the server
you name.

## Requirements

- Node.js >= 22

## Install

Not published to npm yet — install from source:

```bash
git clone https://github.com/printemps-tokyo/imappeek
cd imappeek
npm install && npm run build
npm link   # optional: puts the `imappeek` command on your PATH
```

## Usage

```bash
IMAP_PASSWORD=secret imappeek --host imap.example.com --user me@example.com
IMAP_PASSWORD=secret imappeek --host imap.example.com --user me@example.com -n 20
IMAP_PASSWORD=secret imappeek --host imap.example.com --user me@example.com --unseen
IMAP_PASSWORD=secret imappeek --host imap.example.com --user me@example.com --show 42
IMAP_PASSWORD=secret imappeek --host imap.example.com --user me@example.com --mailbox Sent --json
IMAP_OAUTH2_TOKEN=ya29... imappeek --oauth2 --host imap.gmail.com --user me@gmail.com
imappeek ... --from billing@ --since 2026-11-01            # search
imappeek ... --subject 請求書 --threads                    # non-ASCII search, as conversations
```

| Option | Description |
| --- | --- |
| `--host <server>` | IMAP server hostname (required) |
| `--user <address>` | Login user / mailbox address (required) |
| `--pass <password>` | Password (prefer the `IMAP_PASSWORD` env var) |
| `--port <n>` | Port (default: 993, or 143 with `--no-tls`) |
| `--no-tls` | Use a plaintext connection (not recommended) |
| `--mailbox <name>` | Mailbox to open (default: `INBOX`) |
| `-n, --limit <n>` | How many recent messages to list (default: 10) |
| `--unseen` | List only unread messages (IMAP `SEARCH UNSEEN`) |
| `--from`, `--to`, `--subject`, `--text <text>` | Only messages whose header (or, for `--text`, headers or body) contains the text |
| `--since`, `--before <YYYY-MM-DD>` | Only messages on or after / before a date |
| `--threads` | Group the listed messages into conversations |
| `--oauth2` | Log in with an OAuth 2.0 access token from `IMAP_OAUTH2_TOKEN` (SASL `XOAUTH2`) |
| `--show <seq>` | Read the message with this sequence number, as text |
| `--max-body <n>` | Truncate a shown message body to n characters |
| `--json` | Output JSON instead of text |
| `--no-color` | Disable ANSI colors |

Give the password through the `IMAP_PASSWORD` environment variable so it stays
out of your shell history. Subjects and sender names are decoded from MIME
encoded-words, and `--show` renders `text/plain` (falling back to HTML converted
to text) with the attachment list.

### Search

The search options combine (all must match) and run on the server as one IMAP
`SEARCH`; `-n` then keeps the newest matches. ASCII text is sent as quoted
strings; text with other characters (a Japanese subject, say) is sent as a
UTF-8 literal with `CHARSET UTF-8`, as the protocol requires. Servers decide
how they match (usually case-insensitive substrings), and `--since` / `--before`
compare the date the server received the message.

### Conversations

`--threads` groups the listed messages client side: a reply is linked to its
parent through `Message-ID`, `In-Reply-To` and `References`, replies are
indented under it, and conversations are ordered by their latest message.
Messages without those headers are grouped by subject with `Re:` / `Fwd:` /
`返信:` and similar prefixes removed. Only the listed messages are threaded, so
raise `-n` (or narrow with a search) to see whole conversations.

### OAuth 2.0 (Gmail, Microsoft 365)

Providers that disable passwords for IMAP take an OAuth 2.0 access token
through SASL `XOAUTH2`. Put the token in `IMAP_OAUTH2_TOKEN` and pass
`--oauth2`; imappeek sends `AUTHENTICATE XOAUTH2` with
`user=<--user>^Aauth=Bearer <token>^A^A` (base64) and, when the server rejects
it, shows the error the server returns. Getting the token (an OAuth client with
the mail scope, and a refresh flow) is up to you; imappeek never stores it.

## Security

imappeek only talks to the IMAP server you specify, over TLS by default, and
never writes your credentials or mail anywhere. It opens the mailbox read-only,
so it does not change message flags or delete anything. Use `--no-tls` only on a
trusted local network.

## Programmatic API

```ts
import { openMailbox, listRecent, showMessage } from "@printemps-tokyo/imappeek";

const { client, count } = await openMailbox(
  { host: "imap.example.com" },
  { user: "me@example.com", pass: process.env.IMAP_PASSWORD! },
  "INBOX",
);
const recent = await listRecent(client, count, 10);
await client.logout();
```

The IMAP wire parsing (`scanResponse`, literal extraction) is pure and
unit-tested; `ImapClient` holds the only IO.

## License

[MIT](./LICENSE) (c) printemps.tokyo
