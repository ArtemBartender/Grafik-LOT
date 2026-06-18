import React, { useEffect, useState } from 'react';
import { apiCall, currentClaims } from '../lib/api';

interface MarketViewProps {
  addToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onRefresh?: () => void;
}

export default function MarketView({ addToast, onRefresh }: MarketViewProps) {
  const [openOffers, setOpenOffers] = useState<any[]>([]);
  const [mineOffers, setMineOffers] = useState<any[]>([]);
  const [myShiftsMap, setMyShiftsMap] = useState<Map<string, any>>(new Map());
  const [todayIso, setTodayIso] = useState('');
  const [myClaims, setMyClaims] = useState<any>(null);

  const loadMarket = async () => {
    try {
      const claims = currentClaims();
      setMyClaims(claims);

      // Load today's Warsaw ISO
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

      const iso = `${yr}-${String(mn).padStart(2, '0')}-${String(dy).padStart(2, '0')}`;
      setTodayIso(iso);

      // 1. Load active shifts to check candidate conflicts
      const arr = await apiCall('/api/my-shifts');
      const storeMap = new Map();
      (arr || []).forEach((sh: any) => {
        storeMap.set(sh.shift_date, sh);
      });
      setMyShiftsMap(storeMap);

      // 2. Load Market Offers
      const data = await apiCall('/api/market/offers');
      setOpenOffers(data.open || []);
      setMineOffers(data.mine || []);
      if (onRefresh) {
        onRefresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadMarket();
  }, []);

  const handleClaim = async (id: number, date: string) => {
    // Client-side protect
    if (date <= todayIso) {
      addToast('Tej zmiany nie można wziąć (przeszłość / dzisiaj).', 'error');
      return;
    }
    if (myShiftsMap.has(date)) {
      addToast('W tym dniu już masz przypisaną zmianę!', 'error');
      return;
    }
    try {
      await apiCall(`/api/market/offers/${id}/claim`, { method: 'POST' });
      addToast('✅ Wysłano prośbę o odebranie tej zmiany do właściciela.', 'success');
      loadMarket();
    } catch (err: any) {
      addToast(err.message || 'Błąd odbierania zmiany', 'error');
    }
  };

  const handleCancel = async (id: number) => {
    try {
      await apiCall(`/api/market/offers/${id}/cancel`, { method: 'POST' });
      addToast('Anulowano wystawienie zmiany', 'info');
      loadMarket();
    } catch (err: any) {
      addToast(err.message || 'Błąd', 'error');
    }
  };

  const handleApprove = async (id: number) => {
    try {
      await apiCall(`/api/market/offers/${id}/approve`, { method: 'POST' });
      addToast('✅ Zatwierdzono przekazanie zmiany w grafiku!', 'success');
      loadMarket();
    } catch (err: any) {
      addToast(err.message || 'Błąd przy zatwierdzaniu', 'error');
    }
  };

  const handleReject = async (id: number) => {
    try {
      await apiCall(`/api/market/offers/${id}/reject`, { method: 'POST' });
      addToast('Odrzucono kandydata, zmiana powraca na rynek', 'info');
      loadMarket();
    } catch (err: any) {
      addToast(err.message || 'Błąd', 'error');
    }
  };

  const formatMarketDate = (dateIsoStr: string) => {
    try {
      const dObj = new Date(dateIsoStr + 'T12:00:00');
      return dObj.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', weekday: 'short' });
    } catch (e) {
      return dateIsoStr;
    }
  };

  return (
    <div className="space-y-4 animate-fade-in max-w-4xl mx-auto px-4 py-2">
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-3">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              ⚖️ Rynek wymian i oddawania zmian (Giełda)
            </h1>
            <p className="text-xs text-slate-500 mt-1 font-semibold">
              Tu możesz wystawić swoją zmianę na giełdę (poprzez zakładkę Statystyka) lub przygarnąć zmianę innego pracownika.
            </p>
          </div>
          <button 
            onClick={loadMarket}
            className="px-3.5 py-1.5 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-bold rounded-xl transition"
          >
            Odśwież
          </button>
        </div>

        {/* DOUBLE COLUMN LAYOUT BLOCK */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* TAB 1: OPEN OFFERS */}
          <div className="bg-slate-950 border border-slate-850 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-bold text-slate-300 border-b border-slate-850 pb-2 flex items-center gap-1.5">
              🌍 Otwarte oferty giełdowe
            </h3>
            
            <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
              {openOffers.length === 0 ? (
                <div className="text-slate-550 text-xs italic py-4">Brak wolnych zmian na rynku.</div>
              ) : (
                openOffers.map((o) => {
                  const isPastOrToday = o.date <= todayIso;
                  const alreadyWorking = myShiftsMap.has(o.date);
                  const disabled = isPastOrToday || alreadyWorking;

                  let tooltipMsg = 'Wybierz, aby przygarnąć zmianę';
                  if (isPastOrToday) tooltipMsg = 'Zmiana w przeszłości / dzisiaj';
                  else if (alreadyWorking) tooltipMsg = 'Pracujesz już tego dnia';

                  return (
                    <div key={o.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-850 bg-slate-900/40 hover:bg-slate-900/60 transition">
                      <div className="space-y-1">
                        <div className="font-extrabold text-slate-200 text-sm">
                          {formatMarketDate(o.date)}
                        </div>
                        <div className="text-xs text-slate-500 font-semibold flex items-center gap-1.5">
                          <span className="badge badge-shift font-mono text-[10px]">{o.code}</span>
                          <span>właściciel: {o.owner?.full_name}</span>
                        </div>
                      </div>

                      <button 
                        disabled={disabled}
                        onClick={() => handleClaim(o.id, o.date)}
                        title={tooltipMsg}
                        className={`px-3.5 py-1.5 text-xs font-extrabold rounded-lg transition ${
                          disabled
                            ? 'bg-slate-800 text-slate-650 cursor-not-allowed border border-slate-850'
                            : 'bg-gradient-to-r from-blue-500 to-emerald-500 text-slate-950 hover:opacity-95'
                        }`}
                      >
                        Weź
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* TAB 2: MY OFFERS */}
          <div className="bg-slate-950 border border-slate-850 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-bold text-slate-300 border-b border-slate-850 pb-2 flex items-center gap-1.5">
              🔑 Moje wystawione oferty
            </h3>

            <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
              {mineOffers.length === 0 ? (
                <div className="text-slate-550 text-xs italic py-4">Nie masz obecnie wystawionych zmian na rynku.</div>
              ) : (
                mineOffers.map((o) => {
                  return (
                    <div key={o.id} className="flex flex-col p-3 rounded-lg border border-slate-850 bg-slate-900/40 gap-3">
                      <div className="flex justify-between items-start gap-1">
                        <div>
                          <div className="font-extrabold text-slate-200 text-sm">
                            {formatMarketDate(o.date)}
                          </div>
                          <div className="text-xs text-slate-500 font-semibold font-mono mt-1">
                            Kod zmiany: <span className="text-slate-350">{o.code}</span>
                          </div>
                        </div>
                        
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                          o.status === 'open' 
                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' 
                            : o.status === 'requested' 
                              ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20 animate-pulse' 
                              : 'bg-slate-800 text-slate-400 border-transparent'
                        }`}>
                          {o.status === 'open' ? 'OTWARTA' : o.status === 'requested' ? 'CHĘTNY' : o.status}
                        </span>
                      </div>

                      {/* Status actions */}
                      <div className="flex items-center justify-end gap-2.5 pt-1.5 border-t border-slate-850/50">
                        {o.status === 'open' && (
                          <button 
                            onClick={() => handleCancel(o.id)}
                            className="px-3 py-1 bg-slate-850 hover:bg-slate-800 text-slate-300 border border-slate-700 text-xs font-bold rounded-lg transition"
                          >
                            Anuluj
                          </button>
                        )}
                        {o.status === 'requested' && (
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full justify-between items-end">
                            <span className="text-xs text-slate-400">
                              Chętny: <strong className="text-slate-200">{o.candidate?.full_name}</strong>
                            </span>
                            <div className="flex gap-1.5">
                              <button 
                                onClick={() => handleApprove(o.id)}
                                className="px-3 py-1 bg-emerald-500 hover:opacity-95 text-slate-950 text-xs font-bold rounded-lg transition"
                              >
                                Zatwierdź
                              </button>
                              <button 
                                onClick={() => handleReject(o.id)}
                                className="px-3 py-1 border border-red-500/50 text-red-400 text-xs font-bold rounded-lg hover:bg-red-500/5 transition"
                              >
                                Odrzuć
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
