import React, { useEffect, useState } from 'react';
import { apiCall, currentClaims } from '../lib/api';

interface StartViewProps {
  addToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onNavigate: (tab: string) => void;
}

export default function StartView({ addToast, onNavigate }: StartViewProps) {
  const [todayIso, setTodayIso] = useState('');
  const [todayHeader, setTodayHeader] = useState('Dziś...');
  const [shiftStatus, setShiftStatus] = useState('Ładowanie...');
  const [dayCache, setDayCache] = useState<{ morning: any[]; evening: any[] }>({ morning: [], evening: [] });
  const [activeShiftTab, setActiveShiftTab] = useState<'morning' | 'evening'>('morning');
  const [notes, setNotes] = useState<any[]>([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [myClaims, setMyClaims] = useState<any>(null);

  // Get current date under Polish locale Europe/Warsaw
  useEffect(() => {
    const claims = currentClaims();
    setMyClaims(claims);

    const calcWarsawDate = () => {
      let dy = new Date().getDate();
      let mn = new Date().getMonth() + 1;
      let yr = new Date().getFullYear();

      try {
        const parts = new Intl.DateTimeFormat('pl-PL', {
          timeZone: 'Europe/Warsaw',
          year: 'numeric',
          month: 'numeric',
          day: 'numeric'
        }).formatToParts(new Date());

        parts.forEach(p => {
          if (p.type === 'day') dy = Number(p.value);
          else if (p.type === 'month') mn = Number(p.value);
          else if (p.type === 'year') yr = Number(p.value);
        });
      } catch (e) {
        console.error('Failed to get Warsaw time parts:', e);
      }

      const formattedIso = `${yr}-${String(mn).padStart(2, '0')}-${String(dy).padStart(2, '0')}`;
      setTodayIso(formattedIso);

      try {
        const utcDate = new Date(Date.UTC(yr, mn - 1, dy));
        const plWd = new Intl.DateTimeFormat('pl-PL', { weekday: 'long' }).format(utcDate);
        const plShortDate = new Intl.DateTimeFormat('pl-PL', { day: '2-digit', month: '2-digit' }).format(utcDate);
        setTodayHeader(`Dziś, ${plWd} ${plShortDate}`);
      } catch (e) {
        setTodayHeader('Dziś');
      }
    };

    calcWarsawDate();
  }, []);

  const loadTodayShiftsAndNotes = async (iso: string) => {
    if (!iso) return;
    try {
      // 1. Load Shifts
      const dayData = await apiCall(`/api/day-shifts?date=${iso}`);
      const morningList = dayData.morning || [];
      const eveningList = dayData.evening || [];
      setDayCache({ morning: morningList, evening: eveningList });

      // Determine logged-in user shifts
      const myName = myClaims?.full_name || '';
      const worksM = morningList.find((p: any) => p.full_name === myName);
      const worksE = eveningList.find((p: any) => p.full_name === myName);
      const myShift = worksM || worksE;

      if (myShift) {
        setShiftStatus(`Masz dziś zmianę: ${myShift.shift_code}`);
        setActiveShiftTab(worksM ? 'morning' : 'evening');
      } else {
        setShiftStatus('Dziś masz wolne.');
      }

      // 2. Load Notes
      const notesData = await apiCall(`/api/day-notes?date=${iso}`);
      setNotes(notesData || []);
    } catch (err: any) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (todayIso && myClaims) {
      loadTodayShiftsAndNotes(todayIso);
    }
  }, [todayIso, myClaims]);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteText.trim()) return;
    try {
      await apiCall('/api/day-notes', {
        method: 'POST',
        body: JSON.stringify({ date: todayIso, text: newNoteText.trim() })
      });
      setNewNoteText('');
      addToast('Dodano notatkę', 'success');
      // Reload notes only
      const notesData = await apiCall(`/api/day-notes?date=${todayIso}`);
      setNotes(notesData || []);
    } catch (err: any) {
      addToast(err.message || 'Błąd dodawania notatki', 'error');
    }
  };

  const handleDeleteNote = async (id: number) => {
    try {
      await apiCall(`/api/day-notes/${id}`, { method: 'DELETE' });
      addToast('Usunięto notatkę', 'info');
      setNotes(notes.filter(n => n.id !== id));
    } catch (err: any) {
      addToast(err.message || 'Błąd usuwania notatki', 'error');
    }
  };

  const getSortWeight = (p: any) => {
    const isCoord = !!p.is_coordinator;
    const lounge = (p.coord_lounge || p.lounge || '').toLowerCase();
    const isBar = p.is_bar_today;
    const isZ = !!p.is_zmiwaka;

    if (isZ) return 999;
    if (isCoord && lounge === 'polonez') return 1;
    if (isBar) return 2;
    if (lounge === 'polonez') return 3;
    if (isCoord && lounge === 'mazurek') return 4;
    if (lounge === 'mazurek') return 5;
    return 6;
  };

  const currentColleagues = (activeShiftTab === 'morning' ? dayCache.morning : dayCache.evening)
    .slice()
    .sort((a, b) => getSortWeight(a) - getSortWeight(b));

  const formatNoteTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' });
    } catch (e) {
      return '';
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl mx-auto px-4 py-2">
      {/* TODAY HERO HEADER */}
      <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden"
               style={{
                 backgroundImage: 'linear-gradient(210deg, #101a2b 0%, transparent 60%)'
               }}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white mb-2" id="today-title">
              {todayHeader}
            </h1>
            <div className="text-slate-400 font-medium text-sm md:text-base flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping inline-block"></span>
              <span className="text-slate-300 font-semibold">{shiftStatus}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => todayIso && loadTodayShiftsAndNotes(todayIso)}
              className="px-4 py-2 bg-slate-850 hover:bg-slate-800 text-slate-300 text-xs font-bold rounded-xl border border-slate-700 transition active:scale-95"
            >
              Odśwież
            </button>
            <button 
              onClick={() => onNavigate('dashboard')}
              className="px-4 py-2 bg-gradient-to-r from-blue-500 to-emerald-500 hover:opacity-90 text-slate-950 text-xs font-bold rounded-xl transition active:scale-95"
            >
              Mój Kalendarz
            </button>
          </div>
        </div>
      </section>

      {/* TODAY'S TEAM SECTION */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
        <h3 className="text-base font-bold text-slate-300 border-b border-slate-800 pb-2 flex items-center gap-2">
          🤝 Dziś w pracy
        </h3>

        {/* Tab Switcher */}
        <div className="flex gap-2">
          <button 
            onClick={() => setActiveShiftTab('morning')}
            className={`pill tab px-5 py-2 rounded-full font-bold text-xs uppercase transition border ${
              activeShiftTab === 'morning'
                ? 'bg-blue-500/10 text-white border-blue-500/50 shadow-[inset_0_0_0_2px_rgba(59,130,246,0.22)]'
                : 'bg-transparent text-slate-400 border-slate-800 hover:border-slate-700'
            }`}
          >
            Rano (Zmiana 1) · {dayCache.morning.length}
          </button>
          <button 
            onClick={() => setActiveShiftTab('evening')}
            className={`pill tab px-5 py-2 rounded-full font-bold text-xs uppercase transition border ${
              activeShiftTab === 'evening'
                ? 'bg-purple-500/10 text-white border-purple-500/50 shadow-[inset_0_0_0_2px_rgba(166,107,255,0.22)]'
                : 'bg-transparent text-slate-400 border-slate-800 hover:border-slate-700'
            }`}
          >
            Popo (Zmiana 2) · {dayCache.evening.length}
          </button>
        </div>

        {/* Colleagues Chips List */}
        <div className="flex flex-wrap gap-2.5 pt-2">
          {currentColleagues.length === 0 ? (
            <div className="text-slate-500 text-sm italic py-2">Brak obsady na tę zmianę.</div>
          ) : (
            currentColleagues.map((p: any, idx: number) => {
              const looksBar = /(^|[\/\s])B($|[\/\s])/i.test(String(p.shift_code || ''));
              const isBar = p.is_bar_today ?? looksBar;
              const isZ = p.is_zmiwaka;
              const lounge = String(p.lounge || '').toLowerCase();
              const coordLounge = String(p.coord_lounge || '').toLowerCase();

              // Style matching priority
              let frameClass = '';
              if (isZ) frameClass = 'chip-zmywak-ring';
              else if (isBar) frameClass = 'chip-polonez';
              else if (lounge === 'mazurek' || lounge === 'polonez') frameClass = `chip-${lounge}`;

              // Coord visual highlight overrides
              let customStyle: React.CSSProperties = {};
              if (p.is_coordinator && coordLounge) {
                if (coordLounge === 'mazurek') customStyle = { boxShadow: 'inset 0 0 0 2px rgba(42,110,245,.45)' };
                else if (coordLounge === 'polonez') customStyle = { boxShadow: 'inset 0 0 0 2px rgba(255,214,74,.55)' };
              }

              return (
                <div 
                  key={`${p.user_id || idx}-${p.id || idx}-${idx}`} 
                  className={`person-chip flex items-center gap-2 ${frameClass}`}
                  style={customStyle}
                >
                  <span className="font-bold text-white text-sm">{p.full_name}</span>
                  
                  {isBar && (
                    <span className="badge badge-bar">Bar</span>
                  )}
                  
                  {p.is_coordinator && (
                    <span className={`badge badge-coord ${coordLounge === 'mazurek' ? 'lounge-mazurek' : coordLounge === 'polonez' ? 'lounge-polonez' : ''}`}>
                      Koordynator
                    </span>
                  )}
                  
                  {isZ && (
                    <span className="badge badge-zmiwak font-semibold">Zmywak</span>
                  )}

                  {/* Clean code label i.e. "2/B" -> "2" */}
                  {p.shift_code && (
                    <span className="badge badge-shift font-mono">
                      {String(p.shift_code).replace(/\s+/g, '').replace('/B', '').replace('B', '')}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
