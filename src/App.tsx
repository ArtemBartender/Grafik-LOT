import React, { useEffect, useState, useRef } from 'react';
import { getToken, removeToken, currentClaims, apiCall } from './lib/api';

// Imports of core submodules
import AuthView from './components/AuthView';
import StartView from './components/StartView';
import CalendarView from './components/CalendarView';
import StatsView from './components/StatsView';
import ProposalsView from './components/ProposalsView';
import MarketView from './components/MarketView';
import ControlView from './components/ControlView';
import AdminView from './components/AdminView';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

function isShiftCodeMorning(code: string): boolean {
  const norm = String(code || '').trim().toLowerCase();
  if (norm.includes('rano') || norm.startsWith('r')) {
    return true;
  }
  if (norm.includes('popo') || norm.startsWith('p')) {
    return false;
  }
  
  const hourMatch = norm.match(/^(\d{1,2})/);
  if (hourMatch) {
    const hr = parseInt(hourMatch[1], 10);
    if (hourMatch[1].length > 1 || hr > 2) {
      return hr >= 4 && hr <= 12;
    }
    if (hr === 1) return true;
    if (hr === 2) return false;
  }
  
  return norm.startsWith('1');
}

function isShiftCodeAfternoon(code: string): boolean {
  const norm = String(code || '').trim().toLowerCase();
  if (norm.includes('popo') || norm.startsWith('p')) {
    return true;
  }
  if (norm.includes('rano') || norm.startsWith('r')) {
    return false;
  }
  
  const hourMatch = norm.match(/^(\d{1,2})/);
  if (hourMatch) {
    const hr = parseInt(hourMatch[1], 10);
    if (hourMatch[1].length > 1 || hr > 2) {
      return hr >= 13 && hr <= 23;
    }
    if (hr === 1) return false;
    if (hr === 2) return true;
  }
  
  return norm.startsWith('2');
}

