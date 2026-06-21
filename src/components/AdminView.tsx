import React, { useRef, useState, useEffect } from 'react';
import { apiCall } from '../lib/api';

interface AdminViewProps {
  addToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

interface WorkerUser {
  id: number;
  email: string;
  fullName: string;
  role: string;
  hourlyRatePln: number | null;
  taxPercent: number | null;
}

interface SwapLog {
  id: string;
  type: string;
  userA: string;
  userB: string;
  dateA: string;
  codeA: string;
  dateB: string;
  codeB: string;
  timestamp: string;
}

export default function AdminView({ addToast }: AdminViewProps) {
  // Navigation tabs of Admin Panel
  const [activeSubTab, setActiveSubTab] = useState<'import' | 'roles' | 'swaps'>('import');

  // XLSX States
  const [xlsxFile, setXlsxFile] = useState<File | null>(null);
  const [xlsxMonth, setXlsxMonth] = useState('6'); // Default June (seed match)
  const [xlsxYear, setXlsxYear] = useState('2026');
  const [xlsxMsg, setXlsxMsg] = useState('');
  const [isXlsxLoading, setIsXlsxLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Users lists for Roles tab
  const [workers, setWorkers] = useState<WorkerUser[]>([]);
  const [isWorkersLoading, setIsWorkersLoading] = useState(false);

  // Swaps history logs state
  const [swapsLog, setSwapsLog] = useState<SwapLog[]>([]);
  const [isSwapsLoading, setIsSwapsLoading] = useState(false);

  // Month lists compiled for selects
  const months = Array.from({ length: 12 }, (_, i) => String(i + 1));
  const years = ['2025', '2026', '2027'];

  // Supporting flexible Drag & Drop file upload experience
  const [isDragging, setIsDragging] = useState(false);

  // Fetch workers lists
  const loadWorkers = async () => {
    setIsWorkersLoading(true);
    try {
      const data = await apiCall('/api/admin/users');
      setWorkers(data || []);
    } catch (err: any) {
      addToast(err.message || 'Błąd pobierania bazy pracowników', 'error');
    } finally {
      setIsWorkersLoading(false);
    }
  };

  // Fetch swaps historic logs
  const loadSwapsLog = async () => {
    setIsSwapsLoading(true);
    try {
      const data = await apiCall('/api/admin/swaps-log');
      setSwapsLog(data || []);
    } catch (err: any) {
      addToast(err.message || 'Błąd pobierania raportu zamian', 'error');
    } finally {
      setIsSwapsLoading(false);
    }
  };

  // Trigger loads on sub-tab activation
  useEffect(() => {
    if (activeSubTab === 'roles') {
      loadWorkers();
    } else if (activeSubTab === 'swaps') {
      loadSwapsLog();
    }
  }, [activeSubTab]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.xlsx')) {
        setXlsxFile(file);
        addToast(`Wybrano plik: ${file.name}`, 'info');
      } else {
        addToast('Dozwolone są wyłącznie arkusze typu .xlsx!', 'error');
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setXlsxFile(file);
    }
  };

  const triggerSelectFile = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  // Upload Excel Spreadsheet
  const handleXlsxImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!xlsxFile) {
      addToast('Wybierz plik .xlsx przed wysłaniem!', 'error');
      return;
    }
    setIsXlsxLoading(true);
    setXlsxMsg('Przetwarzanie grafiku...');
    
