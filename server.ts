import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import fs from 'fs';

import { db } from './src/db/index.ts';
import { 
  users, shifts, notes, proposals, marketOffers, 
  controlEvents, deletedEvents, coordinatorReports,
  formatkaPreferences, formatkaLocks
} from './src/db/schema.ts';
import { eq, and, or, like, desc, asc, sql } from 'drizzle-orm';
import { authGuard, AuthRequest } from './src/lib/auth-middleware.ts';

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT) || 3000;

// Helper password hasher: SHA256 (Simple and native)
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Default Data Seed
const DEFAULT_USERS = [
  {
    id: 1,
    email: 'admin@lot.pl',
    passwordHash: hashPassword('admin123'),
    fullName: 'Robert Admin',
    role: 'admin',
    hourlyRatePln: 35.00,
    taxPercent: 12.0
  },
  {
    id: 2,
    email: 'coord@lot.pl',
    passwordHash: hashPassword('coord123'),
    fullName: 'Michał Koordynator',
    role: 'coordinator',
    hourlyRatePln: 30.00,
    taxPercent: 12.0
  },
  {
    id: 3,
    email: 'user@lot.pl',
    passwordHash: hashPassword('user123'),
    fullName: 'Jan Nowak',
    role: 'user',
    hourlyRatePln: 28.10,
    taxPercent: 12.0
  },
  {
    id: 4,
    email: 'tomasz@lot.pl',
    passwordHash: hashPassword('user123'),
    fullName: 'Tomasz Kowalski',
    role: 'user',
    hourlyRatePln: 28.10,
    taxPercent: 12.0
  },
  {
    id: 5,
    email: 'anna@lot.pl',
    passwordHash: hashPassword('user123'),
    fullName: 'Anna Wiśniewska',
    role: 'user',
    hourlyRatePln: 29.00,
    taxPercent: 12.0
  }
];

function getShiftTimeAndHours(shiftCode: string, isZmiwaka: boolean) {
  const code = String(shiftCode).trim();
  const isMorning = code.startsWith('1');
  const isEvening = code.startsWith('2');

  let startTime = '06:00';
  let endTime = '14:00';
  let hours = 8.0;

  if (isZmiwaka) {
    if (isMorning) {
      startTime = '06:00';
      endTime = '17:00';
      hours = 11.0;
    } else if (isEvening) {
      startTime = '14:00';
      endTime = '23:30';
      hours = 9.5;
    }
  } else {
    if (isMorning) {
      startTime = '04:30';
      endTime = '14:00';
      hours = 9.5;
    } else if (isEvening) {
      startTime = '14:00';
      endTime = '23:30';
      hours = 9.5;
    }
  }

  return { startTime, endTime, hours };
}

// Helper to generate a full month of initial mock shifts for June 2026
function generateMockShifts(): any[] {
  const generated: any[] = [];
  const year = 2026;
  const month = 6; // June

  for (let day = 1; day <= 30; day++) {
    const dayStr = String(day).padStart(2, '0');
    const dateStr = `${year}-06-${dayStr}`;

    DEFAULT_USERS.forEach((u, index) => {
      const rotationIndex = (day + index * 3) % 6;
      if (rotationIndex < 4) {
        const isMorning = (day + index) % 2 === 0;
        const code = isMorning ? '1' : '2';
        
        const isBar = index === 3 || (index === 4 && !isMorning);
        const isCoord = u.role === 'coordinator' || (u.role === 'admin' && isMorning);
        const isZmiwak = index === 2 && !isMorning;

        const info = getShiftTimeAndHours(code, isZmiwak);

        generated.push({
          userId: u.id,
          shiftDate: dateStr,
          shiftCode: code + (isBar ? '/B' : ''),
          isBarToday: isBar,
          isCoordinator: isCoord,
          isZmiwaka: isZmiwak,
          lounge: isMorning ? 'mazurek' : 'polonez',
          coordLounge: isCoord ? (isMorning ? 'mazurek' : 'polonez') : '',
          scheduledHours: info.hours,
          startTime: info.startTime,
          endTime: info.endTime
        });
      }
    });
  }
  return generated;
}

// Seed function
async function seedDBIfEmpty() {
  try {
    // Schema Patch for backwards compatibility (ensuring bonus_percent exists in users table)
    try {
      console.log('[Database Schema Sync] Checking if bonus_percent column exists...');
      await db.execute(sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bonus_percent" double precision DEFAULT 0;`);
      console.log('[Database Schema Sync] Column bonus_percent ensured successfully!');
    } catch (patchErr: any) {
      console.warn('[Database Schema Sync Warn] Failed to patch bonus_percent: ' + patchErr.message);
    }

    const checkUsers = await db.select().from(users).limit(1);
    if (checkUsers.length === 0) {
      console.log('[Database Seeding] Seeding default users...');
      
      // Insert users with explicit IDs
      for (const u of DEFAULT_USERS) {
        await db.insert(users).values({
          id: u.id,
          email: u.email,
          passwordHash: u.passwordHash,
          fullName: u.fullName,
          role: u.role,
          hourlyRatePln: u.hourlyRatePln,
          taxPercent: u.taxPercent
        });
      }

      // Sync sequence in Postgres
      await db.execute(sql`SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));`);
      console.log('[Database Seeding] Users seeded successfully!');

      // Populate Mock Shifts
      const mockShifts = generateMockShifts();
      console.log(`[Database Seeding] Seeding ${mockShifts.length} mock shifts for June 2026...`);
      for (const s of mockShifts) {
        await db.insert(shifts).values(s);
      }
      console.log('[Database Seeding] Shifts seeded successfully!');

      // Add one default note
      await db.insert(notes).values({
        date: '2026-06-16',
        text: 'Wszyscy barmani na stanowiskach. Czysto i super frekwencja dzisiaj!',
        author: 'Robert Admin',
        authorId: 1,
        createdAt: new Date().toISOString()
      });
      console.log('[Database Seeding] Main note seeded.');
    } else {
      console.log('[Database Seeding] Database is already initialized.');
    }
  } catch (error) {
    console.error('[Database Seeding Error] Seeding failed:', error);
  }
}

// Run Seeder
seedDBIfEmpty();


/* ================== API ENDPOINTS ================== */

// API Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', serverTime: new Date().toISOString() });
});

function getShortEmailPrefix(email: string): string {
  const clean = email.toLowerCase().trim().split('@')[0];
  const parts = clean.split(/[\s\.\-]+/).filter(Boolean);
  if (parts.length >= 2) {
    const firstLetter = parts[0].substring(0, 1);
    const lastName = parts.slice(1).join('');
    return `${firstLetter}.${lastName}`;
  }
  return clean;
}

// Helper to find existing user by email or name variation
async function findUserByEmailAndName(email: string, fullName?: string) {
  const cleanEmail = email.toLowerCase().trim();
  const inputShortPrefix = getShortEmailPrefix(cleanEmail);

  const allDbUsers = await db.select().from(users);

  // 1. Direct email match
  let matched = allDbUsers.find(u => u.email.toLowerCase().trim() === cleanEmail);
  if (matched) return matched;

  // 2. Short email prefix match (e.g. alicja.daniel@lot.pl matches a.daniel@lot.pl, f.czuba matches franciszek.czuba)
  matched = allDbUsers.find(u => getShortEmailPrefix(u.email) === inputShortPrefix);
  if (matched) return matched;

  // 3. Name to Company Email lookup
  matched = allDbUsers.find(u => {
    const generated = generateCompanyEmail(u.fullName).toLowerCase().trim();
    return getShortEmailPrefix(generated) === inputShortPrefix;
  });
  if (matched) return matched;

  // 4. By Full Name match (supporting Polish chars mapping)
  const emailPrefix = cleanEmail.split('@')[0];
  const nameToSearch = fullName || emailPrefix;
  if (nameToSearch) {
    const cleanProposedName = nameToSearch.toLowerCase().trim();
    matched = allDbUsers.find(u => {
      const dbNameClean = u.fullName.toLowerCase().trim();
      return dbNameClean === cleanProposedName || 
             simplifyPolishChars(dbNameClean).replace(/\s+/g, '') === simplifyPolishChars(cleanProposedName).replace(/\s+/g, '');
    });
    if (matched) return matched;
  }

  return null;
}

// Authentication: Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Proszę podać email i hasło' });
    }
    
    const user = await findUserByEmailAndName(email);
    if (!user) {
      return res.status(401).json({ error: 'Nieprawidłowy email lub hasło' });
    }

    if (user.passwordHash !== hashPassword(password)) {
      return res.status(401).json({ error: 'Nieprawidłowy email lub hasło' });
    }

    // Create custom simplified token
    const tokenPayload = {
      user_id: user.id,
      sub: String(user.id),
      email: user.email,
      full_name: user.fullName,
      role: user.role,
      exp: Date.now() + 24 * 60 * 60 * 1000 // 1 day
    };
    const access_token = Buffer.from(JSON.stringify(tokenPayload)).toString('base64');
    res.json({ access_token, user: { id: user.id, full_name: user.fullName, role: user.role } });
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd logowania: ' + err.message });
  }
});

// Authentication: Register
app.post('/api/register', async (req, res) => {
  try {
    const { full_name, email, password } = req.body;
    if (!full_name || !email || !password) {
      return res.status(400).json({ error: 'Wszystkie pola są wymagane' });
    }

    // Try to locate preloaded/existing worker profile
    const existingUser = await findUserByEmailAndName(email, full_name);

    if (existingUser) {
      // Preloaded profile found! Update/activate password and link preferred email
      await db.update(users).set({
        email: email.toLowerCase().trim(),
        passwordHash: hashPassword(password),
        fullName: full_name.trim()
      }).where(eq(users.id, existingUser.id));

      res.json({ success: true, message: 'Konto zostało połączone z Twoim grafikiem. Zaloguj się.' });
    } else {
      // Create new account
      await db.insert(users).values({
        email: email.toLowerCase().trim(),
        passwordHash: hashPassword(password),
        fullName: full_name.trim(),
        role: 'user',
        hourlyRatePln: 28.10,
        taxPercent: 12.0
      });

      res.json({ success: true, message: 'Konto zostało utworzone. Zaloguj się.' });
    }
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd rejestracji: ' + err.message });
  }
});

// Password change directly inside auth page before logging in
app.post('/api/password/change-before-login', async (req, res) => {
  try {
    const { email, stare_haslo, nowe_haslo } = req.body;
    if (!email || !stare_haslo || !nowe_haslo) {
      return res.status(400).json({ error: 'Wszystkie pola są wymagane' });
    }

    const user = await findUserByEmailAndName(email);
    if (!user) {
      return res.status(404).json({ error: 'Nieprawidłowy adres email' });
    }

    if (user.passwordHash !== hashPassword(stare_haslo)) {
      return res.status(400).json({ error: 'Błędne dotychczasowe hasło' });
    }

    await db.update(users).set({ passwordHash: hashPassword(nowe_haslo) }).where(eq(users.id, user.id));
    res.json({ success: true, message: 'Hasło zostało zmienione.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd zmiany hasła: ' + err.message });
  }
});

