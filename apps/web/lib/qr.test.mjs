import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { parseInvitationQr } from "./qr.ts";

const origin = "https://event.example.com";
const token = "x7_Ap9rVq2nB4kH8dTmY3sWuNzLf6CeQ";
const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

afterEach(() => {
  if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
});

test("extracts only the guest token from a complete invitation URL", () => {
  assert.equal(parseInvitationQr(`${origin}/i/${token}`, origin), token);
  assert.equal(parseInvitationQr(`  ${origin}/i/${token}/  `, origin), token);
});

test("accepts the canonical invitation domain while PG runs on another approved frontend", () => {
  process.env.NEXT_PUBLIC_APP_URL = "https://invite.example.com";
  assert.equal(parseInvitationQr(`https://invite.example.com/i/${token}`, origin), token);
});

test("rejects external and lookalike domains even with a valid invitation path", () => {
  delete process.env.NEXT_PUBLIC_APP_URL;
  for (const untrusted of ["https://other.example.com", "https://event.example.com.attacker.test", "http://event.example.com"]) {
    assert.equal(parseInvitationQr(`${untrusted}/i/${token}`, origin), null);
  }
});

test("rejects arbitrary paths, extra segments and percent-encoded tokens", () => {
  for (const path of [`/admin/${token}`, `/pg/i/${token}`, `/i/${token}/extra`, `/i/%78${token.slice(1)}`]) {
    assert.equal(parseInvitationQr(`${origin}${path}`, origin), null);
  }
});

test("rejects absent, short and malformed invitation tokens", () => {
  for (const value of ["", "1234", "a".repeat(21), "a".repeat(129), "hello.world.long.invalid.token"]) {
    assert.equal(parseInvitationQr(`${origin}/i/${value}`, origin), null);
  }
});

test("rejects URLs with credentials, parameters and fragments", () => {
  for (const value of [`https://user:pass@event.example.com/i/${token}`, `${origin}/i/${token}?next=/admin`, `${origin}/i/${token}#fragment`]) {
    assert.equal(parseInvitationQr(value, origin), null);
  }
});

test("rejects non-URL scans and executable schemes without navigating", () => {
  for (const value of [token, `/i/${token}`, `//event.example.com/i/${token}`, "javascript:alert(1)", "data:text/html,hi", "not a QR invitation"]) {
    assert.equal(parseInvitationQr(value, origin), null);
  }
});

test("supports localhost invitation URLs used for local integration tests", () => {
  assert.equal(parseInvitationQr(`http://localhost:3000/i/${token}`, "http://localhost:3000"), token);
});
