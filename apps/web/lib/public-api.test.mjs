import assert from "node:assert/strict";
import { test } from "node:test";
import { eventDate, eventTime, isWelcomeGuest } from "./public-api.ts";

const guest = { id: 42, name: "Nguyễn Văn An", company: "Thiên Long", checked_in_at: "2026-09-11T10:30:00Z" };

test("accepts the real backend SSE and snapshot payload with an integer check-in ID", () => {
  assert.equal(isWelcomeGuest(guest), true);
  assert.equal(isWelcomeGuest({ ...guest, company: "" }), true);
});

test("rejects malformed check-in IDs before welcome deduplication", () => {
  for (const id of [null, undefined, "42", 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(isWelcomeGuest({ ...guest, id }), false);
  }
});

test("rejects invalid event data without crashing the stream consumer", () => {
  for (const value of [null, [], {}, "checkin", { ...guest, name: null }, { ...guest, company: 123 }, { ...guest, checked_in_at: "not-a-date" }]) {
    assert.equal(isWelcomeGuest(value), false);
  }
});

test("formats the configured reception time in the Vietnam timezone", () => {
  const reception = "2026-11-20T17:30:00+07:00";
  assert.equal(eventTime(reception), "17:30");
  assert.match(eventDate(reception), /20\/11\/2026/);
});
