import assert from "node:assert/strict";
import { test } from "node:test";
import { parseInvitationQr } from "./qr.ts";

const origin = "https://event.example.com";
const token = "x7_Ap9rVq2nB4kH8dTmY3sWuNzLf6CeQ";

test("extracts only the guest token from a complete invitation URL", () => {
  assert.equal(parseInvitationQr(`${origin}/i/${token}`, origin), token);
  assert.equal(parseInvitationQr(`  ${origin}/i/${token}/  `, origin), token);
});

test("accepts a backend-generated production QR while PG runs on another Vercel deployment", () => {
  const pgDeployment = "https://thienlong-preview-123.vercel.app";
  const invitationUrl = `https://thienlong-ten.vercel.app/i/${token}`;
  assert.equal(parseInvitationQr(invitationUrl, pgDeployment), token);
});

test("accepts an older HTTPS invitation host because the API validates the token", () => {
  assert.equal(parseInvitationQr(`https://old-event-domain.example.com/i/${token}`, origin), token);
});

test("rejects insecure remote origins even with an invitation-shaped path", () => {
  for (const insecure of ["http://other.example.com", "http://event.example.com", "ftp://event.example.com"]) {
    assert.equal(parseInvitationQr(`${insecure}/i/${token}`, origin), null);
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
