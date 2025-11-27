import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarDays, Link, Plus, TrendingUp, Home, Bell, ChevronLeft, ChevronRight, Send, User, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface Reservation {
  id: string;
  guestName: string;
  guestEmail?: string;
  checkIn: string;
  checkOut: string;
  status: string;
  source: 'Site' | 'Airbnb' | 'Booking.com';
  total: number;
  numberOfGuests?: number;
}

interface CalendarEvent {
  date: string;
  type: 'reservation' | 'block' | 'ical';
  source?: string;
  guestName?: string;
  color?: string;
}

export const NewDashboard: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [stats, setStats] = useState({ monthlyRevenue: 0, occupancy: 0, pendingRequests: 0 });
  const [manualOpen, setManualOpen] = useState(false);
  const [quickReplies, setQuickReplies] = useState<Record<string, string>>({});
  const [mGuestName, setMGuestName] = useState('');
  const [mGuestEmail, setMGuestEmail] = useState('');
  const [mGuestPhone, setMGuestPhone] = useState('');
  const [mGuests, setMGuests] = useState(1);
  const [mCheckIn, setMCheckIn] = useState('');
  const [mCheckOut, setMCheckOut] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [basePrice, setBasePrice] = useState<number | ''>('');
  const [weekendPrice, setWeekendPrice] = useState<number | ''>('');
  const navigate = useNavigate();
  const handleLogout = () => { localStorage.removeItem('token'); navigate('/auth'); };

  const [datePrices, setDatePrices] = useState<Record<string, number>>({});
  const [priceModalOpen, setPriceModalOpen] = useState(false);
  const [selectedDateStr, setSelectedDateStr] = useState('');
  const [datePriceInput, setDatePriceInput] = useState('');
  const [multiSelect, setMultiSelect] = useState(false);
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());
  const [bulkPriceInput, setBulkPriceInput] = useState('');

  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ];

  const pendingReservations = useMemo(
    () => reservations.filter(r => ['requested', 'pending'].includes((r.status || '').toLowerCase())),
    [reservations]
  );

  useEffect(() => {
    loadDashboardData();
    const handler = () => { void loadDashboardData(); };
    document.addEventListener('ical:updated', handler as EventListener);
    const id = window.setInterval(() => { void loadDashboardData(); }, 10 * 60 * 1000);
    return () => { document.removeEventListener('ical:updated', handler as EventListener); window.clearInterval(id); };
  }, []);

  useEffect(() => {
    const API = 'http://localhost:3005';
    const token = localStorage.getItem('token');
    const y = currentDate.getFullYear();
    const m = currentDate.getMonth();
    const startStr = format(new Date(y, m, 1), 'yyyy-MM-dd');
    const endStr = format(new Date(y, m + 1, 0), 'yyyy-MM-dd');
    fetch(`${API}/date-prices?start=${startStr}&end=${endStr}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(res => res.ok ? res.json() : Promise.reject(new Error('failed')))
      .then(data => {
        const map: Record<string, number> = {};
        (data.data || []).forEach((r: { date: string; Date?: string; price: number; Price?: number }) => {
          const ds = (r.date || r.Date || '').split('T')[0];
          if (ds) map[ds] = Number(r.price || r.Price || 0);
        });
        setDatePrices(map);
      })
      .catch(() => {});
  }, [currentDate]);

  const loadDashboardData = async () => {
    try {
      const token = localStorage.getItem('token');
      const API = 'http://localhost:3005';

      const res = await fetch(`${API}/bookings`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (res.ok) {
        const data = await res.json();
        type BRec = { ID?: string; id?: string; GuestName?: string; guest_name?: string; GuestEmail?: string; guest_email?: string; CheckIn?: string; check_in?: string; CheckOut?: string; check_out?: string; Status?: string; status?: string; TotalPrice?: number; total_price?: number; NumberOfGuests?: number; number_of_guests?: number };
        const mapped = (data.data || []).map((r: BRec) => ({
          id: r.ID || r.id || '',
          guestName: r.GuestName || r.guest_name || '',
          guestEmail: r.GuestEmail || r.guest_email || '',
          checkIn: r.CheckIn || r.check_in || '',
          checkOut: r.CheckOut || r.check_out || '',
          status: r.Status || r.status || '',
          source: 'Site' as const,
          total: Number(r.TotalPrice || r.total_price || 0),
          numberOfGuests: Number(r.NumberOfGuests || r.number_of_guests || 1),
        })) as Reservation[];
        setReservations(mapped);
      }

      const icsRes = await fetch(`${API}/calendar/merged.ics?t=${Date.now()}`);
      if (icsRes.ok) {
        const icsText = await icsRes.text();
        const events = parseICSEvents(icsText);
        setCalendarEvents(events);
      }

      const sRes = await fetch(`${API}/settings/public`);
      if (sRes.ok) {
        const j = await sRes.json();
        const s = j.settings || {};
        setBasePrice(s.base_price !== undefined ? Number(s.base_price) : '');
        setWeekendPrice(s.weekend_price !== undefined ? Number(s.weekend_price) : '');
      }

      const statsRes = await fetch(`${API}/stats/dashboard`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats({
          monthlyRevenue: Number(statsData.monthly_revenue || statsData.total_revenue || 0),
          occupancy: Number(statsData.occupancy_rate || 0),
          pendingRequests: Number(statsData.pending_requests || 0),
        });
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    }
  };

  const parseICSEvents = (icsText: string): CalendarEvent[] => {
    const events: CalendarEvent[] = [];
    const lines = icsText.split(/\r?\n/);
    let current: { dtstart?: Date; dtend?: Date; summary?: string; categories?: string } = {};
    const parseIcsDate = (value: string): Date => {
      if (/^\d{8}$/.test(value)) {
        const y = Number(value.slice(0, 4));
        const m = Number(value.slice(4, 6)) - 1;
        const d = Number(value.slice(6, 8));
        return new Date(y, m, d);
      }
      if (/^\d{8}T\d{6}Z$/.test(value)) {
        const y = Number(value.slice(0, 4));
        const m = Number(value.slice(4, 6)) - 1;
        const d = Number(value.slice(6, 8));
        return new Date(y, m, d);
      }
      return new Date(value);
    };
    for (const raw of lines) {
      const line = raw.trim();
      if (line.startsWith('BEGIN:VEVENT')) { current = {}; continue; }
      if (line.startsWith('DTSTART')) { const [, val] = line.split(':'); current.dtstart = parseIcsDate(val); continue; }
      if (line.startsWith('DTEND')) { const [, val] = line.split(':'); current.dtend = parseIcsDate(val); continue; }
      if (line.startsWith('SUMMARY')) { const [, val] = line.split(':'); current.summary = val; continue; }
      if (line.startsWith('CATEGORIES')) { const [, val] = line.split(':'); current.categories = val; continue; }
      if (line.startsWith('END:VEVENT')) {
        if (current.dtstart && current.dtend) {
          const inclusiveEnd = new Date(current.dtend); inclusiveEnd.setDate(inclusiveEnd.getDate() - 1);
          const cur = new Date(current.dtstart);
          while (cur <= inclusiveEnd) {
            const dateStr = format(cur, 'yyyy-MM-dd');
            let type: CalendarEvent['type'] = 'reservation';
            let source = current.categories || 'Site';
            let color = '#10b981';
            const cat = (current.categories || '').toLowerCase();
            const sum = (current.summary || '').toLowerCase();
            if (cat.includes('block')) { type = 'block'; color = '#ef4444'; }
            else if (cat.includes('airbnb')) { source = 'Airbnb'; color = '#f59e0b'; }
            else if (cat.includes('booking')) { source = 'Booking.com'; color = '#3b82f6'; }
            else {
              if (sum.includes('airbnb')) { source = 'Airbnb'; color = '#f59e0b'; }
              else if (sum.includes('booking')) { source = 'Booking.com'; color = '#3b82f6'; }
            }
            events.push({ date: dateStr, type, source, guestName: current.summary, color });
            cur.setDate(cur.getDate() + 1);
          }
        }
        current = {};
        continue;
      }
    }
    return events;
  };

  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const padding = Array.from({ length: firstDay }, (_, i) => i);
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const getEventsForDate = (day: number) => {
    const dateStr = format(new Date(year, month, day), 'yyyy-MM-dd');
    return calendarEvents.filter(event => event.date === dateStr);
  };

  const approveBooking = async (id: string) => {
    try {
      const token = localStorage.getItem('token');
      const API = 'http://localhost:3005';
      const res = await fetch(`${API}/bookings/${id}/approve`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (res.ok) { await loadDashboardData(); document.dispatchEvent(new Event('ical:updated')); }
    } catch (e) { void e; }
  };
  const rejectBooking = async (id: string) => {
    try {
      const token = localStorage.getItem('token');
      const API = 'http://localhost:3005';
      const res = await fetch(`${API}/bookings/${id}/reject`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (res.ok) { await loadDashboardData(); document.dispatchEvent(new Event('ical:updated')); }
    } catch (e) { void e; }
  };

  return (
    <>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Visão Geral</h1>
          <p className="text-sm text-zinc-500 mt-1">Gerencie suas reservas e disponibilidade.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-white border border-zinc-200 rounded-md text-sm font-medium text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 transition-all shadow-sm">
            <Link className="w-4 h-4" />
            Copiar Link iCal
          </button>
          <button className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-md text-sm font-medium hover:bg-zinc-800 transition-all shadow-sm hover:shadow-md" onClick={() => setManualOpen(true)}>
            <Plus className="w-4 h-4" />
            Nova Reserva Manual
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
        <div className="p-6 rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-zinc-500">Receita Mensal</span>
            <TrendingUp className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="text-2xl font-semibold tracking-tight">R$ {stats.monthlyRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
        </div>
        <div className="p-6 rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-zinc-500">Ocupação</span>
            <Home className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="text-2xl font-semibold tracking-tight">{stats.occupancy}%</div>
        </div>
        <div className="p-6 rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-zinc-500">Pendentes</span>
            <Bell className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="text-2xl font-semibold tracking-tight">{stats.pendingRequests}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-12 mt-8">
        <div className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-zinc-200 flex items-center justify-between">
            <h2 className="font-medium text-zinc-900">{monthNames[month]} {year}</h2>
            <div className="flex gap-1">
              <button onClick={prevMonth} className="p-1 hover:bg-zinc-100 rounded text-zinc-500">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={nextMonth} className="p-1 hover:bg-zinc-100 rounded text-zinc-500">
                <ChevronRight className="w-4 h-4" />
              </button>
              <button onClick={() => { setMultiSelect((v) => !v); setSelectedDays(new Set()); }} className="ml-2 px-2 py-1 text-xs border border-zinc-200 rounded text-zinc-600 hover:bg-zinc-100">
                {multiSelect ? 'Editar múltiplos' : 'Selecionar dias'}
              </button>
            </div>
          </div>
          <div className="p-6 md:p-5 overflow-hidden">
            <div className="grid grid-cols-7 text-center mb-2 hidden md:grid">
              {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
                <div key={d} className="text-sm md:text-xs text-zinc-400 font-medium py-3 md:py-2">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-1 text-sm">
              {padding.map(i => (
                <div key={`pad-${i}`} className="h-36 md:h-28 p-2 border border-transparent rounded-lg text-zinc-300 hidden md:block"></div>
              ))}
              {days.map(day => {
                const events = getEventsForDate(day);
                const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();
                const weekDayName = format(new Date(year, month, day), 'EEE', { locale: ptBR });
                const ds = format(new Date(year, month, day), 'yyyy-MM-dd');
                const isSelected = selectedDays.has(ds);
                return (
                  <div
                    key={day}
                    className={`h-36 md:h-28 p-3 md:p-2 border ${isSelected ? 'border-blue-400 bg-blue-50/20' : 'border-zinc-100'} rounded-lg hover:border-zinc-200 transition-colors relative group cursor-pointer ${isToday ? 'bg-blue-50/30' : ''}`}
                    onClick={() => {
                      if (multiSelect) {
                        setSelectedDays((prev) => {
                          const next = new Set(prev);
                          if (next.has(ds)) next.delete(ds); else next.add(ds);
                          return next;
                        });
                        return;
                      }
                      setSelectedDateStr(ds);
                      const existing = datePrices[ds];
                      setDatePriceInput(existing !== undefined ? String(existing) : '');
                      setPriceModalOpen(true);
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-base md:text-sm font-medium ${isToday ? 'text-blue-600 bg-blue-100 w-7 h-7 flex items-center justify-center rounded-full' : 'text-zinc-700'}`}>{day}</span>
                      <span className="md:hidden text-xs text-zinc-400 uppercase font-medium">{weekDayName}</span>
                    </div>
                    {(() => {
                      const price = datePrices[ds];
                      if (price === undefined) return null;
                      return (
                        <div className="absolute top-1 right-1 text-[11px] md:text-[10px] bg-zinc-200 text-zinc-800 px-1.5 py-0.5 rounded">
                          R$ {Number(price).toLocaleString('pt-BR')}
                        </div>
                      );
                    })()}
                    {events.map((event, idx) => (
                      <div key={idx} className="mt-1 px-1.5 py-0.5 text-[11px] md:text-[10px] rounded truncate" style={{ backgroundColor: (event.color || '#000') + '20', color: event.color || '#000', borderLeft: `2px solid ${event.color || '#000'}` }}>
                        {event.guestName || event.source}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
            {multiSelect && selectedDays.size > 0 && (
              <div className="mt-4 p-4 bg-zinc-50 border border-zinc-200 rounded-lg flex items-center gap-3">
                <div className="text-sm text-zinc-600">{selectedDays.size} dia(s) selecionado(s)</div>
                <Input placeholder="Valor em reais" value={bulkPriceInput} onChange={(e) => setBulkPriceInput(e.target.value)} />
                <Button
                  onClick={async () => {
                    const price = Number(bulkPriceInput);
                    if (!isFinite(price)) { toast.error('Valor inválido'); return; }
                    const API = 'http://localhost:3005';
                    const token = localStorage.getItem('token');
                    const dates = Array.from(selectedDays);
                    const res = await fetch(`${API}/date-prices/bulk`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                      body: JSON.stringify({ Dates: dates, Price: price })
                    });
                    if (res.ok) {
                      setDatePrices((prev) => {
                        const next = { ...prev };
                        dates.forEach((d) => { next[d] = price; });
                        return next;
                      });
                      toast.success('Preços atualizados');
                      setSelectedDays(new Set());
                      setBulkPriceInput('');
                    } else {
                      toast.error('Erro ao atualizar preços');
                    }
                  }}
                >
                  Aplicar preço aos selecionados
                </Button>
                <Button variant="outline" onClick={() => setSelectedDays(new Set())}>Limpar seleção</Button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {pendingReservations.length === 0 ? (
            <div className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
              <div className="p-4 bg-amber-50/50 border-b border-zinc-200/60 flex items-center justify-between">
                <span className="text-sm font-medium text-amber-900 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></span>
                  Solicitação Pendente
                </span>
                <span className="text-xs text-amber-700/70 font-mono">—</span>
              </div>
              <div className="p-6">
                <div className="text-center text-sm text-zinc-500">Nenhuma solicitação pendente</div>
              </div>
            </div>
          ) : (
            pendingReservations.map((r) => {
              const nights = Math.max(0, Math.floor((new Date(r.checkOut).getTime() - new Date(r.checkIn).getTime()) / (1000 * 60 * 60 * 24)));
              const reply = quickReplies[r.id] || '';
              return (
                <div key={r.id} className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
                  <div className="p-4 bg-amber-50/50 border-b border-zinc-200/60 flex items-center justify-between">
                    <span className="text-sm font-medium text-amber-900 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></span>
                      Solicitação Pendente
                    </span>
                    <span className="text-xs text-amber-700/70 font-mono">#{String(r.id).slice(0, 8)}</span>
                  </div>
                  <div className="p-6">
                    <div className="flex items-start gap-4 mb-6">
                      <div className="w-12 h-12 rounded-full border border-zinc-100 bg-zinc-50 flex items-center justify-center">
                        <User className="w-6 h-6 text-zinc-600" />
                      </div>
                      <div>
                        <h4 className="font-medium text-zinc-900">{r.guestName}</h4>
                        {r.guestEmail && (<p className="text-sm text-zinc-500">{r.guestEmail}</p>)}
                      </div>
                    </div>
                    <div className="space-y-3 mb-6">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-zinc-500 flex items-center gap-2"><CalendarDays className="w-3.5 h-3.5" /> Check-in</span>
                        <span className="font-medium text-zinc-900">{format(new Date(r.checkIn), 'dd MMM, yyyy', { locale: ptBR })}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-zinc-500 flex items-center gap-2"><CalendarDays className="w-3.5 h-3.5" /> Check-out</span>
                        <span className="font-medium text-zinc-900">{format(new Date(r.checkOut), 'dd MMM, yyyy', { locale: ptBR })}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-zinc-500 flex items-center gap-2"><User className="w-3.5 h-3.5" /> Hóspedes</span>
                        <span className="font-medium text-zinc-900">{r.numberOfGuests || 1} {(r.numberOfGuests || 1) > 1 ? 'Hóspedes' : 'Hóspede'}</span>
                      </div>
                      <div className="pt-3 border-t border-zinc-100 flex items-center justify-between">
                        <span className="text-sm font-medium text-zinc-500">Total ({nights} noite{nights === 1 ? '' : 's'})</span>
                        <span className="text-lg font-semibold tracking-tight text-zinc-900">R$ {Number(r.total || 0).toLocaleString('pt-BR')}</span>
                      </div>
                    </div>
                    <div className="bg-zinc-50 rounded-lg p-4 mb-6 border border-zinc-100">
                      <p className="text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">Mensagem do Hóspede</p>
                      <div className="mt-3 flex gap-2">
                        <input type="text" placeholder="Responder..." value={reply} onChange={(e) => setQuickReplies(prev => ({ ...prev, [r.id]: e.target.value }))} className="flex-1 bg-white border border-zinc-200 text-xs px-3 py-2 rounded-md focus:outline-none focus:border-zinc-400" />
                        <button className="bg-white border border-zinc-200 p-2 rounded-md hover:bg-zinc-50 text-zinc-600" onClick={async () => {
                          const token = localStorage.getItem('token');
                          const API = 'http://localhost:3005';
                          const msg = quickReplies[r.id];
                          if (!msg) return;
                          await fetch(`${API}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ BookingID: r.id, Message: msg }) });
                          setQuickReplies(prev => ({ ...prev, [r.id]: '' }));
                        }}>
                          <Send className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <button className="flex items-center justify-center gap-2 px-4 py-2.5 border border-zinc-200 rounded-md text-sm font-medium text-zinc-600 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-all" onClick={() => rejectBooking(r.id)}>
                        Recusar
                      </button>
                      <button className="flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-900 text-white rounded-md text-sm font-medium hover:bg-zinc-800 transition-all shadow-sm hover:shadow-md" onClick={() => approveBooking(r.id)}>
                        Aceitar
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <Dialog open={priceModalOpen} onOpenChange={setPriceModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Preço do dia</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-zinc-500">{selectedDateStr}</div>
            <Input
              placeholder="Valor em reais"
              value={datePriceInput}
              onChange={(e) => setDatePriceInput(e.target.value)}
            />
          </div>
          <DialogFooter>
            {selectedDateStr && datePrices[selectedDateStr] !== undefined && (
              <Button
                variant="outline"
                onClick={async () => {
                  const API = 'http://localhost:3005';
                  const token = localStorage.getItem('token');
                  const res = await fetch(`${API}/date-prices/${selectedDateStr}`, { method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : {} });
                  if (res.ok) {
                    setDatePrices((prev) => {
                      const next = { ...prev };
                      delete next[selectedDateStr];
                      return next;
                    });
                    toast.success('Preço removido');
                    setPriceModalOpen(false);
                  } else {
                    toast.error('Erro ao remover preço');
                  }
                }}
              >
                Remover preço
              </Button>
            )}
            <Button
              onClick={async () => {
                if (!selectedDateStr) return;
                const API = 'http://localhost:3005';
                const token = localStorage.getItem('token');
                const price = Number(datePriceInput);
                if (!isFinite(price)) { toast.error('Valor inválido'); return; }
                const res = await fetch(`${API}/date-prices`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                  body: JSON.stringify({ Date: selectedDateStr, Price: price })
                });
                if (res.ok) {
                  setDatePrices((prev) => ({ ...prev, [selectedDateStr]: price }));
                  toast.success('Preço atualizado');
                  setPriceModalOpen(false);
                } else {
                  toast.error('Erro ao salvar preço');
                }
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
