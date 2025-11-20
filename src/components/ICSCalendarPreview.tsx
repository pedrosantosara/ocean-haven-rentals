import * as React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { parse, eachDayOfInterval, format, addDays } from 'date-fns';
import { toast } from 'sonner';
import type { DateRange, SelectRangeEventHandler } from 'react-day-picker';

type IcsEvent = { from: Date; to: Date; source?: string; summary?: string; status?: string };

function parseICS(icsText: string): IcsEvent[] {
  const lines = icsText.split(/\r?\n/);
  const events: IcsEvent[] = [];
  let current: { dtstart?: Date; dtend?: Date; source?: string; summary?: string; status?: string } = {};

  const parseIcsDate = (value: string): Date => {
    if (/^\d{8}$/.test(value)) {
      return parse(value, 'yyyyMMdd', new Date());
    }
    if (/^\d{8}T\d{6}Z$/.test(value)) {
      const year = Number(value.slice(0, 4));
      const month = Number(value.slice(4, 6)) - 1;
      const day = Number(value.slice(6, 8));
      const hour = Number(value.slice(9, 11));
      const minute = Number(value.slice(11, 13));
      const second = Number(value.slice(13, 15));
      return new Date(Date.UTC(year, month, day, hour, minute, second));
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
      current.source = val;
      continue;
    }
    if (line.startsWith('STATUS')) {
      const [, val] = line.split(':');
      current.status = val;
      continue;
    }
    if (line.startsWith('END:VEVENT')) {
      if (current.dtstart && current.dtend) {
        const inclusiveEnd = new Date(current.dtend);
        inclusiveEnd.setDate(inclusiveEnd.getDate() - 1);
        events.push({ from: current.dtstart, to: inclusiveEnd, source: current.source, summary: current.summary, status: current.status });
      }
      current = {};
      continue;
    }
  }
  return events;
}

