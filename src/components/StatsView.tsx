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
  const [rate, setRate] = useState<number | string>(28.10);
  const [tax, setTax] = useState<number | string>(12);
  const [bonus, setBonus] = useState<number | string>(0);

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
      if (setInfo.hourly_rate_pln != null) setRate(setInfo.hourly_rate_pln);
      if (setInfo.tax_percent != null) setTax(setInfo.tax_percent);
      if (setInfo.bonus_percent != null) setBonus(setInfo.bonus_percent);

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
        body: JSON.stringify({ 
          hourly_rate_pln: rate === '' ? '' : parseFloat(String(rate)), 
          tax_percent: tax === '' ? '' : parseFloat(String(tax)),
          bonus_percent: bonus === '' ? '' : parseFloat(String(bonus))
        })
      });
      addToast('Ustawienia i stawki zostały zapisane', 'success');
      loadSettingsAndKPIs();
    } catch (err: any) {
      addToast(err.message || 'Błąd zapisu ustawień', 'error');
    }
  };

  const handlePostToMarket = async (shiftId: number) => {
    const shiftItem = myBriefShifts.find(x => x.id === shiftId);
    if (shiftItem) {
      const nowInstance = new Date();
      const todayDateStr = `${nowInstance.getFullYear()}-${String(nowInstance.getMonth() + 1).padStart(2, '0')}-${String(nowInstance.getDate()).padStart(2, '0')}`;
      if (shiftItem.date <= todayDateStr) {
        addToast('Nie możesz wystawić na giełdę zmiany z dzisiaj lub z przeszłości.', 'error');
        return;
      }
    }
    try {
      await apiCall(`/api/market/offers/${shiftId}`, { method: 'POST' });
      addToast('Zmiana została wystawiona na giełdę!', 'success');
      loadSettingsAndKPIs();
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
    } catch (e) {
      // safe fallback
    }
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
      addToast('Godziny i notatkę pomyślnie zaktualizowano', 'success');
      setEditingOvertimeShift(null);
      loadSettingsAndKPIs();
    } catch (err: any) {
      addToast(err.message || 'Nie udana zmiana godzin', 'error');
    }
  };

  const changeMonth = (offset: number) => {
    const nextDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1);
    setCurrentMonth(nextDate);
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto font-sans">
      
      {/* HEADER SECTION WITH NAVIGATION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-3">
        <div>
          <h1 className="text-xl font-black text-white flex items-center gap-2">
            📊 Statystyki & Finanse
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-bold">
            Podsumowanie wypracowanych godzin, kalkulacje wynagrodzenia oraz notatki zmianowe.
          </p>
        </div>

        {/* MONTH SWITCHER EXACT MATCH WITH CALENDAR VIEW */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button 
            onClick={() => changeMonth(-1)}
            type="button"
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-950/40 hover:bg-slate-950/85 border border-slate-800/80 text-slate-300 hover:text-white transition duration-200"
            title="Poprzedni miesiąc"
          >
            <span className="text-xs font-bold">◀</span>
          </button>
          <span className="text-sm font-extrabold text-slate-100 uppercase min-w-[140px] text-center tracking-wide bg-slate-950/30 p-2.5 rounded-xl border border-slate-800/50 font-mono">
            {plLocalMonth.format(currentMonth)}
          </span>
          <button 
            onClick={() => changeMonth(1)}
            type="button"
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-950/40 hover:bg-slate-950/85 border border-slate-800/80 text-slate-300 hover:text-white transition duration-200"
            title="Następny miesiąc"
          >
            <span className="text-xs font-bold">▶</span>
          </button>
        </div>
      </div>

      {/* STATISTICAL COUNTER BOXES IN EXACT MATCHING STYLE */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* HOURS WORKED */}
        <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/60 p-4 rounded-2xl flex items-center gap-3.5 shadow-md hover:border-slate-750 transition-all duration-305">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-lg">
            ✅
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-black tracking-wider">Przepracowano</p>
            <p className="text-base font-black text-emerald-400 font-mono">{hoursDone.toFixed(1)} h</p>
          </div>
        </div>

        {/* HOURS TO DO */}
        <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/60 p-4 rounded-2xl flex items-center gap-3.5 shadow-md hover:border-slate-750 transition-all duration-305">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 text-lg">
            ⏳
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-black tracking-wider">Pozostało h</p>
            <p className="text-base font-black text-amber-300 font-mono">{hoursLeft.toFixed(1)} h</p>
          </div>
        </div>

        {/* EARNINGS NET CURRENT */}
        <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/60 p-4 rounded-2xl flex items-center gap-3.5 shadow-md hover:border-slate-750 transition-all duration-305">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 text-lg">
            💵
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-black tracking-wider">Zysk netto</p>
            <p className="text-base font-black text-slate-100 font-mono">{netDone.toLocaleString('pl-PL')} zł</p>
          </div>
        </div>

        {/* EARNINGS NET ALL FORECAST */}
        <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/60 p-4 rounded-2xl flex items-center gap-3.5 shadow-md hover:border-slate-750 transition-all duration-305">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 text-lg">
            📈
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-black tracking-wider">Prognoza netto</p>
            <p className="text-base font-black text-indigo-300 font-mono">{netAll.toLocaleString('pl-PL')} zł</p>
          </div>
        </div>

      </div>

      {/* PARAMETERS CONFIG PANEL Row */}
      <div className="bg-slate-900/45 border border-slate-800/70 backdrop-blur-xl p-5 rounded-2xl shadow-xl">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest font-mono flex items-center gap-2 mb-4">
          <span>⚙️</span> Parametry rozliczeń i taryfy
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5 tracking-wider">
              Stawka za godzinę (PLN brutto)
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.1"
                min="0"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 text-slate-100 text-sm rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-550/30 font-bold font-mono"
              />
              <span className="absolute right-3.5 top-2.5 text-xs text-slate-550 font-bold">zł/h</span>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5 tracking-wider">
              Podatek i ZUS (%)
            </label>
            <div className="relative">
              <input
                type="number"
                step="1"
                min="0"
                max="100"
                value={tax}
                onChange={(e) => setTax(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 text-slate-100 text-sm rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-550/30 font-bold font-mono"
              />
              <span className="absolute right-3.5 top-2.5 text-xs text-slate-550 font-bold">%</span>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5 tracking-wider">
              Premia i uznania (%)
            </label>
            <div className="relative">
              <input
                type="number"
                step="1"
                min="0"
                value={bonus}
                onChange={(e) => setBonus(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 text-slate-100 text-sm rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-550/30 font-bold font-mono"
              />
              <span className="absolute right-3.5 top-2.5 text-xs text-slate-550 font-bold">%</span>
            </div>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-800/40 flex justify-end">
          <button
            onClick={handleSaveSettings}
            type="button"
            className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-500 hover:from-indigo-500 hover:to-blue-400 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-indigo-500/10 transition-all transform active:translate-y-0.5"
          >
            ✓ Zapisz parametry kalkulacji
          </button>
        </div>
      </div>

      {/* DAILY BAR PROGRESS HEATMAP */}
      {dailyHours.length > 0 && (
        <div className="bg-slate-900/45 border border-slate-800/70 p-5 rounded-2xl shadow-xl">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest font-mono flex items-center gap-2 mb-4">
            <span>📈</span> Dzienny spis przepracowanego czasu
          </h3>
          <div className="overflow-x-auto pb-2">
            <div className="flex items-end gap-1.5 min-w-[620px] h-32 pt-6">
              {dailyHours.map((bar, idx) => {
                const heightPct = Math.min(100, (bar.hours / 12) * 100);
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center group relative cursor-pointer">
                    <div className="absolute top-[-26px] hidden group-hover:block bg-slate-950 border border-slate-700 text-[10px] text-slate-200 px-1.5 py-0.5 rounded shadow-lg z-20 whitespace-nowrap">
                      {bar.hours.toFixed(1)} h
                    </div>
                    <div className="w-full h-20 flex flex-col justify-end">
                      <div className="w-full relative rounded-t-sm transition-all" style={{ height: `${heightPct}%` }}>
                        <div className={`absolute inset-0 rounded-t-sm ${
                          bar.done ? 'bg-gradient-to-t from-emerald-600 to-emerald-450' : 'bg-gradient-to-t from-indigo-800 to-indigo-500 opacity-60'
                        }`} />
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-500 mt-2 font-mono font-bold">{bar.date}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 mt-3 text-[10px] text-slate-400 font-bold border-t border-slate-800/30 pt-3">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-gradient-to-t from-emerald-600 to-emerald-450 rounded-sm" />
              <span>Dni zaliczone</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-gradient-to-t from-indigo-800 to-indigo-500 opacity-60 rounded-sm" />
              <span>Dni zaplanowane</span>
            </div>
          </div>
        </div>
      )}

      {/* SHIFTS MANAGER TABLE */}
      <div className="bg-slate-905/80 border border-slate-800/80 rounded-2xl p-5 shadow-2xl space-y-4">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest font-mono flex items-center gap-2 mb-1">
          <span>📋</span> Zarządzanie czasem i giełdą dyżurów
        </h3>

        {myBriefShifts.length === 0 ? (
          <div className="text-center py-12 text-slate-500 border border-dashed border-slate-800/80 rounded-xl text-xs italic">
            Nie znaleziono Twoich dyżurów w systemie dla wybranego miesiąca.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-450 font-black uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-3">Data</th>
                  <th className="py-3 px-3">Kod wejścia</th>
                  <th className="py-3 px-3">Planowane h</th>
                  <th className="py-3 px-3">Faktyczne h</th>
                  <th className="py-3 px-3">Salon / Lounge</th>
                  <th className="py-3 px-3">Komentarze</th>
                  <th className="py-3 px-3 text-right">Zarządzaj</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850/40">
                {myBriefShifts.map((shift) => (
                  <tr key={shift.id} className="hover:bg-slate-900/30 transition-colors">
                    <td className="py-3 px-3 font-bold text-slate-300 font-mono">{shift.date}</td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 bg-slate-800/80 text-slate-200 rounded border border-slate-700/80 font-black font-mono">
                        {shift.code}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-400 font-mono">{shift.scheduled_hours} h</td>
                    <td className="py-3 px-3">
                      <span className={`font-black font-mono ${shift.worked_hours !== shift.scheduled_hours ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {shift.worked_hours} h
                      </span>
                    </td>
                    <td className="py-3 px-3 capitalize text-teal-450 font-bold">{shift.lounge}</td>
                    <td className="py-3 px-3 max-w-[150px] truncate text-slate-500 italic" title={shift.note || ''}>
                      {shift.note || '—'}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="inline-flex gap-2">
                        <button
                          onClick={() => handleOpenOvertime(shift.id)}
                          type="button"
                          className="px-2.5 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/25 border border-indigo-500/20 text-indigo-300 text-[10px] font-black rounded-lg transition uppercase tracking-wider"
                        >
                          ⚙ Godziny
                        </button>
                        <button
                          onClick={() => handlePostToMarket(shift.id)}
                          type="button"
                          className="px-2.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/25 border border-emerald-500/20 text-emerald-350 text-[10px] font-black rounded-lg transition uppercase tracking-wider"
                        >
                          ⇄ Na Giełdę
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MONTH NOTES TIMELINE SUMMARY */}
      {monthNotes.length > 0 && (
        <div className="bg-slate-900/40 border border-slate-800/60 p-5 rounded-2xl shadow-xl">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest font-mono flex items-center gap-2 mb-3">
            <span>📝</span> Raportowane uwagi i notatki w miesiącu
          </h3>
          <div className="space-y-2.5">
            {monthNotes.map((n, idx) => (
              <div key={idx} className="bg-slate-950/35 border border-slate-850 p-3 rounded-xl text-xs flex items-center justify-between gap-4">
                <div>
                  <span className="font-mono text-emerald-450 font-black mr-2 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                    {n.date}
                  </span>
                  <span className="text-slate-300 font-medium">{n.note}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DIALOG: OVERTIME AND WORKLOG WRAPPER */}
      {editingOvertimeShift && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in animate-duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative">
            <div className="bg-gradient-to-r from-indigo-900/90 to-slate-900 p-4 border-b border-slate-800 flex justify-between items-center">
              <div>
                <h4 className="text-slate-100 font-black text-sm">Zmień Godziny i Opis Pracy</h4>
                <p className="text-[10px] text-slate-400 mt-0.5 font-bold font-mono">Dla dyżuru z dnia: {editingOvertimeShift.date}</p>
              </div>
              <button
                onClick={() => setEditingOvertimeShift(null)}
                type="button"
                className="text-slate-400 hover:text-slate-100 text-lg p-1 transition"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5 tracking-wider">Godzina Startu (HH:MM)</label>
                  <input
                    type="text"
                    value={otStart}
                    onChange={(e) => setOtStart(e.target.value)}
                    placeholder="e.g. 06:00"
                    className="w-full bg-slate-950 border border-slate-850 text-slate-200 px-3 py-2 focus:border-indigo-500 rounded-xl outline-none font-bold font-mono text-center tracking-widest focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5 tracking-wider">Godzina Końca (HH:MM)</label>
                  <input
                    type="text"
                    value={otEnd}
                    onChange={(e) => setOtEnd(e.target.value)}
                    placeholder="e.g. 14:00"
                    className="w-full bg-slate-950 border border-slate-850 text-slate-200 px-3 py-2 focus:border-indigo-500 rounded-xl outline-none font-bold font-mono text-center tracking-widest focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5 tracking-wider">Czas sumaryczny (godziny)</label>
                <input
                  type="text"
                  value={otWorked}
                  onChange={(e) => setOtWorked(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 text-amber-400 px-3.5 py-2.5 text-center text-sm rounded-xl outline-none font-black font-mono tracking-wider focus:border-indigo-500"
                />
                <p className="text-[10px] text-slate-500 mt-1.5">
                  Wyliczono automatycznie z czasu rozpoczęcia/zakończenia. Można zmodyfikować w razie niestandardowych przerw.
                </p>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5 tracking-wider">Uwagi / Raport o overtime i odpracowaniu</label>
                <textarea
                  rows={3}
                  value={otNote}
                  onChange={(e) => setOtNote(e.target.value)}
                  placeholder="e.g. Nadprogramowe godziny z powodu opóźnienia czarteru"
                  className="w-full bg-slate-950 border border-slate-850 text-slate-200 px-3.5 py-2.5 focus:border-indigo-500 rounded-xl outline-none font-medium leading-relaxed"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-slate-800/40">
                <button
                  type="button"
                  onClick={() => setEditingOvertimeShift(null)}
                  className="bg-slate-800 hover:bg-slate-750 text-slate-350 font-bold text-xs px-4 py-2.5 rounded-xl transition"
                >
                  Anuluj
                </button>
                <button
                  type="button"
                  onClick={handleSaveOvertime}
                  className="bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-slate-50 font-black text-xs px-5 py-2.5 rounded-xl shadow-lg transition active:scale-[0.98]"
                >
                  Zapisz Zmiany
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
