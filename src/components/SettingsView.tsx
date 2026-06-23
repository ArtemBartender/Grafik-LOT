import React, { useState, useEffect } from 'react';
import { apiCall } from '../lib/api';

interface SettingsViewProps {
  addToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export default function SettingsView({ addToast }: SettingsViewProps) {
  // Password state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPass, setIsChangingPass] = useState(false);

  // Rate & Tax & Notification state
  const [rate, setRate] = useState<number | string>(28.10);
  const [tax, setTax] = useState<number | string>(12);
  const [notifySchedule, setNotifySchedule] = useState(true);
  const [notifyMarket, setNotifyMarket] = useState(true);
  const [notifySwaps, setNotifySwaps] = useState(true);
  const [isSavingPref, setIsSavingPref] = useState(false);

  // Load current values
  const loadSettings = async () => {
    try {
      const setInfo = await apiCall('/api/me/settings');
      if (setInfo.hourly_rate_pln != null) setRate(setInfo.hourly_rate_pln);
      if (setInfo.tax_percent != null) setTax(setInfo.tax_percent);
      setNotifySchedule(setInfo.notify_new_schedule !== false);
      setNotifyMarket(setInfo.notify_new_market !== false);
      setNotifySwaps(setInfo.notify_swap_requests !== false);
    } catch (err: any) {
      console.error('Error loading settings:', err);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingPref(true);
    try {
      await apiCall('/api/me/settings', {
        method: 'POST',
        body: JSON.stringify({
          hourly_rate_pln: rate === '' ? '' : parseFloat(String(rate)),
          tax_percent: tax === '' ? '' : parseFloat(String(tax)),
          notify_new_schedule: notifySchedule,
          notify_new_market: notifyMarket,
          notify_swap_requests: notifySwaps
        })
      });
      addToast('Preferencje i stawki pomyślnie zaktualizowane', 'success');
      loadSettings();
    } catch (err: any) {
      addToast(err.message || 'Błąd zapisu ustawień', 'error');
    } finally {
      setIsSavingPref(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      addToast('Nowe hasła nie są identyczne', 'error');
      return;
    }
    if (newPassword.length < 4) {
      addToast('Nowe hasło powinno mieć co najmniej 4 znaki', 'error');
      return;
    }

    setIsChangingPass(true);
    try {
      await apiCall('/api/password/change', {
        method: 'POST',
        body: JSON.stringify({
          stare_haslo: oldPassword,
          nowe_haslo: newPassword
        })
      });
      addToast('Hasło pomyślnie zaktualizowane', 'success');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      addToast(err.message || 'Błąd zmiany hasła', 'error');
    } finally {
      setIsChangingPass(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl mx-auto font-sans p-4">
      {/* HEADER PAGE SECTION */}
      <div className="border-b border-slate-800/80 pb-3">
        <h1 className="text-xl font-black text-white flex items-center gap-2">
          ⚙️ Ustawienia Profilu & Preferencje
        </h1>
        <p className="text-xs text-slate-500 mt-1 font-bold">
          Dostosuj swoje taryfy rozliczeniowe, ustaw powiadomienia na telefon / przeglądarkę oraz zmień hasło.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* PARAMS & NOTIFICATION CONFIG PANEL */}
        <div className="bg-slate-900/40 border border-slate-800/80 backdrop-blur-xl p-6 rounded-2xl shadow-xl flex flex-col justify-between">
          <form onSubmit={handleSavePreferences} className="space-y-5">
            <div>
              <h3 className="text-xs font-black text-gold-gradient uppercase tracking-widest font-mono mb-4 flex items-center gap-2">
                💵 Parametry Finansowe
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 tracking-wider">
                    Stawka za godzinę (PLN brutto)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={rate}
                      onChange={(e) => setRate(e.target.value)}
                      className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 text-slate-100 text-sm rounded-xl px-3.5 py-2.5 outline-none font-bold font-mono"
                    />
                    <span className="absolute right-3 top-2.5 text-[10px] text-slate-500 font-bold">zł/h</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 tracking-wider">
                    Podatek i ZUS (%)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      max="100"
                      value={tax}
                      onChange={(e) => setTax(e.target.value)}
                      className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 text-slate-100 text-sm rounded-xl px-3.5 py-2.5 outline-none font-bold font-mono"
                    />
                    <span className="absolute right-3 top-2.5 text-[10px] text-slate-500 font-bold">%</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800/40">
              <h3 className="text-xs font-black text-gold-gradient uppercase tracking-widest font-mono mb-4 flex items-center gap-2">
                🔔 Powiadomienia na Telefon / Email
              </h3>

              <div className="space-y-3.5 text-xs">
                {/* 1. NEW ROSTER */}
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={notifySchedule}
                    onChange={(e) => setNotifySchedule(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-800 text-indigo-600 bg-slate-950 focus:ring-indigo-500 mt-0.5 accent-indigo-550"
                  />
                  <div>
                    <span className="font-bold text-slate-200 group-hover:text-white transition">Opublikowanie nowej rozpiskie 📅</span>
                    <p className="text-[10px] text-slate-500 font-medium">Bądź powiadamiany, gdy koordynator wgra nowy grafik LOT na kolejny miesiąc.</p>
                  </div>
                </label>

                {/* 2. MARKET OFFER */}
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={notifyMarket}
                    onChange={(e) => setNotifyMarket(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-800 text-indigo-600 bg-slate-950 focus:ring-indigo-500 mt-0.5 accent-indigo-550"
                  />
                  <div>
                    <span className="font-bold text-slate-200 group-hover:text-white transition">Nowa oferta na giełdzie ⇄</span>
                    <p className="text-[10px] text-slate-500 font-medium">Bądź powiadamiany, gdy inny pracownik wystawi swoją zmianę na giełdę.</p>
                  </div>
                </label>

                {/* 3. SWAP REQUEST */}
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={notifySwaps}
                    onChange={(e) => setNotifySwaps(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-800 text-indigo-600 bg-slate-950 focus:ring-indigo-500 mt-0.5 accent-indigo-550"
                  />
                  <div>
                    <span className="font-bold text-slate-200 group-hover:text-white transition">Bezpośrednie propozycje wymiany 💬</span>
                    <p className="text-[10px] text-slate-500 font-medium">Bądź zwrotnie powiadamiany, gdy ktoś z pracowników chce podesłać Ci bezpośrednią propozycję zamiany.</p>
                  </div>
                </label>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800/40 flex justify-end">
              <button
                type="submit"
                disabled={isSavingPref}
                className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-500 hover:from-indigo-500 hover:to-blue-400 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl shadow-lg transition"
              >
                {isSavingPref ? 'Zapisywanie...' : 'Zapisz profil i preferencje'}
              </button>
            </div>
          </form>
        </div>

        {/* PASSWORD EDITING PANEL */}
        <div className="bg-slate-900/40 border border-slate-800/80 backdrop-blur-xl p-6 rounded-2xl shadow-xl flex flex-col justify-between">
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <h3 className="text-xs font-black text-gold-gradient uppercase tracking-widest font-mono mb-4 flex items-center gap-2">
                🔒 Zmiana Hasła
              </h3>
              <p className="text-[10px] text-slate-500 font-medium mb-4">
                Wprowadź swoje obecne hasło autoryzujące oraz utwórz nowe bezpieczne hasło do systemu.
              </p>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 tracking-wider">Obecne hasło</label>
                <input
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 px-3 py-2 text-slate-100 rounded-xl focus:border-indigo-550 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 tracking-wider">Nowe hasło</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 px-3 py-2 text-slate-101 rounded-xl focus:border-indigo-550 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 tracking-wider">Potwierdź nowe hasło</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 px-3 py-2 text-slate-101 rounded-xl focus:border-indigo-550 focus:outline-none"
                  required
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800/40 flex justify-end">
              <button
                type="submit"
                disabled={isChangingPass}
                className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl shadow-lg transition"
              >
                {isChangingPass ? 'Aktualizacja...' : 'Aktualizuj hasło zabezpieczające'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
