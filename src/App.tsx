import React, { useEffect, useState } from 'react';
import { apiCall, currentClaims } from '../lib/api';

interface ProposalsViewProps {
  addToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onRefresh?: () => void;
}

export default function ProposalsView({ addToast, onRefresh }: ProposalsViewProps) {
  const [activeTab, setActiveTab2] = useState<'incoming' | 'outgoing' | 'manager'>('incoming');
  const [incoming, setIncoming] = useState<any[]>([]);
  const [outgoing, setOutgoing] = useState<any[]>([]);
  const [forApproval, setForApproval] = useState<any[]>([]);
  const [myClaims, setMyClaims] = useState<any>(null);

  const loadProposals = async () => {
    try {
      const claims = currentClaims();
      setMyClaims(claims);

      const data = await apiCall('/api/proposals');
      setIncoming(data.incoming || []);
      setOutgoing(data.outgoing || []);
      setForApproval(data.for_approval || data.to_approve || []);
      if (onRefresh) {
        onRefresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadProposals();
  }, []);

  const handleAccept = async (id: number) => {
    try {
      await apiCall(`/api/proposals/${id}/accept`, { method: 'POST' });
      addToast('Zaakceptowano propozycję zamiany', 'success');
      loadProposals();
    } catch (err: any) {
      addToast(err.message || 'Błąd przy akceptowaniu propozycji', 'error');
    }
  };

  const handleDecline = async (id: number) => {
    try {
      await apiCall(`/api/proposals/${id}/decline`, { method: 'POST' });
      addToast('Odrzucono propozycję zamiany', 'info');
      loadProposals();
    } catch (err: any) {
      addToast(err.message || 'Błąd', 'error');
    }
  };

  const handleCancel = async (id: number) => {
    try {
      await apiCall(`/api/proposals/${id}/cancel`, { method: 'POST' });
      addToast('Anulowano propozycję zamiany', 'info');
      loadProposals();
    } catch (err: any) {
      addToast(err.message || 'Błąd', 'error');
    }
  };

  const handleApprove = async (id: number) => {
    try {
      await apiCall(`/api/proposals/${id}/approve`, { method: 'POST' });
      addToast('Zatwierdzono oficjalnie wymianę w grafiku!', 'success');
      loadProposals();
    } catch (err: any) {
      addToast(err.message || 'Błąd przy zatwierdzaniu propozycji', 'error');
    }
  };

  const handleReject = async (id: number) => {
    try {
      await apiCall(`/api/proposals/${id}/reject`, { method: 'POST' });
      addToast('Odrzucono oficjalnie wymianę', 'info');
      loadProposals();
    } catch (err: any) {
      addToast(err.message || 'Błąd', 'error');
    }
  };

  // Compile visual badges
  const renderStatusBadge = (status: string) => {
    const s = String(status).toLowerCase();
    let label = status;
    let cls = '';
    
    if (s === 'pending') { label = 'W oczekiwaniu'; cls = 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/35'; }
    else if (s === 'accepted') { label = 'Zaakceptowano'; cls = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/35'; }
    else if (s === 'approved') { label = 'Zatwierdzono'; cls = 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/60 font-bold'; }
    else if (s === 'declined' || s === 'rejected') { label = 'Odrzucono'; cls = 'bg-red-500/10 text-red-400 border border-red-500/35'; }
    else if (s === 'canceled') { label = 'Anulowano'; cls = 'bg-slate-800 text-slate-400 border border-slate-700'; }

    return (
      <span className={`px-2.5 py-1 text-xs rounded-full font-bold select-none ${cls}`}>
        {label}
      </span>
    );
  };

  const currentList = activeTab === 'incoming' 
    ? incoming 
    : activeTab === 'outgoing' 
      ? outgoing 
      : forApproval;

  const showManagerTab = myClaims && (myClaims.role === 'admin' || myClaims.role === 'coordinator');

  return (
    <div className="space-y-4 animate-fade-in max-w-4xl mx-auto px-4 py-2">
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
        
        {/* HEADER SECTION INBOX */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-3">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              📬 Skrzynka propozycji wymian
            </h1>
            <p className="text-xs text-slate-500 mt-1 font-semibold">
              Najpierw zamianę akceptuje odbiorca, następnie Koordynator lub Administrator zatwierdza zmianę w systemie.
            </p>
          </div>
          <button 
            onClick={loadProposals}
            className="px-3.5 py-1.5 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-bold rounded-xl transition"
          >
            Odśwież
          </button>
        </div>

        {/* TABS CONTROLLERS */}
        <div className="flex gap-2.5 border-b border-slate-850 pb-2">
          <button 
            onClick={() => setActiveTab2('incoming')}
            className={`px-4 py-2 text-xs font-bold rounded-lg border transition ${
              activeTab === 'incoming'
                ? 'bg-blue-500/10 text-white border-blue-500/50'
                : 'bg-transparent text-slate-400 border-slate-850 hover:border-slate-700'
            }`}
          >
            Odebrane ({incoming.length})
          </button>
          <button 
            onClick={() => setActiveTab2('outgoing')}
            className={`px-4 py-2 text-xs font-bold rounded-lg border transition ${
              activeTab === 'outgoing'
                ? 'bg-blue-500/10 text-white border-blue-500/50'
                : 'bg-transparent text-slate-400 border-slate-850 hover:border-slate-700'
            }`}
          >
            Wysłane ({outgoing.length})
          </button>
          
          {showManagerTab && (
            <button 
              onClick={() => setActiveTab2('manager')}
              className={`px-4 py-2 text-xs font-bold rounded-lg border transition ${
                activeTab === 'manager'
                  ? 'bg-gradient-to-r from-blue-500/10 to-emerald-500/10 text-emerald-400 border-emerald-500/50'
                  : 'bg-transparent text-slate-400 border-slate-850 hover:border-slate-700'
              }`}
            >
              Do zatwierdzenia ({forApproval.length})
            </button>
          )}
        </div>

        {/* LIST RENDER */}
        <div className="space-y-3.5 pr-1">
          {currentList.length === 0 ? (
            <div className="text-slate-500 text-sm italic py-4">Brak propozycji w tej zakładce.</div>
          ) : (
            currentList.map((p) => {
              const reqName = p.requester?.full_name || 'Inny pracownik';
              const tarName = p.target_user?.full_name || 'Inny pracownik';

              const oddajeszDate = activeTab === 'outgoing' ? p.my_date : p.their_date;
              const dostajeszDate = activeTab === 'outgoing' ? p.their_date : p.my_date;

              const oddajeszCode = activeTab === 'outgoing' ? p.give_code : p.take_code;
              const dostajeszCode = activeTab === 'outgoing' ? p.take_code : p.give_code;

              return (
                <div key={p.id} className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-xl border border-slate-850 bg-slate-950/40 hover:bg-slate-950/80 transition duration-150 gap-4">
                  <div className="space-y-2">
                    <div className="text-sm font-semibold flex items-center gap-1.5 flex-wrap">
                      <span className={`${activeTab === 'outgoing' ? 'text-blue-400' : 'text-slate-300'}`}>{reqName}</span>
                      <span className="text-slate-550 shrink-0">&rarr;</span>
                      <span className={`${activeTab === 'incoming' ? 'text-blue-400' : 'text-slate-300'}`}>{tarName}</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-red-400/90 font-bold uppercase tracking-wider text-[10px] bg-red-400/5 px-2 py-0.5 rounded border border-red-400/10">Oddajesz:</span>
                      <span className="font-bold text-slate-300 font-mono">{oddajeszDate}</span>
                      {oddajeszCode && <span className="bg-slate-800 text-slate-300 px-1 py-0.5 rounded font-mono text-[10px]">{oddajeszCode}</span>}

                      <span className="text-slate-600 scale-y-125 px-1 font-bold">&rarr;</span>

                      <span className="text-emerald-400/95 font-bold uppercase tracking-wider text-[10px] bg-emerald-450/5 px-2 py-0.5 rounded border border-emerald-450/10">Dostajesz:</span>
                      <span className="font-bold text-slate-300 font-mono">{dostajeszDate}</span>
                      {dostajeszCode && <span className="bg-slate-800 text-slate-300 px-1 py-0.5 rounded font-mono text-[10px]">{dostajeszCode}</span>}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {renderStatusBadge(p.status)}

                    {/* Pending actions for Receiver */}
                    {activeTab === 'incoming' && p.status === 'pending' && (
                      <div className="flex items-center gap-2.5">
                        <button 
                          onClick={() => handleAccept(p.id)}
                          className="px-4 py-1.5 bg-emerald-500 hover:opacity-95 text-slate-950 text-xs font-bold rounded-lg transition"
                        >
                          Akceptuj
                        </button>
                        <button 
                          onClick={() => handleDecline(p.id)}
                          className="px-4 py-1.5 bg-red-500 hover:opacity-95 text-white text-xs font-bold rounded-lg transition"
                        >
                          Odrzuć
                        </button>
                      </div>
                    )}

                    {/* Pending actions for Requester */}
                    {activeTab === 'outgoing' && p.status === 'pending' && (
                      <button 
                        onClick={() => handleCancel(p.id)}
                        className="px-4 py-1.5 border border-red-500/50 hover:bg-red-500/15 text-red-400 text-xs font-bold rounded-lg transition"
                      >
                        Anuluj
                      </button>
                    )}

                    {/* Audited actions for Managers */}
                    {activeTab === 'manager' && p.status === 'accepted' && (
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => handleApprove(p.id)}
                          className="px-4 py-1.5 bg-gradient-to-r from-emerald-500 to-emerald-400 text-slate-950 text-xs font-bold rounded-lg hover:opacity-95 transition"
                        >
                          Zatwierdź
                        </button>
                        <button 
                          onClick={() => handleReject(p.id)}
                          className="px-4 py-1.5 border border-red-500 hover:bg-red-500/15 text-red-500 text-xs font-bold rounded-lg transition"
                        >
                          Odrzuć
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
