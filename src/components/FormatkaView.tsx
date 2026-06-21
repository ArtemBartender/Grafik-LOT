import React, { useEffect, useState } from 'react';
import { apiCall, getToken } from '../lib/api';

interface FormatkaViewProps {
  addToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

interface UserPreferences {
  id: number;
  fullName: string;
  email: string;
  role: string;
  hasFilled: boolean;
  preferences: Record<string, string>;
  updatedAt: string | null;
}

export default function FormatkaView({ addToast }: FormatkaViewProps) {
  // Date and Months calculation
  const getInitialMonth = () => {
    const d = new Date();
    // Default to next month if day is after 15th, otherwise current
    if (d.getDate() > 15) {
      d.setMonth(d.getMonth() + 1);
    }
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  const [selectedMonth, setSelectedMonth] = useState<string>(getInitialMonth());
  const [currentUserRole, setCurrentUserRole] = useState<string>('user');
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  
  // Formatka core states
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [preferences, setPreferences] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Admin section states
  const [adminUsers, setAdminUsers] = useState<UserPreferences[]>([]);
  const [adminLoading, setAdminLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null);

  // Selected Day for touch-popover on mobile
  const [selectedDayToEdit, setSelectedDayToEdit] = useState<number | null>(null);

  // Fetch roles/ids from JWT claims
  useEffect(() => {
    const token = getToken();
    if (token) {
      try {
        const parts = token.split('.');
        if (parts.length >= 2) {
          const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
          setCurrentUserRole(payload.role || 'user');
          setCurrentUserId(payload.uid || payload.user_id || null);
        }
      } catch (e) {
        console.error('Error reading JWT:', e);
      }
    }
  }, []);

  // Fetch core formatka data (lock status, current user preferences)
  const fetchFormatkaData = async () => {
    setIsLoading(true);
    try {
      const data = await apiCall(`/api/formatka?month=${selectedMonth}`);
      setIsLocked(data.isLocked || false);
      setPreferences(data.preferences || {});
    } catch (err: any) {
      addToast('Nie udało się pobrać danych formatki: ' + err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch admin dashboard data if role is admin or coordinator
  const fetchAdminData = async () => {
    if (currentUserRole !== 'admin' && currentUserRole !== 'coordinator') return;
    setAdminLoading(true);
    try {
      const data = await apiCall(`/api/formatka/admin?month=${selectedMonth}`);
      setIsLocked(data.isLocked || false);
      setAdminUsers(data.users || []);
    } catch (err: any) {
      addToast('Błąd panelu administratora: ' + err.message, 'error');
    } finally {
      setAdminLoading(false);
    }
  };

  useEffect(() => {
    fetchFormatkaData();
    fetchAdminData();
  }, [selectedMonth, currentUserRole]);

  // Handle single preference change with Auto-Save
  const handleSetDayPreference = async (day: number, value: string) => {
    if (isLocked && currentUserRole !== 'admin') {
      addToast('Edycja na ten miesiąc została zablokowana przez administratora.', 'error');
      return;
    }

    const updatedPrefs = {
      ...preferences,
      [day]: value
    };
    
    // Optimistic UI update
    setPreferences(updatedPrefs);
    setIsSaving(true);

    try {
      await apiCall('/api/formatka', {
        method: 'POST',
        body: JSON.stringify({
          month: selectedMonth,
          preferences: updatedPrefs
        })
      });
      // Optionally reload admin dashboard to reflect updates in real-time
      if (currentUserRole === 'admin' || currentUserRole === 'coordinator') {
        const data = await apiCall(`/api/formatka/admin?month=${selectedMonth}`);
        setAdminUsers(data.users || []);
      }
    } catch (err: any) {
      addToast('Błąd zapisu życzeń: ' + err.message, 'error');
      // Revert on error
      fetchFormatkaData();
    } finally {
      setIsSaving(false);
      setSelectedDayToEdit(null);
    }
  };

  // Global admin Lock toggler
  const handleToggleLockStatus = async () => {
    if (currentUserRole !== 'admin') {
      addToast('Tylko administrator może zablokować edycję.', 'error');
      return;
    }
    const newLockState = !isLocked;
    try {
      await apiCall('/api/formatka/admin/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: selectedMonth,
          isLocked: newLockState
        })
      });
      setIsLocked(newLockState);
      addToast(newLockState ? 'Edycja na ten miesiąc została ZABLOKOWANA' : 'Edycja na ten miesiąc została ODBLOKOWANA', 'success');
      fetchAdminData();
    } catch (err: any) {
      addToast('Błąd zmiany blokady: ' + err.message, 'error');
    }
  };

  // Download XLS File via safe direct fetch blob download
  const handleDownloadExcel = async () => {
    try {
      const token = getToken();
      const response = await fetch(`/api/formatka/export?month=${selectedMonth}`, {
        headers: {
          'Authorization': token ? `Bearer ${token}` : ''
        }
      });
      if (!response.ok) {
        const json = await response.json().catch(() => ({ error: 'Nie udało się pobrać pliku' }));
        throw new Error(json.error);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `formatka_${selectedMonth}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      addToast('Pomyślnie pobrano plik Excel.', 'success');
    } catch (err: any) {
      addToast('Błąd podczas pobierania Excel: ' + err.message, 'error');
    }
  };

  // Helper Calendar Math params
  const getCalendarDays = () => {
    const [yearStr, monthStr] = selectedMonth.split('-');
    const year = parseInt(yearStr || '2026');
    const month = parseInt(monthStr || '06');
    
    // First day index
    const firstDayIdx = new Date(year, month - 1, 1).getDay(); // 0 = Sunday
    // Convert Sunday-first (0-6) to Monday-first (0-Mon, 6-Sun)
    const offset = (firstDayIdx + 6) % 7;
    const daysCount = new Date(year, month, 0).getDate();

    const days = [];
    // Spacer days for correct align
    for (let i = 0; i < offset; i++) {
      days.push(null);
    }
    for (let d = 1; d <= daysCount; d++) {
      days.push(d);
    }
    return { days, year, month, daysCount };
  };

  const { days, year, month, daysCount } = getCalendarDays();

  // Stats calculation
  const wolneCount = Object.values(preferences).filter(v => v === 'W').length;
  const shift1Count = Object.values(preferences).filter(v => v === 'I').length;
  const shift2Count = Object.values(preferences).filter(v => v === 'II').length;

  // Filter out admin users and find people who haven't filled formatka (hasFilled === false)
  const unfilteredStaff = adminUsers.filter(u => u.role !== 'admin');
  const missingSubmissionUsers = unfilteredStaff.filter(u => !u.hasFilled);
  const completedSubmissionCount = unfilteredStaff.length - missingSubmissionUsers.length;

  // Filtering users search list for direct dashboard preview
  const filteredUsersForPreview = unfilteredStaff.filter(u => 
    u.fullName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Month navigation helpers
  const handlePrevMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const prevDate = new Date(y, m - 2, 1);
    setSelectedMonth(`${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const nextDate = new Date(y, m, 1);
    setSelectedMonth(`${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`);
  };

  // Get weekday name
  const getDayName = (day: number) => {
    const date = new Date(year, month - 1, day);
    const names = ['Nd', 'Pn', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob'];
    return names[date.getDay()];
  };

  const isWeekend = (day: number) => {
    const date = new Date(year, month - 1, day);
    const dayOfWeek = date.getDay();
    return dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday
  };

  const getFormatkaBadgeStyles = (val: string) => {
    switch (val) {
      case 'W':
        return 'bg-red-500/10 text-red-400 border border-red-500/30';
      case 'I':
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30';
      case 'II':
        return 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30';
      default:
        return 'bg-slate-800/40 text-slate-500 border border-slate-700/30';
    }
  };

  const decodePreferenceName = (val: string) => {
    switch (val) {
      case 'W': return 'Wolne (W)';
      case 'I': return '1 zmiana (I)';
      case 'II': return '2 zmiana (II)';
      default: return 'Brak preferencji';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 space-y-6 select-none pb-12">
      
      {/* HEADER ROW WITH MONTH CHANGER */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold font-sans tracking-tight text-white uppercase font-mono">
              📋 Formatka Życzeń Grafikowych
            </h2>
            {isSaving && (
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping"></span>
                Zapisywanie...
              </span>
            )}
            {!isSaving && !isLoading && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                ✓ Zapisano automatycznie
              </span>
            )}
          </div>
          <p className="text-slate-400 text-xs mt-1">
            Wskaż w kalendarzu dni wolne (W), pierwszą (I) lub drugą zmianę (II). Wszystkie zmiany zapisują się w locie.
          </p>
        </div>

        {/* MONTH PICKER CONTROLS */}
        <div className="flex items-center gap-2 bg-slate-950/40 border border-slate-800 p-1.5 rounded-xl">
          <button 
            onClick={handlePrevMonth}
            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition"
            title="Poprzedni miesiąc"
          >
            ◀
          </button>
          
          <div className="px-4 text-sm font-black font-mono tracking-widest text-[#d4af37] min-w-[120px] text-center uppercase">
            {new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1))}
          </div>

          <button 
            onClick={handleNextMonth}
            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition"
            title="Następny miesiąc"
          >
            ▶
          </button>
        </div>
      </div>

      {/* CORE LAYOUT GRID: Left (Calendar editor), Right (Personal stats & status indicators) */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        
        {/* CALENDAR COLUMN */}
        <div className="lg:col-span-3 space-y-4">
          
          {/* Lock/Unlock Banner for employee */}
          {isLocked ? (
            <div className="bg-[#241212] border border-red-900/30 text-red-300 rounded-xl p-4 flex items-center md:items-start gap-3 shadow-inner">
              <span className="text-lg">🔒</span>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-red-400">Edycja Zablokowana</h4>
                <p className="text-[11px] text-red-300/80 mt-0.5 leading-relaxed">
                  Administrator zamknął możliwość modyfikacji życzeń na ten miesiąc. Twoje zapisane preferencje są wciąż widoczne dla koordynatorów.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-[#0f1d17] border border-emerald-900/30 text-emerald-300 rounded-xl p-4 flex items-center md:items-start gap-3 shadow-inner">
              <span className="text-lg">🔓</span>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400">Edycja jest Otwarta</h4>
                <p className="text-[11px] text-emerald-300/80 mt-0.5 leading-relaxed">
                  Możesz swobodnie modyfikować i dodawać preferencje. Administrator po zebraniu wszystkich zgłoszeń zablokuje dalszą edycję.
                </p>
              </div>
            </div>
          )}

          {/* MAIN CALENDAR GRID ELEMENT */}
          <div className="bg-[#0b1329] border border-slate-800/80 rounded-2xl p-4 shadow-xl overflow-hidden relative">
            
            {/* Weekdays indicator bar */}
            <div className="grid grid-cols-7 gap-1 md:gap-2 mb-2 text-center">
              {['Pn', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'].map((wd) => (
                <div key={wd} className="text-[10px] font-black uppercase text-slate-500 py-1 tracking-wider font-mono">
                  {wd}
                </div>
              ))}
            </div>

            {/* Monthly Day Slots */}
            {isLoading ? (
              <div className="h-[250px] flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#d4af37]"></div>
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-1 md:gap-2">
                {days.map((day, idx) => {
                  if (day === null) {
                    return <div key={`empty-${idx}`} className="aspect-square bg-slate-950/25 rounded-xl border border-slate-950/30" />;
                  }

                  const val = preferences[day] || '';
                  const dayWName = getDayName(day);
                  const isSunOrSat = isWeekend(day);

                  return (
                    <button
                      key={`day-${day}`}
                      onClick={() => {
                        if (isLocked && currentUserRole !== 'admin') {
                          addToast('Formatka jest zablokowana do edycji', 'error');
                          return;
                        }
                        setSelectedDayToEdit(day);
                      }}
                      className={`relative aspect-square flex flex-col justify-between p-1.5 md:p-3 rounded-xl border transition-all text-left group overflow-hidden ${
                        val === 'W' 
                          ? 'bg-red-950/20 border-red-500/30 hover:border-red-400 shadow-[inset_0_0_12px_rgba(239,68,68,0.06)]' 
                          : val === 'I' 
                            ? 'bg-emerald-950/20 border-emerald-500/30 hover:border-emerald-400 shadow-[inset_0_0_12px_rgba(16,185,129,0.06)]' 
                            : val === 'II' 
                              ? 'bg-indigo-950/20 border-indigo-500/30 hover:border-indigo-400 shadow-[inset_0_0_12px_rgba(99,102,241,0.06)]' 
                              : isSunOrSat 
                                ? 'bg-slate-950/40 border-slate-800/60 hover:bg-slate-900/50 hover:border-slate-700' 
                                : 'bg-slate-900/10 border-slate-800/40 hover:bg-slate-900/50 hover:border-slate-700'
                      }`}
                    >
                      {/* Top bar of day cell */}
                      <div className="w-full flex items-center justify-between">
                        <span className={`text-sm font-black font-mono ${isSunOrSat ? 'text-[var(--color-gold-light)]' : 'text-slate-300'}`}>
                          {day}
                        </span>
                        <span className="text-[9px] font-bold text-slate-500 uppercase font-mono tracking-tight">
                          {dayWName}
                        </span>
                      </div>

                      {/* Display preference badge inside calendar slot */}
                      <div className="w-full mt-1">
                        {val ? (
                          <div className={`text-[10px] md:text-xs font-black rounded-lg py-1 text-center truncate ${
                            val === 'W' 
                              ? 'bg-red-500/20 text-red-300 border border-red-500/30' 
                              : val === 'I' 
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                                : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                          }`}>
                            {val}
                          </div>
                        ) : (
                          <div className="text-[9px] text-slate-600 font-bold uppercase tracking-wider text-center py-1 opacity-0 group-hover:opacity-100 transition duration-300">
                            + Ustaw
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* SIDEBAR COLOMN: STATS & QUICK DIRECTIVES */}
        <div className="space-y-6">
          
          {/* STATS COUNT SUMMARY CARD */}
          <div className="bg-[#0b1329] border border-slate-800/80 rounded-2xl p-5 shadow-xl">
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider font-mono">
              📊 Twoje Życzenia ({month}/{year})
            </h3>
            
            <div className="grid grid-cols-1 gap-3 mt-4">
              <div className="flex items-center justify-between p-3 rounded-xl bg-red-950/20 border border-red-900/20 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-bold flex items-center justify-center">W</span>
                  <span className="text-xs font-bold text-slate-300">Dni Wolne (W)</span>
                </div>
                <strong className="text-sm font-black font-mono text-red-400">{wolneCount}</strong>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-950/20 border border-emerald-900/20 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center justify-center">I</span>
                  <span className="text-xs font-bold text-slate-300">1 Zmiana (Ranek)</span>
                </div>
                <strong className="text-sm font-black font-mono text-emerald-400">{shift1Count}</strong>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-indigo-950/20 border border-indigo-900/20 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 text-xs font-bold flex items-center justify-center">II</span>
                  <span className="text-xs font-bold text-slate-300">2 Zmiana (Popołudnie)</span>
                </div>
                <strong className="text-sm font-black font-mono text-indigo-400">{shift2Count}</strong>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-800 text-[10px] text-slate-500 italic text-center">
              Klikaj dni w kalendarzu, aby zdefiniować lub zmienić życzenia.
            </div>
          </div>

          {/* ADMIN ACTION PANEL - Visible only to admin or coordinators */}
          {(currentUserRole === 'admin' || currentUserRole === 'coordinator') && (
            <div className="bg-slate-900/90 border border-[var(--color-gold)]/20 rounded-2xl p-5 shadow-2xl space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                <span className="text-lg">👑</span>
                <div>
                  <h3 className="text-xs font-black uppercase text-gold-gradient tracking-wider font-mono">
                    PANEL KOORDYNATORA
                  </h3>
                  <p className="text-[9px] text-slate-400 uppercase tracking-widest leading-none mt-0.5">
                    Month controls & export
                  </p>
                </div>
              </div>

              {/* LOCK/UNLOCK SHIFTS PERMISSION BUTTONS (Only administrative roles can lock/unlock) */}
              {currentUserRole === 'admin' ? (
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider font-mono block">
                    Zarządzaj pozwoleniem
                  </label>
                  {isLocked ? (
                    <button
                      onClick={handleToggleLockStatus}
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/10 transition"
                    >
                      🔓 Otwórz edycję dla personelu
                    </button>
                  ) : (
                    <button
                      onClick={handleToggleLockStatus}
                      className="w-full py-2 bg-red-600/90 hover:bg-red-500 active:bg-red-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-red-600/10 transition"
                    >
                      🔒 Zamknij edycję (Zablokuj)
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-[10px] text-slate-400 bg-slate-950/20 border border-slate-800 p-2.5 rounded-xl">
                  ⚠️ Twój status jako koordynator pozwala na pobieranie raportów i sprawdzanie postępów, ale nie możesz blokować/odblokowywać wysyłki.
                </div>
              )}

              {/* XLSX DOWNLOAD ACTION */}
              <div className="pt-2">
                <button
                  onClick={handleDownloadExcel}
                  className="w-full py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-black uppercase text-xs rounded-xl shadow-xl transition"
                >
                  📥 Pobierz Excel (.xlsx)
                </button>
              </div>

              {/* STATS PROGRESS FOR ADMIN */}
              <div className="pt-3 border-t border-slate-800 space-y-2">
                <div className="flex justify-between text-[10px] font-bold uppercase text-slate-400 font-mono">
                  <span>Złożone Grafikowe:</span>
                  <span className="text-[var(--color-gold-light)]">
                    {completedSubmissionCount} / {unfilteredStaff.length}
                  </span>
                </div>
                <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="bg-gold-gradient h-full rounded-full transition-all duration-500" 
                    style={{ width: `${unfilteredStaff.length > 0 ? (completedSubmissionCount / unfilteredStaff.length) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
          )}

        </div>

      </div>

      {/* DETAILED ADMINE PANELS AT THE BOTTOM */}
      {(currentUserRole === 'admin' || currentUserRole === 'coordinator') && (
        <div className="bg-[#0b1329] border border-slate-800/80 rounded-2xl p-6 shadow-xl space-y-6">
          
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-sm font-black font-mono tracking-wider text-white uppercase">
                👥 Monitor Zgłoszeń i Preferencji
              </h3>
              <p className="text-slate-400 text-xs mt-0.5">
                Sprawdź postępy personelu w wypełnianiu formatki na {selectedMonth}. Naciskaj na pracowników, aby rozwinąć ich pełne zgłoszenie na telefonie.
              </p>
            </div>

            {/* Quick search input */}
            <div className="relative">
              <input
                type="text"
                placeholder="Szukaj pracownika..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full md:w-64 bg-slate-950 text-slate-200 border border-slate-800 rounded-xl px-4 py-2 text-xs focus:outline-none focus:border-[#d4af37] placeholder-slate-600"
              />
            </div>
          </div>

          {/* MISSING SUBMISSIONS WARNING CORNER */}
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
            <h4 className="text-xs font-black uppercase text-red-400 tracking-wider font-mono flex items-center gap-1.5">
              ⚠️ KTO JESZCZE NIE ZROBIŁ FORMATKI ({missingSubmissionUsers.length})
            </h4>
            {adminLoading ? (
              <div className="text-slate-500 text-xs mt-2 italic font-mono">Trwa ładowanie listy...</div>
            ) : missingSubmissionUsers.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 mt-3">
                {missingSubmissionUsers.map((u) => (
                  <div 
                    key={`missing-${u.id}`}
                    className="p-2 rounded-lg bg-red-950/20 border border-red-500/20 text-center font-bold text-slate-300 text-xs truncate"
                    title={u.fullName}
                  >
                    👤 {u.fullName}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-emerald-400 text-xs mt-2 font-black flex items-center gap-2">
                🎉 Wszyscy pracownicy prawidłowo uzupełnili swoje życzenia na ten miesiąc!
              </div>
            )}
          </div>

          {/* DYNAMIC SHIFTS PREVIEW LIST (Interactive on phone) */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider font-mono">
              💬 Podgląd Szczegółów Zgłoszeń
            </h4>
            
            <div className="grid grid-cols-1 gap-2.5">
              {adminLoading ? (
                <div className="py-8 text-center text-slate-500 text-xs italic font-mono">Trwa pobieranie podglądu...</div>
              ) : filteredUsersForPreview.length === 0 ? (
                <div className="py-6 text-center text-slate-500 text-xs italic font-mono">Brak dopasowanych pracowników.</div>
              ) : (
                filteredUsersForPreview.map((user) => {
                  const isExpanded = expandedUserId === user.id;
                  
                  // Summarize their preferences
                  const uWolne = Object.values(user.preferences).filter(v => v === 'W').length;
                  const uI = Object.values(user.preferences).filter(v => v === 'I').length;
                  const uII = Object.values(user.preferences).filter(v => v === 'II').length;

                  return (
                    <div 
                      key={`preview-user-${user.id}`}
                      className="border border-slate-800 rounded-xl bg-slate-950/20 hover:bg-slate-950/40 overflow-hidden transition"
                    >
                      {/* Flex trigger */}
                      <button
                        onClick={() => setExpandedUserId(isExpanded ? null : user.id)}
                        className="w-full text-left p-4 flex flex-col md:flex-row md:items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-lg">👤</span>
                          <div>
                            <h4 className="text-sm font-black text-slate-200">{user.fullName}</h4>
                            <p className="text-[10px] text-slate-500 font-mono uppercase mt-0.5">
                              Rola: {user.role === 'coordinator' ? 'Koordynator' : 'Pracownik (Waiters/Bar)'}
                            </p>
                          </div>
                        </div>

                        {/* Status bar */}
                        <div className="flex items-center gap-2">
                          {user.hasFilled ? (
                            <div className="flex items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                Wypełnione ({uWolne}W / {uI}I / {uII}II)
                              </span>
                              {user.updatedAt && (
                                <span className="text-[9px] text-slate-500 font-mono">
                                  Aktualizacja: {new Date(user.updatedAt).toLocaleDateString('pl-PL')}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-red-500/10 text-red-400 border border-red-500/30">
                              Brak zgłoszenia!
                            </span>
                          )}
                          <span className="text-slate-500 text-xs pl-2 font-bold select-none">{isExpanded ? '▲' : '▼'}</span>
                        </div>
                      </button>

                      {/* Expanded Monthly detailed Grid */}
                      {isExpanded && (
                        <div className="p-4 bg-slate-950 border-t border-slate-900 animate-slide-in">
                          {Object.keys(user.preferences).length === 0 ? (
                            <p className="text-[11px] text-slate-500 italic">Ten pracownik nie złożył jeszcze żadnych preferencji na ten miesiąc.</p>
                          ) : (
                            <div>
                              <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider font-mono mb-2">
                                INDYWIDUALNE PREFERENCJE DZIEŃ PO DNIU:
                              </p>
                              
                              {/* Horizontal mobile scroll block or compact grid */}
                              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-1.5">
                                {Array.from({ length: daysCount }).map((_, dIdx) => {
                                  const dayNum = dIdx + 1;
                                  const prefVal = user.preferences[dayNum] || '';
                                  const isSuOrSa = isWeekend(dayNum);
                                  
                                  return (
                                    <div 
                                      key={`user-pref-day-${dayNum}`}
                                      className={`p-2 rounded-lg text-center border ${
                                        prefVal === 'W'
                                          ? 'bg-red-500/10 border-red-500/30 text-red-400'
                                          : prefVal === 'I'
                                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                            : prefVal === 'II'
                                              ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
                                              : isSuOrSa 
                                                ? 'bg-slate-900 border-slate-800 text-slate-500'
                                                : 'bg-slate-900/40 border-slate-900 text-slate-600'
                                      }`}
                                    >
                                      <div className="text-[10px] font-bold font-mono text-slate-500">{dayNum}</div>
                                      <div className="text-xs font-black font-mono mt-0.5">{prefVal || '-'}</div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>
      )}

      {/* PRESETS TOUCH OPTIONS MODAL DIALOG ON MOBILE & DESKTOP (Touch friendly picker) */}
      {selectedDayToEdit !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div 
            className="w-full max-w-sm bg-slate-900 rounded-2xl border border-slate-800/80 p-6 shadow-2xl space-y-4 text-center animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div>
              <p className="text-[10px] font-black uppercase text-[var(--color-gold-light)] tracking-widest font-mono">
                WYBÓR PREFERENCJI
              </p>
              <h3 className="text-lg font-black text-white mt-1">
                Dzień {selectedDayToEdit} {new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1))}
              </h3>
              <p className="text-[10px] text-slate-500 mt-1 font-mono uppercase">
                Aktualny stan: <span className="text-slate-300 font-extrabold">{decodePreferenceName(preferences[selectedDayToEdit] || '')}</span>
              </p>
            </div>

            {/* Buttons options */}
            <div className="grid grid-cols-1 gap-2">
              
              {/* Option 1: First Shift */}
              <button
                onClick={() => handleSetDayPreference(selectedDayToEdit, 'I')}
                className="w-full p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-400 font-bold text-sm tracking-wide flex items-center justify-between transition"
              >
                <span>🟢 1 Zmiana (Ranek)</span>
                <span className="text-xs bg-emerald-500/20 px-2 py-0.5 rounded text-emerald-300 font-mono">I</span>
              </button>

              {/* Option 2: Second Shift */}
              <button
                onClick={() => handleSetDayPreference(selectedDayToEdit, 'II')}
                className="w-full p-3.5 rounded-xl border border-indigo-500/20 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-400 font-bold text-sm tracking-wide flex items-center justify-between transition"
              >
                <span>🔵 2 Zmiana (Popołudnie)</span>
                <span className="text-xs bg-indigo-500/20 px-2 py-0.5 rounded text-indigo-300 font-mono">II</span>
              </button>

              {/* Option 3: Wolne */}
              <button
                onClick={() => handleSetDayPreference(selectedDayToEdit, 'W')}
                className="w-full p-3.5 rounded-xl border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-red-400 font-bold text-sm tracking-wide flex items-center justify-between transition"
              >
                <span>🔴 Dzień Wolny (Wolne)</span>
                <span className="text-xs bg-red-500/20 px-2 py-0.5 rounded text-red-300 font-mono">W</span>
              </button>

              {/* Option 4: Clear */}
              <button
                onClick={() => handleSetDayPreference(selectedDayToEdit, '')}
                className="w-full p-3.5 rounded-xl border border-slate-800 bg-slate-950 hover:bg-slate-800 text-slate-400 font-bold text-sm tracking-wide flex items-center justify-between transition"
              >
                <span>⚪ Brak preferencji</span>
                <span className="text-xs bg-slate-800 px-2 py-0.5 rounded text-slate-400 font-mono">-</span>
              </button>

            </div>

            {/* Cancel Button */}
            <div className="pt-2">
              <button
                onClick={() => setSelectedDayToEdit(null)}
                className="w-full py-2 bg-slate-800 hover:bg-slate-705 text-slate-300 text-xs font-bold rounded-xl transition"
              >
                Anuluj ✕
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
