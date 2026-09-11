import Image from "next/image";
import { cn } from "@/lib/utils";

export function BrandLogo({ className, priority = false }: { className?: string; priority?: boolean }) {
  return <Image src="/thienlong-logo.png" alt="Thiên Long" width={3947} height={903} priority={priority} className={cn("h-auto w-44 object-contain", className)} />;
}
