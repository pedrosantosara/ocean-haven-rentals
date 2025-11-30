import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Plus,
  Filter,
  Download,
  Eye,
  MessageSquare,
  Phone,
  Mail,
  Link,
} from 'lucide-react';
import { format, addMonths, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface CalendarPageProps {
  onNavClick?: (section: string) => void;
}

interface CalendarEvent {
  id: string;
  date: string;
  type: 'reservation' | 'block' | 'ical';
  source?: string;
  guestName?: string;
  status?: 'pending' | 'confirmed' | 'cancelled';
  color: string;
  startDate: string;
  endDate: string;
}

export const CalendarPage: React.FC<CalendarPageProps> = ({ onNavClick }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null
  );
  const [viewType, setViewType] = useState<'month' | 'week'>('month');
  const navigate = useNavigate();
  const location = useLocation();
  const [highlight, setHighlight] = useState<{
    start?: string;
    end?: string;
  } | null>(null);
  const [highlightSet, setHighlightSet] = useState<Set<string>>(new Set());

  const monthNames = [
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro',
  ];
  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  useEffect(() => {
    loadCalendarData();
  }, [currentDate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const hs = params.get('highlight_start') || '';
      const he = params.get('highlight_end') || '';
      if (hs && he) {
        setHighlight({ start: hs, end: he });
        const [y, m] = hs.split('-').map(Number);
        if (y && m) setCurrentDate(new Date(y, m - 1, 1));
        const set = new Set<string>();
        const start = new Date(hs);
        const end = new Date(he);
        const cur = new Date(start);
        while (cur <= end) {
          set.add(format(cur, 'yyyy-MM-dd'));
          cur.setDate(cur.getDate() + 1);
        }
        setHighlightSet(set);
      } else {
        setHighlight(null);
        setHighlightSet(new Set());
      }
    } catch (_) {
      setHighlight(null);
      setHighlightSet(new Set());
    }
  }, [location.search]);

  const loadCalendarData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const API = 'http://localhost:3005';

      // Load reservations
      const res = await fetch(`${API}/bookings`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      // Load calendar events from merged.ics
      const icsRes = await fetch(`${API}/calendar/merged.ics?t=${Date.now()}`);

      const allEvents: CalendarEvent[] = [];

      if (res.ok) {
        const data = await res.json();
        const reservations = (data.data || [])
          .filter((r: { Status?: string; status?: string }) => {
            const st = String(r.Status || r.status || '').toLowerCase();
            return st !== 'rejected' && st !== 'cancelled';
          })
          .map(
            (r: {
              ID?: string;
              id?: string;
              GuestName?: string;
              guest_name?: string;
              CheckIn?: string;
              check_in?: string;
              CheckOut?: string;
              check_out?: string;
              Status?: string;
              status?: string;
            }) => ({
              id: r.ID || r.id || '',
              date: r.CheckIn || r.check_in || '',
              type: 'reservation' as const,
              source: 'Site' as const,
              guestName: r.GuestName || r.guest_name || '',
              status: r.Status || r.status || '',
              color: '#10b981',
              startDate: r.CheckIn || r.check_in || '',
              endDate: r.CheckOut || r.check_out || '',
            })
          );
        allEvents.push(...reservations);
      }

      if (icsRes.ok) {
        const icsText = await icsRes.text();
        const icsEvents = parseICSEvents(icsText);
        allEvents.push(...icsEvents);
      }

      setEvents(allEvents);
    } catch (error) {
      console.error('Error loading calendar data:', error);
    } finally {
      setLoading(false);
    }
  };

  const parseICSEvents = (icsText: string): CalendarEvent[] => {
    const events: CalendarEvent[] = [];
    const lines = icsText.split(/\r?\n/);
    let current: {
      dtstart?: Date;
      dtend?: Date;
      summary?: string;
      categories?: string;
    } = {};

    const parseIcsDate = (value: string): Date => {
      if (/^\d{8}$/.test(value)) {
        const year = Number(value.slice(0, 4));
        const month = Number(value.slice(4, 6)) - 1;
        const day = Number(value.slice(6, 8));
        return new Date(year, month, day);
      }
      if (/^\d{8}T\d{6}Z$/.test(value)) {
        const year = Number(value.slice(0, 4));
        const month = Number(value.slice(4, 6)) - 1;
        const day = Number(value.slice(6, 8));
        return new Date(year, month, day);
      }
      return new Date(value);
    };

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.startsWith('BEGIN:VEVENT')) {
        current = {};
        continue;
      }
      if (line.startsWith('DTSTART')) {
        const [, val] = line.split(':');
        current.dtstart = parseIcsDate(val);
        continue;
      }
      if (line.startsWith('DTEND')) {
        const [, val] = line.split(':');
        current.dtend = parseIcsDate(val);
        continue;
      }
      if (line.startsWith('SUMMARY')) {
        const [, val] = line.split(':');
        current.summary = val;
        continue;
      }
      if (line.startsWith('CATEGORIES')) {
        const [, val] = line.split(':');
        current.categories = val;
        continue;
      }
      if (line.startsWith('END:VEVENT')) {
        if (current.dtstart && current.dtend) {
          const inclusiveEnd = new Date(current.dtend);
          inclusiveEnd.setDate(inclusiveEnd.getDate() - 1);
          const cur = new Date(current.dtstart);
          while (cur <= inclusiveEnd) {
            const dateStr = format(cur, 'yyyy-MM-dd');
            let source = current.categories || 'Site';
            let color = '#10b981';
            let type: CalendarEvent['type'] = 'reservation';
            const cat = (current.categories || '').toLowerCase();
            const sum = (current.summary || '').toLowerCase();
            if (cat.includes('block')) {
              type = 'block';
              color = '#ef4444';
            } else if (cat.includes('airbnb')) {
              source = 'Airbnb';
              color = '#f59e0b';
            } else if (cat.includes('booking')) {
              source = 'Booking.com';
              color = '#3b82f6';
            } else {
              if (sum.includes('airbnb')) {
                source = 'Airbnb';
                color = '#f59e0b';
              } else if (sum.includes('booking')) {
                source = 'Booking.com';
                color = '#3b82f6';
              }
            }
            events.push({
              id: `ical-${Date.now()}-${Math.random()}`,
              date: dateStr,
              type,
              source,
              guestName: current.summary,
              color,
              startDate: current.dtstart.toISOString(),
              endDate: current.dtend.toISOString(),
            });
            cur.setDate(cur.getDate() + 1);
          }
        }
        current = {};
        continue;
      }
    }
    return events;
  };

  const getDaysInMonth = (year: number, month: number) =>
    new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) =>
    new Date(year, month, 1).getDay();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const padding = Array.from({ length: firstDay }, (_, i) => i);

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  const getEventsForDate = (day: number) => {
    const dateStr = format(new Date(year, month, day), 'yyyy-MM-dd');
    return events.filter((event) => event.date === dateStr);
  };

  const handleCopyICalLink = () => {
    navigator.clipboard.writeText('http://localhost:3005/calendar/merged.ics');
  };

  const handleNewReservation = () => {
    // Navigate to new reservation page
    window.location.href = '/dashboard#new-reservation';
  };

  return (
    <div className=''>
      {/* Header */}
      <div className='bg-white border-b border-zinc-200 px-6 py-4'>
        <div className='flex items-center justify-between'>
          <div>
            <h1 className='text-2xl font-semibold text-zinc-900'>Calendário</h1>
            <p className='text-sm text-zinc-500 mt-1'>
              Visualize e gerencie suas reservas
            </p>
          </div>
          <div className='flex items-center gap-3'>
            <button
              onClick={handleCopyICalLink}
              className='inline-flex items-center gap-2 px-4 py-2 bg-white border border-zinc-200 rounded-md text-sm font-medium text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 transition-all shadow-sm'
            >
              <Link className='w-4 h-4' />
              Copiar Link iCal
            </button>
            <button
              onClick={handleNewReservation}
              className='inline-flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-md text-sm font-medium hover:bg-zinc-800 transition-all shadow-sm'
            >
              <Plus className='w-4 h-4' />
              Nova Reserva
            </button>
          </div>
        </div>
      </div>

      {/* Calendar Navigation */}
      <div className='bg-white border-b border-zinc-200 px-6 py-4'>
        <div className='flex items-center justify-between'>
          <div className='flex items-center gap-4'>
            <button
              onClick={prevMonth}
              className='p-2 hover:bg-zinc-100 rounded-lg transition-colors'
            >
              <ChevronLeft className='w-5 h-5' />
            </button>
            <h2 className='text-xl font-semibold text-zinc-900'>
              {monthNames[month]} {year}
            </h2>
            <button
              onClick={nextMonth}
              className='p-2 hover:bg-zinc-100 rounded-lg transition-colors'
            >
              <ChevronRight className='w-5 h-5' />
            </button>
          </div>

          <div className='flex items-center gap-2'>
            <button className='px-3 py-1.5 text-sm font-medium text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100 rounded-md transition-colors'>
              Hoje
            </button>
            <div className='flex bg-zinc-100 rounded-lg p-1'>
              <button
                onClick={() => setViewType('month')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  viewType === 'month'
                    ? 'bg-white text-zinc-900 shadow-sm'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Mês
              </button>
              <button
                onClick={() => setViewType('week')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  viewType === 'week'
                    ? 'bg-white text-zinc-900 shadow-sm'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Semana
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className='p-6'>
        <div className='bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden'>
          <div className='p-6 md:p-5 overflow-hidden'>
            {/* Week Days Header */}
            <div className='grid grid-cols-7 text-center mb-2 hidden md:grid'>
              {weekDays.map((day) => (
                <div
                  key={day}
                  className='text-sm md:text-xs text-zinc-400 font-medium py-3 md:py-2'
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Days */}
            <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-1 text-sm'>
              {/* Padding for first week */}
              {padding.map((i) => (
                <div
                  key={`pad-${i}`}
                  className='h-36 md:h-28 p-2 border border-transparent rounded-lg text-zinc-300 hidden md:block'
                ></div>
              ))}

              {/* Days */}
              {days.map((day) => {
                const dayEvents = getEventsForDate(day);
                const isToday =
                  new Date().toDateString() ===
                  new Date(year, month, day).toDateString();
                const weekDayName = format(new Date(year, month, day), 'EEE', {
                  locale: ptBR,
                });

                return (
                  <div
                    key={day}
                    className={`h-36 md:h-28 p-3 md:p-2 border rounded-lg transition-colors relative group cursor-pointer ${
                      isToday ? 'bg-blue-50/30' : ''
                    } ${
                      highlightSet.has(
                        format(new Date(year, month, day), 'yyyy-MM-dd')
                      )
                        ? 'border-emerald-400 bg-emerald-50/40 animate-pulse'
                        : 'border-zinc-100 hover:border-zinc-200'
                    }`}
                  >
                    <div className='flex justify-between items-start mb-1'>
                      <div className='flex items-center gap-2'>
                        <span
                          className={`text-base md:text-sm font-medium ${
                            isToday
                              ? 'text-blue-600 bg-blue-100 w-7 h-7 flex items-center justify-center rounded-full'
                              : highlightSet.has(
                                  format(
                                    new Date(year, month, day),
                                    'yyyy-MM-dd'
                                  )
                                )
                              ? 'text-emerald-700'
                              : 'text-zinc-700'
                          }`}
                        >
                          {day}
                        </span>
                        <span className='md:hidden text-xs text-zinc-400 uppercase font-medium'>
                          {weekDayName}
                        </span>
                      </div>
                      {dayEvents.length > 0 && (
                        <span className='text-sm md:text-xs bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded-full'>
                          {dayEvents.length}
                        </span>
                      )}
                    </div>

                    {/* Events */}
                    <div className='space-y-1 mt-1'>
                      {dayEvents.slice(0, 3).map((event, idx) => (
                        <div
                          key={idx}
                          className='px-1.5 py-0.5 text-[11px] md:text-[10px] rounded truncate cursor-pointer hover:opacity-80 transition-opacity'
                          style={{
                            backgroundColor: event.color + '20',
                            color: event.color,
                            borderLeft: `2px solid ${event.color}`,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEvent(event);
                          }}
                        >
                          {event.guestName || event.source}
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <div className='text-[11px] md:text-[10px] text-zinc-500 px-1.5'>
                          +{dayEvents.length - 3} mais
                        </div>
                      )}
                    </div>

                    {/* Add Event Button */}
                    <button
                      className='absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 md:w-5 md:h-5 bg-zinc-200 hover:bg-zinc-300 rounded-full flex items-center justify-center text-zinc-600'
                      onClick={(e) => {
                        e.stopPropagation();
                        // Open add event modal
                        const date = new Date(year, month, day);
                        console.log('Add event for:', date);
                      }}
                    >
                      <Plus className='w-4 h-4 md:w-3 md:h-3' />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className='mt-6 flex flex-wrap gap-4'>
          <div className='flex items-center gap-2'>
            <div className='w-3 h-3 bg-green-500 rounded-full'></div>
            <span className='text-sm text-zinc-600'>Reservas do Site</span>
          </div>
          <div className='flex items-center gap-2'>
            <div className='w-3 h-3 bg-amber-500 rounded-full'></div>
            <span className='text-sm text-zinc-600'>Airbnb</span>
          </div>
          <div className='flex items-center gap-2'>
            <div className='w-3 h-3 bg-blue-500 rounded-full'></div>
            <span className='text-sm text-zinc-600'>Booking.com</span>
          </div>
          <div className='flex items-center gap-2'>
            <div className='w-3 h-3 bg-red-500 rounded-full'></div>
            <span className='text-sm text-zinc-600'>Bloqueios</span>
          </div>
        </div>
      </div>

      {/* Event Details Modal */}
      {selectedEvent && (
        <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
          <div className='bg-white rounded-xl p-6 max-w-md w-full mx-4'>
            <div className='flex items-center justify-between mb-4'>
              <h3 className='text-lg font-semibold text-zinc-900'>
                {selectedEvent.type === 'block' ? 'Bloqueio' : 'Reserva'}
              </h3>
              <button
                onClick={() => setSelectedEvent(null)}
                className='text-zinc-400 hover:text-zinc-600'
              >
                <svg
                  className='w-5 h-5'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M6 18L18 6M6 6l12 12'
                  />
                </svg>
              </button>
            </div>

            <div className='space-y-3'>
              <div>
                <label className='text-sm font-medium text-zinc-700'>
                  Fonte
                </label>
                <p className='text-sm text-zinc-900'>{selectedEvent.source}</p>
              </div>

              {selectedEvent.guestName && (
                <div>
                  <label className='text-sm font-medium text-zinc-700'>
                    Nome
                  </label>
                  <p className='text-sm text-zinc-900'>
                    {selectedEvent.guestName}
                  </p>
                </div>
              )}

              <div>
                <label className='text-sm font-medium text-zinc-700'>
                  Período
                </label>
                <p className='text-sm text-zinc-900'>
                  {format(new Date(selectedEvent.startDate), 'dd/MM/yyyy', {
                    locale: ptBR,
                  })}{' '}
                  -
                  {format(new Date(selectedEvent.endDate), 'dd/MM/yyyy', {
                    locale: ptBR,
                  })}
                </p>
              </div>

              {selectedEvent.status && (
                <div>
                  <label className='text-sm font-medium text-zinc-700'>
                    Status
                  </label>
                  <span
                    className={`inline-flex px-2 py-1 text-xs rounded-full ${
                      selectedEvent.status === 'confirmed'
                        ? 'bg-green-100 text-green-800'
                        : selectedEvent.status === 'pending'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {selectedEvent.status === 'confirmed'
                      ? 'Confirmado'
                      : selectedEvent.status === 'pending'
                      ? 'Pendente'
                      : 'Cancelado'}
                  </span>
                </div>
              )}
            </div>

            <div className='flex gap-3 mt-6'>
              <button
                onClick={() => setSelectedEvent(null)}
                className='flex-1 px-4 py-2 border border-zinc-200 rounded-md text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors'
              >
                Fechar
              </button>
              {selectedEvent.type !== 'block' &&
                selectedEvent.source === 'Site' && (
                  <button
                    onClick={() => {
                      if (selectedEvent.id) {
                        if (onNavClick) onNavClick('messages');
                        navigate(
                          `/dashboard?booking_id=${encodeURIComponent(
                            selectedEvent.id
                          )}`
                        );
                      }
                    }}
                    className='flex-1 px-4 py-2 bg-zinc-900 text-white rounded-md text-sm font-medium hover:bg-zinc-800 transition-colors'
                  >
                    <MessageSquare className='w-4 h-4 inline mr-2' />
                    Conversar
                  </button>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
