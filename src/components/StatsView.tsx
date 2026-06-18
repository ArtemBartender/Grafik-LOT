import React, { useEffect, useState } from 'react';
import { apiCall, currentClaims } from '../lib/api';

interface StatsViewProps {
  addToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export default function StatsView({ addToast }: StatsViewProps) {
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date(2026, 5, 1)); // Default June 2026

  // KPI States
  const [hoursDone, setHoursDone] = useState(0);
  const [hoursLeft, setHoursLeft] = useState(0);
  const [netDone, setNetDone] = useState(0);
  const [netAll, setNetAll] = useState(0);
  const [dailyHours, setDailyBars] = useState<any[]>([]);
  
  // Rate limits or inputs config state
  const [rate, setRate] = useState<number>(28.10);
  const [tax, setTax] = useState<number>(12);

  // Shifts list inside current month
  const [myBriefShifts, setMyBriefShifts] = useState<any[]>([]);
  const [monthNotes, setMonthNotes] = useState<any[]>([]);

  // Dialog editor state
  const [editingOvertimeShift, setEditingOvertimeShift] = useState<any | null>(null);
  const [otStart, setOtStart] = useState('06:00');
  const [otEnd, setOtEnd] = useState('14:00');
  const [otWorked, setOtWorked] = useState('8');
  const [otNote, setOtNote] = useState('');

  const plLocalMonth = new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' });

  const getMonthPrefix = () => {
    return `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`;
  };

  const loadSettingsAndKPIs = async () => {
    const ym = getMonthPrefix();
    try {
      // 1. Fetch Rates Settings
      const setInfo = await apiCall('/api/me/settings');
      if (setInfo.hourly_rate_pln != null) setRate(Number(setInfo.hourly_rate_pln));
      if (setInfo.tax_percent != null) setTax(Number(setInfo.tax_percent));

      // 2. Fetch KPIs Stats
      const kpiData = await apiCall(`/api/my-stats?month=${ym}`);
      setHoursDone(kpiData.hours_done || 0);
      setHoursLeft(kpiData.hours_left || 0);
      setNetDone(kpiData.net_done || 0);
      setNetAll(kpiData.net_all || 0);
      setDailyBars(kpiData.daily || []);

      // 3. Fetch Monthly shift list for management
      const briefShifts = await apiCall(`/api/my-shifts-brief?month=${ym}`);
      setMyBriefShifts(briefShifts || []);

      // 4. Fetch User notes list
      const nSummary = await apiCall(`/api/my-notes?month=${ym}`);
      setMonthNotes(nSummary || []);

    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadSettingsAndKPIs();
  }, [currentMonth]);

  const handleSaveSettings = async () => {
    try {
      await apiCall('/api/me/settings', {
        method: 'POST',
        body: JSON.stringify({ hourly_rate_pln: rate, tax_percent: tax })
      });
      addToast('Ustawienia i stawki zostały zapisane', 'success');
      loadSettingsAndKPIs();
    } catch (err: any) {
      addToast(err.message || 'Błąd zapisu ustawień', 'error');
    }
  };

  const handlePostToMarket = async (shiftId: number) => {
    try {
      await apiCall(`/api/market/offers/${shiftId}`, { method: 'POST' });
      addToast('Zmiana została wystawiona na giełdę!', 'success');
    } catch (err: any) {
      addToast(err.message || 'Błąd wystawiania zmiany', 'error');
    }
  };

  // Open Overtime dialog editor
  const handleOpenOvertime = async (shiftId: number) => {
    try {
      const data = await apiCall(`/api/my-shift/${shiftId}`);
      setEditingOvertimeShift(data);
      setOtStart(data.default_start || '06:00');
      setOtEnd(data.default_end || '14:00');
      setOtWorked(String(data.worked_hours || '8'));
      setOtNote(data.note || '');
    } catch (err: any) {
      addToast(err.message || 'Nie udany odczyt szczegółów', 'error');
    }
  };

  // Recompute decimal worked hours dynamically as soon as start or end time changes
  useEffect(() => {
    if (!otStart || !otEnd) return;
    try {
      const [sh, sm] = otStart.split(':').map(Number);
      const [eh, em] = otEnd.split(':').map(Number);
      if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return;

      let mins = (eh * 60 + em) - (sh * 60 + sm);
      // Handles overnight flips i.e. 22:00 to 06:00
      if (mins < 0) {
        mins += 24 * 60;
      }
      setOtWorked((mins / 60).toFixed(2));
    } catch (e) {}
  }, [otStart, otEnd]);

  const handleSaveOvertime = async () => {
    if (!editingOvertimeShift) return;
    try {
      await apiCall(`/api/my-shift/${editingOvertimeShift.id}/worklog`, {
        method: 'POST',
        body: JSON.stringify({
          start_time: otStart,
          end_time: otEnd,
          worked_hours: Number(otWorked) || 8,
          note: otNote.trim()
        })
      });
      addToast('Zapisano nadgodziny i notatkę', 'success');
      setEditingOvertimeShift(null);
      loadSettingsAndKPIs();
    } catch (err: any) {
      addToast(err.message || 'Błąd zapisu zmian', 'error');
    }
  };

