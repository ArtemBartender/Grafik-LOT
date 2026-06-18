import React, { useRef, useState } from 'react';
import { apiCall } from '../lib/api';

interface AdminViewProps {
  addToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export default function AdminView({ addToast }: AdminViewProps) {
  // XLSX States
  const [xlsxFile, setXlsxFile] = useState<File | null>(null);
  const [xlsxMonth, setXlsxMonth] = useState('6'); // Default June (seed match)
  const [xlsxYear, setXlsxYear] = useState('2026');
  const [xlsxMsg, setXlsxMsg] = useState('');
  const [isXlsxLoading, setIsXlsxLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Month lists compiled for selects
  const months = Array.from({ length: 12 }, (_, i) => String(i + 1));
  const years = ['2025', '2026', '2027'];

  // Supporting flexible Drag & Drop file upload experience
  const [isDragging, setIsDragging] = useState(false);

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
      // Send raw binary buffer representing of .xlsx file to backend
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

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl mx-auto px-4 py-2">
      {/* XLSX IMPORT SECTION */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-1.5 border-b border-slate-800 pb-2">
          📊 Importuj grafik zmian (Plik XLSX)
        </h2>

        <form onSubmit={handleXlsxImport} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-400 uppercase">Wybierz Miesiąc</label>
              <select 
                value={xlsxMonth}
                onChange={(e) => setXlsxMonth(e.target.value)}
                className="w-full px-3 py-2 border border-slate-800 bg-slate-950 text-slate-100 rounded-xl focus:outline-none font-semibold text-sm"
              >
                {months.map(m => (
                  <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-400 uppercase">Wybierz Rok</label>
              <select 
                value={xlsxYear}
                onChange={(e) => setXlsxYear(e.target.value)}
                className="w-full px-3 py-2 border border-slate-800 bg-slate-950 text-slate-100 rounded-xl focus:outline-none font-semibold text-sm"
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
                <span className="text-slate-400 text-sm font-semibold">Przeciągnij tutaj plik grafiku XLSX lub <strong className="text-blue-400 hover:text-blue-300">kliknij, aby wybrać z komputera</strong></span>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <div className="text-xs text-slate-500 font-medium italic">
              * Importer czyta kolory i kodowanie rzędów bezpośrednio z arkusza, automatycznie tworząc nieobecne konta użytkowników o haśle domyślnym "user123".
            </div>
            <button 
              disabled={isXlsxLoading || !xlsxFile}
              type="submit"
              className={`px-5 py-2.5 rounded-xl font-extrabold text-sm ml-auto whitespace-nowrap active:scale-95 transition ${
                isXlsxLoading || !xlsxFile
                  ? 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-850'
                  : 'bg-gradient-to-r from-blue-500 to-emerald-500 text-slate-950 hover:opacity-95'
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
    </div>
  );
}
