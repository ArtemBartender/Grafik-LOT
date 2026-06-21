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
    <div className="space-y-6">
      {/* HEADER WITH MONTH PICKER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/40 border border-slate-800/60 p-4 rounded-2xl backdrop-blur-md">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <span>📊</span> Statystyki i Zarobki
          </h2>
          <p className="text-xs text-slate-400 mt-1">Ewidencja wypracowanych godzin i prognoza wynagrodzenia netto</p>
        </div>

        <div className="flex items-center justify-center gap-2 bg-slate-950/40 border border-slate-800 p-1.5 rounded-xl self-start md:self-auto">
          <button
            onClick={() => changeMonth(-1)}
            type="button"
            className="p-1 px-3 hover:bg-slate-800 text-slate-300 hover:text-slate-100 rounded-lg text-sm transition-all"
          >
            ←
          </button>
          <span className="text-sm font-semibold capitalize px-3 text-emerald-400">
            {plLocalMonth.format(currentMonth)}
          </span>
          <button
            onClick={() => changeMonth(1)}
            type="button"
            className="p-1 px-3 hover:bg-slate-800 text-slate-300 hover:text-slate-100 rounded-lg text-sm transition-all"
          >
            →
          </button>
        </div>
      </div>

      {/* KPI DASHBOARDS AND RATES */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* KPI: HOURS */}
        <div className="bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl p-5 rounded-2xl flex flex-col justify-between hover:border-slate-700/60 transition-all duration-300 shadow-md">
          <div className="flex items-start justify-between">
            <span className="text-3xl">⏱️</span>
            <div className="text-right">
              <span className="text-xs font-semibold px-2 py-1 bg-indigo-500/15 text-indigo-400 border border-indigo-500/25 rounded-md">
                Czas Pracy
              </span>
            </div>
          </div>
          <div className="mt-8">
            <h4 className="text-sm font-medium text-slate-400">Wypracowane godziny</h4>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-bold text-emerald-400">{hoursDone.toFixed(1)}</span>
              <span className="text-xs text-slate-400">godz.</span>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
            <span>Do odpracowania:</span>
            <span className="font-semibold text-amber-400">{hoursLeft.toFixed(1)} godz.</span>
          </div>
        </div>

        {/* KPI: NET INCOME */}
        <div className="bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl p-5 rounded-2xl flex flex-col justify-between hover:border-slate-700/60 transition-all duration-300 shadow-md">
          <div className="flex items-start justify-between">
            <span className="text-3xl">💵</span>
            <div className="text-right">
              <span className="text-xs font-semibold px-2 py-1 bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 rounded-md">
                Aktualny Zysk
              </span>
            </div>
          </div>
          <div className="mt-8">
            <h4 className="text-sm font-medium text-slate-400">Zarobek netto (na rękę)</h4>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-bold text-slate-100">{netDone.toLocaleString('pl-PL')}</span>
              <span className="text-xs text-slate-300">PLN</span>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
            <span>Prognoza na koniec miesiąca:</span>
            <span className="font-semibold text-emerald-400">{netAll.toLocaleString('pl-PL')} PLN</span>
          </div>
        </div>

        {/* CONFIG RATES CONFIG BOX */}
        <div className="bg-gradient-to-br from-slate-900/80 to-slate-950/80 border border-slate-800/80 p-5 rounded-2xl backdrop-blur-xl shadow-lg">
          <h3 className="text-sm font-bold text-indigo-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <span>⚙️</span> Twoje Parametry Rozliczeń
          </h3>
          <div className="space-y-3.5">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                Stawka za godzinę (PLN brutto)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 text-slate-100 text-sm rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                  Tax i ZUS (%)
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={tax}
                  onChange={(e) => setTax(e.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 text-slate-100 text-sm rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                  Premia (%)
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={bonus}
                  onChange={(e) => setBonus(e.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 text-slate-100 text-sm rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                />
              </div>
            </div>
            <button
              onClick={handleSaveSettings}
              type="button"
              className="mt-2 w-full py-2 bg-indigo-600 hover:bg-indigo-500 font-semibold text-slate-100 text-xs rounded-xl shadow-md transition-all active:translate-y-0.5"
            >
              Zapisz parametry rozliczeń
            </button>
          </div>
        </div>

      </div>

      {/* DALLY HORSE GRAPH/HEATMAP PROGRESS */}
      {dailyHours.length > 0 && (
        <div className="bg-slate-900/40 border border-slate-800/60 p-5 rounded-2xl">
          <h3 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2">
            <span>📈</span> Wykres aktywności (przepracowane godziny w dniach)
          </h3>
          <div className="overflow-x-auto pb-2">
            <div className="flex items-end gap-1.5 min-w-[600px] h-32 pt-6">
              {dailyHours.map((bar, idx) => {
                const heightPct = Math.min(100, (bar.hours / 12) * 100);
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center group relative cursor-pointer">
                    {/* Tooltip */}
                    <div className="absolute top-[-26px] hidden group-hover:block bg-slate-950 border border-slate-700 text-[10px] text-slate-200 px-1.5 py-0.5 rounded shadow-lg z-20 whitespace-nowrap">
                      {bar.hours.toFixed(1)} godz.
                    </div>
                    {/* Bar */}
                    <div className="w-full relative rounded-t-sm transition-all" style={{ height: `${heightPct}%` }}>
                      <div className={`absolute inset-0 rounded-t-sm ${
                        bar.done ? 'bg-gradient-to-t from-emerald-600 to-emerald-400' : 'bg-gradient-to-t from-indigo-800 to-indigo-500 opacity-60'
                      }`} />
                    </div>
                    {/* Label */}
                    <span className="text-[10px] text-slate-500 mt-2 font-mono">{bar.date}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-4 mt-3 text-[11px] text-slate-400 font-medium border-t border-slate-800/40 pt-3">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-gradient-to-t from-emerald-600 to-emerald-400 rounded-sm" />
              <span>Dni zaliczone / zakończone</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-gradient-to-t from-indigo-800 to-indigo-500 opacity-60 rounded-sm" />
              <span>Plany i przyszłe harmonogramy</span>
            </div>
          </div>
        </div>
      )}

      {/* SHIFTS LIST SUMMARY FOR EDITS */}
      <div className="bg-slate-900/40 border border-slate-800/60 p-5 rounded-2xl">
        <h3 className="text-sm font-bold text-slate-200 mb-4 flex items-center gap-2">
          <span>📋</span> Zarządzanie czasem pracy w wybranym miesiącu
        </h3>

        {myBriefShifts.length === 0 ? (
          <div className="text-center py-8 text-sm text-slate-500 border border-dashed border-slate-800 rounded-xl">
            Nie znaleziono Twoich zmian w tym miesiącu w systemie.
          </div>
        ) : (
          <div className="overflow-x-auto text-slate-300">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-3">Data</th>
                  <th className="py-3 px-3">Kod zmiany</th>
                  <th className="py-3 px-3">Czas zaplanowany</th>
                  <th className="py-3 px-3">Przepracowano</th>
                  <th className="py-3 px-3">Salon / Lounge</th>
                  <th className="py-3 px-3">Uwagi / Notatka</th>
                  <th className="py-3 px-3 text-right">Opcje</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850/60">
                {myBriefShifts.map((shift) => (
                  <tr key={shift.id} className="hover:bg-slate-900/30 transition-colors">
                    <td className="py-3 px-3 font-medium text-slate-300 font-mono">{shift.date}</td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 bg-slate-800/80 text-slate-100 rounded border border-slate-700 font-semibold font-mono">
                        {shift.code}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-400">{shift.scheduled_hours} godz.</td>
                    <td className="py-3 px-3">
                      <span className={`font-semibold ${shift.worked_hours !== shift.scheduled_hours ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {shift.worked_hours} godz.
                      </span>
                    </td>
                    <td className="py-3 px-3 capitalize text-teal-400 font-medium">{shift.lounge}</td>
                    <td className="py-3 px-3 max-w-[140px] truncate text-slate-400 italic" title={shift.note || ''}>
                      {shift.note || '—'}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="inline-flex gap-1.5">
                        <button
                          onClick={() => handleOpenOvertime(shift.id)}
                          type="button"
                          className="bg-indigo-600/30 hover:bg-indigo-600 text-indigo-300 hover:text-white px-2.5 py-1 text-[11px] rounded transition-all font-semibold"
                        >
                          ✎ Godziny
                        </button>
                        <button
                          onClick={() => handlePostToMarket(shift.id)}
                          type="button"
                          className="bg-emerald-600/30 hover:bg-emerald-600 text-emerald-300 hover:text-white px-2.5 py-1 text-[11px] rounded transition-all font-semibold"
                        >
                          ⇆ Na Giełdę
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

      {/* MONTH NOTES ARCHIVE */}
      {monthNotes.length > 0 && (
        <div className="bg-slate-900/30 border border-slate-800/40 p-5 rounded-2xl">
          <h3 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
            <span>📝</span> Dziennik uwag i notatek raportowanych w tym miesiącu
          </h3>
          <div className="space-y-2 mt-3">
            {monthNotes.map((n, idx) => (
              <div key={idx} className="bg-slate-900/50 border border-slate-850 p-2.5 rounded-xl text-xs flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                <div>
                  <span className="font-mono text-emerald-400 font-semibold mr-2">[{n.date}]</span>
                  <span className="text-slate-200">{n.note}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DIALOG: OVERTIME AND HOURS WORKLOG EDITOR */}
      {editingOvertimeShift && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-900 to-slate-900 p-4 border-b border-slate-800 flex justify-between items-center">
              <div>
                <h4 className="text-slate-100 font-bold text-sm">Zmień Godziny i Opis Pracy</h4>
                <p className="text-[11px] text-slate-300 mt-0.5 font-mono">Dla zmiany w dniu: {editingOvertimeShift.date}</p>
              </div>
              <button
                onClick={() => setEditingOvertimeShift(null)}
                type="button"
                className="text-slate-400 hover:text-slate-100 text-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Godzina Startu (HH:MM)</label>
                  <input
                    type="text"
                    value={otStart}
                    onChange={(e) => setOtStart(e.target.value)}
                    placeholder="e.g. 06:00"
                    className="w-full bg-slate-950 border border-slate-850 text-slate-100 px-3 py-1.5 focus:border-indigo-500 rounded-lg outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Godzina Końca (HH:MM)</label>
                  <input
                    type="text"
                    value={otEnd}
                    onChange={(e) => setOtEnd(e.target.value)}
                    placeholder="e.g. 14:00"
                    className="w-full bg-slate-950 border border-slate-850 text-slate-100 px-3 py-1.5 focus:border-indigo-500 rounded-lg outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Wypracowany ułamkowy czas (Suma godzin)</label>
                <input
                  type="text"
                  value={otWorked}
                  onChange={(e) => setOtWorked(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 text-amber-400 px-3 py-1.5 text-sm rounded-lg outline-none font-bold font-mono"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Obliczono automatycznie na podstawie godzin startu i końca. Można zmienić ręcznie w razie potrzeby.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Konkretny komentarz i uwagi (overtime)</label>
                <textarea
                  rows={2.5}
                  value={otNote}
                  onChange={(e) => setOtNote(e.target.value)}
                  placeholder="e.g. Nadprogramowe 2.5 godziny z powodu opóźnienia zmian"
                  className="w-full bg-slate-950 border border-slate-850 text-slate-200 px-3 py-1.5 focus:border-indigo-500 rounded-lg outline-none"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setEditingOvertimeShift(null)}
                  className="bg-slate-800 hover:bg-slate-750 text-slate-300 font-semibold text-xs px-4 py-2 rounded-lg transition-all"
                >
                  Anuluj
                </button>
                <button
                  type="button"
                  onClick={handleSaveOvertime}
                  className="bg-gradient-to-r from-emerald-600 to-teal-500 text-slate-50 font-bold text-xs px-4 py-2 rounded-lg shadow-md hover:from-emerald-500 hover:to-teal-400 transition-all active:scale-[0.98]"
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