  const handleQuickNote = async (shiftId: number) => {
    const text = prompt('Wpisz treść notatki dla tej zmiany:');
    if (text === null) return;
    try {
      await apiCall(`/api/my-shift/${shiftId}/worklog`, {
        method: 'POST',
        body: JSON.stringify({ note: text.trim() })
      });
      addToast('Zapisano notatkę o zmianie', 'success');
      loadSettingsAndKPIs();
    } catch (err: any) {
      addToast(err.message || 'Błąd modyfikacji notatki', 'error');
    }
  };

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const plnCurrency = (val: number) => {
    return val.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' PLN';
  };

  const formatBriefDate = (dateIsoStr: string) => {
    try {
      const dObj = new Date(dateIsoStr + 'T12:00:00');
      return dObj.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' });
    } catch (e) {
      return dateIsoStr;
    }
  };

  const maxDailyH = dailyHours.length > 0 ? Math.max(...dailyHours.map(d => d.hours), 1) : 12;

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl mx-auto px-4 py-2">
      {/* HEADER NAV MONTH */}
      <div className="flex items-center justify-center gap-3">
        <button 
          onClick={handlePrevMonth}
          className="p-2 border border-slate-800 hover:bg-slate-800 rounded-xl text-slate-350 font-bold transition active:scale-95 duration-100"
        >
          ◀
        </button>
        <h1 className="text-xl font-bold uppercase text-white min-w-[200px] text-center select-none">
          {plLocalMonth.format(currentMonth)}
        </h1>
        <button 
          onClick={handleNextMonth}
          className="p-2 border border-slate-800 hover:bg-slate-800 rounded-xl text-slate-350 font-bold transition active:scale-95 duration-100"
        >
          ▶
        </button>
      </div>

