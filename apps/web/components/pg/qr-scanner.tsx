"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, LoaderCircle, ScanLine, Zap, ZapOff } from "lucide-react";
import type QrScanner from "qr-scanner";
import { calculateQrScanRegion, choosePrimaryRearCamera, type CameraDevice } from "@/lib/camera";

type TrackCapabilities = MediaTrackCapabilities & {
  focusMode?: string[];
  zoom?: { min: number; max: number };
};

function cameraError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : String(error);
  if (/NotAllowed|Permission|denied/i.test(name)) return "Chưa được cấp quyền camera. Hãy cho phép camera trong cài đặt trình duyệt rồi thử lại.";
  if (/NotFound|DevicesNotFound|No camera|Camera not found/i.test(name)) return "Không tìm thấy camera phù hợp trên thiết bị này.";
  if (/NotReadable|TrackStart/i.test(name)) return "Camera đang được ứng dụng khác sử dụng. Hãy đóng ứng dụng đó rồi mở lại camera.";
  return "Chưa thể mở camera. Hãy thử lại hoặc tìm khách theo tên.";
}

async function tuneCamera(video: HTMLVideoElement) {
  const stream = video.srcObject;
  if (!(stream instanceof MediaStream)) return;
  const track = stream.getVideoTracks()[0];
  if (!track) return;

  await track.applyConstraints({
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 30 },
  }).catch(() => undefined);

  const capabilities = track.getCapabilities?.() as TrackCapabilities | undefined;
  if (capabilities?.focusMode?.includes("continuous")) {
    await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] } as unknown as MediaTrackConstraints).catch(() => undefined);
  }
  if (capabilities?.zoom && capabilities.zoom.max > capabilities.zoom.min) {
    const zoom = Math.min(capabilities.zoom.max, Math.max(capabilities.zoom.min, 1.35));
    await track.applyConstraints({ advanced: [{ zoom }] } as unknown as MediaTrackConstraints).catch(() => undefined);
  }
}

