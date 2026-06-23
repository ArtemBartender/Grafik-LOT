import React, { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore/lite';
import { firebaseDb } from '../lib/firebase';
import { currentClaims } from '../lib/api';

const COLLECTION_NAME = 'premie_users'; 

interface BonusEntry {
  id: string;
  comment: string;
  val: number;
  type: 'plus' | 'minus' | string;
  date: string;
  author?: string;
  rejected?: boolean;
}

export default function BonusView() {
  const [loading, setLoading] = useState(true);
  const [errorItem, setErrorItem] = useState('');
  const [bonusTotal, setBonusTotal] = useState(0);
  const [entries, setEntries] = useState<BonusEntry[]>([]);

  useEffect(() => {
    fetchBonusData();
  }, []);

  const fetchBonusData = async () => {
    try {
      const claims = currentClaims();
      if (!claims || !claims.full_name) {
        setErrorItem('Błąd logowania. Brak przypisanego imienia i nazwiska.');
        setLoading(false);
        return;
      }

      const usersCol = collection(firebaseDb, COLLECTION_NAME);
      const snapshot = await getDocs(usersCol);

      let foundData: any = null;
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.name === claims.full_name) {
          foundData = data;
        }
      });

      if (!foundData) {
        setErrorItem('Nie znaleziono Twojego profilu w zewnętrznej bazie premii (premie_users).');
      } else {
        const rawEntries: BonusEntry[] = foundData.entries || [];
        
        // Filter out rejected entries
        const validEntries = rawEntries.filter(e => !e.rejected);
        // Sort from newest to oldest
        const sortedEntries = validEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        
        setEntries(sortedEntries);
        
        // Compute total points sum
        const total = sortedEntries.reduce((acc: number, val: BonusEntry) => {
          if (val.val) {
            const num = Number(val.val);
            return val.type === 'minus' ? acc - num : acc + num;
          }
          return acc;
        }, 0);
        
        setBonusTotal(Number(total.toFixed(2)));
      }
    } catch (e: any) {
      console.error("Firebase fetch error:", e);
      setErrorItem('Problem z połączeniem do bazy premii. Skontaktuj się z adminem.');
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
            Informacje o otrzymanych w tym miesiącu plusach, minusach i finalnej kwocie premii wyciągnięte z systemu koordynatorów.
          </p>

          {loading ? (
            <div className="flex flex-col items-center py-10">
              <div className="w-10 h-10 border-4 border-[var(--color-gold)]/30 border-t-[var(--color-gold-light)] rounded-full animate-spin mb-4" />
              <div className="text-slate-400 text-sm animate-pulse">Pobieranie bazy premii...</div>
            </div>
          ) : errorItem ? (
             <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl max-w-lg w-full text-center">
               {errorItem}
             </div>
          ) : (
            <div className="w-full space-y-6">
              <div className="bg-slate-950/50 border border-[var(--color-gold)]/30 rounded-2xl p-6 text-center shadow-[inset_0_0_20px_rgba(212,175,55,0.05)]">
                <span className="block text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Aktualne Punkty (Plusy/Minusy)</span>
                <span className={`text-5xl sm:text-6xl font-black bg-gradient-to-br ${bonusTotal < 0 ? 'from-red-400 to-red-600' : 'from-yellow-300 to-[var(--color-gold-light)]'} bg-clip-text text-transparent drop-shadow-sm`}>
                  {bonusTotal > 0 ? '+' : ''}{bonusTotal} <span className="text-2xl text-slate-500 font-bold">pkt</span>
                </span>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-bold text-white mb-4">Historia Zdarzeń</h3>
                {entries.length === 0 ? (
                  <div className="text-center text-slate-500 py-6 border border-dashed border-slate-700/50 rounded-xl">
                    Aktualnie brak wpisów (plusów lub minusów).
                  </div>
                ) : (
                  <div className="space-y-3">
                    {entries.map((entry, i) => {
                      const isMinus = entry.type === 'minus';
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
                          {entry.val && (
                            <div className={`flex-shrink-0 text-xl font-black ${isMinus ? 'text-red-400' : 'text-[var(--color-gold-light)]'}`}>
                                {isMinus ? '-' : '+'}{entry.val}
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