export function ICSCalendarPreview() {
  const [disabledRanges, setDisabledRanges] = React.useState<DateRange[]>([]);
  const [icsEvents, setIcsEvents] = React.useState<IcsEvent[]>([]);
  const [hoverCard, setHoverCard] = React.useState<{ x: number; y: number; items: IcsEvent[] } | null>(null);
  const calRef = React.useRef<HTMLDivElement | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [months, setMonths] = React.useState(1);
  const [selected, setSelected] = React.useState<DateRange | undefined>();
  const [availability, setAvailability] = React.useState<Record<string, boolean>>({});
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const [noteDraft, setNoteDraft] = React.useState('');
  const [flashRange, setFlashRange] = React.useState(false);
  const [bookings, setBookings] = React.useState<{ id: string; check_in: string; check_out: string; status?: string; guest_name?: string; guest_email?: string }[]>([]);
  const navigate = useNavigate();
  const location = useLocation();

  React.useEffect(() => {
    const loadIcs = async () => {
      try {
        const API = 'http://localhost:3005';
        const res = await fetch(`${API}/calendar/merged.ics?t=${Date.now()}`);
        if (!res.ok) {
          return;
        }
        const text = await res.text();
        const events = parseICS(text);
        setIcsEvents(events);
        const ranges = events.map((ev) => ({ from: ev.from, to: ev.to }));
        setDisabledRanges(ranges);
        setError(null);
      } catch (e) {
        return;
      }
    };
    loadIcs();
  }, []);

  React.useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const API = 'http://localhost:3005';
    (async () => {
      const res = await fetch(`${API}/bookings`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const j = await res.json();
      const rows = (j.data || []) as unknown[];
      const mapped = rows.map((raw) => {
        const r = raw as Record<string, unknown>;
        return {
          id: String(r.ID ?? r.id ?? ''),
          check_in: String(r.CheckIn ?? r.check_in ?? ''),
          check_out: String(r.CheckOut ?? r.check_out ?? ''),
          status: String(r.Status ?? r.status ?? ''),
          guest_name: String(r.GuestName ?? r.guest_name ?? ''),
          guest_email: String(r.GuestEmail ?? r.guest_email ?? ''),
        };
      });
      setBookings(mapped);
    })();
  }, []);

  React.useEffect(() => {
    const params = new URLSearchParams(location.search);
    const fromStr = params.get('from');
    const toStr = params.get('to');
    if (fromStr && toStr) {
      const f = parse(fromStr, 'yyyy-MM-dd', new Date());
      const t = parse(toStr, 'yyyy-MM-dd', new Date());
      setSelected({ from: f, to: t });
      setFlashRange(true);
      window.setTimeout(() => setFlashRange(false), 1500);
      const el = document.getElementById('calendar');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      void reloadCalendar();
    }
  }, [location.search]);

  React.useEffect(() => {
    const updateMonths = () => {
      const w = window.innerWidth;
      if (w >= 1024) {
        setMonths(2);
      } else {
        setMonths(1);
      }
    };
    updateMonths();
    window.addEventListener('resize', updateMonths);
    return () => window.removeEventListener('resize', updateMonths);
  }, []);

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!calRef.current) return;
      const target = e.target as Node | null;
      if (target && !calRef.current.contains(target)) {
        setSelected(undefined);
      }
    };
    const handlerClick = (e: MouseEvent) => {
      if (!calRef.current) return;
      const target = e.target as Node | null;
      if (target && !calRef.current.contains(target)) {
        setSelected(undefined);
      }
    };
    const handlerTouch = (e: TouchEvent) => {
      if (!calRef.current) return;
      const target = e.target as Node | null;
      if (target && !calRef.current.contains(target)) {
        setSelected(undefined);
      }
    };
    const handlerKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelected(undefined);
      }
    };
    document.addEventListener('mousedown', handler, true);
    document.addEventListener('click', handlerClick, true);
    document.addEventListener('touchstart', handlerTouch, true);
    document.addEventListener('keydown', handlerKey, true);
    return () => {
      document.removeEventListener('mousedown', handler, true);
      document.removeEventListener('click', handlerClick, true);
      document.removeEventListener('touchstart', handlerTouch, true);
      document.removeEventListener('keydown', handlerKey, true);
    };
  }, []);

  const normalizeSource = (ev: IcsEvent): string | undefined => {
    const raw = (ev.source || ev.summary || '').toLowerCase();
    if (!raw) return undefined;
    if (raw.includes('booking')) return 'Booking';
    if (raw.includes('airbnb')) return 'Airbnb';
    if (raw.includes('vrbo')) return 'VRBO';
    if (raw.includes('site') || raw.includes('reserva')) return 'Site';
    return ev.source || ev.summary || undefined;
  };
  const sourcesByDay = React.useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const ev of icsEvents) {
      const src = normalizeSource(ev);
      const days = eachDayOfInterval({ start: ev.from, end: ev.to });
      for (const day of days) {
        const key = format(day, 'yyyy-MM-dd');
        if (!map[key]) map[key] = new Set();
        if (src) map[key].add(src);
      }
    }
    const out: Record<string, string[]> = {};
    for (const [k, set] of Object.entries(map)) {
      out[k] = Array.from(set);
    }
    return out;
  }, [icsEvents]);
  const unavailableDates = React.useMemo(() => {
    return Object.entries(availability)
      .filter(([, avail]) => avail === false)
      .map(([dateStr]) => new Date(dateStr));
  }, [availability]);
  const notedDates = React.useMemo(
    () => Object.keys(notes).map((d) => new Date(d)),
    [notes]
  );

  const busySets = React.useMemo(() => {
    const start: Date[] = [];
    const middle: Date[] = [];
    const end: Date[] = [];
    const all: Date[] = [];
    for (const ev of icsEvents) {
      const days = eachDayOfInterval({ start: ev.from, end: ev.to });
      if (days.length === 0) continue;
      all.push(...days);
      if (days.length === 1) {
        start.push(days[0]);
        end.push(days[0]);
      } else {
        start.push(days[0]);
        end.push(days[days.length - 1]);
        for (let i = 1; i < days.length - 1; i++) middle.push(days[i]);
      }
    }
    return { start, middle, end, all };
  }, [icsEvents]);

  const selectionHasBlock = React.useMemo(() => {
    if (!selected?.from || !selected?.to) return false;
    const start = selected.from;
    const end = selected.to;
    return icsEvents.some((ev) => {
      const isBlock = (ev.source || '').toLowerCase().includes('block');
      if (!isBlock) return false;
      return !(end < ev.from || start > ev.to);
    });
  }, [selected, icsEvents]);

  const selectionTouchesBlock = React.useMemo(() => {
    if (!selected?.from || !selected?.to) return false;
    const selStart = format(selected.from, 'yyyy-MM-dd');
    const selEnd = format(selected.to, 'yyyy-MM-dd');
    const nextEnd = format(addDays(selected.to, 1), 'yyyy-MM-dd');
    const prevStart = format(addDays(selected.from, -1), 'yyyy-MM-dd');
    return icsEvents.some((ev) => {
      const isBlock = (ev.source || '').toLowerCase().includes('block');
      if (!isBlock) return false;
      const evStart = format(ev.from, 'yyyy-MM-dd');
      const evEnd = format(ev.to, 'yyyy-MM-dd');
      return evStart === nextEnd || evEnd === prevStart;
    });
  }, [selected, icsEvents]);


  const applyAvailability = (isAvailable: boolean) => {
    if (!selected?.from || !selected?.to) return;
    const days = eachDayOfInterval({ start: selected.from, end: selected.to });
    const updates: Record<string, boolean> = {};
    for (const day of days) {
      updates[format(day, 'yyyy-MM-dd')] = isAvailable;
    }
    setAvailability((prev) => ({ ...prev, ...updates }));
  };

  const blockSelectedRange = () => {
    if (!selected?.from || !selected?.to) return;
    setDisabledRanges((prev) => [
      ...prev,
      { from: selected.from, to: selected.to },
    ]);
  };

  const saveNotesForSelection = () => {
    if (!selected?.from || !selected?.to || !noteDraft.trim()) return;
    const days = eachDayOfInterval({ start: selected.from, end: selected.to });
    const updates: Record<string, string> = {};
    for (const day of days) {
      updates[format(day, 'yyyy-MM-dd')] = noteDraft.trim();
    }
    setNotes((prev) => ({ ...prev, ...updates }));
    setNoteDraft('');
  };

  const handleRangeSelect: SelectRangeEventHandler = (range) => {
    setSelected(range);
  };

  const API = 'http://localhost:3005';
  const reloadCalendar = async () => {
    try {
      const res = await fetch(`${API}/calendar/merged.ics?t=${Date.now()}`);
      if (!res.ok) return;
      const text = await res.text();
      const events = parseICS(text);
      setIcsEvents(events);
      const ranges = events.map((ev) => ({ from: ev.from, to: ev.to }));
      setDisabledRanges(ranges);
    } catch (_) { return; }
  };

  const blockRangeBackend = async (from: Date, to: Date, note?: string) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const res = await fetch(`${API}/blocks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ From: from.toISOString(), To: addDays(to, 1).toISOString(), Note: note || '' }),
    });
    if (!res.ok) {
      if (res.status === 403) { toast.error('Você precisa ser proprietário para bloquear'); } else { toast.error('Erro ao bloquear período'); }
      return;
    }
    toast.success('Período bloqueado');
    await reloadCalendar();
  };

  const unblockRangeBackend = async (from: Date, to: Date) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const res = await fetch(`${API}/blocks/unblock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ From: from.toISOString(), To: addDays(to, 1).toISOString() }),
    });
    if (!res.ok) {
      if (res.status === 403) { toast.error('Você precisa ser proprietário para desbloquear'); } else { toast.error('Erro ao desbloquear período'); }
      return;
    }
    toast.success('Período desbloqueado');
    await reloadCalendar();
  };

  return (
    <Card className='glass-ocean border-primary/20 mb-8'>
      <CardHeader>
        <CardTitle>Calendário</CardTitle>
        <CardDescription>Gerencie disponibilidade e bloqueios</CardDescription>
      </CardHeader>
      <CardContent>
        <div className='flex items-center gap-2 mb-4'>
          <Badge>Ocupado</Badge>
          {disabledRanges.length > 0 && (
            <p className='text-sm text-muted-foreground'>
              {disabledRanges.length} intervalo(s) bloqueado(s)
            </p>
          )}
        </div>
        <div className='grid grid-cols-1 lg:grid-cols-[70%_30%] gap-4'>
          <div ref={calRef} className='relative w-full min-w-0 overflow-visible'>
            <Calendar
              className='w-full'
              showOutsideDays
              numberOfMonths={months}
              mode='range'
              selected={selected}
              onSelect={handleRangeSelect}
              modifiers={{
                unavailable: unavailableDates,
                noted: notedDates,
                busyStart: busySets.start,
                busyMiddle: busySets.middle,
                busyEnd: busySets.end,
                busy: busySets.all,
              }}
              modifiersClassNames={{
                unavailable: '',
                noted: 'ring-2 ring-accent',
                busy: '',
                busyMiddle:
                  'relative before:absolute before:left-1 before:right-1 before:top-1/2 before:h-[2px] before:bg-destructive before:opacity-100 before:pointer-events-none',
                busyStart:
                  'relative before:absolute before:left-1/2 before:right-1 before:top-1/2 before:h-[2px] before:bg-destructive before:opacity-100 before:pointer-events-none',
                busyEnd:
                  'relative before:absolute before:left-1 before:right-1/2 before:top-1/2 before:h-[2px] before:bg-destructive before:opacity-100 before:pointer-events-none',
              }}
              classNames={{
                months: 'grid grid-cols-1 md:grid-cols-2 gap-4',
                month: 'space-y-4',
                caption_label: 'text-base md:text-lg font-semibold',
                head_cell:
                  'text-muted-foreground rounded-md w-10 sm:w-12 md:w-14 font-normal text-[0.8rem]',
                cell: 'h-10 w-10 sm:h-12 sm:w-12 md:h-14 md:w-14 text-center text-sm p-0 relative',
                day: 'h-10 w-10 sm:h-12 sm:w-12 md:h-14 md:w-14 p-0 font-normal',
                day_range_start: `bg-primary/20 ring-2 ring-primary ${flashRange ? 'animate-glow' : ''} rounded-l-full`,
                day_range_middle: `bg-primary/10 ${flashRange ? 'animate-glow' : ''}`,
                day_range_end: `bg-primary/20 ring-2 ring-primary ${flashRange ? 'animate-glow' : ''} rounded-r-full`,
                day_selected: `bg-primary/20 ring-2 ring-primary ${flashRange ? 'animate-glow' : ''} rounded-full`,
              }}
              components={{
                DayContent: ({ date }) => {
                  const label = date.getDate();
                  const key = format(date, 'yyyy-MM-dd');
                  const srcs = sourcesByDay[key] || [];
                  const items = icsEvents.filter((ev) => date >= ev.from && date <= ev.to);
                  return (
                    <div
                      className='relative w-full h-full flex items-center justify-center cursor-pointer'
                      onMouseEnter={(e) => {
                        if (items.length === 0) return;
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        const containerRect = calRef.current?.getBoundingClientRect();
                        if (!containerRect) return;
                        const x = rect.left - containerRect.left + rect.width / 2;
                        const y = rect.top - containerRect.top - 8;
                        setHoverCard({ x, y, items });
                      }}
                      onMouseMove={(e) => {
                        if (!hoverCard || items.length === 0) return;
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        const containerRect = calRef.current?.getBoundingClientRect();
                        if (!containerRect) return;
                        const x = rect.left - containerRect.left + rect.width / 2;
                        const y = rect.top - containerRect.top - 8;
                        setHoverCard({ x, y, items });
                      }}
                      onMouseLeave={() => {
                        setHoverCard(null);
                      }}
                      onClick={() => {
                        const match = bookings.find((b) => {
                          if (!b.check_in || !b.check_out) return false;
                          const ci = new Date(b.check_in);
                          const co = new Date(b.check_out);
                          return date >= ci && date <= co;
                        });
                        if (match && match.id) {
                          navigate(`/chat/${match.id}`);
                        }
                      }}
                    >
                      <span>{label}</span>
                      {srcs.length > 0 && (
                        <div className='absolute inset-x-1 bottom-1 flex gap-1 justify-center pointer-events-none'>
                          {srcs.slice(0, 2).map((s) => (
                            <span
                              key={s}
                              className={
                                s === 'Booking'
                                  ? 'px-1 rounded text-[10px] bg-destructive/30 text-destructive-foreground'
                                  : 'px-1 rounded text-[10px] bg-primary/20 text-primary'
                              }
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                },
              }}
            />
            {hoverCard && (
              <div
                style={{ position: 'absolute', left: hoverCard.x, top: hoverCard.y, transform: 'translate(-50%, -100%)' }}
                className='z-50 rounded-md border border-border bg-white p-2 text-xs shadow-xl'
                onMouseLeave={() => setHoverCard(null)}
              >
                <div className='grid gap-2 min-w-[220px]'>
                  {hoverCard.items.slice(0, 4).map((ev, idx) => (
                    <div key={idx} className='rounded-md border border-border bg-white p-2 shadow'>
                      <div className='flex items-center justify-between'>
                        <span className='font-medium'>{ev.summary || ((ev.source || '').toLowerCase().includes('site') ? 'Reserva' : 'Evento')}</span>
                        <Badge variant='secondary'>{normalizeSource(ev) || '—'}</Badge>
                      </div>
                      <div className='mt-1 text-muted-foreground'>
                        {format(ev.from, 'dd/MM/yyyy')} — {format(ev.to, 'dd/MM/yyyy')}
                      </div>
                      {ev.status && <div className='mt-1'>Status: {ev.status}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className='w-full min-w-0'>
            <Card className='bg-background/50 glass-ocean rounded-2xl overflow-hidden lg:sticky lg:top-24'>
              <CardHeader>
                <CardTitle>Gerenciar Período</CardTitle>
                <CardDescription>
                  Selecione um intervalo e aplique as regras
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-3 text-sm'>
                <div className='flex items-center justify-between'>
                  <span className='text-sm'>Disponível</span>
                  <Switch
                    className='scale-90'
                    checked={(() => {
                      if (!selected?.from || !selected?.to) return true;
                      const days = eachDayOfInterval({ start: selected.from, end: selected.to });
                      const blocked = days.some((day) => icsEvents.some((ev) => (ev.source || '').toLowerCase().includes('block') && day >= ev.from && day <= ev.to));
                      return !blocked;
                    })()}
                    onCheckedChange={async (checked) => {
                      if (!selected?.from || !selected?.to) return;
                      if (!checked) {
                        await blockRangeBackend(selected.from, selected.to, noteDraft.trim() || undefined);
                      } else {
                        const useAdj = !selectionHasBlock && selectionTouchesBlock;
                        const f = useAdj ? addDays(selected.from, -1) : selected.from;
                        const t = useAdj ? addDays(selected.to, 1) : selected.to;
                        await unblockRangeBackend(f, t);
                      }
                    }}
                  />
                </div>

                <Button
                  variant='gradient'
                  size='sm'
                  className='shadow-ocean'
                  onClick={async () => { if (!selected?.from || !selected?.to) return; await blockRangeBackend(selected.from, selected.to, noteDraft.trim() || undefined); }}
                  disabled={!selected?.from || !selected?.to}
                >
                  Bloquear período selecionado
                </Button>

                <Button
                  variant='outline'
                  size='sm'
                  className='shadow-ocean'
                  onClick={async () => {
                    if (!selected?.from || !selected?.to) return;
                    const useAdj = !selectionHasBlock && selectionTouchesBlock;
                    const f = useAdj ? addDays(selected.from, -1) : selected.from;
                    const t = useAdj ? addDays(selected.to, 1) : selected.to;
                    await unblockRangeBackend(f, t);
                  }}
                  disabled={!selected?.from || !selected?.to || (!selectionHasBlock && !selectionTouchesBlock)}
                >
                  Desbloquear período selecionado
                </Button>

                <div className='space-y-2'>
                  <span className='text-sm'>Notas</span>
                  <Textarea
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder='Adicione uma nota para as datas selecionadas'
                    rows={2}
                  />
                  <Button
                    size='sm'
                    variant='gradient'
                    className='shadow-ocean'
                    onClick={saveNotesForSelection}
                    disabled={
                      !selected?.from || !selected?.to || !noteDraft.trim()
                    }
                  >
                    Salvar notas para o período
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default ICSCalendarPreview;