export type CameraDevice = { id: string; label: string };

const rearPattern = /back|rear|environment|mặt sau|camera sau/i;
const frontPattern = /front|user|mặt trước|camera trước/i;
const auxiliaryPattern = /ultra|0[.,]5|siêu rộng|macro|tele|depth|chân dung/i;

/** Prefer the normal rear camera; phone browsers sometimes choose the ultra-wide lens by default. */
export function choosePrimaryRearCamera(cameras: CameraDevice[]): CameraDevice | undefined {
  const rear = cameras.filter((camera) => rearPattern.test(camera.label) && !frontPattern.test(camera.label));
  return rear.find((camera) => !auxiliaryPattern.test(camera.label))
    ?? rear[0]
    ?? cameras.find((camera) => !frontPattern.test(camera.label))
    ?? cameras[0];
}

/** Scan most of the visible frame without reducing small QR codes to the library's 400px default. */
export function calculateQrScanRegion(videoWidth: number, videoHeight: number) {
  const size = Math.round(Math.min(videoWidth, videoHeight) * 0.8);
  return {
    x: Math.round((videoWidth - size) / 2),
    y: Math.round((videoHeight - size) / 2),
    width: size,
    height: size,
    downScaledWidth: 720,
    downScaledHeight: 720,
  };
}
