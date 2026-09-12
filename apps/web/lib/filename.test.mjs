import assert from "node:assert/strict";
import { test } from "node:test";
import { guestQrFilename } from "./filename.ts";

test("creates an accent-free Thiên Long QR filename from a guest name", () => {
  assert.equal(guestQrFilename("Diệp Gia Luật"), "diep-gia-luat-thienlong.png");
  assert.equal(guestQrFilename("Đặng Như Phước"), "dang-nhu-phuoc-thienlong.png");
});

test("normalizes spaces and punctuation in QR filenames", () => {
  assert.equal(guestQrFilename("  Ánh  Hiếu (VIP) "), "anh-hieu-vip-thienlong.png");
});
