import assert from "node:assert/strict";
import test from "node:test";
import { calculateQrScanRegion, choosePrimaryRearCamera } from "./camera.ts";

test("prefers a normal rear camera over ultra-wide, telephoto and front lenses", () => {
  const cameras = [
    { id: "front", label: "Front Camera" },
    { id: "ultra", label: "Back Ultra Wide Camera 0.5x" },
    { id: "main", label: "Back Camera" },
    { id: "tele", label: "Back Telephoto Camera" },
  ];
  assert.equal(choosePrimaryRearCamera(cameras)?.id, "main");
});

test("falls back to an available non-front camera when labels are generic", () => {
  const cameras = [{ id: "front", label: "Front Camera" }, { id: "second", label: "Camera 2" }];
  assert.equal(choosePrimaryRearCamera(cameras)?.id, "second");
});

test("uses a centered high-resolution square scan region", () => {
  assert.deepEqual(calculateQrScanRegion(1920, 1080), {
    x: 528,
    y: 108,
    width: 864,
    height: 864,
    downScaledWidth: 720,
    downScaledHeight: 720,
  });
});
