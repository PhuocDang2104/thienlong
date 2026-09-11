"use client";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;
export const DialogClose = DialogPrimitive.Close;
export function DialogContent({ className, children, ...props }: React.ComponentProps<typeof DialogPrimitive.Content>) { return <DialogPrimitive.Portal><DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-slate-950/45 data-[state=open]:animate-in"/><DialogPrimitive.Content className={cn("fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,.16)]", className)} {...props}>{children}<DialogPrimitive.Close aria-label="Đóng" className="absolute top-4 right-4 rounded-md p-1.5 text-muted transition hover:bg-slate-100 hover:text-primary"><X className="size-4"/></DialogPrimitive.Close></DialogPrimitive.Content></DialogPrimitive.Portal>; }
