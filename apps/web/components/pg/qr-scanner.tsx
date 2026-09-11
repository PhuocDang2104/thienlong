"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, LoaderCircle, ScanLine } from "lucide-react";
import type QrScanner from "qr-scanner";

function cameraError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : String(error);
  if (/NotAllowed|Permission|denied/i.test(name)) return "Chưa được cấp quyền camera. Hãy cho phép camera trong cài đặt trình duyệt rồi thử lại, hoặc tìm khách theo tên bên dưới.";
  if (/NotFound|DevicesNotFound|No camera|Camera not found/i.test(name)) return "Không tìm thấy camera trên thiết bị này. Vui lòng tìm khách theo tên hoặc nhập đường dẫn QR bên dưới.";
  if (/NotReadable|TrackStart/i.test(name)) return "Camera đang được ứng dụng khác sử dụng. Hãy đóng ứng dụng đó rồi mở lại camera.";
  return "Chưa thể mở camera. Vui lòng thử lại hoặc tìm khách theo tên bên dưới.";
}

export function GuestQrScanner({ onScan }: { onScan: (value: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const mountedRef = useRef(false);
  const generationRef = useRef(0);
  const onScanRef = useRef(onScan);
  const [state, setState] = useState<"idle" | "starting" | "active">("idle");
  const [error, setError] = useState("");

  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  const releaseCamera = () => {
    scannerRef.current?.destroy();
    scannerRef.current = null;
    const stream = videoRef.current?.srcObject;
    if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
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
      setError("Camera cần kết nối HTTPS và trình duyệt hỗ trợ. Vui lòng dùng đường dẫn bảo mật của hệ thống hoặc tìm khách theo tên.");
      return;
    }
    setState("starting");
    const generation = ++generationRef.current;
    try {
      const { default: Scanner } = await import("qr-scanner");
      if (!mountedRef.current || generation !== generationRef.current || !videoRef.current) return;
      // Acquire the stream directly so native permission/device errors are preserved.
      // qr-scanner otherwise collapses these distinct failures into "Camera not found".
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      if (!mountedRef.current || generation !== generationRef.current || !videoRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      videoRef.current.srcObject = stream;
      const scanner = new Scanner(videoRef.current, (result) => onScanRef.current(result.data), {
        preferredCamera: "environment", maxScansPerSecond: 5, returnDetailedScanResult: true,
        highlightScanRegion: false, highlightCodeOutline: false,
      });
      scannerRef.current = scanner;
      await scanner.start();
      if (!mountedRef.current || generation !== generationRef.current) {
        scanner.destroy();
        return;
      }
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

  return (
    <section aria-label="Máy quét mã QR">
      <div className="relative flex aspect-[4/3] min-h-64 items-center justify-center overflow-hidden rounded-2xl bg-[#0d2d6c] text-white shadow-[0_18px_44px_rgba(13,45,108,.2)] ring-1 ring-blue-900/10">
        <video ref={videoRef} className={`absolute inset-0 size-full object-cover ${state === "active" ? "opacity-100" : "opacity-0"}`} playsInline muted aria-label="Hình ảnh camera quét QR" />
        {state === "active" ? (
          <div className="pointer-events-none relative flex size-52 items-end justify-center overflow-hidden rounded-2xl border-2 border-white/90 pb-3 shadow-[0_0_0_999px_rgba(0,0,0,0.24),0_0_28px_rgba(255,255,255,.18)] sm:size-60"><span className="scan-line absolute inset-x-3 top-1/2 h-0.5 bg-brand-red"/><span className="relative rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium backdrop-blur">Đưa mã QR vào khung</span></div>
        ) : (
          <div className="relative max-w-xs px-6 text-center"><ScanLine className="mx-auto mb-5 size-12 text-slate-400" strokeWidth={1.2} /><p className="text-lg font-medium">Quét QR trên thư mời</p><p className="mt-2 text-sm leading-6 text-slate-400">Đặt mã QR trong khung, giữ điện thoại ổn định để nhận diện khách.</p></div>
        )}
      </div>
      {error && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900" role="alert">{error}</p>}
      <button type="button" onClick={state === "idle" ? start : stop} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-blue-100 bg-white px-4 text-sm font-semibold text-primary shadow-[0_5px_16px_rgba(16,37,80,.07)] transition hover:-translate-y-0.5 hover:bg-blue-50">
        {state === "idle" ? <><Camera className="size-4" />Mở camera</> : state === "starting" ? <><LoaderCircle className="size-4 animate-spin" />Hủy mở camera</> : <><CameraOff className="size-4" />Tắt camera</>}
      </button>
    </section>
  );
}
