export type RsvpStatus = "pending" | "accepted" | "declined";
export type EventInfo = { id: number; name: string; start_at: string; venue: string; counters: string[]; max_companions: number; welcome_screen_url: string };
export type Guest = { id: number; name: string; company: string; email: string | null; phone: string; notes: string; invite_token: string; invitation_url: string; rsvp_status: RsvpStatus; companions: number; checked_in_at: string | null; counter: string | null; created_at: string };
export type GuestPage = { items: Guest[]; total: number; page: number; page_size: number };
export type DashboardSummary = { total_guests: number; accepted: number; declined: number; pending: number; expected_attendance: number; checked_in: number; not_arrived: number; no_show: number; checkin_rate: number; registered_arrived: number; recent_checkins: { id: number; guest_name: string; company: string; checked_in_at: string; counter: string }[]; checkins_by_counter: { counter: string; count: number }[] };
export type TrendPoint = { time: string; count: number };
export type ImportPreview = { rows: { row_number: number; name: string; company: string; email: string | null; phone: string; notes: string }[]; errors: { row_number: number; message: string }[]; total: number; valid_count: number };