// Password change inside profile (Auth protected)
app.post('/api/password/change', authGuard, async (req: AuthRequest, res) => {
  try {
    const { stare_haslo, nowe_haslo } = req.body;
    const user = req.user;
    if (!stare_haslo || !nowe_haslo) {
      return res.status(400).json({ error: 'Proszę podać stare i nowe hasło' });
    }

    if (user.passwordHash !== hashPassword(stare_haslo)) {
      return res.status(400).json({ error: 'Błędne stare hasło' });
    }

    await db.update(users).set({ passwordHash: hashPassword(nowe_haslo) }).where(eq(users.id, user.id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd zmiany hasła: ' + err.message });
  }
});

// Users List for dropdowns
app.get('/api/users', authGuard, async (req: AuthRequest, res) => {
  try {
    const allUsers = await db.select().from(users);
    const list = allUsers.map(u => ({ id: u.id, full_name: u.fullName, role: u.role }));
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd pobierania użytkowników: ' + err.message });
  }
});

// Get User stats configurations
app.get('/api/me/settings', authGuard, async (req: AuthRequest, res) => {
  try {
    const user = req.user;
    res.json({
      hourly_rate_pln: user.hourlyRatePln !== undefined && user.hourlyRatePln !== null ? user.hourlyRatePln : 28.10,
      tax_percent: user.taxPercent !== undefined && user.taxPercent !== null ? user.taxPercent : 12.0,
      bonus_percent: user.bonusPercent !== undefined && user.bonusPercent !== null ? user.bonusPercent : 0.0
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd pobierania ustawień: ' + err.message });
  }
});

// Update User stats rate/tax config
app.post('/api/me/settings', authGuard, async (req: AuthRequest, res) => {
  try {
    const { hourly_rate_pln, tax_percent, bonus_percent } = req.body;
    const user = req.user;

    const updates: any = {};
    updates.hourlyRatePln = hourly_rate_pln === '' || hourly_rate_pln == null ? 0.0 : Number(hourly_rate_pln);
    updates.taxPercent = tax_percent === '' || tax_percent == null ? 0.0 : Number(tax_percent);
    updates.bonusPercent = bonus_percent === '' || bonus_percent == null ? 0.0 : Number(bonus_percent);

    await db.update(users).set(updates).where(eq(users.id, user.id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd zapisu ustawień: ' + err.message });
  }
});

// Get context shifts for logged-in user
app.get('/api/my-shifts', authGuard, async (req: AuthRequest, res) => {
  try {
    const user = req.user;
    const userShifts = await db.select().from(shifts).where(eq(shifts.userId, user.id));
    
    // Map with backward-compatible camelCase to snake_case structure
    const mapped = userShifts.map(s => {
      const info = getShiftTimeAndHours(s.shiftCode, s.isZmiwaka);
      return {
        id: s.id,
        user_id: s.userId,
        shift_date: s.shiftDate,
        shift_code: s.shiftCode,
        is_bar_today: s.isBarToday,
        is_coordinator: s.isCoordinator,
        is_zmiwaka: s.isZmiwaka,
        lounge: s.lounge,
        coord_lounge: s.coordLounge,
        scheduled_hours: info.hours,
        worked_hours: s.workedHours ?? info.hours,
        start_time: s.startTime ?? info.startTime,
        end_time: s.endTime ?? info.endTime,
        note: s.note
      };
    });
    res.json(mapped);
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd pobierania zmian: ' + err.message });
  }
});

// Get brief detail summary for month
app.get('/api/my-shifts-brief', authGuard, async (req: AuthRequest, res) => {
  try {
    const user = req.user;
    const { month } = req.query; // YYYY-MM
    if (!month) {
      return res.status(400).json({ error: 'Brak parametru month' });
    }

    const monthShifts = await db.select().from(shifts).where(
      and(
        eq(shifts.userId, user.id),
        like(shifts.shiftDate, `${month}%`)
      )
    );

    const list = monthShifts.map(s => {
      const info = getShiftTimeAndHours(s.shiftCode, s.isZmiwaka);
      return {
        id: s.id,
        date: s.shiftDate,
        code: s.shiftCode,
        scheduled_hours: info.hours,
        worked_hours: s.workedHours ?? info.hours,
        lounge: s.lounge,
        is_zmiwaka: s.isZmiwaka,
        is_coordinator: s.isCoordinator,
        note: s.note
      };
    }).sort((a, b) => a.date.localeCompare(b.date));

    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd pobierania skrótu zmian: ' + err.message });
  }
});

// Single shift detail by id
app.get('/api/my-shift/:id', authGuard, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const results = await db.select().from(shifts).where(eq(shifts.id, id));
    if (results.length === 0) {
      return res.status(404).json({ error: 'Nie znaleziono zmiany' });
    }

    const shift = results[0];
    const info = getShiftTimeAndHours(shift.shiftCode, shift.isZmiwaka);

    res.json({
      id: shift.id,
      date: shift.shiftDate,
      shift_code: shift.shiftCode,
      default_start: info.startTime,
      default_end: info.endTime,
      worked_hours: shift.workedHours ?? info.hours,
      note: shift.note
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd szczegółów zmiany: ' + err.message });
  }
});

// Log custom hours or shift notes
app.post('/api/my-shift/:id/worklog', authGuard, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { start_time, end_time, worked_hours, note } = req.body;

    const updates: any = {};
    if (start_time !== undefined) updates.startTime = start_time;
    if (end_time !== undefined) updates.endTime = end_time;
    if (worked_hours !== undefined) updates.workedHours = Number(worked_hours);
    if (note !== undefined) updates.note = String(note);

    const result = await db.update(shifts).set(updates).where(eq(shifts.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd zapisu logu pracy: ' + err.message });
  }
});

// Add extra shift (Przychodzę dodatkowo)
app.post('/api/shifts/extra', authGuard, async (req: AuthRequest, res) => {
  try {
    const { date, shift_code, lounge, is_zmiwaka } = req.body;
    if (!date || !shift_code) {
      return res.status(400).json({ error: 'Data i код смены są wymagane' });
    }

    const info = getShiftTimeAndHours(shift_code, !!is_zmiwaka);

    const isBar = String(shift_code).toLowerCase().includes('/b') || String(shift_code).toLowerCase().includes('bar');

    const result = await db.insert(shifts).values({
      userId: req.user.id,
      shiftDate: String(date),
      shiftCode: String(shift_code).trim(),
      isBarToday: isBar,
      isCoordinator: false,
      isZmiwaka: !!is_zmiwaka,
      lounge: String(lounge || 'polonez'),
      scheduledHours: info.hours,
      workedHours: info.hours,
      startTime: info.startTime,
      endTime: info.endTime,
      note: 'Zgłoszone przyjście dodatkowe'
    }).returning();

    // Log to control audit events
    await db.insert(controlEvents).values({
      userId: req.user.id,
      date: String(date),
      kind: 'extra',
      reason: `Zgłoszono przyjście dodatkowe (Salon: ${lounge || 'Polonez'}, Zmiana: ${shift_code})`,
      hours: info.hours,
      createdAt: new Date().toISOString()
    });

    res.json({ success: true, shift: result[0] });
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd zgłaszania przyjścia dodatkowego: ' + err.message });
  }
});

// Delete shift (Drop shift / remove shift)
app.delete('/api/shifts/:id', authGuard, async (req: AuthRequest, res) => {
  try {
    const shiftId = Number(req.params.id);
    const userId = req.user.id;
    const role = req.user.role;

    // Check if shift exists
    const results = await db.select().from(shifts).where(eq(shifts.id, shiftId));
    if (results.length === 0) {
      return res.status(404).json({ error: 'Nie znaleziono zmiany' });
    }

    const shift = results[0];

    // Must be owner or admin to delete/drop a shift
    if (shift.userId !== userId && role !== 'admin') {
      return res.status(403).json({ error: 'Brak uprawnień do usunięcia tej zmiany' });
    }

    // Capture user details for audit trail
    const [userRecord] = await db.select().from(users).where(eq(users.id, shift.userId));
    const userName = userRecord ? userRecord.fullName : 'Nieznany';

    // Log deletion event to deletedEvents table
    await db.insert(deletedEvents).values({
      eventId: shift.id,
      userName: userName,
      reason: 'Usunięcie zmiany z własnego grafiku (Oddanie zmiany)',
      deletedByName: req.user.fullName,
      deletedDate: new Date().toISOString(),
      kind: 'shift_deletion',
      eventDate: shift.shiftDate,
      timeFrom: shift.startTime,
      timeTo: shift.endTime,
      hours: shift.workedHours ?? shift.scheduledHours
    });

    // Actually delete the shift from the database
    await db.delete(shifts).where(eq(shifts.id, shiftId));

    res.json({ success: true, message: 'Zmiana została usunięta.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd usuwania zmiany: ' + err.message });
  }
});

// Get complete day schedule (morning and evening lists)
app.get('/api/day-shifts', authGuard, async (req: AuthRequest, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ error: 'Date is required' });
    }

    const dayShifts = await db.select().from(shifts).where(eq(shifts.shiftDate, String(date)));
    const allUsers = await db.select().from(users);
    const usersMap = new Map(allUsers.map(u => [u.id, u.fullName]));

    const mapShiftWithUserName = (s: any) => {
      return {
        id: s.id,
        user_id: s.userId,
        full_name: usersMap.get(s.userId) || 'Nieznany',
        shift_code: s.shiftCode,
        is_bar_today: s.isBarToday,
        is_coordinator: s.isCoordinator,
        is_zmiwaka: s.isZmiwaka,
        lounge: s.lounge,
        coord_lounge: s.coordLounge
      };
    };

    const morning = dayShifts.filter(s => s.shiftCode.startsWith('1')).map(mapShiftWithUserName);
    const evening = dayShifts.filter(s => s.shiftCode.startsWith('2')).map(mapShiftWithUserName);

    res.json({ morning, evening });
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd harmonogramu dobowego: ' + err.message });
  }
});

// Get month schedule in bulk ladder dictionary view
app.get('/api/month-shifts', authGuard, async (req: AuthRequest, res) => {
  try {
    const { year, month } = req.query;
    if (!year || !month) {
      return res.status(400).json({ error: 'Year and Month are required' });
    }

    const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
    const monthShifts = await db.select().from(shifts).where(like(shifts.shiftDate, `${monthPrefix}%`));
    
    const allUsers = await db.select().from(users);
    const usersMap = new Map(allUsers.map(u => [u.id, u.fullName]));

    const result: { [date: string]: { morning: any[]; evening: any[] } } = {};

    monthShifts.forEach(s => {
      const dt = s.shiftDate;
      if (!result[dt]) {
        result[dt] = { morning: [], evening: [] };
      }
      const mapped = {
        id: s.id,
        user_id: s.userId,
        full_name: usersMap.get(s.userId) || 'Nieznany',
        shift_code: s.shiftCode,
        is_bar_today: s.isBarToday,
        is_coordinator: s.isCoordinator,
        is_zmiwaka: s.isZmiwaka,
        lounge: s.lounge,
        coord_lounge: s.coordLounge
      };

      if (s.shiftCode.startsWith('1')) {
        result[dt].morning.push(mapped);
      } else if (s.shiftCode.startsWith('2')) {
        result[dt].evening.push(mapped);
      }
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd harmonogramu miesięcznego: ' + err.message });
  }
});

// Day notes log for start screen (Today Notes)
app.get('/api/day-notes', authGuard, async (req: AuthRequest, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ error: 'Date is required' });
    }
    const dayNotes = await db.select().from(notes).where(eq(notes.date, String(date)));
    res.json(dayNotes);
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd pobierania notatek: ' + err.message });
  }
});

app.post('/api/day-notes', authGuard, async (req: AuthRequest, res) => {
  try {
    const { date, text } = req.body;
    const user = req.user;
    if (!date || !text) {
      return res.status(400).json({ error: 'Brak daty lub tekstu notatki' });
    }

    const inserted = await db.insert(notes).values({
      date: String(date),
      text: String(text).trim(),
      author: user.fullName,
      authorId: user.id,
      createdAt: new Date().toISOString()
    }).returning();

    res.json(inserted[0]);
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd zapisu notatki: ' + err.message });
  }
});

