"use client";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { LoaderCircle } from "lucide-react";
import { useAdmin } from "@/components/layout/admin-shell";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/feedback";
import type { Guest } from "@/types";

const schema = z.object({
  name: z.string().trim().min(1, "Nhập tên khách mời.").max(200),
  company: z.string().trim().max(250),
  email: z.union([z.email("Email không hợp lệ."), z.literal("")]),
  phone: z.string().trim().max(40),
  rsvp_status: z.enum(["pending", "accepted", "declined"]),
  companions: z.number().int().min(0),
});
type Values = z.infer<typeof schema>;
const labels = { pending: "Chưa phản hồi", accepted: "Tham dự", declined: "Không tham dự" };

export function GuestForm({ guest, onSaved, onCancel }: { guest?: Guest; onSaved: (saved: Guest) => void; onCancel: () => void }) {
  const { token, event } = useAdmin();
  const [error, setError] = useState<string | null>(null);
  const locked = Boolean(guest?.checked_in_at);
  const { register, handleSubmit, setValue, control, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: guest?.name || "", company: guest?.company || "", email: guest?.email || "", phone: guest?.phone || "", rsvp_status: guest?.rsvp_status || "pending", companions: guest?.companions || 0 },
  });
  const status = useWatch({ control, name: "rsvp_status" });
  const save = async (values: Values) => {
    setError(null);
    if (!locked && values.companions > event.max_companions) {
      setError(`Mỗi khách được đăng ký tối đa ${event.max_companions} người đi cùng.`);
      return;
    }
    const { name, company, email, phone } = values;
    try {
      const saved = await api<Guest>(guest ? `/admin/guests/${guest.id}` : "/admin/guests", { method: guest ? "PATCH" : "POST", token, body: {
        name, company, email, phone,
        ...(!locked ? { rsvp_status: values.rsvp_status, companions: values.rsvp_status === "accepted" ? values.companions : 0 } : {}),
      } });
      onSaved(saved);
    } catch (err) { setError(err instanceof Error ? err.message : "Không lưu được thay đổi."); }
  };
  return <form onSubmit={handleSubmit(save)} className="mt-6 space-y-4">
    {error && <Alert>{error}</Alert>}
    {([
      ["name", "Họ và tên", "text"], ["company", "Đơn vị / Công ty", "text"],
      ["email", "Email", "email"], ["phone", "Số điện thoại", "tel"],
    ] as const).map(([field, label, type]) => <div key={field}>
      <label className="mb-1.5 block text-xs font-medium" htmlFor={`guest-${field}`}>{label}{field === "name" && <span className="text-red-700"> *</span>}</label>
      <Input id={`guest-${field}`} type={type} {...register(field)} aria-invalid={!!errors[field]} />
      {errors[field] && <p className="mt-1 text-xs text-red-700">{errors[field]?.message}</p>}
    </div>)}
    {guest && <div className="rounded-lg border border-border bg-slate-50 px-3.5 py-3"><p className="text-xs font-semibold text-slate-700">Ghi chú khách gửi</p><p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-muted">{guest.notes || "Khách chưa để lại ghi chú."}</p></div>}
    {locked ? <div className="rounded-lg bg-slate-50 p-3 text-xs leading-6 text-muted">
      <input type="hidden" {...register("rsvp_status")} />
      <input type="hidden" {...register("companions", { valueAsNumber: true })} />
      Khách đã check-in. Giữ nguyên phản hồi <strong>{labels[guest!.rsvp_status]}</strong> và {guest!.companions} người đi cùng đã đăng ký.
    </div> : <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="mb-1.5 block text-xs font-medium" htmlFor="guest-rsvp">Phản hồi tham dự</label>
          <Select id="guest-rsvp" className="w-full" {...register("rsvp_status", { onChange: (e) => { if (e.target.value !== "accepted") setValue("companions", 0); } })}>
            <option value="pending">Chưa phản hồi</option><option value="accepted">Tham dự</option><option value="declined">Không tham dự</option>
          </Select>
        </div>
        <div><label className="mb-1.5 block text-xs font-medium" htmlFor="guest-companions">Người đi cùng</label>
          <Input id="guest-companions" type="number" min={0} max={event.max_companions} readOnly={status !== "accepted"} {...register("companions", { valueAsNumber: true })} />
          {errors.companions && <p className="mt-1 text-xs text-red-700">Nhập số nguyên không âm.</p>}
        </div>
      </div>
      <p className="text-xs leading-5 text-muted">Tối đa {event.max_companions} người đi cùng, dành cho khách xác nhận tham dự.</p>
    </>}
    <div className="flex justify-end gap-2 border-t border-border pt-4">
      <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>Hủy</Button>
      <Button type="submit" disabled={isSubmitting}>{isSubmitting && <LoaderCircle className="animate-spin" />}{isSubmitting ? "Đang lưu…" : guest ? "Lưu thay đổi" : "Thêm khách mời"}</Button>
    </div>
  </form>;
}