export default function App() {
  const [token, setTokenState] = useState<string | null>(null);
  const [claims, setClaims] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState('start');

  // Floating messages state
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);

  // Profile shift list (Mój grafik) tab states
  const [myShifts, setMyShifts] = useState<any[]>([]);
  const [dashboardMonth, setDashboardMonth] = useState<Date>(new Date(2026, 5, 1)); // June 2026 default seed alignment
  const [dashboardFilter, setDashboardFilter] = useState<'all' | 'rano' | 'popo'>('all');
  const [dashboardLayout, setDashboardLayout] = useState<'grid' | 'agenda'>('grid');
  const [dashboardSubTab, setDashboardSubTab] = useState<'calendar' | 'statistics'>('calendar');

  // Change Password dialog (while logged in)
  const [showPassModal, setShowPassModal] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  
  // Menu collapse for mobile navigation
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // States for "Przychodzę dodatkowo" (I am coming additionally)
  const [showExtraModal, setShowExtraModal] = useState(false);
  const [extraDate, setExtraDate] = useState('');
  const [extraCode, setExtraCode] = useState('1'); // standard options: '1', '2', '1/B', '2/B'
  const [extraLounge, setExtraLounge] = useState('polonez'); // 'polonez' or 'mazurek'
  const [extraIsZmiwaka, setExtraIsZmiwaka] = useState(false);

  // Password strength meter states matching user criteria ("Słabe", "Dobre", "Świetne")
  const [passStrength, setPassStrength] = useState('');
  const [strengthColor, setStrengthColor] = useState('text-slate-500');

  const [activeProposalsCount, setActiveProposalsCount] = useState<number>(0);
  const [activeMarketCount, setActiveMarketCount] = useState<number>(0);

  const loadProposalsCount = async () => {
    if (!token) return;
    try {
      const data = await apiCall('/api/proposals');
      let count = 0;
      if (data.incoming) {
        count += data.incoming.filter((p: any) => p.status === 'pending').length;
      }
      if (data.for_approval) {
        count += data.for_approval.filter((p: any) => p.status === 'accepted').length;
      }
      setActiveProposalsCount(count);
    } catch (e) {
      console.error(e);
    }
  };

  const loadMarketCount = async () => {
    if (!token) return;
    try {
      const data = await apiCall('/api/market/offers');
      let count = 0;
      if (data.open) {
        count += data.open.filter((o: any) => o.status === 'open').length;
      }
      if (data.mine) {
        count += data.mine.filter((o: any) => o.status === 'requested').length;
      }
      setActiveMarketCount(count);
    } catch (e) {
      console.error(e);
    }
  };

  const loadAllCounts = () => {
    loadProposalsCount();
    loadMarketCount();
  };

  useEffect(() => {
    if (token) {
      loadAllCounts();
      const interval = setInterval(loadAllCounts, 15000);
      return () => clearInterval(interval);
    }
  }, [token]);

  // Submit adding extra shift
  const handleAddExtraShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extraDate || !extraCode) {
      addToast('Wybierz datę oraz kod zmiany!', 'error');
      return;
    }
    try {
      await apiCall('/api/shifts/extra', {
        method: 'POST',
        body: JSON.stringify({
          date: extraDate,
          shift_code: extraCode,
          lounge: extraLounge,
          is_zmiwaka: extraIsZmiwaka
        })
      });
      addToast('Pomyślnie zgłoszono Twoje przyjście dodatkowe! Zmiana jest już w grafiku.', 'success');
      setShowExtraModal(false);
      // Reset form
      setExtraDate('');
      setExtraCode('1');
      setExtraLounge('polonez');
      setExtraIsZmiwaka(false);
      // Reload schedule listing
      loadMyShiftsList();
    } catch (err: any) {
      addToast(err.message || 'Błąd przy zgłaszaniu zmiany', 'error');
    }
  };

  // Drop or delete shift from owner schedule
  const handleDropShift = async (shiftId: number) => {
    if (!window.confirm('Czy na pewno chcesz usunąć tę zmianę ze swojego grafiku (oddać ją)? Ta operacja zostanie zarejestrowana.')) {
      return;
    }
    try {
      await apiCall(`/api/shifts/${shiftId}`, {
        method: 'DELETE'
      });
      addToast('Zmiana została pomyślnie usunięta z Twojego grafiku.', 'success');
      loadMyShiftsList();
    } catch (err: any) {
      addToast(err.message || 'Błąd przy usuwaniu zmiany', 'error');
    }
  };

  useEffect(() => {
    const checkAuthStatus = async () => {
      const stored = getToken();
      if (stored) {
        try {
          // Attempt to fetch settings to verify token validity
          await apiCall('/api/me/settings');
          setTokenState(stored);
          setClaims(currentClaims());
        } catch (e) {
          console.error('Initial token verification failed, clearing session:', e);
          removeToken();
          setTokenState(null);
          setClaims(null);
        }
      } else {
        setTokenState(null);
        setClaims(null);
      }
    };
    checkAuthStatus();
  }, []);

  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const removeToast = (id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const handleLogout = () => {
    removeToken();
    setTokenState(null);
    setClaims(null);
    setActiveTab('start');
    addToast('Wylogowano pomyślnie z systemu', 'info');
  };

  const handleLoginSuccess = () => {
    const stored = getToken();
    setTokenState(stored);
    const decoded = currentClaims();
    setClaims(decoded);
    addToast(`Witaj z powrotem, ${decoded?.full_name || 'Użytkowniku'}!`, 'success');
  };

  // Pull individual user shifts list inside Dashboard
  const loadMyShiftsList = async () => {
    if (!token) return;
    try {
      const year = dashboardMonth.getFullYear();
      const month = dashboardMonth.getMonth() + 1;
      const data = await apiCall(`/api/my-shifts-brief?month=${year}-${String(month).padStart(2, '0')}`);
      setMyShifts(data || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (token && activeTab === 'dashboard') {
      loadMyShiftsList();
    }
  }, [token, activeTab, dashboardMonth]);

  // Track password strength
  useEffect(() => {
    if (!newPassword) {
      setPassStrength('');
      return;
    }
    const hasLetters = /[a-zA-Z]/.test(newPassword);
    const hasNumbers = /[0-9]/.test(newPassword);
    const hasSpecial = /[^a-zA-Z0-9]/.test(newPassword);

    const length = newPassword.length;
    if (length < 6) {
      setPassStrength('Słabe');
      setStrengthColor('text-red-400');
    } else if (length >= 6 && hasLetters && hasNumbers && !hasSpecial) {
      setPassStrength('Dobre');
      setStrengthColor('text-blue-400');
    } else if (length >= 8 && hasLetters && hasNumbers && hasSpecial) {
      setPassStrength('Świetne');
      setStrengthColor('text-emerald-400');
    } else {
      setPassStrength('Dobre');
      setStrengthColor('text-blue-400');
    }
  }, [newPassword]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword || !newPassword) {
      addToast('Wprowadź stare i nowe hasło!', 'error');
      return;
    }
    try {
      await apiCall('/api/password/change', {
        method: 'POST',
        body: JSON.stringify({ stare_haslo: oldPassword, nowe_haslo: newPassword })
      });
      addToast('Hasło zostało pomyślnie zaktualizowane', 'success');
      setShowPassModal(false);
      setOldPassword('');
      setNewPassword('');
    } catch (err: any) {
      addToast(err.message || 'Błąd zmiany hasła', 'error');
    }
  };

  // If not logged in, render authentication layout directly
  if (!token) {
    return (
      <div className="min-h-screen bg-[#0b0d10] font-sans flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
        {/* Decorative celestial grid rings */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] border border-slate-800/20 rounded-full select-none pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] border border-dashed border-slate-800/25 rounded-full select-none pointer-events-none animate-spin-slow" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] border border-slate-800/10 rounded-full select-none pointer-events-none" />

        <div className="relative z-10">
          <AuthView onLoginSuccess={handleLoginSuccess} addToast={addToast} />
        </div>

        {/* Floating Custom Stacked Toasts */}
        <div className="absolute bottom-6 right-6 z-50 space-y-2 pointer-events-auto">
          {toasts.map(t => (
            <div 
              key={t.id}
              onClick={() => removeToast(t.id)}
              className={`flex items-center justify-between p-4 rounded-xl shadow-2xl border cursor-pointer animate-slide-in text-sm font-bold max-w-sm ${
                t.type === 'success' 
                  ? 'bg-[#0f1d17] text-emerald-400 border-emerald-500/30' 
                  : t.type === 'error' 
                    ? 'bg-[#221010] text-red-400 border-red-500/30' 
                    : 'bg-[#101925] text-blue-400 border-blue-500/30'
              }`}
            >
              <span>{t.message}</span>
              <button className="ml-4 opacity-50 hover:opacity-100 font-bold">&times;</button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const role = claims?.role || 'user';
  const myName = claims?.full_name || 'Użytkownik';

  // Format month labels for simple dashboard list
  const plLocalMonth = new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' });

  return (
    <div className="min-h-screen bg-[#0b0d10] text-slate-100 flex flex-col font-sans select-none">
      {/* BRANDING TOP HEADER ROW */}
      <header className="bg-slate-900 border-b border-slate-850 px-6 py-4 flex items-center justify-between sticky top-0 z-40 backdrop-blur-md bg-opacity-90">
        <div className="flex items-center gap-2">
          {/* Logo badge */}
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-500/80 to-emerald-400/80 flex items-center justify-center font-black text-slate-950 font-mono text-sm leading-none">
            L
          </div>
          <div>
            <h1 className="text-sm font-black tracking-wider text-slate-100 uppercase font-mono">
              Grafik LOT
            </h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-none">
              Warszawa Lounge Scheduler
            </p>
          </div>
        </div>

        {/* DESKTOP METADATA WRAPPER */}
        <div className="hidden md:flex items-center gap-4">
          <div className="text-right">
            <span className="text-xs text-slate-400">Zalogowany: </span>
            <strong className="text-xs text-slate-200">{myName}</strong>
            <div className="text-[10px] font-bold text-slate-550 uppercase">
              Rola: <span className="text-emerald-400 font-extrabold">{role === 'admin' ? 'Michał / Robert (Admin)' : role === 'coordinator' ? 'Koordynator' : 'Pracownik (Waiters/Bar)'}</span>
            </div>
          </div>

          <button 
            onClick={() => setShowPassModal(true)}
            className="px-3 py-1.5 bg-slate-850 hover:bg-slate-800 text-slate-300 text-xs font-semibold rounded-lg transition"
          >
            Hasło 🔑
          </button>

          <button 
            onClick={handleLogout}
            className="px-3 py-1.5 border border-red-500/30 hover:bg-red-550/10 text-red-400 text-xs font-bold rounded-lg transition"
          >
            Wyloguj
          </button>
        </div>

        {/* MOBILE HAMBURGER BUTTON */}
        <button 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 text-slate-300 hover:text-white"
        >
          {mobileMenuOpen ? '✕' : '☰'}
        </button>
      </header>

      {/* MOBILE EXPANDED MENU TRAY */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-slate-900 border-b border-slate-800 p-4 space-y-3 animate-fade-in text-sm font-semibold">
          <div className="pb-2 border-b border-slate-850 select-none">
            <p className="text-slate-400 text-xs">Menu zalogowanego:</p>
            <p className="text-white font-bold">{myName} ({role})</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => { setActiveTab('start'); setMobileMenuOpen(false); }} className={`px-3 py-2 rounded-lg text-left ${activeTab === 'start' ? 'bg-blue-500/10 text-white' : 'text-slate-400'}`}>Dziś w pracy</button>
            <button onClick={() => { setActiveTab('dashboard'); setMobileMenuOpen(false); }} className={`px-3 py-2 rounded-lg text-left ${activeTab === 'dashboard' ? 'bg-blue-500/10 text-white' : 'text-slate-400'}`}>Mój grafik</button>
            <button onClick={() => { setActiveTab('calendar'); setMobileMenuOpen(false); }} className={`px-3 py-2 rounded-lg text-left ${activeTab === 'calendar' ? 'bg-blue-500/10 text-white' : 'text-slate-400'}`}>Grafik ogólny</button>
            <button 
              onClick={() => { setActiveTab('proposals'); setMobileMenuOpen(false); }} 
              className={`px-3 py-2 rounded-lg text-left flex items-center justify-between ${
                activeTab === 'proposals' ? 'bg-blue-500/10 text-white' : 'text-slate-400'
              }`}
            >
              <span>Skrzynka wymian</span>
              {activeProposalsCount > 0 && (
                <span className="px-2 py-0.5 text-[10px] font-black rounded-full bg-red-600 text-white min-w-[20px] text-center">
                  {activeProposalsCount}
                </span>
              )}
            </button>
            <button 
              onClick={() => { setActiveTab('market'); setMobileMenuOpen(false); }} 
              className={`px-3 py-2 rounded-lg text-left flex items-center justify-between ${
                activeTab === 'market' ? 'bg-blue-500/10 text-white' : 'text-slate-400'
              }`}
            >
              <span>Giełda zmian</span>
              {activeMarketCount > 0 && (
                <span className="px-2 py-0.5 text-[10px] font-black rounded-full bg-red-600 text-white min-w-[20px] text-center animate-pulse row">
                  {activeMarketCount}
                </span>
              )}
            </button>
            
            {(role === 'coordinator' || role === 'admin') && (
              <button onClick={() => { setActiveTab('coordinator'); setMobileMenuOpen(false); }} className={`px-3 py-2 text-left text-yellow-500 ${activeTab === 'coordinator' ? 'bg-yellow-550/10' : ''}`}>Raport Koord.</button>
            )}
            {role === 'admin' && (
              <>
                <button onClick={() => { setActiveTab('control'); setMobileMenuOpen(false); }} className={`px-3 py-2 text-left text-orange-400 ${activeTab === 'control' ? 'bg-orange-550/10' : ''}`}>Kontrola zmian</button>
                <button onClick={() => { setActiveTab('admin'); setMobileMenuOpen(false); }} className={`px-3 py-2 text-left text-emerald-400 ${activeTab === 'admin' ? 'bg-emerald-555/10' : ''}`}>Panel Excel</button>
              </>
            )}
          </div>
          <div className="pt-2 border-t border-slate-850 flex items-center justify-between gap-2">
            <button onClick={() => setShowPassModal(true)} className="px-4 py-2 bg-slate-800 rounded-lg text-xs text-slate-300">Zmień Hasło</button>
            <button onClick={handleLogout} className="px-4 py-2 border border-red-500/40 text-red-400 rounded-lg text-xs">Wyloguj</button>
          </div>
        </div>
      )}

      {/* CORE DESKTOP NAVIGATION ROW */}
      <nav className="hidden md:flex bg-slate-950 border-b border-slate-900 px-6 gap-2 py-2 overflow-x-auto">
        <button 
          onClick={() => setActiveTab('start')}
          className={`px-4 py-2 text-xs font-bold uppercase rounded-lg tracking-wider transition ${
            activeTab === 'start' ? 'bg-blue-500/10 text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Dziś w pracy
        </button>
        <button 
          onClick={() => setActiveTab('dashboard')}
          className={`px-4 py-2 text-xs font-bold uppercase rounded-lg tracking-wider transition ${
            activeTab === 'dashboard' ? 'bg-blue-500/10 text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Mój grafik
        </button>
        <button 
          onClick={() => setActiveTab('calendar')}
          className={`px-4 py-2 text-xs font-bold uppercase rounded-lg tracking-wider transition ${
            activeTab === 'calendar' ? 'bg-blue-500/10 text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Grafik ogólny
        </button>
        <button 
          onClick={() => setActiveTab('proposals')}
          className={`px-4 py-2 text-xs font-bold uppercase rounded-lg tracking-wider transition flex items-center gap-1.5 ${
            activeTab === 'proposals' ? 'bg-blue-500/10 text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>Skrzynka wymian</span>
          {activeProposalsCount > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-black rounded-full bg-red-600 text-white min-w-[18px] text-center animate-pulse leading-none flex items-center justify-center">
              {activeProposalsCount}
            </span>
          )}
        </button>
        <button 
          onClick={() => setActiveTab('market')}
          className={`px-4 py-2 text-xs font-bold uppercase rounded-lg tracking-wider transition flex items-center gap-1.5 ${
            activeTab === 'market' ? 'bg-blue-500/10 text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>Giełda zmian</span>
          {activeMarketCount > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-black rounded-full bg-red-600 text-white min-w-[18px] text-center animate-pulse leading-none flex items-center justify-center">
              {activeMarketCount}
            </span>
          )}
        </button>

        {/* Separator */}
        <span className="w-px bg-slate-800 self-stretch my-1" />

        {/* Admins subroutines */}
        {role === 'admin' && (
          <>
            <button 
              onClick={() => setActiveTab('control')}
              className={`px-4 py-2 text-xs font-bold uppercase rounded-lg tracking-wider transition text-orange-400 ${
                activeTab === 'control' ? 'bg-orange-500/10' : 'hover:text-orange-450'
              }`}
            >
              Kontrola zmian
            </button>
            <button 
              onClick={() => setActiveTab('admin')}
              className={`px-4 py-2 text-xs font-bold uppercase rounded-lg tracking-wider transition text-emerald-400 ${
                activeTab === 'admin' ? 'bg-emerald-500/10' : 'hover:text-emerald-450'
              }`}
            >
              Panel Excel
            </button>
          </>
        )}
      </nav>

      {/* FLOATING ACTION OVERLAYS/MODALS/TOAST PANEL */}
      <div className="fixed bottom-6 right-6 z-50 space-y-2 pointer-events-auto">
        {toasts.map(t => (
          <div 
            key={t.id}
            onClick={() => removeToast(t.id)}
            className={`flex items-center justify-between p-4 rounded-xl shadow-2xl border cursor-pointer animate-slide-in text-sm font-bold max-w-sm ${
              t.type === 'success' 
                ? 'bg-[#0f1d17] text-emerald-400 border-emerald-500/30' 
                : t.type === 'error' 
                  ? 'bg-[#221010] text-red-400 border-red-500/30' 
                  : 'bg-[#101925] text-blue-400 border-blue-500/30'
            }`}
          >
            <span>{t.message}</span>
            <button className="ml-4 opacity-50 hover:opacity-100 font-bold">&times;</button>
          </div>
        ))}
      </div>

      {/* PRIMARY VIEWS SWITCH COMPILER */}
      <main className="flex-1 overflow-y-auto py-6">
        {activeTab === 'start' && (
          <StartView addToast={addToast} onNavigate={setActiveTab} />
        )}

        {/* Dynamic customized Tab "dashboard" representing individual calendar */}
        {activeTab === 'dashboard' && (() => {
          // 1. Calculate general stats for the CURRENT selected calendar month
          const totalScheduled = myShifts.reduce((acc, s) => acc + Number(s.scheduled_hours || 0), 0);
          const totalWorked = myShifts.reduce((acc, s) => acc + Number(s.worked_hours || 0), 0);
          
          const statsMorningCount = myShifts.filter(s => isShiftCodeMorning(s.code)).length;

          const statsAfternoonCount = myShifts.filter(s => isShiftCodeAfternoon(s.code)).length;

          // 2. Generate Calendar grid cells
          const year = dashboardMonth.getFullYear();
          const monthIndex = dashboardMonth.getMonth(); // 0-indexed month
          
          const firstDayOfThisMonth = new Date(year, monthIndex, 1);
          // Polish week start conversion: (day + 6) % 7
          const firstDayOfWeekIndex = (firstDayOfThisMonth.getDay() + 6) % 7; 
          const totalDaysInThisMonth = new Date(year, monthIndex + 1, 0).getDate();

          const calendarCells = [];

          // Overlap day count from previous month
          const prevMonthDate = new Date(year, monthIndex - 1, 1);
          const totalDaysInPrevMonth = new Date(year, monthIndex, 0).getDate();

          // Push outer items for previous month padding
          for (let i = firstDayOfWeekIndex - 1; i >= 0; i--) {
            const dNum = totalDaysInPrevMonth - i;
            const dStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`;
            calendarCells.push({
              dateStr: dStr,
              dayNum: dNum,
              isCurrentMonth: false,
              shifts: []
            });
          }

          // Push items for active current month
          for (let dNum = 1; dNum <= totalDaysInThisMonth; dNum++) {
            const dStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`;
            const dayShifts = myShifts.filter((s: any) => s.date === dStr);
            calendarCells.push({
              dateStr: dStr,
              dayNum: dNum,
              isCurrentMonth: true,
              shifts: dayShifts
            });
          }

          // Suffix items to pad end of last week line
          const nextMonthDate = new Date(year, monthIndex + 1, 1);
          const totalCellsTarget = Math.ceil(calendarCells.length / 7) * 7;
          const remainingDaysCount = totalCellsTarget - calendarCells.length;
          for (let dNum = 1; dNum <= remainingDaysCount; dNum++) {
            const dStr = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`;
            calendarCells.push({
              dateStr: dStr,
              dayNum: dNum,
              isCurrentMonth: false,
              shifts: []
            });
          }

          // Compute today identifier in Warsaw to highlight cell
          const nowInstance = new Date();
          const todayDateStr = `${nowInstance.getFullYear()}-${String(nowInstance.getMonth() + 1).padStart(2, '0')}-${String(nowInstance.getDate()).padStart(2, '0')}`;

          const DAYS_SHORT = ['Pn', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'];

          // Filter matcher
          const matchesFilter = (shift: any) => {
            if (dashboardFilter === 'all') return true;
            if (dashboardFilter === 'rano') return isShiftCodeMorning(shift.code);
            if (dashboardFilter === 'popo') return isShiftCodeAfternoon(shift.code);
            return true;
          };

          return (
            <div className="space-y-6 animate-fade-in max-w-5xl mx-auto px-4 py-2 font-sans">
              
              {/* HEADER ROW INDIVIDUAL STATS */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                <div className="flex items-center justify-between w-full sm:w-auto gap-4">
                  <div>
                    <h1 className="text-xl font-black text-white flex items-center gap-2">
                      🗓️ Twój osobisty grafik pracy
                    </h1>
                    <p className="text-xs text-slate-500 mt-1 font-bold">
                      Nowoczesny i przejrzysty rozkład Twoich zmian z podsumowaniem statystyk godzinowych.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      // Set default date to today in Warsaw format timezone
                      const yearStr = dashboardMonth.getFullYear();
                      const monthStr = String(dashboardMonth.getMonth() + 1).padStart(2, '0');
                      setExtraDate(`${yearStr}-${monthStr}-15`); // Seed mid-month default or simply empty
                      setShowExtraModal(true);
                    }}
                    className="px-3.5 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-extrabold text-xs rounded-xl flex items-center gap-1.5 shadow-lg shadow-emerald-500/10 transition duration-300"
                  >
                    <span>➕</span> Przychodzę dodatkowo
                  </button>
                </div>

                {/* SUBTAB SELECTOR BUTTONS IN APPLE GLASS STYLE */}
                <div className="flex bg-slate-950/80 p-0.5 rounded-xl border border-slate-800/80 self-start sm:self-auto shadow-inner shrink-0">
                  <button
                    onClick={() => setDashboardSubTab('calendar')}
                    className={`py-1 px-3 text-xs font-bold rounded-lg transition-all duration-300 flex items-center gap-1.5 ${
                      dashboardSubTab === 'calendar'
                        ? 'bg-blue-500/15 text-blue-300 border border-blue-500/25 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span>📅</span> Grafik
                  </button>
                  <button
                    onClick={() => setDashboardSubTab('statistics')}
                    className={`py-1 px-3 text-xs font-bold rounded-lg transition-all duration-300 flex items-center gap-1.5 ${
                      dashboardSubTab === 'statistics'
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span>📊</span> Statystyki & Finanse
                  </button>
                </div>
              </div>

              {dashboardSubTab === 'statistics' ? (
                <StatsView addToast={addToast} />
              ) : (
                <>
                  {/* MONTH CONTROLLER & GLASS SEGMENTS BAR */}
                  <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl rounded-2xl p-4 shadow-xl">
                <div className="flex items-center gap-2 justify-center sm:justify-start">
                  <button 
                    onClick={() => setDashboardMonth(new Date(dashboardMonth.getFullYear(), dashboardMonth.getMonth() - 1, 1))}
                    className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-950/40 hover:bg-slate-950/85 border border-slate-800/80 text-slate-300 hover:text-white transition duration-200"
                    title="Poprzedni miesiąc"
                  >
                    <span className="text-xs font-bold">◀</span>
                  </button>
                  <span className="text-sm font-extrabold text-slate-100 uppercase min-w-[140px] text-center tracking-wide bg-slate-950/30 p-2.5 rounded-xl border border-slate-800/50 font-mono">
                    {plLocalMonth.format(dashboardMonth)}
                  </span>
                  <button 
                    onClick={() => setDashboardMonth(new Date(dashboardMonth.getFullYear(), dashboardMonth.getMonth() + 1, 1))}
                    className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-950/40 hover:bg-slate-950/85 border border-slate-800/80 text-slate-300 hover:text-white transition duration-200"
                    title="Następny miesiąc"
                  >
                    <span className="text-xs font-bold">▶</span>
                  </button>
                </div>

                <div className="flex flex-col md:flex-row gap-3 items-center w-full xl:w-auto">
                  
                  {/* DESIGN SELECTOR - APPLE GLASS */}
                  <div className="p-1 bg-slate-950/60 rounded-2xl border border-slate-800/60 flex gap-1 w-full md:w-auto shadow-inner">
                    <button
                      onClick={() => setDashboardLayout('grid')}
                      className={`flex-1 md:flex-none px-4 py-2 text-xs font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-1.5 ${
                        dashboardLayout === 'grid'
                          ? 'bg-slate-800/60 text-white shadow-[0_4px_12px_rgba(255,255,255,0.06)] border border-white/5 backdrop-blur-md'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 border border-transparent'
                      }`}
                    >
                      <span>🗺️</span> Siatka
                    </button>
                    <button
                      onClick={() => setDashboardLayout('agenda')}
                      className={`flex-1 md:flex-none px-4 py-2 text-xs font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-1.5 ${
                        dashboardLayout === 'agenda'
                          ? 'bg-slate-800/60 text-white shadow-[0_4px_12px_rgba(255,255,255,0.06)] border border-white/5 backdrop-blur-md'
                          : 'text-slate-400 hover:text-slate-205 hover:bg-slate-900/40 border border-transparent'
                      }`}
                    >
                      <span>📋</span> Lista / Agenda
                    </button>
                  </div>

                  {/* FILTER BAR IN APPLE GLASS SEGMENT STYLE */}
                  <div className="p-1 bg-slate-950/60 rounded-2xl border border-slate-800/60 flex gap-1 w-full md:w-auto shadow-inner">
                    <button
                      onClick={() => setDashboardFilter('all')}
                      className={`flex-1 md:flex-none px-4 py-2 text-xs font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-1.5 ${
                        dashboardFilter === 'all'
                          ? 'bg-slate-800/60 text-white shadow-[0_4px_12px_rgba(255,255,255,0.06)] border border-white/5 backdrop-blur-md'
                          : 'text-slate-400 hover:text-slate-205 hover:bg-slate-900/40 border border-transparent'
                      }`}
                    >
                      <span>🌐</span> Wszystkie
                    </button>
                    <button
                      onClick={() => setDashboardFilter('rano')}
                      className={`flex-1 md:flex-none px-4 py-2 text-xs font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-1.5 ${
                        dashboardFilter === 'rano'
                          ? 'bg-amber-500/20 text-amber-300 shadow-[0_4px_12px_rgba(245,158,11,0.1)] border border-amber-500/30 backdrop-blur-md'
                          : 'text-slate-400 hover:text-slate-205 hover:bg-slate-900/40 border border-transparent'
                      }`}
                    >
                      <span>☀️</span> Rano
                    </button>
                    <button
                      onClick={() => setDashboardFilter('popo')}
                      className={`flex-1 md:flex-none px-4 py-2 text-xs font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-1.5 ${
                        dashboardFilter === 'popo'
                          ? 'bg-indigo-500/20 text-indigo-305 shadow-[0_4px_12px_rgba(99,102,241,0.1)] border border-indigo-500/30 backdrop-blur-md'
                          : 'text-slate-400 hover:text-slate-205 hover:bg-slate-900/40 border border-transparent'
                      }`}
                    >
                      <span>🌙</span> Popo
                    </button>
                  </div>

                </div>
              </div>

              {/* STATISTICAL COUNTER BOXES */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/60 p-4 rounded-2xl flex items-center gap-3.5 shadow-md">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 text-lg">
                    ⏳
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase font-black tracking-wider">Zaplanowane</p>
                    <p className="text-base font-black text-slate-100 font-mono">{totalScheduled} h</p>
                  </div>
                </div>

                <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/60 p-4 rounded-2xl flex items-center gap-3.5 shadow-md">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-lg">
                    ✅
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase font-black tracking-wider">Faktyczne h</p>
                    <p className="text-base font-black text-emerald-400 font-mono">{totalWorked} h</p>
                  </div>
                </div>

                <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/60 p-4 rounded-2xl flex items-center gap-3.5 shadow-md">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 text-lg">
                    ☀️
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase font-black tracking-wider">Zmiany RANO</p>
                    <p className="text-base font-black text-amber-300 font-mono">{statsMorningCount}</p>
                  </div>
                </div>

                <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/60 p-4 rounded-2xl flex items-center gap-3.5 shadow-md">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 text-lg">
                    🌙
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase font-black tracking-wider">Zmiany POPO</p>
                    <p className="text-base font-black text-indigo-300 font-mono">{statsAfternoonCount}</p>
                  </div>
                </div>
              </div>

              {/* CALENDAR VIEWS SWITCHER (GRID VS AGENDA LIST) */}
              {dashboardLayout === 'agenda' ? (
                /* AGENDA / LIST VIEW - EXTRA READABLE ON MOBILE */
                <div className="bg-slate-905/80 border border-slate-800/80 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl space-y-4">
                  <div className="border-b border-slate-800/60 pb-3 flex justify-between items-center">
                    <h3 className="text-sm font-extrabold text-slate-350 uppercase tracking-widest font-mono flex items-center gap-1.5">
                      📋 Lista zaplanowanych dyżurów
                    </h3>
                    <span className="px-2.5 py-1 bg-slate-950/60 rounded-full text-slate-400 font-mono text-xs font-bold">
                      {calendarCells.filter(cell => cell.isCurrentMonth && cell.shifts.filter(matchesFilter).length > 0).length} dni robocze
                    </span>
                  </div>

                  <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                    {(() => {
                      const activeShiftsDays = calendarCells.filter(cell => cell.isCurrentMonth && cell.shifts.filter(matchesFilter).length > 0);
                      
                      if (activeShiftsDays.length === 0) {
                        return (
                          <div className="text-center py-16 px-4 bg-slate-950/20 rounded-2xl border border-dashed border-slate-800 text-slate-500 italic font-medium">
                            🔍 Brak zaplanowanych zmian w wybranym filtrze na ten miesiąc.
                          </div>
                        );
                      }

                      return activeShiftsDays.map((cell, idx) => {
                        const isToday = cell.dateStr === todayDateStr;
                        const matchingShifts = cell.shifts.filter(matchesFilter);

                        return (
                          <div 
                            key={idx}
                            className={`p-4 rounded-xl sm:rounded-2xl border transition-all duration-300 bg-slate-900/40 border-slate-800/80 hover:bg-slate-850/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3.5 ${
                              isToday ? 'border-blue-500/50 bg-[#0f1b2e]/60 shadow-lg shadow-blue-500/5 ring-1 ring-blue-500/20' : ''
                            }`}
                          >
                            {/* Left Side: Date label */}
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 shrink-0 rounded-xl bg-slate-950 border border-slate-850 flex flex-col items-center justify-center font-mono">
                                <span className="text-[9px] uppercase font-black text-slate-500 tracking-wider">
                                  {new Date(cell.dateStr + 'T12:00:00').toLocaleDateString('pl-PL', { weekday: 'short' })}
                                </span>
                                <span className="text-base font-black text-slate-100">
                                  {cell.dayNum}
                                </span>
                              </div>
                              <div>
                                <h4 className="text-sm font-extrabold text-slate-200 capitalize">
                                  {new Date(cell.dateStr + 'T12:00:00').toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })}
                                </h4>
                                {isToday && (
                                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 mt-1 bg-blue-500/15 border border-blue-500/30 rounded-md text-[9px] font-black text-blue-300 tracking-wider uppercase">
                                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" /> Dzisiaj
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Right Side: Shift specifications */}
                            <div className="flex flex-col gap-2 w-full sm:w-auto">
                              {matchingShifts.map((s, sIdx) => {
                                const isPolonez = s.lounge ? String(s.lounge).trim().toLowerCase() === 'polonez' : false;
                                const isMorning = isShiftCodeMorning(s.code);

                                return (
                                  <div 
                                    key={sIdx}
                                    className={`flex items-center justify-between gap-6 p-3 rounded-xl border min-w-full sm:min-w-[320px] ${
                                      isMorning
                                        ? 'bg-amber-500/10 border-amber-500/20 text-amber-200'
                                        : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-200'
                                    }`}
                                  >
                                    <div className="flex items-center gap-3">
                                      <span className="text-lg">{isMorning ? '☀️' : '🌙'}</span>
                                      <div>
                                        <div className="flex items-center gap-1.5 text-xs font-black uppercase font-mono">
                                          ZMIANA <span className="text-white bg-slate-950 px-2 py-0.5 rounded font-black font-mono text-[12px] border border-slate-800">{s.code}</span>
                                          {s.is_zmiwaka && (
                                            <span className="badge-zmiwak text-[9px] px-2 py-0.5 rounded font-bold ml-1 bg-slate-500/20 border border-slate-500/30 text-slate-200">Zmywak</span>
                                          )}
                                        </div>
                                        <div className="text-[10px] text-slate-400 font-bold mt-1">
                                          Czas: <span className="font-mono text-slate-200 font-extrabold">{s.worked_hours} godzin pracy</span>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="text-right flex items-center gap-2 shrink-0">
                                      <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black tracking-normal uppercase leading-none shadow-sm ${
                                        isPolonez 
                                          ? 'bg-yellow-500/20 border border-yellow-500/30 text-yellow-300' 
                                          : 'bg-blue-500/20 border border-blue-500/30 text-blue-300'
                                      }`}>
                                        {isPolonez ? 'POLONEZ' : 'MAZUREK'}
                                      </span>
                                      <button 
                                        onClick={() => handleDropShift(s.id)}
                                        className="p-1 px-2 rounded-lg bg-red-500/10 hover:bg-red-500/25 border border-red-500/20 text-red-400 text-[10px] font-extrabold transition uppercase tracking-wider shrink-0"
                                        title="Usuń zmianę (oddałem komuś)"
                                      >
                                        Usuń
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              ) : (
                /* GRID CALENDAR VIEW - SIGNIFICANTLY IMPROVED READABILITY */
                <div className="bg-slate-905/80 border border-slate-800/80 rounded-2xl sm:rounded-3xl p-3 sm:p-5 shadow-2xl space-y-3 sm:space-y-4">
                  
                  {/* 7 column heads */}
                  <div className="grid grid-cols-7 gap-1 sm:gap-2 border-b border-slate-800/60 pb-2 sm:pb-3">
                    {DAYS_SHORT.map((day, idx) => (
                      <div key={idx} className="text-center text-[9px] sm:text-[10px] font-bold tracking-wider text-slate-500 uppercase font-mono">
                        {day}
                      </div>
                    ))}
                  </div>

                  {/* Monthly Cells grid */}
                  <div className="grid grid-cols-7 gap-1 sm:gap-2">
                    {calendarCells.map((cell, idx) => {
                      const isToday = cell.dateStr === todayDateStr;
                      const filteredShifts = cell.shifts.filter(matchesFilter);
                      const hasShifts = filteredShifts.length > 0;
                      
                      return (
                        <div 
                          key={idx} 
                          className={`min-h-[92px] sm:min-h-[115px] rounded-xl sm:rounded-2xl p-1.5 sm:p-2.5 transition-all duration-300 flex flex-col justify-between relative border ${
                            !cell.isCurrentMonth
                              ? 'bg-slate-955/20 border-slate-950/10 text-slate-705 opacity-20 select-none pointer-events-none'
                              : isToday
                                ? 'bg-blue-500/10 border-blue-500/60 shadow-[0_0_15px_rgba(59,130,246,0.18)] text-slate-100'
                                : hasShifts
                                  ? 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-850/50 text-slate-100'
                                  : 'bg-slate-950/30 border-slate-900/40 hover:bg-slate-900/25 text-slate-400'
                          }`}
                        >
                          {/* Day Number Row */}
                          <div className="flex justify-between items-start">
                            <span className={`text-[10px] sm:text-[11px] font-extrabold font-mono px-1.5 py-0.5 rounded-md ${
                              isToday 
                                ? 'bg-blue-550 text-white shadow-sm font-black' 
                                : cell.isCurrentMonth
                                  ? 'text-slate-350'
                                  : 'text-slate-755'
                            }`}>
                              {cell.dayNum}
                            </span>

                            {isToday && (
                              <span className="flex h-1.5 w-1.5 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500"></span>
                              </span>
                            )}
                          </div>

                          {/* Shift content indicators in the cell */}
                          <div className="mt-1 space-y-1 flex-1 flex flex-col justify-end">
                            
                            {/* DESKTOP MODE */}
                            <div className="hidden sm:block space-y-1">
                              {cell.isCurrentMonth && filteredShifts.map((s, sIdx) => {
                                const isPolonez = s.lounge ? String(s.lounge).trim().toLowerCase() === 'polonez' : false;
                                const loungeLabel = isPolonez ? 'PLN' : 'MZR';
                                const isMorning = isShiftCodeMorning(s.code);
                                
                                return (
                                  <div 
                                    key={sIdx}
                                    className={`text-[9.5px] p-2 rounded-xl border flex flex-col transition gap-0.5 shadow-sm leading-tight ${
                                      isMorning
                                        ? 'bg-amber-500/10 hover:bg-amber-500/15 border-amber-500/25 text-amber-200'
                                        : 'bg-indigo-500/10 hover:bg-indigo-500/15 border-indigo-500/25 text-indigo-200'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between font-mono font-extrabold pb-0.5 border-b border-current/10">
                                      <span className="flex items-center gap-0.5">
                                        {isMorning ? '☀️' : '🌙'} {s.code}
                                        {s.is_zmiwaka && (
                                          <span className="text-[8px] px-1 bg-slate-500/25 text-slate-200 rounded shrink-0 border border-slate-500/35 font-bold" title="Zmywak">Z</span>
                                        )}
                                      </span>
                                      <div className="flex items-center gap-1 shrink-0">
                                        <span className={`px-1 rounded-[4px] text-[7.5px] font-black tracking-normal leading-0 ${
                                          isPolonez ? 'bg-yellow-500/20 text-yellow-300' : 'bg-blue-500/20 text-blue-300'
                                        }`}>
                                          {loungeLabel}
                                        </span>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDropShift(s.id);
                                          }}
                                          className="text-red-400 hover:text-red-350 hover:bg-slate-950 px-0.5 rounded font-black text-xs transition leading-none"
                                          title="Usuń zmianę (oddałem)"
                                        >
                                          &times;
                                        </button>
                                      </div>
                                    </div>
                                    <div className="flex items-center justify-between text-[7.5px] font-bold pt-0.5 opacity-80 font-mono">
                                      <span>h:</span>
                                      <strong>{s.worked_hours}</strong>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {/* MOBILE MODE WITH DRASTICALLY ENHANCED LEGIBILITY */}
                            <div className="sm:hidden flex flex-col gap-0.5 w-full mt-0.5 overflow-hidden">
                              {cell.isCurrentMonth && filteredShifts.map((s, sIdx) => {
                                const isPolonez = s.lounge ? String(s.lounge).trim().toLowerCase() === 'polonez' : false;
                                const isMorning = isShiftCodeMorning(s.code);
                                
                                return (
                                  <div 
                                    key={sIdx}
                                    className={`w-full py-0.5 px-0.5 rounded-md text-[7.5px] font-black leading-none flex items-center justify-between border scale-95 overflow-hidden shrink-0 ${
                                      isMorning
                                        ? 'bg-amber-500/10 border-amber-550/20 text-amber-300'
                                        : 'bg-indigo-550/10 border-indigo-550/20 text-indigo-305'
                                    }`}
                                    title={`${isPolonez ? 'Polonez' : 'Mazurek'}: ${s.code} (${s.worked_hours}h)`}
                                  >
                                    <span className="font-mono text-[6.5px] select-none truncate flex items-center gap-0.5">
                                      {s.code}
                                      {s.is_zmiwaka && <span className="text-[5px] px-0.5 bg-slate-500/30 text-white rounded font-bold">Z</span>}
                                    </span>
                                    <span className={`text-[5px] font-black text-center px-0.5 rounded leading-none shrink-0 ${
                                      isPolonez ? 'bg-[#3e2d1d] text-yellow-400 font-mono' : 'bg-[#1b233a] text-blue-300 font-mono'
                                    }`}>
                                      {isPolonez ? 'P' : 'M'}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>

                            {cell.isCurrentMonth && cell.shifts.length > 0 && filteredShifts.length === 0 && (
                              <div className="text-[7.5px] sm:text-[8px] text-slate-600 italic text-center py-0.5 select-none font-medium leading-none">
                                ukryta
                              </div>
                            )}
                          </div>

                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
                </>
              )}

            </div>
          );
        })()}

        {activeTab === 'calendar' && (
          <CalendarView addToast={addToast} onNavigate={setActiveTab} />
        )}

        {activeTab === 'proposals' && (
          <ProposalsView addToast={addToast} onRefresh={loadProposalsCount} />
        )}

        {activeTab === 'market' && (
          <MarketView addToast={addToast} onRefresh={loadMarketCount} />
        )}

        {role === 'admin' && activeTab === 'control' && (
          <ControlView addToast={addToast} />
        )}

        {role === 'admin' && activeTab === 'admin' && (
          <AdminView addToast={addToast} />
        )}
      </main>

      {/* FOOTER METRICS INFO */}
      <footer className="bg-slate-950 border-t border-slate-900 py-3 text-center text-[10px] text-slate-600 font-semibold select-none">
        &copy; 2026 Grafik LOT Warsaw Airport. Wszelkie prawa zastrzeżone.
      </footer>

      {/* CONSOLE DIALOG PASSWORD CHANGE OVERLAY MODAL */}
      {showPassModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center mb-1 pb-1 border-b border-slate-800">
              <h3 className="text-base font-extrabold text-slate-200">
                🔒 Zmień hasło konta
              </h3>
              <button 
                onClick={() => setShowPassModal(false)}
                className="text-slate-400 hover:text-white text-2xl"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Obecne hasło</label>
                <input 
                  type="password" 
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-950 text-slate-101 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nowe hasło</label>
                <input 
                  type="password" 
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-950 text-slate-101 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  required
                />
                
                {passStrength && (
                  <div className="text-xs font-semibold mt-1">
                    Bezpieczeństwo: <span className={`font-bold ${strengthColor}`}>{passStrength}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-3 border-t border-slate-800">
                <button 
                  type="button"
                  onClick={() => setShowPassModal(false)}
                  className="px-3.5 py-1.5 border border-slate-700 text-slate-300 text-xs font-bold rounded-lg hover:border-slate-500 transition"
                >
                  Anuluj
                </button>
                <button 
                  type="submit"
                  className="px-4 py-1.5 bg-gradient-to-r from-blue-500 to-emerald-500 text-slate-950 text-xs font-extrabold rounded-lg hover:opacity-95 transition"
                >
                  Zmień hasło
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PUBLIC MODAL: PRZYCHODZĘ DODATKOWO */}
      {showExtraModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center mb-1 pb-1 border-b border-slate-800">
              <h3 className="text-base font-extrabold text-white flex items-center gap-1.5">
                ➕ Zgłoś dodatkowy dyżur
              </h3>
              <button 
                onClick={() => setShowExtraModal(false)}
                className="text-slate-400 hover:text-white text-2xl"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleAddExtraShift} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Kiedy przychodzisz (Data)</label>
                <input 
                  type="date" 
                  value={extraDate}
                  onChange={(e) => setExtraDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-slate-100 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Kod zmiany / dyżuru</label>
                <select
                  value={extraCode === '1' || extraCode === '2' || extraCode === '1/B' || extraCode === '2/B' ? extraCode : 'other'}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'other') {
                      setExtraCode('');
                    } else {
                      setExtraCode(val);
                    }
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="1">☀️ Smena 1 (Rano)</option>
                  <option value="2">🌙 Smena 2 (Popołudnie)</option>
                  <option value="1/B">☀️ Smena 1/B (Bar Rano)</option>
                  <option value="2/B">🌙 Smena 2/B (Bar Popołudnie)</option>
                  <option value="other">Inna (wpisz ręcznie)...</option>
                </select>
              </div>

              {!(extraCode === '1' || extraCode === '2' || extraCode === '1/B' || extraCode === '2/B') && (
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Wpisz kod zmiany ręcznie</label>
                  <input
                    type="text"
                    placeholder="np. 1/Z, S, 2/P"
                    value={extraCode}
                    onChange={(e) => setExtraCode(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-slate-100 text-sm font-mono uppercase focus:outline-none focus:ring-1 focus:ring-blue-500"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Salon / Lounge</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setExtraLounge('polonez')}
                    className={`py-2 px-3.5 text-xs font-bold rounded-xl border transition ${
                      extraLounge === 'polonez'
                        ? 'bg-yellow-500/10 text-yellow-300 border-yellow-500/50'
                        : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    👑 POLONEZ
                  </button>
                  <button
                    type="button"
                    onClick={() => setExtraLounge('mazurek')}
                    className={`py-2 px-3.5 text-xs font-bold rounded-xl border transition ${
                      extraLounge === 'mazurek'
                        ? 'bg-blue-550/10 text-blue-300 border-blue-550/50'
                        : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    ✈️ MAZUREK
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2.5 pt-1.5">
                <input
                  type="checkbox"
                  id="extraIsZmiwaka"
                  checked={extraIsZmiwaka}
                  onChange={(e) => setExtraIsZmiwaka(e.target.checked)}
                  className="w-4 h-4 rounded bg-slate-950 border-slate-800 focus:ring-0 text-blue-500 cursor-pointer"
                />
                <label htmlFor="extraIsZmiwaka" className="text-xs font-extrabold text-slate-300 select-none cursor-pointer uppercase tracking-wider">
                  🧼 Stanowisko Zmywak (Zmywaka)
                </label>
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-3 border-t border-slate-800">
                <button 
                  type="button"
                  onClick={() => setShowExtraModal(false)}
                  className="px-4 py-2 border border-slate-700 text-slate-300 text-xs font-bold rounded-lg hover:border-slate-500 transition"
                >
                  Anuluj
                </button>
                <button 
                  type="submit"
                  className="px-5 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 text-xs font-extrabold rounded-lg hover:opacity-95 transition"
                >
                  Zgłoś przyjście
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