app.delete('/api/day-notes/:id', authGuard, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const user = req.user;

    const matchedNote = await db.select().from(notes).where(eq(notes.id, id));
    if (matchedNote.length === 0) {
      return res.status(404).json({ error: 'Nie znaleziono notatki' });
    }

    const noteRecord = matchedNote[0];
    if (noteRecord.authorId !== user.id && user.role !== 'admin') {
      return res.status(403).json({ error: 'Brak uprawnień do usunięcia notatki' });
    }

    await db.delete(notes).where(eq(notes.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd usuwania notatki: ' + err.message });
  }
});

// Proposals Swap Panel (Incoming, Outgoing, Manager Approval Lists)
app.get('/api/proposals', authGuard, async (req: AuthRequest, res) => {
  try {
    const user = req.user;
    const allProposals = await db.select().from(proposals);
    const allUsers = await db.select().from(users);
    const usersMap = new Map(allUsers.map(u => [u.id, { full_name: u.fullName, email: u.email }]));

    const populateProposal = (p: any) => {
      const reqU = usersMap.get(p.requesterId);
      const tarU = usersMap.get(p.targetUserId);
      return {
        id: p.id,
        requester_id: p.requesterId,
        target_user_id: p.targetUserId,
        my_date: p.myDate,
        their_date: p.theirDate,
        status: p.status,
        created_at: p.createdAt,
        give_code: p.giveCode,
        take_code: p.takeCode,
        requester: reqU,
        target_user: tarU
      };
    };

    const activeProposals = allProposals.filter(p => p.status === 'pending' || p.status === 'accepted');

    const incoming = activeProposals.filter(p => p.targetUserId === user.id).map(populateProposal);
    const outgoing = activeProposals.filter(p => p.requesterId === user.id).map(populateProposal);
    
    // Managers or Admins approve swaps
    const for_approval = (user.role === 'admin' || user.role === 'coordinator')
      ? activeProposals.filter(p => p.status === 'accepted').map(populateProposal)
      : [];

    res.json({ incoming, outgoing, for_approval, to_approve: for_approval });
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd pobierania giełdy zamian: ' + err.message });
  }
});

// Post a new swap proposal request
app.post('/api/proposals', authGuard, async (req: AuthRequest, res) => {
  try {
    const { target_user_id, my_date, their_date } = req.body;
    const user = req.user;

    if (!target_user_id || !my_date || !their_date) {
      return res.status(400).json({ error: 'Wszystkie dane do wymiany są wymagane' });
    }

    // Find users shifts in SQL
    const myShifts = await db.select().from(shifts).where(
      and(
        eq(shifts.userId, user.id),
        eq(shifts.shiftDate, String(my_date))
      )
    );
    const theirShifts = await db.select().from(shifts).where(
      and(
        eq(shifts.userId, Number(target_user_id)),
        eq(shifts.shiftDate, String(their_date))
      )
    );

    if (myShifts.length === 0) {
      return res.status(400).json({ error: 'Nie masz zarejestrowanej własnej zmiany w podanym dniu' });
    }
    if (theirShifts.length === 0) {
      return res.status(400).json({ error: 'Pracownik docelowy nie ma zmiany w podanym dniu' });
    }

    const todayISO = new Date().toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' }).split('.').reverse().join('-');
    if (String(my_date) <= todayISO || String(their_date) <= todayISO) {
      return res.status(400).json({ error: 'Zaproponowana wymiana musi dotyczyć wyłącznie dni przyszłych (od jutra).' });
    }

    const inserted = await db.insert(proposals).values({
      requesterId: user.id,
      targetUserId: Number(target_user_id),
      myDate: String(my_date),
      theirDate: String(their_date),
      status: 'pending',
      createdAt: new Date().toISOString(),
      giveCode: myShifts[0].shiftCode,
      takeCode: theirShifts[0].shiftCode
    }).returning();

    res.json({
      id: inserted[0].id,
      requester_id: inserted[0].requesterId,
      target_user_id: inserted[0].targetUserId,
      my_date: inserted[0].myDate,
      their_date: inserted[0].theirDate,
      status: inserted[0].status,
      created_at: inserted[0].createdAt,
      give_code: inserted[0].giveCode,
      take_code: inserted[0].takeCode
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd zapisu wymiany: ' + err.message });
  }
});

// Proposals state actions
app.post('/api/proposals/:id/accept', authGuard, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const user = req.user;

    // Load proposal to verify target user ownership and fetch dates
    const matchedProps = await db.select().from(proposals).where(
      and(
        eq(proposals.id, id),
        eq(proposals.targetUserId, user.id)
      )
    );

    if (matchedProps.length === 0) {
      return res.status(404).json({ error: 'Nie znaleziono propozycji lub nie jesteś jej adresatem' });
    }

    const proposal = matchedProps[0];
    if (proposal.status !== 'pending' && proposal.status !== 'accepted') {
      return res.status(400).json({ error: 'Ta propozycja nie jest już oczekująca na przetworzenie' });
    }

    // SWAP THE SHIFTS immediately in DB
    const myShiftsArr = await db.select().from(shifts).where(
      and(
        eq(shifts.userId, proposal.requesterId),
        eq(shifts.shiftDate, proposal.myDate)
      )
    );
    const theirShiftsArr = await db.select().from(shifts).where(
      and(
        eq(shifts.userId, proposal.targetUserId),
        eq(shifts.shiftDate, proposal.theirDate)
      )
    );

    if (myShiftsArr.length > 0 && theirShiftsArr.length > 0) {
      // Cross-swap user IDs
      await db.update(shifts).set({ userId: proposal.targetUserId }).where(eq(shifts.id, myShiftsArr[0].id));
      await db.update(shifts).set({ userId: proposal.requesterId }).where(eq(shifts.id, theirShiftsArr[0].id));
    }

    // Set proposal status to 'approved' immediately so it's finalized
    await db.update(proposals).set({ status: 'approved' }).where(eq(proposals.id, id));

    res.json({ success: true, message: 'Wymiana pomyślnie zaakceptowana i automatycznie naniesiona na grafik.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd akceptacji i aktualizacji grafiku: ' + err.message });
  }
});

app.post('/api/proposals/:id/decline', authGuard, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const user = req.user;
    await db.update(proposals).set({ status: 'declined' }).where(
      and(
        eq(proposals.id, id),
        eq(proposals.targetUserId, user.id)
      )
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd odrzucenia: ' + err.message });
  }
});

app.post('/api/proposals/:id/cancel', authGuard, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const user = req.user;
    await db.update(proposals).set({ status: 'canceled' }).where(
      and(
        eq(proposals.id, id),
        eq(proposals.requesterId, user.id)
      )
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd anulowania: ' + err.message });
  }
});

// Swap executions require Manager Approvals! When approved, shifts are swapped in DB
app.post('/api/proposals/:id/approve', authGuard, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const user = req.user;
    if (user.role !== 'admin' && user.role !== 'coordinator') {
      return res.status(403).json({ error: 'Tylko Robert lub Michał mogą zatwierdzić zamiany' });
    }

    const matchedProps = await db.select().from(proposals).where(eq(proposals.id, id));
    if (matchedProps.length === 0) {
      return res.status(404).json({ error: 'Nie znaleziono propozycji' });
    }

    const proposal = matchedProps[0];
    if (proposal.status !== 'accepted') {
      return res.status(400).json({ error: 'Zamiana nie została jeszcze zaakceptowana przez adresata' });
    }

    // SWAP THE SHIFTS! Load shift documents
    const myShiftsArr = await db.select().from(shifts).where(
      and(
        eq(shifts.userId, proposal.requesterId),
        eq(shifts.shiftDate, proposal.myDate)
      )
    );
    const theirShiftsArr = await db.select().from(shifts).where(
      and(
        eq(shifts.userId, proposal.targetUserId),
        eq(shifts.shiftDate, proposal.theirDate)
      )
    );

    if (myShiftsArr.length > 0 && theirShiftsArr.length > 0) {
      // Cross swap user IDs inside shifts
      await db.update(shifts).set({ userId: proposal.targetUserId }).where(eq(shifts.id, myShiftsArr[0].id));
      await db.update(shifts).set({ userId: proposal.requesterId }).where(eq(shifts.id, theirShiftsArr[0].id));
    }

    await db.update(proposals).set({ status: 'approved' }).where(eq(proposals.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd zatwierdzenia zamiany: ' + err.message });
  }
});

app.post('/api/proposals/:id/reject', authGuard, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const user = req.user;
    if (user.role !== 'admin' && user.role !== 'coordinator') {
      return res.status(403).json({ error: 'Brak uprawnień menedżerskich' });
    }

    await db.update(proposals).set({ status: 'rejected' }).where(eq(proposals.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd odrzucenia zamiany: ' + err.message });
  }
});


// Direct Claim/Takeover shift trigger
app.post('/api/takeovers', authGuard, async (req: AuthRequest, res) => {
  try {
    const { target_user_id, date } = req.body;
    const user = req.user;
    const targetUserId = Number(target_user_id);

    if (targetUserId === user.id) {
      return res.status(400).json({ error: 'Nie możesz odebrać własnej zmiany' });
    }

    // Ensure candidate does not already work on this date
    const candidateShifts = await db.select().from(shifts).where(
      and(
        eq(shifts.userId, user.id),
        eq(shifts.shiftDate, date)
      )
    );
    if (candidateShifts.length > 0) {
      return res.status(400).json({ error: 'Przykro nam, w tym dniu pracujesz już na innej zmianie' });
    }

    // Find the target shift
    const matchedShifts = await db.select().from(shifts).where(
      and(
        eq(shifts.userId, targetUserId),
        eq(shifts.shiftDate, date)
      )
    );
    if (matchedShifts.length === 0) {
      return res.status(404).json({ error: 'Nie znaleziono zmiany u wskazanego pracownika na ten dzień' });
    }

    const targetShift = matchedShifts[0];

    // Check if there is an existing active market offer for this shift
    const existingOffers = await db.select().from(marketOffers).where(
      and(
        eq(marketOffers.shiftId, targetShift.id),
        or(
          eq(marketOffers.status, 'open'),
          eq(marketOffers.status, 'requested')
        )
      )
    );

    if (existingOffers.length > 0) {
      const offer = existingOffers[0];
      if (offer.status === 'requested') {
        return res.status(400).json({ error: 'Ta zmiana została już przez kogoś zgłoszona do przejęcia' });
      }
      // Update existing 'open' offer to 'requested'
      await db.update(marketOffers).set({
        candidateId: user.id,
        status: 'requested'
      }).where(eq(marketOffers.id, offer.id));
    } else {
      // Create a brand new market offer entry as 'requested' (directly claimed/notified)
      await db.insert(marketOffers).values({
        shiftId: targetShift.id,
        ownerId: targetUserId,
        candidateId: user.id,
        date: date,
        code: targetShift.shiftCode,
        status: 'requested',
        createdAt: new Date().toISOString()
      });
    }

    res.json({ success: true, message: 'Zgłoszono chęć przejęcia zmiany giełdowej pomyślnie!' });
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd zgłaszania chęci przejęcia: ' + err.message });
  }
});


// Shift Trade Market: View Offers
app.get('/api/market/offers', authGuard, async (req: AuthRequest, res) => {
  try {
    const user = req.user;
    const allOffers = await db.select().from(marketOffers);
    const allUsers = await db.select().from(users);
    const usersMap = new Map(allUsers.map(u => [u.id, u.fullName]));

    const populateOffer = (o: any) => {
      return {
        id: o.id,
        shift_id: o.shiftId,
        owner_id: o.ownerId,
        candidate_id: o.candidateId,
        date: o.date,
        code: o.code,
        status: o.status,
        created_at: o.createdAt,
        owner: { full_name: usersMap.get(o.ownerId) || 'Nieznany' },
        candidate: o.candidateId ? { full_name: usersMap.get(o.candidateId) || 'Nieznany' } : undefined
      };
    };

    const open = allOffers.filter(o => o.ownerId !== user.id && (o.status === 'open' || o.status === 'requested')).map(populateOffer);
    const mine = allOffers.filter(o => o.ownerId === user.id && (o.status === 'open' || o.status === 'requested')).map(populateOffer);

    res.json({ open, mine });
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd pobierania ofert z rynku: ' + err.message });
  }
});

