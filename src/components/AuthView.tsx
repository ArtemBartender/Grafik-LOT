import React, { useState } from 'react';
import { apiCall } from '../lib/api';

interface AuthViewProps {
  onLoginSuccess: () => void;
  addToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export default function AuthView({ onLoginSuccess, addToast }: AuthViewProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  
  // Change password modal state
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [changeEmail, setChangeEmail] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  
  // Password Strength calculation
  const getStrengthScore = (p: string) => {
    if (!p) return 0;
    let s = 0;
    if (p.length >= 8) s++;
    if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
    if (/\d/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;
    if (p.length >= 12) s++;
    return Math.min(s, 5);
  };
  
  const score = getStrengthScore(password);
  const strengthText = ['Bardzo słabe', 'Słabe', 'OK', 'Dobre', 'Bardzo dobre', 'Świetne'][score] || ' ';
  const barWidths = [0, 20, 40, 60, 80, 100][score];
  const barColors = ['bg-red-500', 'bg-red-400', 'bg-yellow-500', 'bg-yellow-400', 'bg-green-500', 'bg-green-400'];

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      addToast('Podaj email i hasło.', 'error');
      return;
    }
    try {
      const data = await apiCall('/api/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      const token = data.access_token;
      if (rememberMe) {
        localStorage.setItem('access_token', token);
        sessionStorage.removeItem('access_token');
      } else {
        sessionStorage.setItem('access_token', token);
        localStorage.removeItem('access_token');
      }
      addToast('Zalogowano pomyślnie!', 'success');
      onLoginSuccess();
    } catch (err: any) {
      addToast(err.message || 'Błąd logowania', 'error');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !email || !password) {
      addToast('Uzupełnij wszystkie wymagane pola.', 'error');
      return;
    }
    if (getStrengthScore(password) < 3) {
      addToast('Hasło jest zbyt słabe! Użyj silniejszego hasła.', 'error');
      return;
    }
    try {
      await apiCall('/api/register', {
        method: 'POST',
        body: JSON.stringify({ full_name: fullName, email, password })
      });
      addToast('Konto zostało utworzone. Zaloguj się teraz.', 'success');
      setIsRegister(false);
      setPassword('');
    } catch (err: any) {
      addToast(err.message || 'Błąd rejestracji', 'error');
    }
  };

  const handleChangePasswordBeforeLogin = async () => {
    if (!changeEmail || !oldPassword || !newPassword) {
      addToast('Wypełnij wszystkie pola w formularzu zmiany hasła.', 'error');
      return;
    }
    if (newPassword.length < 6) {
      addToast('Nowe hasło musi mieć co najmniej 6 znaków.', 'error');
      return;
    }
    try {
      await apiCall('/api/password/change-before-login', {
        method: 'POST',
        body: JSON.stringify({
          email: changeEmail,
          stare_haslo: oldPassword,
          nowe_haslo: newPassword
        })
      });
      addToast('✅ Hasło zostało zmienione pomyślnie.', 'success');
      setShowChangeModal(false);
      setChangeEmail('');
      setOldPassword('');
      setNewPassword('');
    } catch (err: any) {
      addToast(err.message || 'Błąd podczas zmiany hasła.', 'error');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-950 text-slate-100 relative overflow-hidden" 
         style={{
           backgroundImage: 'radial-gradient(1200px 600px at 10% -10%, #142033 0%, transparent 60%), radial-gradient(900px 500px at 110% 110%, #0b1a2a 0%, transparent 60%)'
         }}>
      <div className="w-full max-w-[480px] bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl animate-fade-in">
        <h1 className="text-3xl font-extrabold tracking-tight mb-6 bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent text-center">
          Grafik Zmian
        </h1>

        {!isRegister ? (
          <div>
            <h2 className="text-xl font-bold mb-4 text-slate-200">Logowanie</h2>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5 text-slate-300">Email</label>
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-700 bg-slate-950 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50" 
                  required 
                  placeholder="np. jan.nowak@lot.pl"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5 text-slate-300">Hasło</label>
                <div className="relative">
                  <input 
                    type={showPassword ? "text" : "password"} 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-700 bg-slate-950 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 pr-12" 
                    required 
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 focus:outline-none"
                  >
                    {showPassword ? "🙈" : "👁"}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm py-1">
                <label className="flex items-center gap-2 cursor-pointer text-slate-400 select-none">
                  <input 
                    type="checkbox" 
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded border-slate-800 bg-slate-950 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900"
                  />
                  Zapamiętaj mnie
                </label>
                <button 
                  type="button"
                  onClick={() => setShowChangeModal(true)}
                  className="text-blue-400 hover:text-blue-300 hover:underline font-semibold"
                >
                  Zmień hasło
                </button>
              </div>

              <button 
                type="submit" 
                className="w-full py-3 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-xl text-slate-900 font-bold hover:opacity-95 transform active:scale-[0.99] transition"
              >
                Zaloguj
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-400">
              Nie masz konta?{" "}
              <button 
                onClick={() => { setIsRegister(true); setPassword(''); }} 
                className="text-blue-400 hover:text-blue-300 font-bold"
              >
                Zarejestruj się
              </button>
            </p>
          </div>
        ) : (
          <div>
            <h2 className="text-xl font-bold mb-4 text-slate-200">Rejestracja</h2>
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5 text-slate-300">Imię i nazwisko</label>
                <input 
                  type="text" 
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-700 bg-slate-950 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50" 
                  required 
                  placeholder="np. Jan Nowak"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5 text-slate-300">Email</label>
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-700 bg-slate-950 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50" 
                  required 
                  placeholder="email@domena.pl"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5 text-slate-300">Hasło</label>
                <div className="relative">
                  <input 
                    type={showPassword ? "text" : "password"} 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-700 bg-slate-950 text-slate-100 placeholder-slate-500 pr-12 focus:outline-none focus:ring-2 focus:ring-blue-500/50" 
                    required 
                    minLength={4}
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 focus:outline-none"
                  >
                    {showPassword ? "🙈" : "👁"}
                  </button>
                </div>
                
                {/* Strength Meter */}
                {password && (
                  <div className="mt-2.5 space-y-1 animate-fade-in">
                    <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                      <div 
                        className={`h-full transition-all duration-300 ${barColors[score]}`} 
                        style={{ width: `${barWidths}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Siła hasła: <strong>{strengthText}</strong></span>
                      <span>Min. 8 znaków, cyfry i symbole</span>
                    </div>
                  </div>
                )}
              </div>

              <button 
                type="submit" 
                className="w-full py-3 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-xl text-slate-900 font-bold hover:opacity-95 transform active:scale-[0.99] transition mt-6"
              >
                Utwórz konto
              </button>
            </form>
            <p className="mt-6 text-center text-sm text-slate-400">
              Masz już konto?{" "}
              <button 
                onClick={() => { setIsRegister(false); setPassword(''); }} 
                className="text-blue-400 hover:text-blue-300 font-bold"
              >
                Zaloguj się
              </button>
            </p>
          </div>
        )}
      </div>

      {/* Change Password Modal */}
      {showChangeModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-800">
              <h3 className="text-lg font-bold text-slate-200">Zmień hasło</h3>
              <button 
                onClick={() => setShowChangeModal(false)}
                className="text-slate-400 hover:text-slate-100 text-2xl"
              >
                &times;
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5 text-slate-300">Email konta</label>
                <input 
                  type="email" 
                  value={changeEmail}
                  onChange={(e) => setChangeEmail(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50" 
                  placeholder="Wpisz email przypisany do konta"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5 text-slate-300">Stare hasło</label>
                <input 
                  type="password" 
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50" 
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5 text-slate-300">Nowe hasło</label>
                <input 
                  type="password" 
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50" 
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-3 border-t border-slate-800">
              <button 
                onClick={() => setShowChangeModal(false)}
                className="px-4 py-2 bg-transparent border border-slate-700 hover:border-slate-500 hover:bg-slate-800 rounded-xl text-slate-300 text-sm font-semibold transition"
              >
                Anuluj
              </button>
              <button 
                onClick={handleChangePasswordBeforeLogin}
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