      {/* KPI GRID METRICS */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
          <div className="text-xs font-bold text-slate-400 uppercase">Przepracowano</div>
          <div className="text-2xl font-black text-white mt-1.5">{hoursDone} h</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
          <div className="text-xs font-bold text-slate-400 uppercase">Pozostało</div>
          <div className="text-2xl font-black text-white mt-1.5">{hoursLeft} h</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
          <div className="text-xs font-bold text-slate-400 uppercase">Wynagrodzenie (netto, wykonane)</div>
          <div className="text-2xl font-black text-emerald-400 mt-1.5 font-mono">{plnCurrency(netDone)}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
          <div className="text-xs font-bold text-slate-400 uppercase">Wynagrodzenie (netto, cały zakres)</div>
          <div className="text-2xl font-black text-emerald-300 mt-1.5 font-mono">{plnCurrency(netAll)}</div>
        </div>
      </section>

      {/* WORKED HOURS DAILY BARS GRAPHIC */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-2">
        <h3 className="text-sm font-bold text-slate-400 uppercase">Przepływ godzin</h3>
        {dailyHours.length === 0 ? (
          <div className="text-slate-550 text-sm py-4 italic select-none">Brak rozpisanych godzin w wybranym miesiącu.</div>
        ) : (
          <div className="bars h-[140px] flex items-end gap-1.5 border-b border-slate-800 pb-1">
            {dailyHours.map((d, index) => {
              const heightPct = Math.max(5, (d.hours / maxDailyH) * 100);
              return (
                <div 
                  key={index}
                  className={`bar flex-1 ${d.done ? 'done' : ''}`}
                  style={{ height: `${heightPct}%` }}
                  data-tip={`${d.date} • ${d.hours} h`}
                />
              );
            })}
          </div>
        )}
      </section>

      {/* HOURLY RATE CONFIG */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
        <h3 className="text-sm font-bold text-slate-400 uppercase">Ustawienia finansowe</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-400 uppercase">Stawka stawki (PLN/h)</label>
            <input 
              type="number" 
              value={rate}
              onChange={(e) => setRate(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-slate-850 bg-slate-950 text-slate-100 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold text-sm"
              step="0.01" 
              placeholder="np. 28.00"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-400 uppercase">Podatek dochodowy (%)</label>
            <input 
              type="number" 
              value={tax}
              onChange={(e) => setTax(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-slate-850 bg-slate-950 text-slate-100 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold text-sm"
              step="0.1" 
              placeholder="np. 12"
            />
          </div>
          <button 
            type="button"
            onClick={handleSaveSettings}
            className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-emerald-500 text-slate-950 font-extrabold rounded-xl hover:opacity-95 transform active:scale-95 transition text-sm"
          >
            Zapisz
          </button>
        </div>
      </section>

      {/* INDIVIDUAL WORKLOG BRIEF MANAGEMENT LIST */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
        <h3 className="text-base font-bold text-slate-350 border-b border-slate-800 pb-2 flex items-center justify-between">
          <span>📅 Moje zmiany w tym miesiącu</span>
          <span className="text-xs text-slate-500 font-semibold">{myBriefShifts.length} zmian</span>
        </h3>

        <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
          {myBriefShifts.length === 0 ? (
            <div className="text-slate-550 text-sm py-4 italic">Brak zarejestrowanych zmian w tym okresie.</div>
          ) : (
            myBriefShifts.map((item) => (
              <div key={item.id} className="flex flex-col md:flex-row md:items-center justify-between p-3.5 rounded-xl border border-slate-850 bg-slate-950/40 hover:bg-slate-950/90 transition duration-150 gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <strong className="text-slate-100 text-sm">{formatBriefDate(item.date)}</strong>
                    <span className="badge badge-shift font-mono text-[10px]">{item.code}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1 font-semibold flex items-center gap-1.5 flex-wrap">
                    <span>Plan: <strong>{item.scheduled_hours}h</strong></span>
                    {item.worked_hours !== item.scheduled_hours && (
                      <span className="text-slate-400">· Praca: <strong>{item.worked_hours}h</strong></span>
                    )}
                    {item.note && (
                      <span className="italic text-slate-400 font-normal">({item.note})</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button 
                    onClick={() => handlePostToMarket(item.id)}
                    className="px-3 py-1.5 border border-slate-800 hover:border-slate-600 hover:bg-slate-900 text-slate-300 text-xs font-bold rounded-lg transition"
                  >
                    Oddaj na rynek
                  </button>
                  <button 
                    onClick={() => handleOpenOvertime(item.id)}
                    className="px-3 py-1.5 bg-slate-850 hover:bg-slate-855 text-slate-200 text-xs font-bold rounded-lg transition"
                  >
                    Edytuj godziny
                  </button>
                  <button 
                    onClick={() => handleQuickNote(item.id)}
                    className="px-3 py-1.5 bg-slate-850 hover:bg-slate-855 text-slate-200 text-xs font-bold rounded-lg transition"
                  >
                    Notatka
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* MONTHLY SUMMARY NOTES */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
        <h3 className="text-sm font-bold text-slate-400 uppercase">Podsumowanie notatek o zmianach</h3>
        <div className="space-y-2 text-xs text-slate-400 max-h-[160px] overflow-y-auto pr-1">
          {monthNotes.length === 0 ? (
            <div className="italic text-slate-550 select-none">Brak notatek dla Twoich zmian w tym okresie.</div>
          ) : (
            monthNotes.map((n, i) => (
              <div key={i} className="flex gap-2 py-1 items-start border-b border-slate-850 pb-1">
                <span className="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-mono text-[10px] shrink-0">
                  {formatBriefDate(n.date)}
                </span>
                <span className="text-slate-300">{n.note}</span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* EDIT OVERTIME DIALOG MODAL */}
      {editingOvertimeShift && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-800">
              <h3 className="text-base font-extrabold text-slate-200">
                ✏️ Edytuj nadgodziny i notatkę
              </h3>
              <button 
                onClick={() => setEditingOvertimeShift(null)}
                className="text-slate-400 hover:text-slate-100 text-2xl"
              >
                &times;
              </button>
            </div>

            <div className="space-y-4">
              <div className="text-xs text-blue-400 font-bold bg-blue-500/10 border border-blue-500/20 px-3 py-2 rounded-xl">
                Zmiana z dnia: {editingOvertimeShift.date} ({editingOvertimeShift.shift_code})
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-400 uppercase">Start pracy</label>
                  <input 
                    type="time" 
                    value={otStart}
                    onChange={(e) => setOtStart(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-950 text-slate-100 text-sm font-semibold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-400 uppercase">Koniec pracy</label>
                  <input 
                    type="time" 
                    value={otEnd}
                    onChange={(e) => setOtEnd(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-950 text-slate-100 text-sm font-semibold"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-400 uppercase">Faktycznie przepracowano (godziny)</label>
                <input 
                  type="number" 
                  value={otWorked}
                  onChange={(e) => setOtWorked(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-950 text-slate-105 text-sm font-bold font-mono"
                  step="0.01" 
                  placeholder="np. 8.00"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-400 uppercase">Notatka (co zrobiłeś / dlaczego nadgodziny)</label>
                <textarea 
                  value={otNote}
                  onChange={(e) => setOtNote(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-950 text-slate-100 text-sm placeholder-slate-550 h-24 resize-none outline-none"
                  placeholder="np. Dodatkowy rozładunek magazynu..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-3 border-t border-slate-800">
              <button 
                onClick={() => setEditingOvertimeShift(null)}
                className="px-4 py-2 bg-transparent border border-slate-700 hover:border-slate-500 hover:bg-slate-800 rounded-xl text-slate-350 text-sm font-semibold transition"
              >
                Anuluj
              </button>
              <button 
                onClick={handleSaveOvertime}
                className="px-5 py-2 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-xl text-slate-900 text-sm font-bold hover:opacity-95 transition"
              >
                Zapisz
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