// Shift Trade Market: Publish shift to market
app.post('/api/market/offers/:shiftId', authGuard, async (req: AuthRequest, res) => {
  try {
    const shiftId = Number(req.params.shiftId);
    const user = req.user;

    const matchedShifts = await db.select().from(shifts).where(
      and(
        eq(shifts.id, shiftId),
        eq(shifts.userId, user.id)
      )
    );
    if (matchedShifts.length === 0) {
      return res.status(400).json({ error: 'Brak Twojej zmiany o podanym ID' });
    }

    const shift = matchedShifts[0];

    const todayISO = new Date().toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' }).split('.').reverse().join('-');
    if (shift.shiftDate <= todayISO) {
      return res.status(400).json({ error: 'Nie możesz wystawić na giełdę zmiany z dzisiaj lub z przeszłości.' });
    }

    // Prevent posting duplicates
    const duplicates = await db.select().from(marketOffers).where(
      and(
        eq(marketOffers.shiftId, shiftId),
        or(
          eq(marketOffers.status, 'open'),
          eq(marketOffers.status, 'requested')
        )
      )
    );
    if (duplicates.length > 0) {
      return res.status(400).json({ error: 'Ta zmiana jest już wystawiona na rynku' });
    }

    await db.insert(marketOffers).values({
      shiftId: shiftId,
      ownerId: user.id,
      date: shift.shiftDate,
      code: shift.shiftCode,
      status: 'open',
      createdAt: new Date().toISOString()
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd publikacji giełdowej: ' + err.message });
  }
});

// Shift Trade Market: Claim another user's shift
app.post('/api/market/offers/:id/claim', authGuard, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const user = req.user;

    const matchedOffers = await db.select().from(marketOffers).where(
      and(
        eq(marketOffers.id, id),
        eq(marketOffers.status, 'open')
      )
    );
    if (matchedOffers.length === 0) {
      return res.status(404).json({ error: 'Oferta giełdowa nie jest dłużej otwarta' });
    }
    
    const offer = matchedOffers[0];
    if (offer.ownerId === user.id) {
      return res.status(400).json({ error: 'Nie możesz odebrać własnej zmiany' });
    }

    // Ensure candidate does not already work on this date
    const candidateShifts = await db.select().from(shifts).where(
      and(
        eq(shifts.userId, user.id),
        eq(shifts.shiftDate, offer.date)
      )
    );
    if (candidateShifts.length > 0) {
      return res.status(400).json({ error: 'Przykro nam, w tym dniu pracujesz już na innej zmianie' });
    }

    await db.update(marketOffers).set({
      candidateId: user.id,
      status: 'requested'
    }).where(eq(marketOffers.id, id));

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd rezerwacji giełdowej: ' + err.message });
  }
});

// Shift Trade Market: Cancel offer
app.post('/api/market/offers/:id/cancel', authGuard, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const user = req.user;

    const result = await db.update(marketOffers).set({ status: 'canceled' }).where(
      and(
        eq(marketOffers.id, id),
        eq(marketOffers.ownerId, user.id)
      )
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd anulowania oferty: ' + err.message });
  }
});

// Shift Trade Market: Approve shift collection
app.post('/api/market/offers/:id/approve', authGuard, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const user = req.user;

    const matchedOffers = await db.select().from(marketOffers).where(
      and(
        eq(marketOffers.id, id),
        eq(marketOffers.ownerId, user.id)
      )
    );
    if (matchedOffers.length === 0) {
      return res.status(404).json({ error: 'Brak praw do zatwierdzenia tej umowy' });
    }

    const offer = matchedOffers[0];
    if (offer.status !== 'requested' || !offer.candidateId) {
      return res.status(400).json({ error: 'Brak zgłoszenia chętnych na tę zmianę' });
    }

    // Execute shift assignment mapping in shifts table
    await db.update(shifts).set({ userId: offer.candidateId }).where(eq(shifts.id, offer.shiftId));
    await db.update(marketOffers).set({ status: 'completed' }).where(eq(marketOffers.id, id));

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd zatwierdzenia umowy giełdowej: ' + err.message });
  }
});

app.post('/api/market/offers/:id/reject', authGuard, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const user = req.user;

    await db.update(marketOffers).set({
      status: 'open',
      candidateId: null
    }).where(
      and(
        eq(marketOffers.id, id),
        eq(marketOffers.ownerId, user.id)
      )
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd odrzucenia oferty giełdowej: ' + err.message });
  }
});