export function GuestQrScanner({ onScan, processing = false }: { onScan: (value: string) => void; processing?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const mountedRef = useRef(false);
  const generationRef = useRef(0);
  const onScanRef = useRef(onScan);
  const [state, setState] = useState<"idle" | "starting" | "active">("idle");
  const [error, setError] = useState("");
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [cameraId, setCameraId] = useState("");
  const [cameraBusy, setCameraBusy] = useState(false);
  const [flashAvailable, setFlashAvailable] = useState(false);
  const [flashOn, setFlashOn] = useState(false);

  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  const releaseCamera = () => {
    scannerRef.current?.destroy();
    scannerRef.current = null;
    const stream = videoRef.current?.srcObject;
    if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setFlashAvailable(false);
    setFlashOn(false);
  };

  useEffect(() => {
    mountedRef.current = true;
    const video = videoRef.current;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      scannerRef.current?.destroy();
      scannerRef.current = null;
      const stream = video?.srcObject;
      if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
      if (video) video.srcObject = null;
    };
  }, []);

  const start = async () => {
    if (state !== "idle") return;
    setError("");
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError("Camera cần HTTPS và trình duyệt có hỗ trợ camera.");
      return;
    }
    setState("starting");
    const generation = ++generationRef.current;
    try {
      const { default: Scanner } = await import("qr-scanner");
      // Ask for permission directly so browsers preserve the real permission/device error.
      // Stop this short preflight stream before QrScanner opens the selected rear camera.
      const permissionStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      permissionStream.getTracks().forEach((track) => track.stop());
      const available = await Scanner.listCameras(true).catch(() => [] as CameraDevice[]);
      const preferred = choosePrimaryRearCamera(available);
      if (!mountedRef.current || generation !== generationRef.current || !videoRef.current) return;

      const scanner = new Scanner(videoRef.current, (result) => onScanRef.current(result.data), {
        preferredCamera: preferred?.id || "environment",
        maxScansPerSecond: 10,
        calculateScanRegion: (video) => calculateQrScanRegion(video.videoWidth, video.videoHeight),
        onDecodeError: () => undefined,
        returnDetailedScanResult: true,
        highlightScanRegion: false,
        highlightCodeOutline: false,
      });
      scannerRef.current = scanner;
      await scanner.start();
      if (!mountedRef.current || generation !== generationRef.current) {
        scanner.destroy();
        return;
      }
      await tuneCamera(videoRef.current);
      const currentCameras = available.length ? available : await Scanner.listCameras(true).catch(() => [] as CameraDevice[]);
      const selected = preferred ?? choosePrimaryRearCamera(currentCameras);
      setCameras(currentCameras);
      setCameraId(selected?.id || "");
      setFlashAvailable(await scanner.hasFlash().catch(() => false));
      setState("active");
    } catch (err) {
      if (!mountedRef.current || generation !== generationRef.current) return;
      releaseCamera();
      setState("idle");
      setError(cameraError(err));
    }
  };

  const stop = () => {
    generationRef.current += 1;
    releaseCamera();
    setState("idle");
  };

  const changeCamera = async (nextCameraId: string) => {
    const scanner = scannerRef.current;
    if (!scanner || !videoRef.current || cameraBusy) return;
    setCameraBusy(true); setError("");
    try {
      await scanner.setCamera(nextCameraId);
      await tuneCamera(videoRef.current);
      setCameraId(nextCameraId);
      setFlashOn(false);
      setFlashAvailable(await scanner.hasFlash().catch(() => false));
    } catch (err) {
      setError(cameraError(err));
    } finally {
      setCameraBusy(false);
    }
  };

  const toggleFlash = async () => {
    const scanner = scannerRef.current;
    if (!scanner || cameraBusy) return;
    try {
      await scanner.toggleFlash();
      setFlashOn(scanner.isFlashOn());
    } catch {
      setFlashAvailable(false);
    }
  };

  return (
    <section aria-label="Máy quét mã QR">
      <div className="relative flex aspect-[4/3] min-h-64 items-center justify-center overflow-hidden rounded-xl bg-[#0d2d6c] text-white ring-1 ring-blue-900/10">
        <video ref={videoRef} className={`absolute inset-0 size-full object-cover ${state === "active" ? "opacity-100" : "opacity-0"}`} playsInline muted aria-label="Hình ảnh camera quét QR" />
        {state === "active" ? (
          <div className="pointer-events-none relative flex size-52 items-end justify-center overflow-hidden rounded-xl border-2 border-white/90 pb-3 shadow-[0_0_0_999px_rgba(0,0,0,0.24)] sm:size-60"><span className="scan-line absolute inset-x-3 top-1/2 h-0.5 bg-brand-red"/><span className="relative rounded-md bg-black/70 px-3 py-1.5 text-xs font-medium">{processing ? "Đang kiểm tra khách…" : "Đang quét liên tục"}</span></div>
        ) : (
          <div className="relative max-w-xs px-6 text-center"><ScanLine className="mx-auto mb-5 size-12 text-slate-400" strokeWidth={1.2} /><p className="text-lg font-medium">Quét QR trên thư mời</p><p className="mt-2 text-sm leading-6 text-slate-400">Dùng camera sau, giữ QR đủ sáng và nằm trong khung.</p></div>
        )}
      </div>

      {state === "active" && (cameras.length > 1 || flashAvailable) && <div className="mt-3 flex gap-2">
        {cameras.length > 1 && <select aria-label="Chọn camera" value={cameraId} disabled={cameraBusy} onChange={(event) => void changeCamera(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-blue-100">
          {cameras.map((camera, index) => <option key={camera.id} value={camera.id}>{camera.label || `Camera ${index + 1}`}</option>)}
        </select>}
        {flashAvailable && <button type="button" onClick={() => void toggleFlash()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-primary">{flashOn ? <ZapOff className="size-4"/> : <Zap className="size-4"/>}{flashOn ? "Tắt đèn" : "Bật đèn"}</button>}
      </div>}

      {error && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900" role="alert">{error}</p>}
      <button type="button" onClick={state === "idle" ? start : stop} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-blue-100 bg-white px-4 text-sm font-semibold text-primary transition hover:bg-blue-50">
        {state === "idle" ? <><Camera className="size-4" />Mở camera</> : state === "starting" ? <><LoaderCircle className="size-4 animate-spin" />Hủy mở camera</> : <><CameraOff className="size-4" />Tắt camera</>}
      </button>
    </section>
  );
}
