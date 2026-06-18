import React, { useEffect, useState } from 'react';
import { apiCall } from '../lib/api';

interface ControlViewProps {
  addToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export default function ControlView({ addToast }: ControlViewProps) {
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date(2026, 5, 1)); // Default June 2026

  // Lists loader info
  const [events, setEvents] = useState<any[]>([]);
  const [staffing, setStaffing] = useState<any[]>([]);
  const [deletedEvents, setDeletedEvents] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);

  // Modals state triggers
  const [activeModal, setActiveModal] = useState<'late' | 'extra' | 'absence' | 'shift' | 'delete' | 'deleted-details' | null>(null);

  // Form states
  const [formUserId, setFormUserId] = useState('');
  const [formDateStr, setFormDateStr] = useState('');
  const [formReason, setFormReason] = useState('');
  const [formDelayMinutes, setFormDelayMinutes] = useState('30');
  const [formHours, setFormHours] = useState('1');
  const [formTimeFrom, setFormTimeFrom] = useState('');
  const [formTimeTo, setFormTimeTo] = useState('');

  // Delete event states
  const [targetDeleteEventId, setTargetDeleteEventId] = useState<number | null>(null);
  const [deleteReasonText, setDeleteReasonText] = useState('');
  
  // Audited deleted event modal details
  const [selectedDeletedDetail, setSelectedDeletedDetail] = useState<any | null>(null);

  const getMonthPrefix = () => {
    return `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`;
  };

  const loadControlData = async () => {
    const ym = getMonthPrefix();
    try {
      const data = await apiCall(`/api/control/summary?month=${ym}`);
      setEvents(data.events || []);
      setStaffing(data.staffing || []);

      const deleted = await apiCall('/api/control/deleted');
      setDeletedEvents(deleted || []);

      const listUsers = await apiCall('/api/users');
      setEmployees(listUsers || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadControlData();
  }, [currentMonth]);

  // Set default form date when opening dialogs
  const openModal = (kind: 'late' | 'extra' | 'absence' | 'shift') => {
    // Select first day of currentMonth as a placeholder
    const firstDayStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-16`; // mid month
    setFormDateStr(firstDayStr);
    if (employees.length > 0) setFormUserId(String(employees[0].id));
    setFormReason('');
    setFormDelayMinutes('30');
    setFormHours('1');
    setFormTimeFrom('08:00');
    setFormTimeTo('16:00');
    setActiveModal(kind);
  };

  const handleSaveLate = async () => {
    if (!formUserId || !formDateStr || !formDelayMinutes) {
      addToast('Podaj wszystkie dane do spóźnienia', 'error');
      return;
    }
    try {
      await apiCall('/api/control/late', {
        method: 'POST',
        body: JSON.stringify({
          user_id: Number(formUserId),
          date: formDateStr,
          reason: formReason,
          delay_minutes: Number(formDelayMinutes),
          time_from: formTimeFrom,
          time_to: formTimeTo
        })
      });
      addToast('Zapisano spóźnienie pracownika', 'success');
      setActiveModal(null);
      loadControlData();
    } catch (err: any) {
      addToast(err.message || 'Błąd zapisu', 'error');
    }
  };

  const handleSaveExtra = async () => {
    if (!formUserId || !formDateStr || !formHours) {
      addToast('Uzupełnij wymagane pola', 'error');
      return;
    }
    try {
      await apiCall('/api/control/extra', {
        method: 'POST',
        body: JSON.stringify({
          user_id: Number(formUserId),
          date: formDateStr,
          reason: formReason,
          hours: Number(formHours)
        })
      });
      addToast('Zapisano dodatkowe godziny', 'success');
      setActiveModal(null);
      loadControlData();
    } catch (err: any) {
      addToast(err.message || 'Błąd', 'error');
    }
  };

  const handleSaveAbsence = async () => {
    if (!formUserId || !formDateStr) {
      addToast('Uzupełnij wymagane pola', 'error');
      return;
    }
    try {
      await apiCall('/api/control/absence', {
        method: 'POST',
        body: JSON.stringify({
          user_id: Number(formUserId),
          date: formDateStr,
          reason: formReason
        })
      });
      addToast('Zgłoszono nieobecność', 'success');
      setActiveModal(null);
      loadControlData();
    } catch (err: any) {
      addToast(err.message || 'Błąd', 'error');
    }
  };

  const handleSaveShift = async () => {
    if (!formUserId || !formDateStr || !formTimeFrom || !formTimeTo) {
      addToast('Uzupełnij dane nowej zmiany', 'error');
      return;
    }
    try {
      await apiCall('/api/control/add-shift', {
        method: 'POST',
        body: JSON.stringify({
          user_id: Number(formUserId),
          date: formDateStr,
          reason: formReason,
          from: formTimeFrom,
          to: formTimeTo
        })
      });
      addToast('Dodano nową zmianę manualną pomyślnie!', 'success');
      setActiveModal(null);
      loadControlData();
    } catch (err: any) {
      addToast(err.message || 'Błąd zapisu', 'error');
    }
  };

  const triggerDeleteConfirm = (id: number) => {
    setTargetDeleteEventId(id);
    setDeleteReasonText('');
    setActiveModal('delete');
  };

  const handleExecuteDelete = async () => {
    if (!targetDeleteEventId || !deleteReasonText.trim()) {
      addToast('Podaj powód usunięcia zdarzenia', 'error');
      return;
    }
    try {
      await apiCall('/api/control/delete', {
        method: 'POST',
        body: JSON.stringify({ id: targetDeleteEventId, reason: deleteReasonText.trim() })
      });
      addToast('Zdarzenie zostało pomyślnie usunięte z rejestru', 'success');
      setActiveModal(null);
      loadControlData();
    } catch (err: any) {
      addToast(err.message || 'Błąd usunięcia', 'error');
    }
  };

  const loadDeletedDetails = async (eventId: number) => {
    try {
      const data = await apiCall(`/api/control/deleted/${eventId}`);
      setSelectedDeletedDetail(data);
      setActiveModal('deleted-details');
    } catch (err: any) {
      addToast(err.message || 'Błąd odczytu audytu', 'error');
    }
  };

  const plLocalMonth = new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl mx-auto px-4 py-2">
      {/* QUICK INCIDENT ADD BUTTONS BAR */}
      <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg space-y-4">
        <h2 className="text-center font-bold text-slate-300 text-sm uppercase select-none tracking-wider">
          Panel kontroli frekwencji i dodawania korekt
        </h2>
        <div className="flex gap-4 justify-center items-center flex-wrap">
          <button 
            onClick={() => openModal('late')}
            className="px-5 py-3 bg-slate-950 border border-slate-700 hover:border-blue-500/50 hover:bg-blue-500/5 rounded-xl text-slate-100 font-extrabold text-sm flex items-center gap-1.5 transition active:scale-95 duration-100"
          >
            ⏰+ Spóźnienie
          </button>
          <button 
            onClick={() => openModal('extra')}
            className="px-5 py-3 bg-slate-950 border border-slate-700 hover:border-emerald-500/50 hover:bg-emerald-500/5 rounded-xl text-slate-100 font-extrabold text-sm flex items-center gap-1.5 transition active:scale-95 duration-100"
          >
            ⏱+ Nadgodziny
          </button>
          <button 
            onClick={() => openModal('absence')}
            className="px-5 py-3 bg-slate-950 border border-slate-700 hover:border-red-500/50 hover:bg-red-500/5 rounded-xl text-slate-100 font-extrabold text-sm flex items-center gap-1.5 transition active:scale-95 duration-100"
          >
            🚫+ Nieobecność
          </button>
          <button 
            onClick={() => openModal('shift')}
            className="px-5 py-3 bg-slate-950 border border-slate-700 hover:border-violet-500/50 hover:bg-violet-500/5 rounded-xl text-slate-100 font-extrabold text-sm flex items-center gap-1.5 transition active:scale-95 duration-100"
          >
            📅+ Dodaj zmianę
          </button>
        </div>
      </section>

      {/* MONTH NAVIGATION BAR */}
      <div className="flex items-center justify-between gap-4 py-2 border-b border-slate-800">
        <h2 className="text-lg font-bold text-white uppercase select-none" id="month-title">
          Wydarzenia: {plLocalMonth.format(currentMonth)}
        </h2>
        
        <div className="flex gap-2">
          <button 
            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
            className="px-3.5 py-1.5 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-bold rounded-xl transition"
          >
            ◀
          </button>
          <button 
            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
            className="px-3.5 py-1.5 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-bold rounded-xl transition"
          >
            ▶
          </button>
        </div>
      </div>

      {/* EVENTS LOG CARD */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
        <h3 className="text-sm font-bold text-slate-400 uppercase border-b border-slate-800 pb-2">
          Skrót zdarzeń w wybranym miesiącu
        </h3>

        <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
          {events.length === 0 ? (
            <div className="text-slate-550 text-sm italic py-4">Brak zgłoszonych zdarzeń w tym miesiącu.</div>
          ) : (
            events.map((e) => {
              let label = e.kind;
              let badgeColor = 'bg-slate-800 text-slate-350 border-slate-700';
              if (e.kind === 'late') { label = 'Spóźnienie'; badgeColor = 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'; }
              else if (e.kind === 'extra') { label = 'Dodatkowe h'; badgeColor = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'; }
              else if (e.kind === 'absence') { label = 'Nieobecność'; badgeColor = 'bg-red-500/10 text-red-500 border border-red-500/20'; }
              else if (e.kind === 'manual_shift') { label = 'Man. zmiana'; badgeColor = 'bg-blue-500/10 text-blue-400 border border-blue-500/20'; }

              return (
                <div key={e.id} className="flex items-center justify-between p-3.5 rounded-xl border border-slate-850 bg-slate-950/40 hover:bg-slate-950 gap-4 transition duration-150 animate-fade-in text-sm">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded ${badgeColor}`}>{label}</span>
                      <strong className="text-slate-200">{e.user}</strong>
                      <span className="text-slate-550 font-semibold font-mono text-xs">{e.date}</span>
                    </div>

                    <div className="text-xs text-slate-450 font-semibold flex items-center gap-1.5 flex-wrap">
                      {e.hours && <span>Ilość h: <strong className="text-slate-300 font-mono">{e.hours}</strong></span>}
                      {e.delay_minutes && <span>Opóźnienie: <strong className="text-slate-300 font-mono">{e.delay_minutes} min</strong></span>}
                      {e.time_from && <span>Przedział: <strong className="text-slate-300 font-mono">{e.time_from}-{e.time_to}</strong></span>}
                      {e.reason && <span className="italic text-slate-500 font-normal">({e.reason})</span>}
                    </div>
                  </div>

                  <button 
                    onClick={() => triggerDeleteConfirm(e.id)}
                    className="p-1 px-2 border border-slate-800 hover:border-red-500/50 hover:bg-red-500/5 rounded-lg text-red-400 hover:text-red-300 transition"
                    title="Usuń zdarzenie z audytem"
                  >
                    🗑️
                  </button>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* STAFFING COVERAGE NUMS DELTA CHART CARD */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
        <h3 className="text-sm font-bold text-slate-400 uppercase border-b border-slate-800 pb-2">
          Obsada i wskaźnik zapotrzebowania (Norma 12)
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-center text-xs text-slate-300 border-collapse">
            <thead>
              <tr className="bg-slate-950 border-b border-slate-800">
                <th className="py-2.5 px-3 text-left font-bold text-slate-400 uppercase">Data</th>
                <th className="py-2.5 px-3 font-bold text-slate-400 uppercase">Rano</th>
                <th className="py-2.5 px-3 font-bold text-slate-400 uppercase">Delta Rano</th>
                <th className="py-2.5 px-3 font-bold text-slate-400 uppercase">Popołudnie</th>
                <th className="py-2.5 px-3 font-bold text-slate-400 uppercase">Delta Popo</th>
              </tr>
            </thead>
            <tbody>
              {staffing.map((row, index) => {
                const remNegM = row.morning_delta < 0;
                const remNegE = row.evening_delta < 0;

                return (
                  <tr key={index} className="border-b border-slate-850 hover:bg-slate-950/20 py-2">
                    <td className="py-2 px-3 text-left font-bold text-slate-100">{row.date}</td>
                    <td className="py-2 px-3">{row.morning} szef.</td>
                    <td className={`py-2 px-3 font-mono font-bold ${remNegM ? 'text-red-400' : 'text-emerald-400'}`}>
                      {row.morning_delta >= 0 ? `+${row.morning_delta}` : row.morning_delta}
                    </td>
                    <td className="py-2 px-3">{row.evening} szef.</td>
                    <td className={`py-2 px-3 font-mono font-bold ${remNegE ? 'text-red-400' : 'text-emerald-400'}`}>
                      {row.evening_delta >= 0 ? `+${row.evening_delta}` : row.evening_delta}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* DELETED LOG AUDITS */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
        <h3 className="text-sm font-bold text-slate-400 uppercase border-b border-slate-800 pb-2">
          🗑️ Usunięte zdarzenia (Historia usunięć i audytu)
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-350 border-collapse">
            <thead>
              <tr className="bg-slate-950 border-b border-slate-800">
                <th className="py-2.5 px-3 font-bold text-slate-400 uppercase">Data usunięcia</th>
                <th className="py-2.5 px-3 font-bold text-slate-400 uppercase">Pracownik</th>
                <th className="py-2.5 px-3 font-bold text-slate-400 uppercase">Uzasadnienie</th>
                <th className="py-2.5 px-3 font-bold text-slate-400 uppercase">ID eventu</th>
              </tr>
            </thead>
            <tbody>
              {deletedEvents.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-4 text-center italic text-slate-600">Brak logów usunięć.</td>
                </tr>
              ) : (
                deletedEvents.map((l) => (
                  <tr key={l.id} className="border-b border-slate-850 hover:bg-slate-950/40">
                    <td className="py-2 px-3">{new Date(l.deleted_date).toLocaleDateString('pl-PL')}</td>
                    <td className="py-2 px-3 font-bold text-slate-100">{l.user_name}</td>
                    <td className="py-2 px-3 max-w-[200px] truncate" title={l.reason}>{l.reason}</td>
                    <td className="py-2 px-3">
                      <button 
                        onClick={() => loadDeletedDetails(l.event_id)}
                        className="text-blue-400 font-bold hover:underline"
                      >
                        #{l.event_id}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* MODALS RENDERING FLOW */}
      {activeModal && activeModal !== 'delete' && activeModal !== 'deleted-details' && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-800">
              <h3 className="text-base font-extrabold text-slate-200">
                {activeModal === 'late' && '⏰ Dodaj spóźnienie'}
                {activeModal === 'extra' && '⏱️ Dodaj dodatkowe godziny'}
                {activeModal === 'absence' && '🚫 Rejestruj nieobecność'}
                {activeModal === 'shift' && '📅 Dodaj zmianę manualną'}
              </h3>
              <button onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-slate-100 text-2xl">&times;</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Pracownik</label>
                <select 
                  value={formUserId}
                  onChange={(e) => setFormUserId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-950 text-slate-105 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {employees.map(u => (
                    <option key={u.id} value={u.id}>{u.full_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Dzień (Data)</label>
                <input 
                  type="date" 
                  value={formDateStr}
                  onChange={(e) => setFormDateStr(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-950 text-slate-100 text-sm font-semibold"
                />
              </div>

              {activeModal === 'late' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Ilość minut spóźnienia</label>
                    <input 
                      type="number" 
                      value={formDelayMinutes}
                      onChange={(e) => setFormDelayMinutes(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-950 text-slate-100 text-sm font-mono"
                      min="1"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-550 uppercase mb-1">Godzina od</label>
                      <input type="time" value={formTimeFrom} onChange={(e) => setFormTimeFrom(e.target.value)} className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-700 text-xs" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-550 uppercase mb-1">Godzina do</label>
                      <input type="time" value={formTimeTo} onChange={(e) => setFormTimeTo(e.target.value)} className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-700 text-xs" />
                    </div>
                  </div>
                </>
              )}

              {activeModal === 'extra' && (
                <div>
                  <label className="block text-xs font-bold text-slate-550 uppercase mb-1">Ilość godzin nadliczbowych</label>
                  <input 
                    type="number" 
                    value={formHours}
                    onChange={(e) => setFormHours(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-950 text-slate-100 text-sm font-semibold"
                    step="0.5" 
                    min="0.5"
                  />
                </div>
              )}

              {activeModal === 'shift' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-550 uppercase mb-1">Godzina od</label>
                    <input type="time" value={formTimeFrom} onChange={(e) => setFormTimeFrom(e.target.value)} className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-700 text-sm font-semibold" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-550 uppercase mb-1">Godzina do</label>
                    <input type="time" value={formTimeTo} onChange={(e) => setFormTimeTo(e.target.value)} className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-700 text-sm font-semibold" />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-550 uppercase mb-1">Powód / Uzasadnienie (Opcjonalnie)</label>
                <input 
                  type="text" 
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-950 text-slate-100 text-sm placholder-slate-550"
                  placeholder="np. korekta planu..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-3 border-t border-slate-800">
              <button 
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 bg-transparent border border-slate-700 hover:border-slate-500 rounded-xl text-slate-350 text-sm font-semibold transition"
              >
                Anuluj
              </button>
              <button 
                onClick={() => {
                  if (activeModal === 'late') handleSaveLate();
                  else if (activeModal === 'extra') handleSaveExtra();
                  else if (activeModal === 'absence') handleSaveAbsence();
                  else if (activeModal === 'shift') handleSaveShift();
                }}
                className="px-5 py-2 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-xl text-slate-950 text-sm font-bold hover:opacity-95 transition animate-fade-in"
              >
                Zapisz
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LOG EVENT REMOVAL AUDITED MODAL RE-CONFIRM */}
      {activeModal === 'delete' && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-extrabold text-red-400 flex items-center gap-1.5 border-b border-slate-800 pb-2">
              ⚠️ Potwierdź usunięcie zdarzenia
            </h3>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Podaj powód usunięcia audytu:</label>
              <textarea 
                value={deleteReasonText}
                onChange={(e) => setDeleteReasonText(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-755 bg-slate-950 text-slate-100 text-xs placeholder-slate-550 h-20 outline-none"
                placeholder="np. omyłkowe zgłoszenie, spóźnienie odwołane..."
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setActiveModal(null)} className="px-3.5 py-1.5 text-xs border border-slate-700 hover:border-slate-500 rounded-lg font-semibold text-slate-300 transition">Anuluj</button>
              <button onClick={handleExecuteDelete} className="px-4 py-1.5 text-xs bg-red-500 text-white rounded-lg font-bold hover:opacity-95 transition">Usuń</button>
            </div>
          </div>
        </div>
      )}

      {/* EVENT DETAILED AUDIT MODAL LOG */}
      {activeModal === 'deleted-details' && selectedDeletedDetail && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center mb-1 pb-1 border-b border-slate-800">
              <h3 className="text-base font-bold text-slate-205 flex items-center gap-1.5">
                🗑️ Szczegóły usuniętego zdarzenia
              </h3>
              <button onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-slate-100 text-xl">&times;</button>
            </div>

            <div className="space-y-2 text-xs text-slate-350">
              <p><b>Event ID:</b> #{selectedDeletedDetail.event_id}</p>
              <p><b>Zdarzenie miało charakter:</b> <span className="text-slate-100 font-bold uppercase">{selectedDeletedDetail.kind}</span></p>
              <p><b>Zdarzenie z dnia:</b> {selectedDeletedDetail.event_date}</p>
              <p><b>Faktycznie zgłoszone h:</b> {selectedDeletedDetail.hours || '—'}</p>
              <p><b>Pracownik:</b> <span className="text-slate-100 font-bold">{selectedDeletedDetail.user_name}</span></p>
              
              <hr className="border-slate-805" />

              <p><b>Zdarzenie usunięte przez:</b> <span className="text-emerald-400 font-bold">{selectedDeletedDetail.deleted_by_name}</span></p>
              <p><b>Moment usunięcia:</b> {new Date(selectedDeletedDetail.deleted_date).toLocaleDateString('pl-PL')}</p>
              <p><b>Powód usunięcia audytu:</b> <span className="text-slate-200 block bg-slate-950 p-2.5 rounded-lg border border-slate-850 mt-1 italic">"{selectedDeletedDetail.reason}"</span></p>
            </div>

            <div className="flex justify-end pt-3">
              <button onClick={() => setActiveModal(null)} className="px-4 py-2 bg-slate-850 hover:bg-slate-800 rounded-xl text-slate-300 text-xs font-bold transition">Zamknij</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
