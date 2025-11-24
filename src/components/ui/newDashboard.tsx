import React, { useState, useEffect, useMemo } from 'react';
import { LayoutDashboard, CalendarDays, MessageSquare, Users, RefreshCw, Settings, Link, Plus, TrendingUp, Home, Bell, ChevronLeft, ChevronRight, Trash2, Send, Star, User } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarPage } from '@/components/ui/CalendarPage';
import { MessagesPage } from '@/components/ui/MessagesPage';
import { SyncPage } from '@/components/ui/SyncPage';
import { GuestsPage } from '@/components/ui/GuestsPage';
import { SettingsPage } from '@/components/ui/SettingsPage';

interface DashboardProps {
  userName?: string;
  userRole?: string;
  onNavClick?: (section: string) => void;
}

interface Reservation {
  id: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  status: string;
  source: 'Site' | 'Airbnb' | 'Booking.com';
  total: number;
  numberOfGuests?: number;
  guestEmail?: string;
}

interface CalendarEvent {
  date: string;
  type: 'reservation' | 'block' | 'ical';
  source?: string;
  guestName?: string;
  color: string;
}

interface MessageThread {
  id: string;
  guestName: string;
  lastMessage: string;
  unread: boolean;
  timestamp: string;
}

export const NewDashboard: React.FC<DashboardProps> = ({ 
  userName = "João Silva", 
  userRole = "Superhost",
  onNavClick = () => {}
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [messageThreads, setMessageThreads] = useState<MessageThread[]>([]);
  const [stats, setStats] = useState({
    monthlyRevenue: 12450,
    occupancy: 82,
    pendingRequests: 3
  });
  const [activeNav, setActiveNav] = useState('dashboard');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [quickReplies, setQuickReplies] = useState<Record<string, string>>({});
  const [mGuestName, setMGuestName] = useState('');
  const [mGuestEmail, setMGuestEmail] = useState('');
  const [mGuestPhone, setMGuestPhone] = useState('');
  const [mGuests, setMGuests] = useState(1);
  const [mCheckIn, setMCheckIn] = useState('');
  const [mCheckOut, setMCheckOut] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [basePrice, setBasePrice] = useState(500);
  const [weekendPrice, setWeekendPrice] = useState(600);
  const pendingReservations = useMemo(() => reservations.filter(r => (r.status || '').toLowerCase() === 'requested' || (r.status || '').toLowerCase() === 'pending'), [reservations]);
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

  const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  useEffect(() => {
    loadDashboardData();
    const handler = () => { void loadDashboardData(); };
    document.addEventListener('ical:updated', handler as EventListener);
    const id = window.setInterval(() => { void loadDashboardData(); }, 10 * 60 * 1000);
    return () => { document.removeEventListener('ical:updated', handler as EventListener); window.clearInterval(id); };
  }, []);

  const loadDashboardData = async () => {
    try {
      const token = localStorage.getItem('token');
      const API = 'http://localhost:3005';
      
      // Load reservations
      const res = await fetch(`${API}/bookings`, { 
        headers: token ? { Authorization: `Bearer ${token}` } : {} 
      });
      if (res.ok) {
        const data = await res.json();
      const mapped = (data.data || []).map((r: { ID?: string; id?: string; GuestName?: string; guest_name?: string; GuestEmail?: string; guest_email?: string; NumberOfGuests?: number; number_of_guests?: number; CheckIn?: string; check_in?: string; CheckOut?: string; check_out?: string; Status?: string; status?: string; TotalPrice?: number; total_price?: number }) => ({
        id: r.ID || r.id || '',
        guestName: r.GuestName || r.guest_name || '',
        guestEmail: r.GuestEmail || r.guest_email || '',
        checkIn: r.CheckIn || r.check_in || '',
        checkOut: r.CheckOut || r.check_out || '',
        status: r.Status || r.status || '',
        source: 'Site' as const,
        total: r.TotalPrice || r.total_price || 0,
        numberOfGuests: r.NumberOfGuests || r.number_of_guests || 1
      }));
      setReservations(mapped);
      }

      // Load calendar events from merged.ics
      const icsRes = await fetch(`${API}/calendar/merged.ics?t=${Date.now()}`);
      if (icsRes.ok) {
        const icsText = await icsRes.text();
        const events = parseICSEvents(icsText);
        setCalendarEvents(events);
      }

      // Load pricing settings
      try {
        const sRes = await fetch(`${API}/settings/public`);
        if (sRes.ok) {
          const j = await sRes.json();
          const s = j.settings || {};
          setBasePrice(Number(s.base_price || basePrice));
          setWeekendPrice(Number(s.weekend_price || weekendPrice));
        }
      } catch (_) {
        // ignore
      }

      // Load stats
      const statsRes = await fetch(`${API}/stats/dashboard`, { 
        headers: token ? { Authorization: `Bearer ${token}` } : {} 
      });
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats({
          monthlyRevenue: statsData.total_revenue || 12450,
          occupancy: statsData.occupancy || 82,
          pendingRequests: statsData.pending_requests || 3
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

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'calendar', label: 'Calendário', icon: CalendarDays },
    { id: 'messages', label: 'Mensagens', icon: MessageSquare },
    { id: 'guests', label: 'Hóspedes', icon: Users },
    { id: 'sync', label: 'Sincronização iCal', icon: RefreshCw },
    { id: 'settings', label: 'Configurações', icon: Settings }
  ];

  return (
    <div className="flex h-screen bg-zinc-50 text-zinc-900 antialiased">
      {/* Sidebar Navigation */}
      <nav className="w-64 border-r border-zinc-200 bg-white flex-col justify-between hidden md:flex shrink-0 h-full">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-zinc-900 rounded-lg flex items-center justify-center text-white">
              <span className="font-semibold tracking-tighter text-sm">H.</span>
            </div>
            <span className="text-lg font-semibold tracking-tight">HOSTIFY</span>
          </div>

          <div className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveNav(item.id);
                    onNavClick(item.id);
                  }}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors w-full text-left ${
                    activeNav === item.id
                      ? 'bg-zinc-100 text-zinc-900'
                      : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                  {item.id === 'messages' && messageThreads.some(t => t.unread) && (
                    <span className="w-2 h-2 bg-blue-500 rounded-full ml-auto"></span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-4 border-t border-zinc-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center">
              <User className="w-4 h-4 text-zinc-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{userName}</p>
              <p className="text-xs text-zinc-500 truncate">{userRole}</p>
            </div>
            <button className="text-zinc-400 hover:text-zinc-900">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        {/* Header mobile */}
        <header className="md:hidden h-16 border-b border-zinc-200 bg-white flex items-center justify-between px-4 shrink-0 z-20">
          <span className="font-semibold tracking-tight">HOSTIFY</span>
          <button className="p-2 text-zinc-500" onClick={() => setMobileOpen(true)}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 md:p-10 scroll-smooth">
          <div className="max-w-7xl mx-auto space-y-10">
            {activeNav !== 'dashboard' && (
              activeNav === 'calendar' ? <CalendarPage /> :
              activeNav === 'messages' ? <MessagesPage /> :
              activeNav === 'guests' ? <GuestsPage /> :
              activeNav === 'sync' ? <SyncPage /> :
              activeNav === 'settings' ? <SettingsPage /> : null
            )}
            <div className={activeNav === 'dashboard' ? '' : 'hidden'}>
            
            {/* Header Section */}
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

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-6 rounded-xl border border-zinc-200 bg-white shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium text-zinc-500">Receita Mensal</span>
                  <TrendingUp className="w-4 h-4 text-zinc-400" />
                </div>
                <div className="text-2xl font-semibold tracking-tight">R$ {stats.monthlyRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                <div className="mt-2 flex items-center text-xs text-emerald-600 font-medium">
                  <span className="bg-emerald-50 px-1.5 py-0.5 rounded">+12%</span>
                  <span className="text-zinc-400 ml-2 font-normal">vs. mês anterior</span>
                </div>
              </div>
              <div className="p-6 rounded-xl border border-zinc-200 bg-white shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium text-zinc-500">Ocupação</span>
                  <Home className="w-4 h-4 text-zinc-400" />
                </div>
                <div className="text-2xl font-semibold tracking-tight">{stats.occupancy}%</div>
                <div className="mt-2 w-full bg-zinc-100 rounded-full h-1.5">
                  <div className="bg-zinc-900 h-1.5 rounded-full" style={{ width: `${stats.occupancy}%` }}></div>
                </div>
              </div>
              <div className="p-6 rounded-xl border border-zinc-200 bg-white shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium text-zinc-500">Pendentes</span>
                  <Bell className="w-4 h-4 text-zinc-400" />
                </div>
                <div className="text-2xl font-semibold tracking-tight">{stats.pendingRequests}</div>
                <div className="mt-2 text-xs text-zinc-500">Requerem sua atenção</div>
              </div>
            </div>

            {/* Calendar Preview + Pending */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mt-8">
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
                  </div>
                </div>
                <div className="p-6 md:p-5">
                  <div className="grid grid-cols-7 text-center mb-2">
                    {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
                      <div key={d} className="text-sm md:text-xs text-zinc-400 font-medium py-3 md:py-2">{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-sm">
                    {padding.map(i => (
                      <div key={`pad-${i}`} className="h-36 md:h-28 p-2 border border-transparent rounded-lg text-zinc-300"></div>
                    ))}
                    {days.map(day => {
                      const events = getEventsForDate(day);
                      const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();
                      
                      return (
                        <div key={day} className={`h-36 md:h-28 p-3 md:p-2 border border-zinc-100 rounded-lg hover:border-zinc-200 transition-colors relative group cursor-pointer ${
                          isToday ? 'bg-blue-50/30' : ''
                        }`}>
                          <span className={`text-base md:text-sm font-medium ${
                            isToday ? 'text-blue-600 bg-blue-100 w-7 h-7 flex items-center justify-center rounded-full' : 'text-zinc-700'
                          }`}>
                            {day}
                          </span>
                          
                          {events.map((event, idx) => (
                            <div
                              key={idx}
                              className="mt-1 px-1.5 py-0.5 text-[11px] md:text-[10px] rounded truncate"
                              style={{ backgroundColor: event.color + '20', color: event.color, borderLeft: `2px solid ${event.color}` }}
                            >
                              {event.guestName || event.source}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="space-y-6 mt-6 lg:mt-0">
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
                    const nights = Math.max(0, differenceInDays(new Date(r.checkOut), new Date(r.checkIn)));
                    const reply = quickReplies[r.id] || '';
                    return (
                      <div key={r.id} className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
                        <div className="p-4 bg-amber-50/50 border-b border-zinc-200/60 flex items-center justify-between">
                          <span className="text-sm font-medium text-amber-900 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></span>
                            Solicitação Pendente
                          </span>
                          <span className="text-xs text-amber-700/70 font-mono">#{String(r.id).slice(0,8)}</span>
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
                              <span className="text-zinc-500 flex items-center gap-2"><Users className="w-3.5 h-3.5" /> Hóspedes</span>
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
            </div>
          </div>
        </div>
        {mobileOpen && (
          <div className="md:hidden fixed inset-0 z-30">
            <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)}></div>
            <div className="absolute left-0 top-0 bottom-0 w-72 bg-white border-r border-zinc-200 shadow-lg p-5 flex flex-col gap-2">
              <div className="flex items-center justify-between mb-4">
                <span className="font-semibold tracking-tight">HOSTIFY</span>
                <button className="p-2 text-zinc-500" onClick={() => setMobileOpen(false)}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => { setActiveNav(item.id); onNavClick(item.id); setMobileOpen(false); }}
                      className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors w-full text-left ${
                        activeNav === item.id ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        {manualOpen && (
          <div className="fixed inset-0 z-40">
            <div className="absolute inset-0 bg-black/50" onClick={() => setManualOpen(false)}></div>
            <div className="absolute left-1/2 top-24 -translate-x-1/2 w-[95%] max-w-lg bg-white border border-zinc-200 rounded-xl shadow-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-zinc-900">Nova Reserva Manual</h2>
                <button className="p-2 text-zinc-500" onClick={() => setManualOpen(false)}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Check-in</label>
                  <input type="date" value={mCheckIn} onChange={(e) => setMCheckIn(e.target.value)} className="w-full px-3 py-2 border border-zinc-200 rounded-md text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Check-out</label>
                  <input type="date" value={mCheckOut} onChange={(e) => setMCheckOut(e.target.value)} className="w-full px-3 py-2 border border-zinc-200 rounded-md text-sm" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Nome do Hóspede</label>
                  <input type="text" value={mGuestName} onChange={(e) => setMGuestName(e.target.value)} className="w-full px-3 py-2 border border-zinc-200 rounded-md text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Email</label>
                  <input type="email" value={mGuestEmail} onChange={(e) => setMGuestEmail(e.target.value)} className="w-full px-3 py-2 border border-zinc-200 rounded-md text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Telefone</label>
                  <input type="tel" value={mGuestPhone} onChange={(e) => setMGuestPhone(e.target.value)} className="w-full px-3 py-2 border border-zinc-200 rounded-md text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Hóspedes</label>
                  <input type="number" min={1} value={mGuests} onChange={(e) => setMGuests(Number(e.target.value))} className="w-full px-3 py-2 border border-zinc-200 rounded-md text-sm" />
                </div>
              </div>
              <div className="mt-4 p-3 bg-zinc-50 rounded-lg border border-zinc-200 text-sm">
                {(() => {
                  if (!mCheckIn || !mCheckOut) return <span>Preencha as datas para calcular o total</span>;
                  const ci = new Date(mCheckIn);
                  const co = new Date(mCheckOut);
                  const nights = Math.max(0, differenceInDays(co, ci));
                  let weekendNights = 0; let weekdayNights = 0;
                  for (let i = 0; i < nights; i++) { const d = new Date(ci); d.setDate(d.getDate() + i); const dow = d.getDay(); if (dow === 5 || dow === 6) weekendNights++; else weekdayNights++; }
                  const subtotal = weekendNights * weekendPrice + weekdayNights * basePrice;
                  return (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between"><span>Noites</span><span className="font-medium">{nights}</span></div>
                      <div className="flex items-center justify-between"><span>Semana</span><span className="font-medium">{weekdayNights} × R$ {basePrice.toLocaleString('pt-BR')}</span></div>
                      <div className="flex items-center justify-between"><span>Fim de semana</span><span className="font-medium">{weekendNights} × R$ {weekendPrice.toLocaleString('pt-BR')}</span></div>
                      <div className="flex items-center justify-between border-t border-zinc-200 pt-2 mt-1"><span className="font-semibold">Total</span><span className="text-lg font-bold">R$ {subtotal.toLocaleString('pt-BR')}</span></div>
                    </div>
                  );
                })()}
              </div>
              <div className="mt-4 flex gap-2">
                <button className="flex-1 px-4 py-2 border border-zinc-200 rounded-md text-sm font-medium text-zinc-700 hover:bg-zinc-50" onClick={() => setManualOpen(false)}>Cancelar</button>
                <button className="flex-1 px-4 py-2 bg-zinc-900 text-white rounded-md text-sm font-medium hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed" disabled={isCreating} onClick={async () => {
                  if (!mCheckIn || !mCheckOut || !mGuestName || !mGuestEmail) return;
                  setIsCreating(true);
                  try {
                    const API = 'http://localhost:3005';
                    const token = localStorage.getItem('token');
                    const ci = new Date(mCheckIn);
                    const co = new Date(mCheckOut);
                    const nights = Math.max(0, differenceInDays(co, ci));
                    let weekendNights = 0; let weekdayNights = 0;
                    for (let i = 0; i < nights; i++) { const d = new Date(ci); d.setDate(d.getDate() + i); const dow = d.getDay(); if (dow === 5 || dow === 6) weekendNights++; else weekdayNights++; }
                    const subtotal = weekendNights * weekendPrice + weekdayNights * basePrice;
                    const body = { CheckIn: new Date(mCheckIn).toISOString(), CheckOut: new Date(mCheckOut).toISOString(), GuestName: mGuestName, GuestEmail: mGuestEmail, GuestPhone: mGuestPhone, NumberOfGuests: mGuests, SubtotalPrice: subtotal, DiscountAmount: 0, TotalPrice: subtotal };
                    const res = await fetch(`${API}/bookings`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
                    if (res.ok) { setManualOpen(false); setMGuestName(''); setMGuestEmail(''); setMGuestPhone(''); setMGuests(1); setMCheckIn(''); setMCheckOut(''); await loadDashboardData(); document.dispatchEvent(new Event('ical:updated')); }
                  } finally { setIsCreating(false); }
                }}>{isCreating ? 'Criando...' : 'Criar Reserva'}</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}