export enum UserRole {
  USER = 'user',
  COORDINATOR = 'coordinator',
  ADMIN = 'admin'
}

export interface User {
  id: number;
  email: string;
  passwordHash?: string;
  full_name: string;
  role: UserRole;
  hourly_rate_pln?: number;
  tax_percent?: number;
}

export interface Shift {
  id: number;
  user_id: number;
  shift_date: string; // YYYY-MM-DD
  shift_code: string; // e.g. "1", "2", "1/B", "2/B"
  is_bar_today: boolean;
  is_coordinator: boolean;
  is_zmiwaka: boolean;
  lounge?: 'mazurek' | 'polonez' | '';
  coord_lounge?: 'mazurek' | 'polonez' | '';
  scheduled_hours: number;
  worked_hours?: number;
  start_time?: string;
  end_time?: string;
  note?: string;
}

export interface DayNote {
  id: number;
  date: string; // YYYY-MM-DD
  text: string;
  author: string;
  author_id: number;
  created_at: string; // ISO string
}

export interface SwapProposal {
  id: number;
  requester_id: number;
  target_user_id: number;
  my_date: string; // YYYY-MM-DD
  their_date: string; // YYYY-MM-DD
  status: 'pending' | 'accepted' | 'declined' | 'approved' | 'rejected' | 'canceled';
  created_at: string;
  give_code?: string;
  take_code?: string;
  // joined fields for client
  requester?: { full_name: string; email: string };
  target_user?: { full_name: string; email: string };
}

export interface MarketOffer {
  id: number;
  shift_id: number;
  owner_id: number;
  candidate_id?: number;
  date: string; // YYYY-MM-DD
  code: string;
  status: 'open' | 'requested' | 'completed' | 'canceled';
  created_at: string;
  // joined fields for client
  owner?: { full_name: string };
  candidate?: { full_name: string };
}

export interface ControlEvent {
  id: number;
  user_id: number;
  date: string; // YYYY-MM-DD
  kind: 'late' | 'extra' | 'absence' | 'manual_shift';
  reason: string;
  delay_minutes?: number;
  hours?: number;
  time_from?: string;
  time_to?: string;
  created_at: string;
}

export interface DeletedEvent {
  id: number;
  event_id: number;
  user_name: string;
  reason: string;
  deleted_by_name: string;
  deleted_date: string;
  kind?: string;
  event_date?: string;
  time_from?: string;
  time_to?: string;
  hours?: number;
}

export interface CoordinatorBars {
  bar0: string;
  bar1: string;
  bar2: string;
  'bar-elita': string;
  zmiwak: string;
  barman: string;
  [key: string]: string;
}

export interface CoordinatorTimes {
  arrived: string;
  left: string;
}

export interface CoordinatorNotes {
  past: string;
  missing: string;
  passengers: string;
}

export interface CoordinatorReport {
  id: string; // lounge_shift-type_date e.g. "mazurek_morning_2026-06-16"
  lounge: 'mazurek' | 'polonez';
  shift_type: 'morning' | 'evening';
  shift_date: string; // YYYY-MM-DD
  bars: CoordinatorBars;
  times: CoordinatorTimes;
  notes: CoordinatorNotes;
}