    try {
      const fileBuffer = await xlsxFile.arrayBuffer();
      
      const res = await apiCall('/api/upload-xlsx', {
        method: 'POST',
        headers: {
          'x-month': xlsxMonth,
          'x-year': xlsxYear,
          'Content-Type': 'application/octet-stream'
        },
        body: fileBuffer
      });

      addToast('Zaimportowano grafik pomyślnie!', 'success');
      setXlsxMsg(`✅ Zaimportowano: ${res.imported} zmian. Nowych pracowników: ${res.created_users?.length || 0}`);
      setXlsxFile(null);
    } catch (err: any) {
      setXlsxMsg(`❌ Błąd: ${err.message}`);
      addToast(err.message || 'Błąd importu XLSX', 'error');
    } finally {
      setIsXlsxLoading(false);
    }
  };

  // Change employee role
  const handleRoleChange = async (userId: number, newRole: string) => {
    try {
      await apiCall(`/api/admin/users/${userId}/role`, {
        method: 'POST',
        body: JSON.stringify({ role: newRole })
      });
      addToast('Rola pracownika została zaktualizowana pomyślnie', 'success');
      
      // Update local state without full reload
      setWorkers(prev => prev.map(w => w.id === userId ? { ...w, role: newRole } : w));
    } catch (err: any) {
      addToast(err.message || 'Błąd zmiany roli', 'error');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto px-4 py-2 font-sans">
      
      {/* SECTION HEADER PANEL */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-xl font-black text-white flex items-center gap-2">
            ⚙️ Panel Zarządzania & Administracji
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-bold">
            Główny panel administratora (Robert & Michał / Artem). Importuj grafiki, zmieniaj uprawnienia pracowników oraz śledź historię zamian.
          </p>
        </div>

        {/* SECTION NAVIGATION PILLS */}
        <div className="flex bg-slate-950 p-1.5 rounded-xl border border-slate-800 text-xs font-bold leading-none select-none">
          <button
            onClick={() => setActiveSubTab('import')}
            className={`px-3 py-2 rounded-lg transition-all ${activeSubTab === 'import' ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
          >
            Import XLS
          </button>
          <button
            onClick={() => setActiveSubTab('roles')}
            className={`px-3 py-2 rounded-lg transition-all ${activeSubTab === 'roles' ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
          >
            Uprawnienia & Role
          </button>
          <button
            onClick={() => setActiveSubTab('swaps')}
            className={`px-3 py-2 rounded-lg transition-all ${activeSubTab === 'swaps' ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
          >
            Ewidencja Zamian
          </button>
        </div>
      </div>

      {/* 1. XLSX IMPORT TAB */}
      {activeSubTab === 'import' && (
        <section className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl shadow-lg space-y-4">
          <h2 className="text-sm font-black text-white flex items-center gap-2">
            📊 Importuj nowy grafik (Plik XLSX)
          </h2>

          <form onSubmit={handleXlsxImport} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-450 uppercase">Miesiąc wykonania</label>
                <select 
                  value={xlsxMonth}
                  onChange={(e) => setXlsxMonth(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-805 bg-slate-950 text-slate-100 rounded-xl focus:outline-none font-semibold text-sm"
                >
                  {months.map(m => (
                    <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-450 uppercase">Rok</label>
                <select 
                  value={xlsxYear}
                  onChange={(e) => setXlsxYear(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-805 bg-slate-950 text-slate-100 rounded-xl focus:outline-none font-semibold text-sm"
                >
                  {years.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Flexible User Drag and Drop zone */}
            <div 
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={triggerSelectFile}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition select-none flex flex-col items-center justify-center gap-2.5 ${
                isDragging 
                  ? 'border-blue-500 bg-blue-500/5' 
                  : xlsxFile 
                    ? 'border-emerald-500/50 bg-emerald-500/5' 
                    : 'border-slate-800 bg-slate-950 hover:bg-slate-950/70 hover:border-slate-700'
              }`}
            >
              <input 
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".xlsx"
                className="hidden"
              />
              
              <div className="text-3xl">
                {xlsxFile ? '📄' : '📥'}
              </div>
              
              <div>
                {xlsxFile ? (
                  <span className="text-emerald-400 font-bold block max-w-xs truncate">{xlsxFile.name} ({(xlsxFile.size / 1024).toFixed(1)} KB)</span>
                ) : (
                  <span className="text-slate-400 text-xs font-bold leading-relaxed">
                    Przeciągnij tutaj plik grafiku XLSX lub <strong className="text-indigo-400 hover:text-indigo-300">kliknij, aby wybrać z komputera</strong>
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <div className="text-[10px] text-slate-500 font-medium italic">
                * Importer czyta kolory i kodowanie rzędów bezpośrednio z arkusza, automatycznie tworząc konta o haśle "user123".
              </div>
              <button 
                disabled={isXlsxLoading || !xlsxFile}
                type="submit"
                className={`px-5 py-2.5 rounded-xl font-extrabold text-xs whitespace-nowrap active:scale-95 transition ${
                  isXlsxLoading || !xlsxFile
                    ? 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-850'
                    : 'bg-gradient-to-r from-blue-500 to-indigo-500 text-slate-950 hover:opacity-95 shadow-lg shadow-indigo-500/10'
                }`}
              >
                {isXlsxLoading ? 'Wysyłanie...' : 'Wyślij grafik'}
              </button>
            </div>

            {xlsxMsg && (
              <div className="text-xs font-semibold py-2 px-3 bg-slate-950 border border-slate-850 rounded-xl text-slate-300">
                {xlsxMsg}
              </div>
            )}
          </form>
        </section>
      )}

      {/* 2. ROLES MANAGEMENT TAB */}
      {activeSubTab === 'roles' && (
        <section className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl shadow-lg space-y-4">
          <div className="flex justify-between items-center border-b border-slate-800/60 pb-2">
            <h2 className="text-sm font-black text-white flex items-center gap-2">
              👥 Zarządzanie uprawnieniami i rolami pracowników
            </h2>
            <button
              onClick={loadWorkers}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 text-[10px] font-black rounded-lg transition uppercase font-mono"
            >
              Odśwież listę ↻
            </button>
          </div>

          <p className="text-[10px] text-slate-500">
            Poniższa lista wyświetla zarejestrowanych pracowników LOT. Możesz natychmiast nadać lub zdjąć im uprawnienia, zmieniając rolę na Admin, Koordynator, Barman lub Ofic.
          </p>

          {isWorkersLoading ? (
            <div className="text-center py-12 text-xs text-slate-500 font-bold animate-pulse font-mono">
              Wczytywanie bazy pracowników...
            </div>
          ) : workers.length === 0 ? (
            <div className="text-center py-12 text-xs italic text-slate-500">
              Nie znaleziono żadnych zalogowanych pracowników w systemie.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-450 font-black uppercase text-[10px] tracking-wider">
                    <th className="py-2.5 px-3">Imię i nazwisko</th>
                    <th className="py-2.5 px-3">E-mail roboczy</th>
                    <th className="py-2.5 px-3">Stawka h (PLN)</th>
                    <th className="py-2.5 px-3">Podatek (%)</th>
                    <th className="py-2.5 px-3">Obecna uprawnienie</th>
                    <th className="py-2.5 px-3 text-right">Zmień uprawnienia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850/30">
                  {workers.map((w) => (
                    <tr key={w.id} className="hover:bg-slate-950/20 transition-all">
                      <td className="py-3 px-3 font-semibold text-slate-100">{w.fullName}</td>
                      <td className="py-3 px-3 font-mono text-slate-450 text-[10px]">{w.email}</td>
                      <td className="py-3 px-3 font-mono text-slate-300">{w.hourlyRatePln != null ? `${w.hourlyRatePln} zł` : '—'}</td>
                      <td className="py-3 px-3 font-mono text-slate-300">{w.taxPercent != null ? `${w.taxPercent} %` : '—'}</td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded font-black font-mono text-[9px] uppercase border ${
                          w.role === 'admin' 
                            ? 'bg-red-500/10 border-red-500/25 text-red-400' 
                            : w.role === 'coordinator'
                              ? 'bg-purple-500/10 border-purple-500/25 text-purple-400'
                              : w.role === 'barman'
                                ? 'bg-amber-500/10 border-amber-500/25 text-amber-400'
                                : w.role === 'ofic'
                                  ? 'bg-blue-500/10 border-blue-500/25 text-blue-400'
                                  : 'bg-slate-500/15 border-slate-700 text-slate-400'
                        }`}>
                          {w.role === 'admin' ? 'Admin' : w.role === 'coordinator' ? 'Koordynator' : w.role === 'barman' ? 'Barman' : w.role === 'ofic' ? 'Ofic' : 'Pracownik'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <select
                          value={w.role}
                          onChange={(e) => handleRoleChange(w.id, e.target.value)}
                          className="px-2.5 py-1.5 border border-slate-800 bg-slate-950 rounded-xl text-[11px] font-bold text-slate-300 focus:outline-none focus:border-indigo-500"
                        >
                          <option value="user">Pracownik (Waiters/Bar)</option>
                          <option value="ofic">Ofic (Kolega na salonie)</option>
                          <option value="barman">Barman</option>
                          <option value="coordinator">Koordynator</option>
                          <option value="admin">Główny Admin (Michał/Robert)</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* 3. SWAPS LOG HISTORY TAB */}
      {activeSubTab === 'swaps' && (
        <section className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl shadow-lg space-y-4">
          <div className="flex justify-between items-center border-b border-slate-800/60 pb-2">
            <h2 className="text-sm font-black text-white flex items-center gap-2">
              📜 Dziennik i log zatwierdzonych zamian dyżurowych
            </h2>
            <button
              onClick={loadSwapsLog}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 text-[10px] font-black rounded-lg transition uppercase font-mono"
            >
              Odśwież log ↻
            </button>
          </div>

          <p className="text-[10px] text-slate-500">
            Ten log jest przeznaczony wyłącznie dla Twojego wglądu jako administratora głównego. Rejestruje dokładny biletowany ślad wszelkich zaakceptowanych i sfinalizowanych wymian (zarówno bezpośrednich dogadanych, jak i odebranych z giełdy taryfowej).
          </p>

          {isSwapsLoading ? (
            <div className="text-center py-12 text-xs text-slate-500 font-bold animate-pulse font-mono">
              Przeszukiwanie bazy ewidencji wymian...
            </div>
          ) : swapsLog.length === 0 ? (
            <div className="text-center py-12 text-xs italic text-slate-500 border border-dashed border-slate-800 rounded-xl">
              Nie odnotowano jeszcze żadnej zatwierdzonej zamiany dyżurów w systemie.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-450 font-black uppercase text-[10px] tracking-wider">
                    <th className="py-2.5 px-3">Data rejestracji</th>
                    <th className="py-2.5 px-3">Pracownik A (Nadawca)</th>
                    <th className="py-2.5 px-3">ODDANA Zmiana</th>
                    <th className="py-2.5 px-3">Pracownik B (Odbiorca)</th>
                    <th className="py-2.5 px-3">ZABRANA Zmiana</th>
                    <th className="py-2.5 px-3">Typ operacji</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850/30">
                  {swapsLog.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-950/20 transition-all font-mono text-[11px]">
                      <td className="py-3 px-3 text-slate-450 text-[10px] font-semibold">
                        {new Date(log.timestamp).toLocaleString('pl-PL')}
                      </td>
                      <td className="py-3 px-3 font-sans font-bold text-indigo-400">{log.userA}</td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 bg-slate-950 text-slate-100 rounded border border-slate-800 text-[10px] font-bold">
                          {log.dateA} ({log.codeA})
                        </span>
                      </td>
                      <td className="py-3 px-3 font-sans font-bold text-teal-400">{log.userB}</td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 bg-slate-950 text-slate-100 rounded border border-slate-800 text-[10px] font-bold">
                          {log.dateB.includes('-') ? `${log.dateB} (${log.codeB})` : log.dateB}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wide border ${
                          log.type.includes('giełd')
                            ? 'bg-yellow-500/10 border-yellow-500/25 text-yellow-500'
                            : 'bg-sky-500/10 border-sky-500/25 text-sky-400'
                        }`}>
                          {log.type}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

    </div>
  );
}
