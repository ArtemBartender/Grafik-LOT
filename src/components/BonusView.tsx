import React, { useEffect, useState } from 'react';
import { apiCall, currentClaims } from '../lib/api';

interface BonusViewProps {
  currentDashboardMonth?: Date;
}

interface BonusEntry {
  id: string;
  comment: string;
  val: number;
  type: 'plus' | 'minus' | string;
  date: string;
  author?: string;
  rejected?: boolean;
}

export default function BonusView({ currentDashboardMonth }: BonusViewProps) {
  const [loading, setLoading] = useState(true);
  const [errorItem, setErrorItem] = useState('');
  const [bonusTotal, setBonusTotal] = useState(0);
  const [entries, setEntries] = useState<BonusEntry[]>([]);
  
  // Default to today if prop not provided
  const targetMonth = currentDashboardMonth || new Date();
  const yearMonthPrefix = `${targetMonth.getFullYear()}-${String(targetMonth.getMonth() + 1).padStart(2, '0')}`;
  const plLocalMonth = new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' }).format(targetMonth);

  useEffect(() => {
    fetchBonusData();
  }, [yearMonthPrefix]);

  const fetchBonusData = async () => {
    setLoading(true);
    setErrorItem('');
    try {
      const claims = currentClaims();
      if (!claims || !claims.full_name) {
        setErrorItem('Błąd logowania. Brak przypisanego imienia i nazwiska.');
        setLoading(false);
        return;
      }

      const { entries: loadedEntries, totalPoints } = await apiCall(`/api/my-bonus?month=${yearMonthPrefix}`);
      setEntries(loadedEntries);
      setBonusTotal(totalPoints);
      
    } catch (e: any) {
      console.error("Firebase fetch error:", e);
      setErrorItem('Problem z pobieraniem premii z serwera. Skontaktuj się z adminem.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 animate-fade-in-up mt-4 relative">
      <div className="relative p-6 sm:p-8 bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 rounded-[2rem] shadow-2xl overflow-hidden">
        {/* Glow Effects */}
        <div className="absolute -top-32 -left-32 w-64 h-64 bg-[var(--color-gold-light)]/20 rounded-full blur-[80px]" />
        
        <div className="relative z-10 flex flex-col items-center">
          <h2 className="text-2xl sm:text-3xl font-black text-[var(--color-gold-light)] tracking-widest uppercase mb-2">Moja Premia</h2>
          <p className="text-sm text-slate-400 mb-8 max-w-md text-center">
            Informacje o otrzymanych plusach i minusach w miesiącu <strong className="text-slate-200 capitalize">{plLocalMonth}</strong>. (Dane z systemu koordynatorów)
          </p>

          {loading ? (
            <div className="flex flex-col items-center py-10">
              <div className="w-10 h-10 border-4 border-[var(--color-gold)]/30 border-t-[var(--color-gold-light)] rounded-full animate-spin mb-4" />
              <div className="text-slate-400 text-sm animate-pulse">Pobieranie bazy premii dla {plLocalMonth}...</div>
            </div>
          ) : errorItem ? (
             <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl max-w-lg w-full text-center">
               {errorItem}
             </div>
          ) : (
            <div className="w-full space-y-6">
              <div className="bg-slate-950/50 border border-[var(--color-gold)]/30 rounded-2xl p-6 text-center shadow-[inset_0_0_20px_rgba(212,175,55,0.05)]">
                <span className="block text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Punkty za {plLocalMonth}</span>
                <span className={`text-5xl sm:text-6xl font-black bg-gradient-to-br ${bonusTotal < 0 ? 'from-red-400 to-red-600' : 'from-yellow-300 to-[var(--color-gold-light)]'} bg-clip-text text-transparent drop-shadow-sm`}>
                  {bonusTotal > 0 ? '+' : ''}{bonusTotal} <span className="text-2xl text-slate-500 font-bold">pkt</span>
                </span>
                {bonusTotal > 0 && <p className="text-xs font-medium text-[var(--color-gold)]/80 mt-2">To daje Ci łącznie {Math.min(20, 10 + bonusTotal).toFixed(2)}% finalnej premii miesięcznej.</p>}
                {bonusTotal < 0 && <p className="text-xs font-medium text-red-400/80 mt-2">To daje Ci łącznie {Math.min(20, 10 + bonusTotal).toFixed(2)}% finalnej premii miesięcznej.</p>}
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-bold text-white mb-4">Historia Zdarzeń ({plLocalMonth})</h3>
                {entries.length === 0 ? (
                  <div className="text-center text-slate-500 py-6 border border-dashed border-slate-700/50 rounded-xl">
                    Brak zdarzeń (plusów/minusów) w tym miesiącu.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {entries.map((entry, i) => {
                      const numVal = Number(entry.val);
                      const isMinus = entry.type === 'minus' || numVal < 0;
                      const absVal = Math.abs(numVal);
                      return (
                        <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-900/50 border border-slate-800/80 rounded-xl gap-4">
                          <div className="flex items-center gap-4">
                            <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-black text-lg ${isMinus ? 'bg-red-500/20 text-red-400 border border-red-500/30 shadow-[0_0_10px_rgba(239,68,68,0.2)]' : 'bg-[var(--color-gold)]/20 text-[var(--color-gold-light)] border border-[var(--color-gold)]/30 shadow-[0_0_10px_rgba(212,175,55,0.2)]'}`}>
                              {isMinus ? '-' : '+'}
                            </div>
                            <div>
                              <div className="text-slate-200 font-medium text-sm leading-relaxed">{entry.comment || 'Brak komentarza'}</div>
                              <div className="text-xs text-slate-500 mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                                {entry.date && <span>📅 {entry.date} </span>}
                                {entry.author && <span>• 🧑‍💼 {entry.author.split('@')[0]}</span>}
                              </div>
                            </div>
                          </div>
                          {(entry.val !== undefined && entry.val !== null) && (
                            <div className={`flex-shrink-0 text-xl font-black ${isMinus ? 'text-red-400' : 'text-[var(--color-gold-light)]'}`}>
                                {isMinus ? '-' : '+'}{absVal}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
