export type RsvpStatus = "pending" | "accepted" | "declined";

export interface PublicEvent {
  name: string;
  start_at: string;
  venue: string;
  counters: string[];
  max_companions: number;
}

export interface Invitation {
  guest_name: string;
  company: string;
  event_name: string;
  start_at: string;
  venue: string;
  rsvp_status: RsvpStatus;
  companions: number;
  max_companions: number;
}

export interface PgGuest {
  guest_token: string;
  name: string;
  company: string;
  rsvp_status: RsvpStatus;
  companions: number;
  checked_in_at: string | null;
  counter: string | null;
}

export interface CheckinResult {
  status: "checked_in" | "already_checked_in";
  guest_name: string;
  company: string;
  checked_in_at: string;
  counter: string;
}

export interface WelcomeGuest {
  id: number;
  name: string;
  company: string;
  checked_in_at: string;
}

export interface WelcomeSnapshot {
  event_name: string;
  latest_guest: WelcomeGuest | null;
}

export function isWelcomeGuest(value: unknown): value is WelcomeGuest {
  if (!value || typeof value !== "object") return false;
  const guest = value as Record<string, unknown>;
  return typeof guest.id === "number" && Number.isSafeInteger(guest.id) && guest.id > 0
    && typeof guest.name === "string" && typeof guest.company === "string"
    && typeof guest.checked_in_at === "string" && Number.isFinite(Date.parse(guest.checked_in_at));
}

export const rsvpLabels: Record<RsvpStatus, string> = {
  pending: "Chưa phản hồi",
  accepted: "Đã xác nhận tham dự",
  declined: "Đã báo không tham dự",
};

export function eventDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    weekday: "long", day: "2-digit", month: "2-digit", year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

export function eventTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}
