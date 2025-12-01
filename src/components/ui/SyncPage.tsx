import React, { useState, useEffect } from 'react';
import { RefreshCw, Settings, Link, Plus, Trash2, Copy, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface SyncPageProps {
  onNavClick?: (section: string) => void;
}

interface CalendarSync {
  id: number;
  platform: string;
  url: string;
  created_at?: string;
  last_sync?: string;
  status: 'active' | 'error' | 'syncing';
}

export const SyncPage: React.FC<SyncPageProps> = ({ onNavClick }) => {
  const [syncs, setSyncs] = useState<CalendarSync[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPlatform, setNewPlatform] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    loadSyncs();
  }, []);

  const loadSyncs = async () => {
    try {
      const token = localStorage.getItem('token');
      const API = import.meta.env.VITE_API_URL as string;

      const res = await fetch(`${API}/ical`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      if (res.ok) {
        const data = await res.json();
        const mapped = (data.data || []).map((s: { id: number; platform: string; url: string; created_at: string; last_sync?: string }) => ({
          id: s.id,
          platform: s.platform,
          url: s.url,
          created_at: s.created_at,
          last_sync: s.last_sync || '',
          status: 'active' as const
        }));
        setSyncs(mapped);
      }

      // Load last sync time
      const lastSyncRes = await fetch(`${API}/ical/last-sync`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      if (lastSyncRes.ok) {
        const data = await lastSyncRes.json();
        setLastUpdated(data.last_updated || '');
      }
    } catch (error) {
      console.error('Error loading syncs:', error);
    } finally {
      setLoading(false);
    }
  };

  const addSync = async () => {
    if (!newPlatform.trim() || !newUrl.trim()) return;

    setIsAdding(true);
    try {
      const token = localStorage.getItem('token');
      const API = import.meta.env.VITE_API_URL as string;

      const res = await fetch(`${API}/ical`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ platform: newPlatform, url: newUrl })
      });

      if (res.ok) {
        // Sync immediately after adding
        await syncNow(0);

        setNewPlatform('');
        setNewUrl('');
        await loadSyncs();
      }
    } catch (error) {
      console.error('Error adding sync:', error);
    } finally {
      setIsAdding(false);
    }
  };

  const removeSync = async (id: number) => {
    try {
      const token = localStorage.getItem('token');
      const API = import.meta.env.VITE_API_URL as string;

      const res = await fetch(`${API}/ical/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (res.ok) {
        await loadSyncs();
      }
    } catch (error) {
      console.error('Error removing sync:', error);
    }
  };

  const syncNow = async (_id?: number) => {
    setIsSyncing(true);
    try {
      const token = localStorage.getItem('token');
      const API = import.meta.env.VITE_API_URL as string;
      const res = await fetch(`${API}/ical/sync`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setLastUpdated(data.last_updated || '');
        document.dispatchEvent(new Event('ical:updated'));
        await loadSyncs();
      }
    } catch (error) {
      console.error('Error syncing:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    const id = window.setInterval(() => { void syncNow(); }, 10 * 60 * 1000);
    return () => { window.clearInterval(id); };
  }, []);

  const copyICalLink = () => {
    const API = import.meta.env.VITE_API_URL as string;
    navigator.clipboard.writeText(`${API}/calendar/merged.ics`);
  };

  const getPlatformColor = (platform: string) => {
    switch (platform.toLowerCase()) {
      case 'airbnb':
        return 'bg-red-500 text-white';
      case 'booking.com':
        return 'bg-blue-600 text-white';
      case 'vrbo':
        return 'bg-green-600 text-white';
      default:
        return 'bg-zinc-600 text-white';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500';
      case 'syncing':
        return 'bg-yellow-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-zinc-500';
    }
  };

  return (
    <div className="">
      {/* Header */}
      <div className="bg-white border-b border-zinc-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Sincronização de Calendários</h1>
            <p className="text-sm text-zinc-500 mt-1">Gerencie suas integrações com plataformas externas</p>
          </div>
          <div className="flex flex-col md:flex-row items-end md:items-center gap-2">
            <button
              onClick={() => syncNow(0)}
              disabled={isSyncing}
              className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-md text-sm font-medium hover:bg-zinc-800 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {isSyncing ? 'Sincronizando...' : 'Sincronizar Agora'}
            </button>
            <button
              onClick={copyICalLink}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-zinc-200 rounded-md text-sm font-medium text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 transition-all shadow-sm"
            >
              <Link className="w-4 h-4" />
              Copiar Link iCal
            </button>
          </div>
        </div>

        <div className="mt-3 text-sm text-zinc-500">
          {lastUpdated ? (
            <>Última sincronização: {format(new Date(lastUpdated), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</>
          ) : (
            <>Última sincronização: —</>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Add New Calendar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm border border-zinc-200 p-6">
              <h3 className="text-lg font-semibold text-zinc-900 mb-4">Adicionar Novo Calendário</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">Plataforma</label>
                  <select
                    value={newPlatform}
                    onChange={(e) => setNewPlatform(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-900"
                  >
                    <option value="">Selecione uma plataforma</option>
                    <option value="Airbnb">Airbnb</option>
                    <option value="Booking.com">Booking.com</option>
                    <option value="VRBO">VRBO</option>
                    <option value="Outro">Outro</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">URL do iCal</label>
                  <input
                    type="url"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-2 border border-zinc-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-900"
                  />
                </div>

                <button
                  onClick={addSync}
                  disabled={isAdding || !newPlatform || !newUrl}
                  className="w-full px-4 py-2 bg-zinc-900 text-white rounded-md text-sm font-medium hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isAdding ? (
                    <>
                      <Loader2 className="w-4 h-4 inline mr-2 animate-spin" />
                      Adicionando...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 inline mr-2" />
                      Adicionar Calendário
                    </>
                  )}
                </button>
              </div>

              {/* Quick Links */}
              <div className="mt-6 pt-6 border-t border-zinc-200">
                <h4 className="text-sm font-medium text-zinc-900 mb-3">Links Rápidos</h4>
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      setNewPlatform('Airbnb');
                      setNewUrl('');
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 rounded-md transition-colors"
                  >
                    📱 Importar do Airbnb
                  </button>
                  <button
                    onClick={() => {
                      setNewPlatform('Booking.com');
                      setNewUrl('');
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 rounded-md transition-colors"
                  >
                    🏨 Importar do Booking.com
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Calendar List */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-zinc-200">
              <div className="p-6 border-b border-zinc-200">
                <h3 className="text-lg font-semibold text-zinc-900">Calendários Sincronizados</h3>
                <p className="text-sm text-zinc-500 mt-1">
                  {syncs.length} calendário(s) ativo(s)
                </p>
              </div>

              <div className="p-6">
                {loading ? (
                  <div className="text-center py-8">
                    <Loader2 className="w-8 h-8 animate-spin text-zinc-400 mx-auto mb-4" />
                    <p className="text-zinc-500">Carregando calendários...</p>
                  </div>
                ) : syncs.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <RefreshCw className="w-8 h-8 text-zinc-400" />
                    </div>
                    <p className="text-zinc-600 font-medium mb-2">Nenhum calendário sincronizado</p>
                    <p className="text-sm text-zinc-500">Adicione seu primeiro calendário para começar</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {syncs.map((sync) => (
                      <div key={sync.id} className="flex items-center justify-between p-4 border border-zinc-200 rounded-lg hover:border-zinc-300 transition-colors min-w-0">
                        <div className="flex items-center gap-4 min-w-0">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold ${getPlatformColor(sync.platform)}`}>
                            {sync.platform.substring(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-medium text-zinc-900 truncate">{sync.platform}</h4>
                            <p className="text-xs text-zinc-500 break-all">{sync.url}</p>
                            {sync.last_sync && (
                              <p className="text-xs text-zinc-400 mt-1">
                                Última sincronização: {format(new Date(sync.last_sync), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${getStatusColor(sync.status)}`}></div>
                            <span className="text-xs text-zinc-500">
                              {sync.status === 'active' ? 'Ativo' :
                                sync.status === 'syncing' ? 'Sincronizando' : 'Erro'}
                            </span>
                          </div>

                          <button
                            onClick={() => syncNow(sync.id)}
                            className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors"
                            title="Sincronizar agora"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => removeSync(sync.id)}
                            className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Remover calendário"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
