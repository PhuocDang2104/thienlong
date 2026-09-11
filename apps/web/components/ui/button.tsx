import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva("inline-flex shrink-0 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4", { variants: { variant: { primary: "bg-primary text-white hover:bg-[#1c3d8d]", secondary: "border border-border bg-white text-foreground hover:border-slate-300 hover:bg-slate-50", ghost: "text-muted hover:bg-slate-100 hover:text-primary", danger: "bg-brand-red text-white hover:bg-[#cf1726]" }, size: { default: "h-10 px-4", sm: "h-8 rounded-md px-3 text-xs", icon: "size-9 rounded-md" } }, defaultVariants: { variant: "primary", size: "default" } });
export function Button({ className, variant, size, asChild = false, ...props }: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) { const Comp = asChild ? Slot : "button"; return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props}/>; }
export { buttonVariants };
