import { describe, expect, it } from "vitest";
import { parseEml } from "../src/mime.js";

/** Build a two-part message whose second part uses the given headers. */
function emlWithAttachment(partHeaders: string[]): Uint8Array {
  const lines = [
    "From: a@example.com",
    "Subject: test",
    'Content-Type: multipart/mixed; boundary="B"',
    "",
    "--B",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "hello",
    "--B",
    ...partHeaders,
    "",
    "ZGF0YQ==",
    "--B--",
    "",
  ];
  return new Uint8Array(Buffer.from(lines.join("\r\n"), "latin1"));
}

describe("attachment filename decoding", () => {
  it("reads a plain quoted filename", () => {
    const mail = parseEml(
      emlWithAttachment([
        "Content-Type: application/pdf",
        'Content-Disposition: attachment; filename="report.pdf"',
        "Content-Transfer-Encoding: base64",
      ]),
    );
    expect(mail.attachments.map((a) => a.filename)).toEqual(["report.pdf"]);
  });

  it("decodes an RFC 2231 extended value (filename*=UTF-8''...)", () => {
    const mail = parseEml(
      emlWithAttachment([
        "Content-Type: application/pdf",
        "Content-Disposition: attachment;",
        " filename*=UTF-8''%E6%97%A5%E6%9C%AC%E8%AA%9E.pdf",
        "Content-Transfer-Encoding: base64",
      ]),
    );
    expect(mail.attachments.map((a) => a.filename)).toEqual(["日本語.pdf"]);
  });

  it("decodes RFC 2231 continuations, even splitting a multibyte character", () => {
    // The bytes of one UTF-8 character are split across the two segments.
    const mail = parseEml(
      emlWithAttachment([
        "Content-Type: application/octet-stream",
        "Content-Disposition: attachment;",
        " filename*0*=UTF-8''%E6%97%A5%E6%9C;",
        " filename*1*=%AC%E8%AA%9E.txt",
        "Content-Transfer-Encoding: base64",
      ]),
    );
    expect(mail.attachments.map((a) => a.filename)).toEqual(["日本語.txt"]);
  });

  it("mixes extended and plain continuation segments", () => {
    const mail = parseEml(
      emlWithAttachment([
        "Content-Type: application/octet-stream",
        "Content-Disposition: attachment;",
        " filename*0*=UTF-8''%E6%97%A5%E6%9C%AC%E8%AA%9E;",
        ' filename*1=".txt"',
        "Content-Transfer-Encoding: base64",
      ]),
    );
    expect(mail.attachments.map((a) => a.filename)).toEqual(["日本語.txt"]);
  });

  it("honors a non-UTF-8 charset label", () => {
    const mail = parseEml(
      emlWithAttachment([
        "Content-Type: application/octet-stream",
        "Content-Disposition: attachment; filename*=iso-8859-1''caf%E9.txt",
        "Content-Transfer-Encoding: base64",
      ]),
    );
    expect(mail.attachments.map((a) => a.filename)).toEqual(["café.txt"]);
  });

  it("does not read filename*= when looking for the name parameter", () => {
    // Without a boundary anchor, searching for `name` used to match inside
    // `filename*=`, inventing a name from an unrelated parameter.
    const mail = parseEml(
      emlWithAttachment([
        "Content-Type: application/pdf; filename*=UTF-8''x%20y.pdf",
        "Content-Transfer-Encoding: base64",
      ]),
    );
    expect(mail.attachments).toHaveLength(1);
    expect(mail.attachments[0]!.filename).toBe("(unnamed)");
  });

  it("does not match a parameter whose name merely ends with the queried one", () => {
    const mail = parseEml(
      emlWithAttachment([
        "Content-Type: application/pdf",
        "Content-Disposition: attachment;",
        " xfilename*0*=UTF-8''alias%20value",
        "Content-Transfer-Encoding: base64",
      ]),
    );
    expect(mail.attachments).toHaveLength(1);
    expect(mail.attachments[0]!.filename).toBe("(unnamed)");
  });

  it("never drops an attachment without an extractable filename", () => {
    const mail = parseEml(
      emlWithAttachment([
        "Content-Type: application/pdf",
        "Content-Disposition: attachment",
        "Content-Transfer-Encoding: base64",
      ]),
    );
    expect(mail.attachments).toHaveLength(1);
    expect(mail.attachments[0]!.filename).toBe("(unnamed)");
    expect(mail.attachments[0]!.contentType).toBe("application/pdf");
  });

  it("lists a non-text leaf part without a disposition instead of dropping it", () => {
    const mail = parseEml(
      emlWithAttachment(["Content-Type: image/png", "Content-Transfer-Encoding: base64"]),
    );
    expect(mail.attachments).toHaveLength(1);
    expect(mail.attachments[0]!.filename).toBe("(unnamed)");
    expect(mail.attachments[0]!.contentType).toBe("image/png");
  });

  it("still reads the text body alongside decoded attachments", () => {
    const mail = parseEml(
      emlWithAttachment([
        "Content-Type: application/pdf",
        "Content-Disposition: attachment; filename*=UTF-8''%E6%97%A5.pdf",
        "Content-Transfer-Encoding: base64",
      ]),
    );
    expect(mail.text?.trim()).toBe("hello");
  });
});
