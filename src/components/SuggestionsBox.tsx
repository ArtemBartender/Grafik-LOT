import React, { useState, useEffect } from 'react';
import { apiCall, currentClaims } from '../lib/api';

interface Suggestion {
  id: number;
  text: string;
  createdAt: string;
  userId: number | null;
  authorName: string;
  authorEmail: string | null;
}

interface SuggestionsBoxProps {
  addToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export default function SuggestionsBox({ addToast }: SuggestionsBoxProps) {
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const claims = currentClaims();
  const isAdminOrCoordinator = claims?.role === 'admin' || claims?.role === 'coordinator';
  const emailLower = (claims?.email || '').toLowerCase();
  const fullNameLower = (claims?.full_name || '').toLowerCase();
  const isArtem = emailLower === 'bilenckotema10@gmail.com' ||
                  emailLower.includes('bilenckotema') ||
                  emailLower === 'a.bilenko@lot.pl' ||
                  emailLower.includes('bilenko') ||
                  (fullNameLower.includes('artem') && fullNameLower.includes('bilenko'));

  const fetchSuggestions = async () => {
    if (!isAdminOrCoordinator) return;
    setIsLoading(true);
    try {
      const data = await apiCall('/api/suggestions');
      setSuggestions(data || []);
    } catch (err: any) {
      console.error('Failed to load suggestions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAdminOrCoordinator) {
      fetchSuggestions();
    }
  }, [isAdminOrCoordinator]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) {
      addToast('Wpisz treść zgłoszenia', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiCall('/api/suggestions', {
        method: 'POST',
        body: JSON.stringify({ text: text.trim() })
      });
      setText('');
      addToast(res.message || 'Zgłoszenie zostało wysłane pomyślnie!', 'success');
      
      if (isAdminOrCoordinator) {
        fetchSuggestions();
      }
    } catch (err: any) {
      addToast(err.message || 'Błąd wysyłania zgłoszenia', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Czy na pewno chcesz usunąć to zgłoszenie?')) return;
    try {
      await apiCall(`/api/suggestions/${id}`, {
        method: 'DELETE'
      });
      addToast('Zgłoszenie usunięte', 'success');
      setSuggestions(prev => prev.filter(s => s.id !== id));
    } catch (err: any) {
      addToast(err.message || 'Błąd usuwania', 'error');
    }
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('pl-PL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return '';
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-6">
      <div>
        <h3 className="text-base font-bold text-slate-300 border-b border-slate-800 pb-2 flex items-center gap-2">
          📮 Poczta Zaufania (Skrzynka Sugestii)
        </h3>
        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
          Tutaj możesz bezpiecznie i anonimowo przesłać skargi, opinie, uwagi lub pomysły. 
          <br />
          <span className="text-[10px] text-amber-500 font-semibold">
            ⚠️ Uwaga: zgłoszenia są całkowicie anonimowe
          </span>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Napisz swoje zgłoszenie tutaj... (np. uwagi dotyczące pracy, sugestie zmian, skargi)"
          maxLength={1000}
          rows={4}
          className="w-full px-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-[var(--color-gold)]/40 focus:border-[var(--color-gold)]/40 resize-none transition"
        />
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-slate-600 font-mono">
            {text.length}/1000 znaków
          </span>
          <button
            type="submit"
            disabled={isSubmitting || !text.trim()}
            className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition active:scale-95 flex items-center gap-2 ${
              !text.trim()
                ? 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-800'
                : 'bg-gradient-to-r from-blue-500 to-teal-500 text-slate-950 hover:opacity-90'
            }`}
          >
            {isSubmitting ? (
              <>
                <span className="w-3 h-3 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></span>
                Wysyłanie...
              </>
            ) : (
              'Wyślij Zgłoszenie'
            )}
          </button>
        </div>
      </form>

      {isAdminOrCoordinator && (
        <div className="border-t border-slate-800 pt-5 space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="text-sm font-extrabold uppercase text-gold-gradient tracking-wider">
              Odebrane zgłoszenia ({suggestions.length})
            </h4>
            <button
              onClick={fetchSuggestions}
              disabled={isLoading}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1.5 transition"
            >
              🔄 Odśwież listę
            </button>
          </div>

          {isLoading ? (
            <div className="text-slate-500 text-xs italic py-4 text-center">
              Ładowanie zgłoszeń...
            </div>
          ) : suggestions.length === 0 ? (
            <div className="text-slate-600 text-xs italic py-4 text-center">
              Brak zgłoszeń w skrzynce.
            </div>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {suggestions.map((s) => (
                <div
                  key={s.id}
                  className="bg-slate-950/60 border border-slate-800/60 rounded-xl p-3.5 space-y-2 relative group"
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded ${
                          s.userId ? (isArtem ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-slate-800 text-slate-400') : 'bg-slate-800 text-slate-400'
                        }`}>
                          {s.authorName}
                        </span>
                        {isArtem && s.authorEmail && (
                          <span className="text-[9px] text-slate-500 font-mono">
                            ({s.authorEmail})
                          </span>
                        )}
                      </div>
                      <span className="text-[9px] text-slate-600 font-mono block">
                        {formatDate(s.createdAt)}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDelete(s.id)}
                      className="text-red-500 hover:text-red-400 p-1 rounded hover:bg-red-500/10 transition"
                      title="Usuń zgłoszenie"
                    >
                      🗑️
                    </button>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap font-medium">
                    {s.text}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
