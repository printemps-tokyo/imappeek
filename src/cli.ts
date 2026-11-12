#!/usr/bin/env node
import { parseArgs } from "node:util";
import { openMailbox, listRecent, listSearch, showMessage } from "./session.js";
import { renderList, renderMessage, renderThreads } from "./render.js";
import { buildSearch, hasSearch, type SearchOptions } from "./search.js";
import { buildThreads } from "./thread.js";

const HELP = `imappeek - peek at recent messages in an IMAP mailbox

Usage:
  imappeek --host <server> --user <address> [options]

Lists the most recent messages (date, from, subject, unread mark), or reads one
message as text with --show. Connects over TLS (port 993 by default). The
password is read from the IMAP_PASSWORD environment variable so it stays out of
your shell history; --pass is available but discouraged.

Options:
  --host <server>     IMAP server hostname (required)
  --user <address>    Login user / mailbox address (required)
  --pass <password>   Password (prefer the IMAP_PASSWORD env var instead)
  --port <n>          Port (default: 993, or 143 with --no-tls)
  --no-tls            Use a plaintext connection (not recommended)
  --mailbox <name>    Mailbox to open (default: INBOX)
  -n, --limit <n>     How many recent messages to list (default: 10)
  --unseen            List only unread messages (IMAP SEARCH UNSEEN)
  --from <text>       Only messages whose From contains <text> (IMAP SEARCH)
  --to <text>         ... whose To contains <text>
  --subject <text>    ... whose Subject contains <text>
  --text <text>       ... with <text> anywhere in the headers or body
  --since <date>      ... on or after YYYY-MM-DD
  --before <date>     ... before YYYY-MM-DD
                      (search options combine; non-ASCII text works)
  --threads           Group the listed messages into conversations
  --oauth2            Log in with an OAuth 2.0 access token (SASL XOAUTH2)
                      from the IMAP_OAUTH2_TOKEN environment variable
  --show <seq>        Read the message with this sequence number, as text
  --max-body <n>      Truncate a shown message body to n characters
  --json              Output JSON instead of text
  --no-color          Disable ANSI colors
  -h, --help          Show this help
  -v, --version       Show version

Examples:
  IMAP_PASSWORD=secret imappeek --host imap.example.com --user me@example.com
  IMAP_OAUTH2_TOKEN=ya29... imappeek --oauth2 --host imap.gmail.com --user me@gmail.com
  imappeek ... --from billing@ --since 2026-11-01 --threads
  IMAP_PASSWORD=secret imappeek --host imap.example.com --user me@example.com --unseen
  IMAP_PASSWORD=secret imappeek --host imap.example.com --user me@example.com --show 42
`;

async function readVersion(): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const here = dirname(fileURLToPath(import.meta.url));
  try {
    const raw = await readFile(join(here, "..", "package.json"), "utf8");
    return (JSON.parse(raw) as { version: string }).version;
  } catch {
    return "0.0.0";
  }
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  if (argv.includes("-h") || argv.includes("--help") || argv.length === 0) {
    process.stdout.write(HELP);
    return argv.length === 0 ? 1 : 0;
  }
  if (argv.includes("-v") || argv.includes("--version")) {
    process.stdout.write((await readVersion()) + "\n");
    return 0;
  }

  let values;
  try {
    values = parseArgs({
      args: argv,
      allowPositionals: false,
      options: {
        host: { type: "string" },
        user: { type: "string" },
        pass: { type: "string" },
        port: { type: "string" },
        "no-tls": { type: "boolean", default: false },
        mailbox: { type: "string" },
        limit: { type: "string", short: "n" },
        unseen: { type: "boolean", default: false },
        oauth2: { type: "boolean", default: false },
        from: { type: "string" },
        to: { type: "string" },
        subject: { type: "string" },
        text: { type: "string" },
        since: { type: "string" },
        before: { type: "string" },
        threads: { type: "boolean", default: false },
        show: { type: "string" },
        "max-body": { type: "string" },
        json: { type: "boolean", default: false },
        "no-color": { type: "boolean", default: false },
      },
    }).values;
  } catch (err) {
    process.stderr.write(`error: ${(err as Error).message}\n`);
    process.stderr.write("run 'imappeek --help' for usage.\n");
    return 1;
  }

  if (!values.host || !values.user) {
    process.stderr.write("error: --host and --user are required\n\n" + HELP);
    return 1;
  }
  let pass: string | undefined;
  let token: string | undefined;
  if (values.oauth2) {
    token = process.env.IMAP_OAUTH2_TOKEN;
    if (!token) {
      process.stderr.write("error: --oauth2 reads the access token from IMAP_OAUTH2_TOKEN, which is not set\n");
      return 1;
    }
  } else {
    pass = values.pass ?? process.env.IMAP_PASSWORD;
    if (!pass) {
      process.stderr.write("error: no password (set IMAP_PASSWORD or pass --pass, or use --oauth2)\n");
      return 1;
    }
  }
  const search: SearchOptions = {
    unseen: values.unseen,
    from: values.from,
    to: values.to,
    subject: values.subject,
    text: values.text,
    since: values.since,
    before: values.before,
  };
  try {
    if (hasSearch(search)) buildSearch(search);
  } catch (err) {
    process.stderr.write(`error: ${(err as Error).message}\n`);
    return 1;
  }

  const color = !values["no-color"] && !process.env.NO_COLOR && process.stdout.isTTY === true;
  const mailbox = values.mailbox ?? "INBOX";
  const options = {
    host: values.host,
    port: values.port ? Number(values.port) : undefined,
    tls: !values["no-tls"],
  };

  let client;
  try {
    const opened = await openMailbox(options, { user: values.user, pass, token }, mailbox);
    client = opened.client;
    const count = opened.count;

    if (values.show !== undefined) {
      const seq = Number(values.show);
      if (!Number.isInteger(seq) || seq < 1) throw new Error(`--show must be a positive sequence number`);
      const mail = await showMessage(client, seq);
      const maxBody = values["max-body"] ? Number(values["max-body"]) : undefined;
      process.stdout.write(values.json ? JSON.stringify(mail, null, 2) + "\n" : renderMessage(mail, color, maxBody));
    } else {
      const limit = values.limit ? Number(values.limit) : 10;
      const searching = hasSearch(search);
      const messages = searching ? await listSearch(client, search, limit) : await listRecent(client, count, limit);
      if (values.threads) {
        const threads = buildThreads(messages);
        process.stdout.write(values.json ? JSON.stringify(threads, null, 2) + "\n" : renderThreads(threads, color));
      } else if (values.json) {
        process.stdout.write(JSON.stringify(messages, null, 2) + "\n");
      } else if (searching && messages.length === 0) {
        process.stdout.write(values.unseen && !search.from && !search.to && !search.subject && !search.text && !search.since && !search.before ? "(no unread messages)\n" : "(no matching messages)\n");
      } else {
        process.stdout.write(renderList(messages, color));
      }
    }
  } catch (err) {
    process.stderr.write(`error: ${(err as Error).message}\n`);
    await client?.logout();
    return 1;
  }

  await client.logout();
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    process.stderr.write(`error: ${(err as Error).message}\n`);
    process.exitCode = 1;
  });
