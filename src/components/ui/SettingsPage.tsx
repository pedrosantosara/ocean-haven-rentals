import React, { useState, useEffect } from 'react';
import { Settings, Bell, Lock, User, Globe, DollarSign, CalendarDays, MessageSquare } from 'lucide-react';

interface SettingsPageProps {
  onNavClick?: (section: string) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ onNavClick }) => {
  const [activeTab, setActiveTab] = useState('general');
  const [notifications, setNotifications] = useState({
    email: true,
    sms: false,
    push: true,
    newBooking: true,
    bookingCancelled: true,
    syncFailed: true,
    lowOccupancy: false
  });
  const [propertyName, setPropertyName] = useState('');
  const [checkinTime, setCheckinTime] = useState('');
  const [checkoutTime, setCheckoutTime] = useState('');
  const [basePrice, setBasePrice] = useState<number | ''>('');
  const [weekendPrice, setWeekendPrice] = useState<number | ''>('');
  const [cleaningFee, setCleaningFee] = useState<number | ''>('');
  const [serviceFee, setServiceFee] = useState<number | ''>('');
  const [weeklyPromoEnabled, setWeeklyPromoEnabled] = useState(false);
  const [monthlyPromoEnabled, setMonthlyPromoEnabled] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;
        const API = import.meta.env.VITE_API_URL as string;
        const r = await fetch(`${API}/settings`, { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) return;
        const j = await r.json();
        const s = j.settings || {};
        setPropertyName(String(s.property_name || ''));
        setCheckinTime(String(s.checkin_time || ''));
        setCheckoutTime(String(s.checkout_time || ''));
        setBasePrice(s.base_price !== undefined ? Number(s.base_price) : '');
        setWeekendPrice(s.weekend_price !== undefined ? Number(s.weekend_price) : '');
        setCleaningFee(s.cleaning_fee !== undefined ? Number(s.cleaning_fee) : '');
        setServiceFee(s.service_fee !== undefined ? Number(s.service_fee) : '');
        setWeeklyPromoEnabled(Number(s.discount_weekly || 0) > 0);
        setMonthlyPromoEnabled(Number(s.discount_monthly || 0) > 0);
      } catch (_) { return; }
    })();
  }, []);

  const tabs = [
    { id: 'general', label: 'Geral', icon: Settings },
    { id: 'notifications', label: 'Notificações', icon: Bell },
    { id: 'security', label: 'Segurança', icon: Lock },
    { id: 'pricing', label: 'Preços', icon: DollarSign }
  ];

  const handleNotificationChange = (key: string, value: boolean) => {
    setNotifications(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const API = import.meta.env.VITE_API_URL as string;
      const body = {
        PropertyName: propertyName,
        CheckinTime: checkinTime,
        CheckoutTime: checkoutTime,
        BasePrice: basePrice,
        WeekendPrice: weekendPrice,
        CleaningFee: cleaningFee,
        ServiceFee: serviceFee,
        DiscountWeekly: weeklyPromoEnabled ? 3 : 0,
        DiscountMonthly: monthlyPromoEnabled ? 5 : 0,
      };
      const r = await fetch(`${API}/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
      if (!r.ok) return;
      alert('Configurações salvas com sucesso!');
    } catch (_) { return; }
  };

  return (
    <div className="">
      {/* Header */}
      <div className="bg-white border-b border-zinc-200 px-6 py-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Configurações</h1>
          <p className="text-sm text-zinc-500 mt-1">Gerencie suas preferências e configurações</p>
        </div>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm border border-zinc-200 p-4">
              <nav className="space-y-1">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.id
                          ? 'bg-zinc-100 text-zinc-900'
                          : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50'
                        }`}
                    >
                      <Icon className="w-4 h-4" />
                      {tab.label}
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>

          {/* Content */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-xl shadow-sm border border-zinc-200 p-6">
              {activeTab === 'general' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-zinc-900 mb-4">Informações Gerais</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-2">Nome da Propriedade</label>
                        <input
                          type="text"
                          value={propertyName}
                          onChange={(e) => setPropertyName(e.target.value)}
                          className="w-full px-3 py-2 border border-zinc-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-900"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-2">Tipo de Propriedade</label>
                        <select className="w-full px-3 py-2 border border-zinc-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-900">
                          <option>Casa de Praia</option>
                          <option>Apartamento</option>
                          <option>Chalé</option>
                          <option>Pousada</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-2">Endereço</label>
                        <input
                          type="text"
                          defaultValue=""
                          placeholder="Ex: Maragogi, Alagoas, Brasil"
                          className="w-full px-3 py-2 border border-zinc-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-900"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-2">Capacidade Máxima</label>
                        <input
                          type="number"
                          defaultValue="8"
                          className="w-full px-3 py-2 border border-zinc-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-900"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-zinc-900 mb-4">Horários de Check-in/Check-out</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-2">Check-in</label>
                        <input
                          type="time"
                          value={checkinTime}
                          onChange={(e) => setCheckinTime(e.target.value)}
                          className="w-full px-3 py-2 border border-zinc-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-900"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-2">Check-out</label>
                        <input
                          type="time"
                          value={checkoutTime}
                          onChange={(e) => setCheckoutTime(e.target.value)}
                          className="w-full px-3 py-2 border border-zinc-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-900"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'notifications' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-zinc-900 mb-4">Preferências de Notificação</h3>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-medium text-zinc-900">Notificações por Email</h4>
                          <p className="text-sm text-zinc-500">Receba notificações por email</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={notifications.email}
                            onChange={(e) => handleNotificationChange('email', e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-zinc-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-zinc-900"></div>
                        </label>
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-medium text-zinc-900">Notificações por SMS</h4>
                          <p className="text-sm text-zinc-500">Receba notificações por SMS</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={notifications.sms}
                            onChange={(e) => handleNotificationChange('sms', e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-zinc-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-zinc-900"></div>
                        </label>
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-medium text-zinc-900">Notificações Push</h4>
                          <p className="text-sm text-zinc-500">Receba notificações no navegador</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={notifications.push}
                            onChange={(e) => handleNotificationChange('push', e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-zinc-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-zinc-900"></div>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-zinc-900 mb-4">Eventos de Notificação</h3>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-medium text-zinc-900">Novas Reservas</h4>
                          <p className="text-sm text-zinc-500">Notificar quando houver nova reserva</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={notifications.newBooking}
                            onChange={(e) => handleNotificationChange('newBooking', e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-zinc-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-zinc-900"></div>
                        </label>
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-medium text-zinc-900">Cancelamentos</h4>
                          <p className="text-sm text-zinc-500">Notificar quando houver cancelamento</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={notifications.bookingCancelled}
                            onChange={(e) => handleNotificationChange('bookingCancelled', e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-zinc-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-zinc-900"></div>
                        </label>
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-medium text-zinc-900">Falhas de Sincronização</h4>
                          <p className="text-sm text-zinc-500">Notificar quando houver falha na sincronização</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={notifications.syncFailed}
                            onChange={(e) => handleNotificationChange('syncFailed', e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-zinc-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-zinc-900"></div>
                        </label>
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-medium text-zinc-900">Baixa Ocupação</h4>
                          <p className="text-sm text-zinc-500">Notificar quando a ocupação estiver baixa</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={notifications.lowOccupancy}
                            onChange={(e) => handleNotificationChange('lowOccupancy', e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-zinc-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-zinc-900"></div>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'security' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-zinc-900 mb-4">Segurança da Conta</h3>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-2">Senha Atual</label>
                        <input
                          type="password"
                          className="w-full px-3 py-2 border border-zinc-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-900"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-2">Nova Senha</label>
                        <input
                          type="password"
                          className="w-full px-3 py-2 border border-zinc-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-900"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-2">Confirmar Nova Senha</label>
                        <input
                          type="password"
                          className="w-full px-3 py-2 border border-zinc-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-900"
                        />
                      </div>

                      <button className="px-4 py-2 bg-zinc-900 text-white rounded-md text-sm font-medium hover:bg-zinc-800 transition-colors">
                        Alterar Senha
                      </button>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-zinc-900 mb-4">Autenticação de Dois Fatores</h3>

                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-medium text-zinc-900">2FA</h4>
                        <p className="text-sm text-zinc-500">Adicione uma camada extra de segurança</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" />
                        <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-zinc-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-zinc-900"></div>
                      </label>
                    </div>
                  </div>
                </div>
              )}


              {activeTab === 'pricing' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-zinc-900 mb-4">Configurações de Preços</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-2">Preço Base (Diária)</label>
                        <input
                          type="number"
                          value={basePrice}
                          onChange={(e) => setBasePrice(Number(e.target.value))}
                          className="w-full px-3 py-2 border border-zinc-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-900"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-2">Preço Final de Semana</label>
                        <input
                          type="number"
                          value={weekendPrice}
                          onChange={(e) => setWeekendPrice(Number(e.target.value))}
                          className="w-full px-3 py-2 border border-zinc-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-900"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-2">Taxa de Limpeza</label>
                        <input
                          type="number"
                          value={cleaningFee}
                          onChange={(e) => setCleaningFee(Number(e.target.value))}
                          className="w-full px-3 py-2 border border-zinc-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-900"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-2">Taxa de Serviço</label>
                        <input
                          type="number"
                          value={serviceFee}
                          onChange={(e) => setServiceFee(Number(e.target.value))}
                          className="w-full px-3 py-2 border border-zinc-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-900"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-zinc-900 mb-4">Promoções</h3>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-medium text-zinc-900">Desconto semanal (3%)</h4>
                          <p className="text-sm text-zinc-500">Aplica ao completar 7 noites</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={weeklyPromoEnabled}
                            onChange={(e) => setWeeklyPromoEnabled(e.target.checked)}
                          />
                          <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-zinc-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-zinc-900"></div>
                        </label>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-medium text-zinc-900">Desconto mensal (5%)</h4>
                          <p className="text-sm text-zinc-500">Aplica ao completar 28 noites</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={monthlyPromoEnabled}
                            onChange={(e) => setMonthlyPromoEnabled(e.target.checked)}
                          />
                          <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-zinc-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-zinc-900"></div>
                        </label>
                      </div>
                    </div>
                  </div>

                </div>
              )}

              <div className="flex justify-end pt-6 border-t border-zinc-200">
                <button
                  onClick={handleSave}
                  className="px-6 py-2 bg-zinc-900 text-white rounded-md text-sm font-medium hover:bg-zinc-800 transition-colors"
                >
                  Salvar Alterações
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