// Statistics Calculations
app.get('/api/my-stats', authGuard, async (req: AuthRequest, res) => {
  try {
    const user = req.user;
    const { month } = req.query; // YYYY-MM
    if (!month) {
      return res.status(400).json({ error: 'Brak miesiąca' });
    }

    const rate = user.hourlyRatePln !== undefined && user.hourlyRatePln !== null ? user.hourlyRatePln : 28.10;
    const tax = user.taxPercent !== undefined && user.taxPercent !== null ? user.taxPercent : 12.0;
    const bonus = user.bonusPercent !== undefined && user.bonusPercent !== null ? user.bonusPercent : 0.0;

    const monthPrefix = String(month);
    const userShifts = await db.select().from(shifts).where(
      and(
        eq(shifts.userId, user.id),
        like(shifts.shiftDate, `${monthPrefix}%`)
      )
    );

    // Partition worked vs scheduled
    const todayISO = new Date().toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' }).split('.').reverse().join('-');

    let hours_done = 0;
    let hours_left = 0;

    const daily = userShifts.map(s => {
      const isDone = s.shiftDate <= todayISO;
      const info = getShiftTimeAndHours(s.shiftCode, s.isZmiwaka);
      const hrs = s.workedHours ?? info.hours;
      if (isDone) {
        hours_done += hrs;
      } else {
        hours_left += hrs;
      }
      return {
        date: s.shiftDate.substring(s.shiftDate.length - 2) + '.' + s.shiftDate.substring(5, 7),
        hours: hrs,
        done: isDone
      };
    }).sort((a, b) => a.date.localeCompare(b.date));

    // Custom extra events from control panel
    const customEventsList = await db.select().from(controlEvents).where(
      and(
        eq(controlEvents.userId, user.id),
        like(controlEvents.date, `${monthPrefix}%`)
      )
    );

    customEventsList.forEach(e => {
      if (e.kind === 'extra' && e.hours) {
        hours_done += e.hours;
      } else if (e.kind === 'late' && e.delayMinutes) {
        hours_done -= (e.delayMinutes / 60);
      } else if (e.kind === 'absence') {
        hours_done = Math.max(0, hours_done - 8);
      }
    });

    const total_net_done = hours_done * rate * (1 - tax / 100) * (1 + bonus / 100);
    const total_net_all = (hours_done + hours_left) * rate * (1 - tax / 100) * (1 + bonus / 100);

    res.json({
      hours_done: Number(hours_done.toFixed(2)),
      hours_left: Number(hours_left.toFixed(2)),
      net_done: Number(total_net_done.toFixed(2)),
      net_all: Number(total_net_all.toFixed(2)),
      daily
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd statystyk: ' + err.message });
  }
});

// User aggregated notes summaries for stats tab
app.get('/api/my-notes', authGuard, async (req: AuthRequest, res) => {
  try {
    const user = req.user;
    const { month } = req.query; // YYYY-MM
    const matchedShifts = await db.select().from(shifts).where(
      and(
        eq(shifts.userId, user.id),
        like(shifts.shiftDate, `${month}%`)
      )
    );
    const notesList = matchedShifts
      .filter(s => s.note)
      .map(s => ({ date: s.shiftDate, note: s.note }));
    res.json(notesList);
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd pobierania notatek: ' + err.message });
  }
});


// ==========================================
// FORMATKA (SCHEDULE PREFERENCES) ENDPOINTS
// ==========================================

// Get formatka state and current user's preferences
app.get('/api/formatka', authGuard, async (req: AuthRequest, res) => {
  try {
    const user = req.user;
    const { month } = req.query; // YYYY-MM
    if (!month || typeof month !== 'string') {
      return res.status(400).json({ error: 'Miesiąc jest wymagany (YYYY-MM)' });
    }

    // 1. Check lock status
    const lockRows = await db.select().from(formatkaLocks).where(eq(formatkaLocks.month, month));
    const isLocked = lockRows.length > 0 ? lockRows[0].isLocked : false;

    // 2. Fetch user's preferences
    const prefRows = await db.select()
      .from(formatkaPreferences)
      .where(and(eq(formatkaPreferences.userId, user.id), eq(formatkaPreferences.month, month)));
    const preferences = prefRows.length > 0 ? (prefRows[0].preferences || {}) : {};

    res.json({ isLocked, preferences });
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd formatki: ' + err.message });
  }
});

// Save or update user preferences
app.post('/api/formatka', authGuard, async (req: AuthRequest, res) => {
  try {
    const user = req.user;
    const { month, preferences } = req.body; // YYYY-MM and { [day]: 'W' | 'I' | 'II' | '' }
    if (!month || typeof month !== 'string') {
      return res.status(400).json({ error: 'Miesiąc jest wymagany' });
    }

    // Check lock status
    const lockRows = await db.select().from(formatkaLocks).where(eq(formatkaLocks.month, month));
    const isLocked = lockRows.length > 0 ? lockRows[0].isLocked : false;

    if (isLocked && user.role !== 'admin') {
      return res.status(403).json({ error: 'Dodawanie i edycja życzeń na ten miesiąc są zablokowane przez administratora.' });
    }

    // Fetch existing preference row
    const existing = await db.select()
      .from(formatkaPreferences)
      .where(and(eq(formatkaPreferences.userId, user.id), eq(formatkaPreferences.month, month)));

    if (existing.length > 0) {
      await db.update(formatkaPreferences)
        .set({ preferences: preferences || {}, updatedAt: new Date().toISOString() })
        .where(eq(formatkaPreferences.id, existing[0].id));
    } else {
      await db.insert(formatkaPreferences)
        .values({
          userId: user.id,
          month,
          preferences: preferences || {},
          updatedAt: new Date().toISOString()
        });
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd zapisu formatki: ' + err.message });
  }
});

// Admin panel view to list all user preferences and lock/unlock
app.get('/api/formatka/admin', authGuard, async (req: AuthRequest, res) => {
  try {
    const user = req.user;
    if (user.role !== 'admin' && user.role !== 'coordinator') {
      return res.status(403).json({ error: 'Brak uprawnień administratora' });
    }
    const { month } = req.query; // YYYY-MM
    if (!month || typeof month !== 'string') {
      return res.status(400).json({ error: 'Miesiąc jest wymagany' });
    }

    // 1. Check lock status
    const lockRows = await db.select().from(formatkaLocks).where(eq(formatkaLocks.month, month));
    const isLocked = lockRows.length > 0 ? lockRows[0].isLocked : false;

    // 2. Fetch all personnel
    const allUsers = await db.select().from(users);

    // 3. Fetch all preferences for this month
    const allPrefs = await db.select()
      .from(formatkaPreferences)
      .where(eq(formatkaPreferences.month, month));

    // Map each user to their submission status and response preferences
    const result = allUsers.map(u => {
      const uPref = allPrefs.find(p => p.userId === u.id);
      const prefObj = uPref ? (uPref.preferences as Record<string, string>) || {} : {};
      
      // Calculate if the user has filled at least one preference day with a valid option
      const nonEmpties = Object.values(prefObj).filter(v => v === 'W' || v === 'I' || v === 'II');
      const hasFilled = nonEmpties.length > 0;

      return {
        id: u.id,
        fullName: u.fullName,
        email: u.email,
        role: u.role,
        hasFilled,
        preferences: prefObj,
        updatedAt: uPref ? uPref.updatedAt : null
      };
    });

    res.json({ isLocked, users: result });
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd panelu formatki: ' + err.message });
  }
});

// Lock/Unlock formatka for a given month
app.post('/api/formatka/admin/lock', authGuard, async (req: AuthRequest, res) => {
  try {
    const user = req.user;
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Tylko administrator może zablokować/odblokować edycję' });
    }
    const { month, isLocked } = req.body;
    if (!month || typeof month !== 'string' || isLocked === undefined) {
      return res.status(400).json({ error: 'Miesiąc i status blokady są wymagane' });
    }

    const existing = await db.select().from(formatkaLocks).where(eq(formatkaLocks.month, month));
    if (existing.length > 0) {
      await db.update(formatkaLocks)
        .set({ isLocked })
        .where(eq(formatkaLocks.id, existing[0].id));
    } else {
      await db.insert(formatkaLocks)
        .values({ month, isLocked });
    }

    res.json({ success: true, isLocked });
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd blokowania formatki: ' + err.message });
  }
});

// Download formatka as Excel (.xlsx) file
app.get('/api/formatka/export', authGuard, async (req: AuthRequest, res) => {
  try {
    const user = req.user;
    if (user.role !== 'admin' && user.role !== 'coordinator') {
      return res.status(403).json({ error: 'Brak uprawnień administratora' });
    }
    const { month } = req.query; // YYYY-MM
    if (!month || typeof month !== 'string') {
      return res.status(400).json({ error: 'Miesiąc jest wymagany' });
    }

    // 1. Fetch data
    const allUsers = await db.select().from(users);
    const allPrefs = await db.select()
      .from(formatkaPreferences)
      .where(eq(formatkaPreferences.month, month));
    const actualShifts = await db.select()
      .from(shifts)
      .where(like(shifts.shiftDate, `${month}%`));

    // Get number of days in the requested year-month
    const [yearStr, monthStr] = month.split('-');
    const year = parseInt(yearStr);
    const monthNum = parseInt(monthStr);
    const daysInMonth = new Date(year, monthNum, 0).getDate();

    // Create a new ExcelJS Workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`Życzenia - ${month}`);

    // Helper to determine if a day is a weekend (Friday, Saturday or Sunday)
    const isWeekendDay = (d: number) => {
      const date = new Date(year, monthNum - 1, d);
      const dayOfWeek = date.getDay();
      return dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6; // Friday, Saturday, Sunday
    };

    // Style helper for borders
    const thinBorder = {
      top: { style: 'thin' as const, color: { argb: 'FFBFBFBF' } },
      bottom: { style: 'thin' as const, color: { argb: 'FFBFBFBF' } },
      left: { style: 'thin' as const, color: { argb: 'FFBFBFBF' } },
      right: { style: 'thin' as const, color: { argb: 'FFBFBFBF' } }
    };

    // User Classification Helper
    const getUserCategory = (u: any) => {
      const nameNorm = (u.fullName || '').trim().toLowerCase();
      
      // 1. Zmywak / Dishwasher
      const isZmywak = checkIsZmiwakByName(u.fullName) || 
                       nameNorm.includes('zmyw') || 
                       nameNorm.includes('zmywak') || 
                       nameNorm.includes('zmywaki') ||
                       actualShifts.some(s => s.userId === u.id && s.isZmiwaka);
      if (isZmywak) return 'zmywak';

      // 2. Coordinator
      const isCoordinator = u.role === 'coordinator' || 
                            u.role === 'admin' ||
                            actualShifts.some(s => s.userId === u.id && s.isCoordinator);
      if (isCoordinator) return 'coordinator';

      // 3. Barman
      const hasBarShift = actualShifts.some(s => s.userId === u.id && s.isBarToday);
      const uPref = allPrefs.find(p => p.userId === u.id);
      const prefObj = uPref ? (uPref.preferences as Record<string, string>) || {} : {};
      const hasBarPref = Object.values(prefObj).some(val => val.includes('/B') || val.includes('B'));
      
      if (hasBarShift || hasBarPref) {
        return 'barman';
      }

      // 4. Regular staff
      return 'regular';
    };

    const categoryPriority: Record<string, number> = {
      'coordinator': 1,
      'barman': 2,
      'regular': 3,
      'zmywak': 4
    };

    // Row 1: Header (Nazwisko i imię, days)
    const row1Values = ['Nazwisko i imię'];
    const formattedMonth = monthNum < 10 ? '0' + monthNum : monthNum.toString();
    for (let day = 1; day <= daysInMonth; day++) {
      row1Values.push(`${day}.${formattedMonth}`);
    }
    row1Values.push('Dni pracy'); // heading for the SUM column at the end: "Количество рабочих дней"

    const row1 = worksheet.addRow(row1Values);
    row1.height = 55; // Taller row for vertically written dates
    row1.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
    row1.getCell(1).font = { name: 'Arial', size: 10, bold: true };
    row1.getCell(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFDDEBF7' } // Light blue/grey
    };
    row1.getCell(1).border = thinBorder;

    for (let d = 1; d <= daysInMonth; d++) {
      const cell = row1.getCell(d + 1);
      cell.alignment = { 
        vertical: 'middle', 
        horizontal: 'center',
        textRotation: 90 // Written vertically!
      };
      cell.font = { name: 'Arial', size: 9, bold: true };
      cell.border = thinBorder;
      if (isWeekendDay(d)) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFC6E0B4' } // soft light green
        };
      } else {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFFFFF' }
        };
      }
    }
    const lastColIndex = daysInMonth + 2;
    const lastCellRow1 = row1.getCell(lastColIndex);
    lastCellRow1.alignment = { vertical: 'middle', horizontal: 'center' };
    lastCellRow1.font = { name: 'Arial', size: 9, bold: true };
    lastCellRow1.border = thinBorder;
    lastCellRow1.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFDDEBF7' } // Light blue/grey
    };

    // Function to generate and format PLAN row
    const addPlanRow = () => {
      const planValues = ['PLAN'];
      for (let d = 1; d <= daysInMonth; d++) {
        planValues.push('10');
      }
      planValues.push('');
      const r = worksheet.addRow(planValues);
      r.height = 20;
      r.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
      r.getCell(1).font = { name: 'Arial', size: 10, bold: true };
      r.getCell(1).border = thinBorder;
      r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };

      for (let d = 1; d <= daysInMonth; d++) {
        const cell = r.getCell(d + 1);
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.font = { name: 'Arial', size: 10, bold: true };
        cell.border = thinBorder;
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFD966' } // soft yellow
        };
      }
      r.getCell(lastColIndex).border = thinBorder;
      r.getCell(lastColIndex).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
    };

    // Function to generate and format BRAKI row
    const addBrakiRow = () => {
      const brakiValues = ['BRAKI'];
      const hasShiftsInMonth = actualShifts.length > 0;

      for (let d = 1; d <= daysInMonth; d++) {
        if (!hasShiftsInMonth) {
          brakiValues.push('');
        } else {
          const formattedM = monthNum < 10 ? '0' + monthNum : monthNum.toString();
          const formattedD = d < 10 ? '0' + d : d.toString();
          const dateStr = `${year}-${formattedM}-${formattedD}`;
          
          const actualCount = actualShifts.filter(s => s.shiftDate === dateStr).length;
          const limit = 10; // PLAN limit is 10 on all days
          const brakiVal = actualCount - limit;
          
          if (brakiVal === 0) {
            brakiValues.push('');
          } else {
            brakiValues.push(brakiVal.toString());
          }
        }
      }
      brakiValues.push('');
      const r = worksheet.addRow(brakiValues);
      r.height = 20;
      r.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
      r.getCell(1).font = { name: 'Arial', size: 10, bold: true };
      r.getCell(1).border = thinBorder;
      r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };

      for (let d = 1; d <= daysInMonth; d++) {
        const cell = r.getCell(d + 1);
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = thinBorder;
        const val = cell.value?.toString() || '';
        
        if (val === '') {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFFFFF' } // White background for unfilled
          };
        } else if (val.startsWith('-')) {
          cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFC00000' } // Dark red background for negative shortage
          };
        } else {
          cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF000000' } };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFF0000' } // Bright red background for positive shortage / other
          };
        }
      }
      r.getCell(lastColIndex).border = thinBorder;
      r.getCell(lastColIndex).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
    };

    // Row 2: PLAN
    addPlanRow();

    // Row 3: BRAKI
    addBrakiRow();

    // User rows - Sorted by role priority, then alphabetically by fullName
    const sortedUsers = [...allUsers].sort((a, b) => {
      const catA = getUserCategory(a);
      const catB = getUserCategory(b);
      if (catA !== catB) {
        return categoryPriority[catA] - categoryPriority[catB];
      }
      return a.fullName.localeCompare(b.fullName);
    });

    sortedUsers.forEach(u => {
      const uPref = allPrefs.find(p => p.userId === u.id);
      const prefObj = uPref ? (uPref.preferences as Record<string, string>) || {} : {};

      const rowData = [u.fullName];
      let shiftCount = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const val = prefObj[d] || '';
        if (val === 'I') {
          rowData.push('1');
          shiftCount++;
        } else if (val === 'II') {
          rowData.push('2');
          shiftCount++;
        } else if (val === 'W') {
          rowData.push('X');
        } else {
          rowData.push('');
        }
      }

      // Calculate working days count (from actual laid-out shifts, or fallback to wishes count if empty)
      const userActualShifts = actualShifts.filter(s => s.userId === u.id);
      const displayDaysCount = actualShifts.length > 0 ? userActualShifts.length : shiftCount;
      rowData.push(displayDaysCount > 0 ? displayDaysCount.toString() : '');

      const userRow = worksheet.addRow(rowData);
      userRow.height = 20;

      const nameCell = userRow.getCell(1);
      nameCell.font = { name: 'Arial', size: 10, bold: true };
      nameCell.alignment = { vertical: 'middle', horizontal: 'left' };
      nameCell.border = thinBorder;
      
      // Fill colors for user names by their category (coordinator, barman, regular, zmywak)
      const userCategory = getUserCategory(u);
      let nameBgColor = 'FFFFFFFF'; // default white
      if (userCategory === 'coordinator') {
        nameBgColor = 'FFFCE4D6'; // Soft peach
      } else if (userCategory === 'barman') {
        nameBgColor = 'FFDDEBF7'; // Soft blue
      } else if (userCategory === 'zmywak') {
        nameBgColor = 'FFD9D9D9'; // Light gray
      }
      nameCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: nameBgColor } };

      for (let d = 1; d <= daysInMonth; d++) {
        const cell = userRow.getCell(d + 1);
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = thinBorder;
        const val = cell.value?.toString() || '';

        if (val === '1' || val === '2') {
          cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF000000' } };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFFFFF' } // "1" and "2" are strictly black on normal white background
          };
        } else if (val === 'X') {
          cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFF0000' } }; // 'X' is red text
          if (isWeekendDay(d)) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFC6E0B4' } // Weekend soft olive green
            };
          } else {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFFFFFF' }
            };
          }
        } else {
          if (isWeekendDay(d)) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFC6E0B4' } // Weekend soft olive green
            };
          } else {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFFFFFF' }
            };
          }
        }
      }

      const sumCell = userRow.getCell(lastColIndex);
      sumCell.font = { name: 'Arial', size: 10, bold: true };
      sumCell.alignment = { vertical: 'middle', horizontal: 'center' };
      sumCell.border = thinBorder;
      sumCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
    });

    // Add bottom rows (BRAKI and PLAN) to match layout
    addBrakiRow();
    addPlanRow();

    // Set columns widths
    worksheet.getColumn(1).width = 25; // Employee name
    for (let d = 1; d <= daysInMonth; d++) {
      worksheet.getColumn(d + 1).width = 4.2;
    }
    worksheet.getColumn(lastColIndex).width = 11; // Width for "Dni pracy" column at the end

    // Write back response
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=formatka_${month}.xlsx`);
    
    await workbook.xlsx.write(res);
    res.end();

  } catch (err: any) {
    res.status(500).json({ error: 'Błąd generowania pliku Excel: ' + err.message });
  }
});


// Coordinator Reports endpoints
app.get('/api/coord-panel/report', authGuard, async (req: AuthRequest, res) => {
  try {
    const { lounge, shift_type, date } = req.query;
    if (!lounge || !shift_type || !date) {
      return res.status(400).json({ error: 'Wszystkie filtry raportu są wymagane' });
    }
    const rId = `${lounge}_${shift_type}_${date}`;
    const results = await db.select().from(coordinatorReports).where(eq(coordinatorReports.id, rId));
    if (results.length > 0) {
      res.json(results[0]);
    } else {
      res.json({
        id: rId,
        lounge,
        shift_type,
        shift_date: date,
        bars: { bar0: '', bar1: '', bar2: '', 'bar-elita': '', zmiwak: '', barman: '' },
        times: { arrived: '', left: '' },
        notes: { past: '', missing: '', passengers: '' }
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd pobierania raportu koordynatora: ' + err.message });
  }
});

app.post('/api/coord-panel/report', authGuard, async (req: AuthRequest, res) => {
  try {
    const { lounge, shift_type, shift_date, bars, times, notes: reportNotes } = req.body;
    if (!lounge || !shift_type || !shift_date) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }
    const rId = `${lounge}_${shift_type}_${shift_date}`;

    const reportVal = {
      id: rId,
      lounge,
      shiftType: shift_type,
      shiftDate: shift_date,
      bars: bars || { bar0: '', bar1: '', bar2: '', 'bar-elita': '', zmiwak: '', barman: '' },
      times: times || { arrived: '', left: '' },
      notes: reportNotes || { past: '', missing: '', passengers: '' }
    };

    await db.insert(coordinatorReports).values(reportVal).onConflictDoUpdate({
      target: coordinatorReports.id,
      set: {
        bars: reportVal.bars,
        times: reportVal.times,
        notes: reportVal.notes
      }
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd zapisu raportu koordynatora: ' + err.message });
  }
});


// Control view - Summary of events and attendance metrics
app.get('/api/control/summary', authGuard, async (req: AuthRequest, res) => {
  try {
    const { month } = req.query; // YYYY-MM
    if (!month) {
      return res.status(400).json({ error: 'Parametr month jest wymagany' });
    }
    const monthStr = String(month);

    const monthEvents = await db.select().from(controlEvents).where(like(controlEvents.date, `${monthStr}%`));
    const allUsers = await db.select().from(users);
    const usersMap = new Map(allUsers.map(u => [u.id, u.fullName]));

    const eventsResult = monthEvents.map(e => {
      return {
        id: e.id,
        kind: e.kind,
        user: usersMap.get(e.userId) || 'Nieznany',
        date: e.date,
        reason: e.reason,
        delay_minutes: e.delayMinutes,
        hours: e.hours,
        time_from: e.timeFrom,
        time_to: e.timeTo
      };
    }).sort((a, b) => b.id - a.id); // Recent first

    // Staffing coverage count vs target 12
    const monthYear = monthStr.split('-');
    const y = Number(monthYear[0]), m = Number(monthYear[1]);
    const lastDay = new Date(y, m, 0).getDate();
    const staffing: any[] = [];

    const monthShifts = await db.select().from(shifts).where(like(shifts.shiftDate, `${monthStr}%`));

    for (let d = 1; d <= lastDay; d++) {
      const dStr = String(d).padStart(2, '0');
      const fullDate = `${monthStr}-${dStr}`;

      const activeShifts = monthShifts.filter(s => s.shiftDate === fullDate);
      const morningCount = activeShifts.filter(s => s.shiftCode.startsWith('1')).length;
      const eveningCount = activeShifts.filter(s => s.shiftCode.startsWith('2')).length;

      staffing.push({
        date: `${dStr}.${String(m).padStart(2, '0')}`,
        morning: morningCount,
        morning_delta: morningCount - 12,
        evening: eveningCount,
        evening_delta: eveningCount - 12
      });
    }

    res.json({ events: eventsResult, staffing });
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd podsumowania kontroli: ' + err.message });
  }
});

// Control extra log details for deleted items
app.get('/api/control/deleted', authGuard, async (req: AuthRequest, res) => {
  try {
    const deleted = await db.select().from(deletedEvents);
    res.json(deleted);
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd logów usuwania: ' + err.message });
  }
});

app.get('/api/control/deleted/:event_id', authGuard, async (req: AuthRequest, res) => {
  try {
    const eventId = Number(req.params.event_id);
    const results = await db.select().from(deletedEvents).where(eq(deletedEvents.eventId, eventId));
    if (results.length === 0) {
      return res.status(404).json({ error: 'Nie znaleziono audytu usuwania' });
    }
    
    // Backward compatibility JSON mapping
    const log = results[0];
    res.json({
      id: log.id,
      event_id: log.eventId,
      user_name: log.userName,
      reason: log.reason,
      deleted_by_name: log.deletedByName,
      deleted_date: log.deletedDate,
      kind: log.kind,
      event_date: log.eventDate,
      time_from: log.timeFrom,
      time_to: log.timeTo,
      hours: log.hours
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd audytu usuwania: ' + err.message });
  }
});

// Log event: Lateness (lateness)
app.post('/api/control/late', authGuard, async (req: AuthRequest, res) => {
  try {
    const { user_id, date, reason, delay_minutes, time_from, time_to } = req.body;
    if (!user_id || !date || !delay_minutes) {
      return res.status(400).json({ error: 'Uzupełnij wymagane pola' });
    }

    await db.insert(controlEvents).values({
      userId: Number(user_id),
      date: String(date),
      kind: 'late',
      reason: String(reason || ''),
      delayMinutes: Number(delay_minutes),
      timeFrom: time_from || null,
      timeTo: time_to || null,
      createdAt: new Date().toISOString()
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd zapisu spóźnienia: ' + err.message });
  }
});

// Log event: Extra Hours
app.post('/api/control/extra', authGuard, async (req: AuthRequest, res) => {
  try {
    const { user_id, date, reason, hours } = req.body;
    if (!user_id || !date || !hours) {
      return res.status(400).json({ error: 'Uzupełnij wymagane pola' });
    }

    await db.insert(controlEvents).values({
      userId: Number(user_id),
      date: String(date),
      kind: 'extra',
      reason: String(reason || ''),
      hours: Number(hours),
      createdAt: new Date().toISOString()
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd zapisu nadgodzin: ' + err.message });
  }
});

// Log event: Absence (absence)
app.post('/api/control/absence', authGuard, async (req: AuthRequest, res) => {
  try {
    const { user_id, date, reason } = req.body;
    if (!user_id || !date) {
      return res.status(400).json({ error: 'Uzupełnij wymagane pola' });
    }

    await db.insert(controlEvents).values({
      userId: Number(user_id),
      date: String(date),
      kind: 'absence',
      reason: String(reason || ''),
      createdAt: new Date().toISOString()
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd zapisu nieobecności: ' + err.message });
  }
});

// Log event: Custom Manual Shift Adds
app.post('/api/control/add-shift', authGuard, async (req: AuthRequest, res) => {
  try {
    const { user_id, date, reason, from, to } = req.body;
    if (!user_id || !date || !from || !to) {
      return res.status(400).json({ error: 'Uzupełnij wymagane pola' });
    }

    await db.insert(controlEvents).values({
      userId: Number(user_id),
      date: String(date),
      kind: 'manual_shift',
      reason: String(reason || ''),
      timeFrom: from,
      timeTo: to,
      createdAt: new Date().toISOString()
    });
    
    // Append a new custom Shift
    const parsedStartHours = Number(from.split(':')[0]);
    const isMorning = parsedStartHours < 12;

    await db.insert(shifts).values({
      userId: Number(user_id),
      shiftDate: String(date),
      shiftCode: isMorning ? '1/M' : '2/M',
      isBarToday: false,
      isCoordinator: false,
      isZmiwaka: false,
      scheduledHours: 8.0,
      startTime: from,
      endTime: to,
      note: `Dodana manualnie: ${reason}`
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd ręcznego dodawania zmiany: ' + err.message });
  }
});

// Delete controlled log with audit note
app.post('/api/control/delete', authGuard, async (req: AuthRequest, res) => {
  try {
    const { id, reason } = req.body;
    const user = req.user;

    if (!id || !reason) {
      return res.status(400).json({ error: 'Podaj powód usunięcia' });
    }

    const matchedEvents = await db.select().from(controlEvents).where(eq(controlEvents.id, Number(id)));
    if (matchedEvents.length === 0) {
      return res.status(404).json({ error: 'Nie odnaleziono zdarzenia' });
    }

    const event = matchedEvents[0];
    const resultsUsers = await db.select().from(users).where(eq(users.id, event.userId));
    const targetUserName = resultsUsers.length > 0 ? resultsUsers[0].fullName : 'Nieznany';

    // Append Audit log
    await db.insert(deletedEvents).values({
      eventId: event.id,
      userName: targetUserName,
      reason: String(reason),
      deletedByName: user.fullName,
      deletedDate: new Date().toISOString(),
      kind: event.kind,
      eventDate: event.date,
      timeFrom: event.timeFrom,
      timeTo: event.timeTo,
      hours: event.hours
    });

    await db.delete(controlEvents).where(eq(controlEvents.id, event.id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd usuwania logu: ' + err.message });
  }
});


// Parser imports: Paste raw schedule text list
app.post('/api/upload-text', authGuard, async (req: AuthRequest, res) => {
  try {
    const { text, month, year } = req.body;
    if (!text || !month || !year) {
      return res.status(400).json({ error: 'Uzupełnij tekst, miesiąc i rok' });
    }

    const lines = String(text).split('\n');
    let importedCount = 0;
    const created_users: string[] = [];

    const allUsers = await db.select().from(users);
    
    let currentIsZmywak = false;

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 2) continue;

      let name = parts[0];
      let shiftsStartIdx = 1;
      if (parts[1] && isNaN(Number(parts[1][0])) && !parts[1].startsWith('/') && !['1','2','B','Z','K','C'].includes(parts[1])) {
        name = parts[0] + ' ' + parts[1];
        shiftsStartIdx = 2;
      }

      const nameLower = name.toLowerCase();
      if (nameLower.includes('zmywak') || nameLower.includes('zmywaki')) {
        continue;
      }

      const generatedEmail = generateCompanyEmail(name);
      let user = allUsers.find(u => 
        u.fullName.toLowerCase() === name.toLowerCase() ||
        u.email.toLowerCase().trim() === generatedEmail.toLowerCase().trim()
      );
      if (!user) {
        const insertUser = await db.insert(users).values({
          email: generatedEmail,
          passwordHash: hashPassword('user123'),
          fullName: name,
          role: 'user',
          hourlyRatePln: 28.10,
          taxPercent: 12.0
        }).returning();
        
        user = insertUser[0];
        allUsers.push(user);
        created_users.push(name);
      }

      const mStr = String(month).padStart(2, '0');
      let dayCursor = 1;

      for (let i = shiftsStartIdx; i < parts.length; i++) {
        const code = parts[i].trim();
        if (!code || code === '-' || code.toLowerCase() === 'wolne') {
          dayCursor++;
          continue;
        }

        const isMorning = code.startsWith('1');
        const isEvening = code.startsWith('2');
        if (!isMorning && !isEvening) {
          dayCursor++;
          continue;
        }

        const dayStr = String(dayCursor).padStart(2, '0');
        const isoDate = `${year}-${mStr}-${dayStr}`;

        const looksBar = /(^|[\/\s])B($|[\/\s])/i.test(code);
        const isZmiwak = checkIsZmiwakByName(name) || code.toLowerCase().includes('z') || name.toLowerCase().includes('zmywak');
        const isCoord = code.toLowerCase().includes('k') || code.toLowerCase().includes('c');

        await db.insert(shifts).values({
          userId: user.id,
          shiftDate: isoDate,
          shiftCode: code,
          isBarToday: looksBar,
          isCoordinator: isCoord,
          isZmiwaka: isZmiwak,
          lounge: isMorning ? 'mazurek' : 'polonez',
          coordLounge: isCoord ? (isMorning ? 'mazurek' : 'polonez') : '',
          scheduledHours: 8.0
        });

        importedCount++;
        dayCursor++;
      }
    }

    res.json({ success: true, imported: importedCount, created_users });
  } catch (err: any) {
    res.status(500).json({ error: 'Błąd importu tekstu: ' + err.message });
  }
});

// Color and Font detection helpers for ExcelJS parsing
function detectFillColor(fill: any): 'yellow' | 'blue' | 'none' {
  if (!fill || fill.type !== 'pattern' || !fill.fgColor) return 'none';
  let argb = fill.fgColor.argb;
  if (!argb && typeof fill.fgColor === 'object') {
    argb = fill.fgColor.theme !== undefined ? `THEME_${fill.fgColor.theme}` : '';
  }
  if (!argb || typeof argb !== 'string') return 'none';
  
  argb = argb.toUpperCase();
  if (argb.length === 8) {
    argb = argb.substring(2);
  }
  if (argb.length !== 6) return 'none';

  const r = parseInt(argb.substring(0, 2), 16);
  const g = parseInt(argb.substring(2, 4), 16);
  const b = parseInt(argb.substring(4, 6), 16);

  if (isNaN(r) || isNaN(g) || isNaN(b)) return 'none';

  // Yellow / Gold / Peach detection
  if (r > 190 && g > 180 && b < 160 && (r - b > 30) && (g - b > 30)) {
    return 'yellow';
  }
  if (r > 210 && g > 190 && b < 185 && (r - b > 25) && (g - b > 25)) {
    return 'yellow';
  }

  // Blue / Sky Blue detection
  if (b > 180 && b > r && (b - r >= 20)) {
    return 'blue';
  }
  if (b > 120 && b > r && b > g && (b - r >= 40)) {
    return 'blue';
  }

  return 'none';
}

function detectFontColor(font: any): 'blue' | 'black' {
  if (!font || !font.color) return 'black';
  let argb = font.color.argb;
  if (!argb && typeof font.color === 'object') {
    argb = font.color.theme !== undefined ? `THEME_${font.color.theme}` : '';
  }
  if (!argb || typeof argb !== 'string') return 'black';

  argb = argb.toUpperCase();
  if (argb.length === 8) {
    argb = argb.substring(2);
  }
  if (argb.length !== 6) return 'black';

  const r = parseInt(argb.substring(0, 2), 16);
  const g = parseInt(argb.substring(2, 4), 16);
  const b = parseInt(argb.substring(4, 6), 16);

  if (isNaN(r) || isNaN(g) || isNaN(b)) return 'black';

  if (b > 120 && b > r && (b - r >= 40)) {
    return 'blue';
  }
  return 'black';
}

function isGrayFill(fill: any): boolean {
  if (!fill || fill.type !== 'pattern' || !fill.fgColor) return false;
  let argb = fill.fgColor.argb;
  if (!argb && typeof fill.fgColor === 'object') {
    argb = fill.fgColor.theme !== undefined ? `THEME_${fill.fgColor.theme}` : '';
  }
  if (!argb || typeof argb !== 'string') return false;

  argb = argb.toUpperCase();
  if (argb.length === 8) {
    argb = argb.substring(2);
  }
  if (argb.length !== 6) return false;

  const r = parseInt(argb.substring(0, 2), 16);
  const g = parseInt(argb.substring(2, 4), 16);
  const b = parseInt(argb.substring(4, 6), 16);

  if (isNaN(r) || isNaN(g) || isNaN(b)) return false;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;

  if (diff <= 15 && max < 240 && min > 80) {
    return true;
  }
  return false;
}

function checkIsZmiwakByName(name: string): boolean {
  const norm = String(name || '').trim().toLowerCase();
  if (norm.includes('prykhidko') || norm.includes('rudiuk') || norm.includes('rybchynchuk')) {
    return true;
  }
  if (norm.includes('prychidko') || norm.includes('ruduk') || norm.includes('rybczyn')) {
    return true;
  }
  return false;
}

function getCellValueString(cell: ExcelJS.Cell): string {
  if (!cell || cell.value === undefined || cell.value === null) return '';
  const val = cell.value;
  if (val instanceof Date) {
    const day = val.getDate();
    const m = val.getMonth() + 1;
    return `${day}.${m}`;
  }
  if (typeof val === 'object') {
    const valAny = val as any;
    if ('richText' in valAny && Array.isArray(valAny.richText)) {
      const parts = valAny.richText.map((t: any) => t ? String(t.text || '') : '');
      return parts.join('').trim();
    }
    if ('result' in valAny) {
      if (valAny.result instanceof Date) {
        return `${valAny.result.getDate()}.${valAny.result.getMonth() + 1}`;
      }
      return valAny.result !== undefined && valAny.result !== null ? String(valAny.result).trim() : '';
    }
    if ('text' in valAny) {
      return valAny.text !== undefined && valAny.text !== null ? String(valAny.text).trim() : '';
    }
    if ('hyperlink' in valAny && valAny.text) {
      return String(valAny.text).trim();
    }
    // Fallback if cell has text property
    if (cell.text !== undefined && cell.text !== null) {
      const t = String(cell.text).trim();
      if (t) return t;
    }
    try {
      return JSON.stringify(valAny);
    } catch (e) {
      return '';
    }
  }
  return String(val).trim();
}

function tryExtractDayNumber(cellStr: string, targetMonth: number): number {
  if (!cellStr) return -1;
  const cleaned = cellStr.trim().replace(',', '.');
  
  // 1. Direct integer match
  const rawNum = Number(cleaned);
  if (!isNaN(rawNum) && Number.isInteger(rawNum) && rawNum >= 1 && rawNum <= 31) {
    return rawNum;
  }
  
  // 2. Decimal representation (e.g., 1.06, 30.06 or 1.6)
  if (!isNaN(rawNum)) {
    const parts = cleaned.split('.');
    if (parts.length === 2) {
      const d = Math.floor(Number(parts[0]));
      const mVal = Number(parts[1]);
      if (d >= 1 && d <= 31 && (mVal === targetMonth || mVal === targetMonth * 10 || mVal === targetMonth * 100)) {
        return d;
      }
    }
  }

  // 3. Regex match for "D.M" or "D.MM" with word boundaries or suffixes
  const dmMatch = cleaned.match(/^(\d{1,2})\.(\d{1,2})/);
  if (dmMatch) {
    const d = parseInt(dmMatch[1], 10);
    const m = parseInt(dmMatch[2], 10);
    if (d >= 1 && d <= 31 && m === targetMonth) {
      return d;
    }
  }

  // 4. Regex match for "D/M" or "D/MM"
  const slashMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})/);
  if (slashMatch) {
    const d = parseInt(slashMatch[1], 10);
    const m = parseInt(slashMatch[2], 10);
    if (d >= 1 && d <= 31 && m === targetMonth) {
      return d;
    }
  }

  // 5. Starting pure integer followed by space or characters (e.g. "1 Pn", "1(Pn)", "1. cze", "1-cze")
  const startMatch = cleaned.match(/^(\d{1,2})\b/);
  if (startMatch) {
    const d = parseInt(startMatch[1], 10);
    if (d >= 1 && d <= 31) {
      return d;
    }
  }

  return -1;
}

function simplifyPolishChars(str: string): string {
  const mapping: { [key: string]: string } = {
    'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n', 'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z',
    'Ą': 'a', 'Ć': 'c', 'Ę': 'e', 'Ł': 'l', 'Ń': 'n', 'Ó': 'o', 'Ś': 's', 'Ź': 'z', 'Ż': 'z',
    'ё': 'e', 'е': 'e', 'и': 'i', 'й': 'j', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p',
    'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'c', 'ч': 'ch', 'ш': 'sh',
    'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
  };
  return str.split('').map(char => mapping[char] || char).join('');
}

function generateCompanyEmail(fullName: string): string {
  // Split case boundaries (e.g., "YuliiaHrabevnyk" -> "Yuliia Hrabevnyk")
  let spaced = fullName.trim().replace(/([a-z])([A-Z])/g, '$1 $2');
  
  // Simplify Polish and accents
  let normalized = simplifyPolishChars(spaced);
  normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, "");
  
  // Lowercase and strip non-alphanumeric except spaces, dots, dashes
  normalized = normalized.toLowerCase().replace(/[^a-z0-9\s\.\-]/g, '').trim();
  
  // Split into words
  const parts = normalized.split(/[\s\.\-]+/).filter(Boolean);
  if (parts.length === 0) {
    return 'user@lot.pl';
  }
  
  if (parts.length >= 2) {
    const firstLetter = parts[0].substring(0, 1);
    const lastName = parts.slice(1).join('');
    return `${firstLetter}.${lastName}@lot.pl`.replace(/\.+/g, '.');
  } else {
    return `${parts[0]}@lot.pl`;
  }
}

function cleanWorkerName(rawName: string): string {
  let cleaned = rawName.replace(/[\r\n\t]+/g, ' ').trim();
  const numberingMatch = cleaned.match(/^\d+[\s\.\-\/\)\,\_]+\s*(.+)$/);
  if (numberingMatch) {
    cleaned = numberingMatch[1].trim();
  }
  return cleaned;
}

function isShiftMorningOrEvening(code: string): { isMorning: boolean; isEvening: boolean } {
  const norm = code.trim().toLowerCase();
  if (!norm || norm === '-' || norm === 'wolne') {
    return { isMorning: false, isEvening: false };
  }

  const hourMatch = norm.match(/^(\d{1,2})[\:\-\s]*/);
  if (hourMatch) {
    const hr = parseInt(hourMatch[1], 10);
    if (hr === 1) {
      return { isMorning: true, isEvening: false };
    }
    if (hr === 2) {
      return { isMorning: false, isEvening: true };
    }
    if (hr >= 4 && hr <= 12) {
      return { isMorning: true, isEvening: false };
    }
    if (hr >= 13 && hr <= 23) {
      return { isMorning: false, isEvening: true };
    }
  }

  if (norm.startsWith('1')) {
    return { isMorning: true, isEvening: false };
  }
  if (norm.startsWith('2')) {
    return { isMorning: false, isEvening: true };
  }

  return { isMorning: false, isEvening: false };
}

// Parser imports: Handle complex Excel sheets parsing directly using exceljs
app.post('/api/upload-xlsx', authGuard, express.raw({ type: '*/*', limit: '20mb' }), async (req, res) => {
  const monthHeader = req.headers['x-month'] || req.query.month;
  const yearHeader = req.headers['x-year'] || req.query.year;

  if (!monthHeader || !yearHeader) {
    return res.status(400).json({ error: 'Miesiąc i rok są nagłówkami obowiązkowymi: x-month i x-year' });
  }

  const month = Number(monthHeader);
  const year = Number(yearHeader);

  const debugLogs: string[] = [];
  debugLogs.push(`=== IMPORT ATTEMPT ===`);
  debugLogs.push(`Timestamp: ${new Date().toISOString()}`);
  debugLogs.push(`Requested: Month = ${month}, Year = ${year}`);

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.body);
    const worksheet = workbook.worksheets[0];

    debugLogs.push(`Loaded Worksheet: Name = "${worksheet.name}", RowCount = ${worksheet.rowCount}`);

    // Print all rows to see what values are in cells
    for (let r = 1; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r);
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colIdx) => {
        cells.push(`[Col ${colIdx}: "${getCellValueString(cell)}"]`);
      });
      debugLogs.push(`Row ${r} Raw: ${cells.join(', ')}`);
    }

    let importedCount = 0;
    const created_users: string[] = [];

    let dayColumnIndices: { [day: number]: number } = {};
    let namesColumnIndex = -1;
    let headerRowIdx = -1;

    // 1. Traverse first 15 rows to find the header row containing day numbers (1 to 31)
    for (let rIdx = 1; rIdx <= Math.min(worksheet.rowCount, 15); rIdx++) {
      const row = worksheet.getRow(rIdx);
      if (!row) continue;
      
      const daysFoundInRow: { day: number, colIdx: number }[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colIdx) => {
        const cellStr = getCellValueString(cell);
        const dayNum = tryExtractDayNumber(cellStr, month);
        if (dayNum >= 1 && dayNum <= 31) {
          daysFoundInRow.push({ day: dayNum, colIdx });
        }
      });

      debugLogs.push(`Row ${rIdx}: Found ${daysFoundInRow.length} day numbers.`);

      if (daysFoundInRow.length >= 10) {
        headerRowIdx = rIdx;
        daysFoundInRow.forEach(o => {
          dayColumnIndices[o.day] = o.colIdx;
        });
        debugLogs.push(`-> Row ${rIdx} chosen as HEADER ROW containing days!`);
        break;
      }
    }

    if (headerRowIdx === -1) {
      fs.writeFileSync(path.join(process.cwd(), 'parser_debug.txt'), debugLogs.join('\n'));
      return res.status(400).json({ error: 'Nie odnaleziono wiersza nagłówkowego z dniami miesiąca (1-31) w arkuszu. Upewnij się, że przesyłasz właściwy grafik.' });
    }

    const headerRow = worksheet.getRow(headerRowIdx);
    
    // 2. Perform score-based predictive lookup to find the worker names column
    headerRow.eachCell({ includeEmpty: true }, (cell, colIdx) => {
      const valStr = getCellValueString(cell).toLowerCase();
      if (
        valStr.includes('imię') || 
        valStr.includes('nazwisko') || 
        valStr.includes('osoba') || 
        valStr.includes('pracownik') ||
        valStr.includes('nazwisko i imię') ||
        valStr.includes('pracownicy') ||
        valStr.includes('nazwa')
      ) {
        namesColumnIndex = colIdx;
      }
    });

    if (namesColumnIndex !== -1) {
      debugLogs.push(`Names column found via header label at column index: ${namesColumnIndex}`);
    } else {
      debugLogs.push(`Names column label NOT found directly. Calculating predictive name scores for columns...`);
      const dayCols = new Set(Object.values(dayColumnIndices));
      const scores: { [colIdx: number]: number } = {};
      const maxCol = headerRow.cellCount;
 
      for (let col = 1; col <= maxCol; col++) {
        if (dayCols.has(col)) continue;
        scores[col] = 0;
      }
 
      const scanStart = headerRowIdx + 1;
      const scanEnd = Math.min(worksheet.rowCount, headerRowIdx + 6);
      for (let rIdx = scanStart; rIdx <= scanEnd; rIdx++) {
        const rowObj = worksheet.getRow(rIdx);
        if (!rowObj) continue;
        for (let col = 1; col <= maxCol; col++) {
          if (scores[col] === undefined) continue;
          const cell = rowObj.getCell(col);
          const valStr = getCellValueString(cell).trim();
          const valLower = valStr.toLowerCase();
 
          if (!valStr) continue;
 
          if (valStr.length >= 3) {
            const hasLetters = /[a-zA-ZęćłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(valStr);
            const hasDigits = /\d/.test(valStr);
            const hasSpace = valStr.includes(' ');
 
            if (
              valLower.includes('suma') || 
              valLower.includes('godzin') || 
              valLower.includes('płaca') ||
              valLower.includes('stawka')
            ) {
              scores[col] -= 20;
            } else if (hasLetters && !hasDigits) {
              if (hasSpace) {
                scores[col] += 15;
              } else {
                scores[col] += 5;
              }
            }
          }
        }
      }
 
      let bestCol = -1;
      let maxScore = -999;
      Object.keys(scores).forEach(colStr => {
        const col = parseInt(colStr, 10);
        debugLogs.push(`  Column ${col} scored ${scores[col]} points`);
        if (scores[col] > maxScore) {
          maxScore = scores[col];
          bestCol = col;
        }
      });
 
      if (bestCol !== -1 && maxScore > 0) {
        namesColumnIndex = bestCol;
        debugLogs.push(`-> Predicitive winner column index: ${bestCol} (${maxScore} points)`);
      } else {
        // Fallback to first non-day column
        for (let col = 1; col <= maxCol; col++) {
          if (dayCols.has(col)) continue;
          namesColumnIndex = col;
          break;
        }
        debugLogs.push(`-> Fallback column index: ${namesColumnIndex}`);
      }
    }

    const allUsers = await db.select().from(users);

    const mStr = String(month).padStart(2, '0');
    const monthStr = `${year}-${mStr}`;
    const todayPolandStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw' }).format(new Date());

    debugLogs.push(`Clearing existing database shifts for ${monthStr} starting from ${todayPolandStr} (excluding extra/manually logged)...`);
    
    // Delete only future/today shifts that do not have custom worked hours or manual/extra notes
    await db.execute(sql`
      DELETE FROM shifts 
      WHERE shift_date LIKE ${monthStr + '%'} 
        AND shift_date >= ${todayPolandStr}
        AND (worked_hours IS NULL)
        AND (note IS NULL OR (note NOT LIKE '%dodat%' AND note NOT LIKE '%manual%' AND note NOT LIKE '%Zgłoszone%'))
    `);

    // 3. Process each row starting below the header row
    for (let rIdx = headerRowIdx + 1; rIdx <= worksheet.rowCount; rIdx++) {
      const row = worksheet.getRow(rIdx);
      if (!row) continue;

      const nameCell = row.getCell(namesColumnIndex);
      if (!nameCell) continue;

      const nameRawLine = getCellValueString(nameCell).trim();
      if (!nameRawLine) continue;

      const nameRaw = cleanWorkerName(nameRawLine);
      const nameLower = nameRaw.toLowerCase();

      // Check if this row acts as a partition/section separator for Zmywak
      if (nameLower.includes('zmywak') || nameLower.includes('zmywaki')) {
        continue;
      }

      if (
        nameRaw.length < 3 || 
        nameLower.includes('suma') || 
        nameLower.includes('godzin') ||
        nameLower.includes('plan') ||
        nameLower.includes('braki') ||
        nameLower.includes('rezerwa') ||
        nameLower.includes('grafik') ||
        nameLower.includes('wolne') ||
        nameLower.trim() === 'brak'
      ) {
        debugLogs.push(`Row ${rIdx}: Skipped row name "${nameRaw}"`);
        continue;
      }

      const generatedEmail = generateCompanyEmail(nameRaw);
      let user = allUsers.find(u => 
        u.fullName.toLowerCase() === nameRaw.toLowerCase() ||
        u.email.toLowerCase().trim() === generatedEmail.toLowerCase().trim()
      );
      if (!user) {
        debugLogs.push(`Row ${rIdx}: User "${nameRaw}" not found in DB. Creating a new worker account...`);
        const insertUser = await db.insert(users).values({
          email: generatedEmail,
          passwordHash: hashPassword('user123'),
          fullName: nameRaw,
          role: 'user',
          hourlyRatePln: 28.10,
          taxPercent: 12.0
        }).returning();
        
        user = insertUser[0];
        allUsers.push(user);
        created_users.push(nameRaw);
      }

      let workerShiftsCount = 0;

      for (let day = 1; day <= 31; day++) {
        const dCol = dayColumnIndices[day];
        if (dCol === undefined) continue;

        const cell = row.getCell(dCol);
        if (!cell) continue;

        const code = getCellValueString(cell).trim();
        if (!code || code === '-' || code.toLowerCase() === 'wolne') continue;

        const { isMorning, isEvening } = isShiftMorningOrEvening(code);
        if (!isMorning && !isEvening) continue;

        const dayStr = String(day).padStart(2, '0');
        const isoDate = `${year}-${mStr}-${dayStr}`;

        const looksBar = /(^|[\/\s])B($|[\/\s])/i.test(code);
        const nameCellFill = row.getCell(namesColumnIndex)?.fill;
        const isZmiwak = checkIsZmiwakByName(nameRaw) || code.toLowerCase().includes('z') || isGrayFill(nameCellFill);

        // Styles and Color Parsing using ExcelJS cell properties
        const fillColor = detectFillColor(cell.fill);
        const isCoord = (fillColor === 'yellow' || fillColor === 'blue');
        
        let lounge = 'polonez';
        let coordLounge = '';

        if (isCoord) {
          if (fillColor === 'yellow') {
            coordLounge = 'polonez';
            lounge = 'polonez';
          } else if (fillColor === 'blue') {
            coordLounge = 'mazurek';
            lounge = 'mazurek';
          }
        } else {
          const fontColor = detectFontColor(cell.font);
          if (fontColor === 'blue') {
            lounge = 'mazurek';
          } else {
            lounge = 'polonez';
          }
        }

        // Check if there is already a shift on this day for this user
        // (e.g. preserved manually-added extra shift or custom work log)
        const alreadyExists = await db.select().from(shifts).where(
          and(
            eq(shifts.userId, user.id),
            eq(shifts.shiftDate, isoDate)
          )
        );

        if (alreadyExists.length > 0) {
          // Keep existing preserved/custom/extra shift
          continue;
        }

        await db.insert(shifts).values({
          userId: user.id,
          shiftDate: isoDate,
          shiftCode: code,
          isBarToday: looksBar,
          isCoordinator: isCoord,
          isZmiwaka: isZmiwak,
          lounge: lounge,
          coordLounge: coordLounge,
          scheduledHours: 8.0
        });

        workerShiftsCount++;
        importedCount++;
      }

      debugLogs.push(`Row ${rIdx}: Succeeded to import ${workerShiftsCount} shifts for "${nameRaw}"`);
    }

    debugLogs.push(`=== IMPORT COMPLETE ===`);
    debugLogs.push(`Total shifts imported: ${importedCount}`);
    debugLogs.push(`Total newly registered workers: ${created_users.length} (${created_users.join(', ')})`);

    fs.writeFileSync(path.join(process.cwd(), 'parser_debug.txt'), debugLogs.join('\n'));
    res.json({ success: true, imported: importedCount, created_users });
  } catch (err: any) {
    debugLogs.push(`FATAL ERROR: ${err.message}\n${err.stack}`);
    fs.writeFileSync(path.join(process.cwd(), 'parser_debug.txt'), debugLogs.join('\n'));
    res.status(500).json({ error: 'Błąd przetwarzania Excel XLSX: ' + err.message });
  }
});


// Serve static assets and handle routing via Vite middleware
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Express Backend] Server running on port ${PORT}`);
  });
}

startServer();
