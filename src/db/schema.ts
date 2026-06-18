import { pgTable, serial, text, integer, boolean, doublePrecision, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').unique(), // Firebase Auth UID
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  fullName: text('full_name').notNull(),
  role: text('role').notNull().default('user'), // 'user', 'coordinator', 'admin'
  hourlyRatePln: doublePrecision('hourly_rate_pln').default(28.10),
  taxPercent: doublePrecision('tax_percent').default(12.0),
});

export const shifts = pgTable('shifts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  shiftDate: text('shift_date').notNull(), // YYYY-MM-DD
  shiftCode: text('shift_code').notNull(), // e.g. "1", "2", "1/B", "2/B"
  isBarToday: boolean('is_bar_today').notNull().default(false),
  isCoordinator: boolean('is_coordinator').notNull().default(false),
  isZmiwaka: boolean('is_zmiwaka').notNull().default(false),
  lounge: text('lounge').default(''), // 'mazurek', 'polonez' or ''
  coordLounge: text('coord_lounge').default(''), // 'mazurek', 'polonez' or ''
  scheduledHours: doublePrecision('scheduled_hours').notNull().default(8.0),
  workedHours: doublePrecision('worked_hours'),
  startTime: text('start_time'),
  endTime: text('end_time'),
  note: text('note'),
});

export const notes = pgTable('notes', {
  id: serial('id').primaryKey(),
  date: text('date').notNull(), // YYYY-MM-DD
  text: text('text').notNull(),
  author: text('author').notNull(),
  authorId: integer('author_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  createdAt: text('created_at').notNull(), // ISO String
});

export const proposals = pgTable('proposals', {
  id: serial('id').primaryKey(),
  requesterId: integer('requester_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  targetUserId: integer('target_user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  myDate: text('my_date').notNull(), // YYYY-MM-DD
  theirDate: text('their_date').notNull(), // YYYY-MM-DD
  status: text('status').notNull().default('pending'), // 'pending', 'accepted', 'declined', 'approved', 'rejected', 'canceled'
  createdAt: text('created_at').notNull(), // ISO string
  giveCode: text('give_code'),
  takeCode: text('take_code'),
});

export const marketOffers = pgTable('market_offers', {
  id: serial('id').primaryKey(),
  shiftId: integer('shift_id').references(() => shifts.id, { onDelete: 'cascade' }).notNull(),
  ownerId: integer('owner_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  candidateId: integer('candidate_id').references(() => users.id, { onDelete: 'set null' }),
  date: text('date').notNull(), // YYYY-MM-DD
  code: text('code').notNull(),
  status: text('status').notNull().default('open'), // 'open', 'requested', 'completed', 'canceled'
  createdAt: text('created_at').notNull(), // ISO string
});

export const controlEvents = pgTable('control_events', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  date: text('date').notNull(), // YYYY-MM-DD
  kind: text('kind').notNull(), // 'late' | 'extra' | 'absence' | 'manual_shift'
  reason: text('reason').notNull(),
  delayMinutes: integer('delay_minutes'),
  hours: doublePrecision('hours'),
  timeFrom: text('time_from'),
  timeTo: text('time_to'),
  createdAt: text('created_at').notNull(),
});

export const deletedEvents = pgTable('deleted_events', {
  id: serial('id').primaryKey(),
  eventId: integer('event_id').notNull(),
  userName: text('user_name').notNull(),
  reason: text('reason').notNull(),
  deletedByName: text('deleted_by_name').notNull(),
  deletedDate: text('deleted_date').notNull(),
  kind: text('kind'),
  eventDate: text('event_date'),
  timeFrom: text('time_from'),
  timeTo: text('time_to'),
  hours: doublePrecision('hours'),
});

export const coordinatorReports = pgTable('coordinator_reports', {
  id: text('id').primaryKey(), // lounge_shift-type_date
  lounge: text('lounge').notNull(), // 'mazurek' | 'polonez'
  shiftType: text('shift_type').notNull(), // 'morning' | 'evening'
  shiftDate: text('shift_date').notNull(), // YYYY-MM-DD
  bars: jsonb('bars').notNull(),
  times: jsonb('times').notNull(),
  notes: jsonb('notes').notNull(),
});

// Relationships
export const usersRelations = relations(users, ({ many }) => ({
  shifts: many(shifts),
  notes: many(notes),
  requestedProposals: many(proposals, { relationName: 'requester' }),
  receivedProposals: many(proposals, { relationName: 'targetUser' }),
  marketOffers: many(marketOffers, { relationName: 'owner' }),
  candidateOffers: many(marketOffers, { relationName: 'candidate' }),
  controlEvents: many(controlEvents),
}));

export const shiftsRelations = relations(shifts, ({ one }) => ({
  user: one(users, {
    fields: [shifts.userId],
    references: [users.id],
  }),
}));

export const notesRelations = relations(notes, ({ one }) => ({
  author: one(users, {
    fields: [notes.authorId],
    references: [users.id],
  }),
}));

export const proposalsRelations = relations(proposals, ({ one }) => ({
  requester: one(users, {
    fields: [proposals.requesterId],
    references: [users.id],
    relationName: 'requester',
  }),
  targetUser: one(users, {
    fields: [proposals.targetUserId],
    references: [users.id],
    relationName: 'targetUser',
  }),
}));

export const marketOffersRelations = relations(marketOffers, ({ one }) => ({
  shift: one(shifts, {
    fields: [marketOffers.shiftId],
    references: [shifts.id],
  }),
  owner: one(users, {
    fields: [marketOffers.ownerId],
    references: [users.id],
    relationName: 'owner',
  }),
  candidate: one(users, {
    fields: [marketOffers.candidateId],
    references: [users.id],
    relationName: 'candidate',
  }),
}));

export const controlEventsRelations = relations(controlEvents, ({ one }) => ({
  user: one(users, {
    fields: [controlEvents.userId],
    references: [users.id],
  }),
}));
