import { Navigation } from '@/components/Navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ICalSync } from '@/components/ICalSync';
import { ICSCalendarPreview } from '@/components/ICSCalendarPreview';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
// Removido calendário grande
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Calendar, Mail, User, CheckCircle2, XCircle, CalendarDays, CalendarCheck, Wallet } from 'lucide-react';

export default function Dashboard() {
  type Booking = { id: string; guest_name: string; guest_email: string; check_in: string; check_out: string; total_price: number; status: 'pending' | 'confirmed' | 'cancelled' | 'completed'; number_of_guests: number };
  const [stats, setStats] = useState<{ total_bookings: number; confirmed_bookings: number; total_revenue: number } | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  type Message = { id: number; booking_id: string; sender_email: string; is_from_owner: boolean; message: string; created_at: string };
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const API = 'http://localhost:3005';
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    fetch(`${API}/stats/dashboard`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => { if (!r.ok) throw new Error('Falha ao carregar estatísticas'); return r.json(); })
      .then((j) => setStats(j))
      .catch(() => toast.error('Erro ao carregar estatísticas'));
    fetch(`${API}/bookings`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => { if (!r.ok) throw new Error('Falha ao carregar reservas'); const j = await r.json(); return j.data || []; })
      .then((rows: unknown[]) => {
        const mapped = rows.map((raw: unknown) => {
          const r = raw as Record<string, unknown>;
          const mapStatus = (s: string) => s === 'approved' ? 'confirmed' : s === 'rejected' ? 'cancelled' : 'pending';
          return {
            id: String(r.ID ?? r.id ?? ''),
            guest_name: String(r.GuestName ?? r.guest_name ?? ''),
            guest_email: String(r.GuestEmail ?? r.guest_email ?? ''),
            check_in: String(r.CheckIn ?? r.check_in ?? ''),
            check_out: String(r.CheckOut ?? r.check_out ?? ''),
            total_price: Number(r.TotalPrice ?? r.total_price ?? 0),
            status: mapStatus(String(r.Status ?? r.status ?? 'requested')) as Booking['status'],
            number_of_guests: Number(r.NumberOfGuests ?? r.number_of_guests ?? 0),
          };
        });
        setBookings(mapped);
      })
      .catch(() => toast.error('Erro ao carregar reservas'));
  }, []);

  const loadMessages = async (bookingId: string) => {
    const token = localStorage.getItem('token');
    if (!token) { setMessages([]); return; }
    const res = await fetch(`${API}/messages?booking_id=${bookingId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const j = await res.json();
      const rows = (j.data || []) as unknown[];
      const mapped = rows.map((raw) => {
        const r = raw as Record<string, unknown>;
        return {
          id: Number(r.ID ?? r.id ?? Date.now()),
          booking_id: String(r.BookingID ?? r.booking_id ?? bookingId),
          sender_email: String(r.SenderEmail ?? r.sender_email ?? ''),
          is_from_owner: Boolean(r.IsFromOwner ?? r.is_from_owner ?? false),
          message: String(r.Message ?? r.message ?? ''),
          created_at: String(r.CreatedAt ?? r.created_at ?? new Date().toISOString()),
        } as Message;
      });
      setMessages(mapped);
    }
  };

  const sendReply = async () => {
    if (!selectedBooking || !reply.trim()) return;
    const token = localStorage.getItem('token');
    if (!token) { toast.error('Faça login como proprietário'); return; }
    const res = await fetch(`${API}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ BookingID: selectedBooking.id, Message: reply }) });
    if (!res.ok) { toast.error('Erro ao enviar mensagem'); return; }
    setReply('');
    await loadMessages(selectedBooking.id);
    toast.success('Mensagem enviada');
  };
  const getInitials = (s: string) => {
    const parts = s.split(/\s+|@/).filter(Boolean);
    const a = (parts[0] || '').charAt(0);
    const b = (parts[1] || '').charAt(0);
    return (a + b).toUpperCase() || 'U';
  };
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => {
    if (!showDialog || !selectedBooking) {
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      return;
    }
    const token = localStorage.getItem('token');
    if (!token) return;
    const url = `ws://localhost:3005/ws/messages?booking_id=${encodeURIComponent(selectedBooking.id)}&token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg && msg.type === 'message' && msg.data && msg.data.booking_id === selectedBooking.id) {
          setMessages((prev) => [...prev, { id: Date.now(), booking_id: selectedBooking.id, sender_email: String(msg.data.sender_email || ''), is_from_owner: Boolean(msg.data.is_from_owner), message: String(msg.data.message || ''), created_at: String(msg.data.created_at || new Date().toISOString()) }]);
        }
      } catch (e) { void e; }
    };

    return () => { if (wsRef.current) { wsRef.current.close(); wsRef.current = null; } };
  }, [showDialog, selectedBooking]);
  return (
    <div className='min-h-screen bg-background'>
      <Navigation />

      <div className='pt-24 pb-12 px-4'>
        <div className='container mx-auto'>
          <h1 className='text-3xl md:text-5xl font-bold mb-8 md:mb-12 text-gradient'>Dashboard</h1>

          <div className='grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-6 md:mb-8'>
            <Card className='relative overflow-hidden bg-white border border-border/50 shadow-sm hover:shadow-md transition-all duration-300 rounded-xl'>
              <CardHeader className='pb-2'>
                <div className='flex items-center justify-between'>
                  <CardTitle className='text-sm font-medium text-muted-foreground'>Total de Reservas</CardTitle>
                  <div className='h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center'>
                    <CalendarDays className='h-4 w-4' />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold text-foreground'>
                  {stats ? stats.total_bookings : '—'}
                </div>
              </CardContent>
            </Card>

            <Card className='relative overflow-hidden bg-white border border-border/50 shadow-sm hover:shadow-md transition-all duration-300 rounded-xl'>
              <CardHeader className='pb-2'>
                <div className='flex items-center justify-between'>
                  <CardTitle className='text-sm font-medium text-muted-foreground'>Reservas Confirmadas</CardTitle>
                  <div className='h-8 w-8 rounded-full bg-green-500/10 text-green-600 flex items-center justify-center'>
                    <CalendarCheck className='h-4 w-4' />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold text-foreground'>
                  {stats ? stats.confirmed_bookings : '—'}
                </div>
              </CardContent>
            </Card>

            <Card className='relative overflow-hidden bg-white border border-border/50 shadow-sm hover:shadow-md transition-all duration-300 rounded-xl'>
              <CardHeader className='pb-2'>
                <div className='flex items-center justify-between'>
                  <CardTitle className='text-sm font-medium text-muted-foreground'>Receita Total</CardTitle>
                  <div className='h-8 w-8 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center'>
                    <Wallet className='h-4 w-4' />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold text-foreground'>
                  {stats ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.total_revenue) : '—'}
                </div>
              </CardContent>
            </Card>
          </div>
          <div id='calendar'>
            <ICSCalendarPreview />
          </div>
          <div className='mt-10'>
            <h2 className='text-xl font-semibold mb-4 text-foreground'>Solicitações Pendentes</h2>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6'>
              {bookings.filter((b) => b.status === 'pending').map((b) => (
                <Card key={b.id} className='relative overflow-hidden bg-white border border-border/50 shadow-sm hover:shadow-md transition-all duration-300 rounded-xl'>
                  <CardHeader className='pb-3'>
                    <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3'>
                      <div className='flex items-center gap-3 min-w-0'>
                        <div className='h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm'>
                          {(b.guest_name || '?').split(' ').filter(Boolean).map((s) => s[0]).slice(0, 2).join('').toUpperCase()}
                        </div>
                        <div className='min-w-0'>
                          <CardTitle className='text-base font-semibold m-0'>{b.guest_name}</CardTitle>
                          <div className='flex items-center text-xs text-muted-foreground min-w-0 mt-0.5'>
                            <Mail className='h-3 w-3 mr-1 shrink-0' />
                            <span className='truncate'>{b.guest_email}</span>
                          </div>
                        </div>
                      </div>
                      <div className='flex flex-col sm:flex-row sm:flex-wrap gap-2 w-full sm:w-auto'>
                        <Button size='sm' className='gap-2 w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white shadow-none' onClick={async () => {
                          const token = localStorage.getItem('token');
                          if (!token) return;
                          const res = await fetch(`${API}/bookings/${b.id}/approve`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
                          if (!res.ok) { toast.error('Erro ao aprovar'); return; }
                          toast.success('Reserva aprovada');
                          const r = await fetch(`${API}/bookings`, { headers: { Authorization: `Bearer ${token}` } });
                          const j = await r.json();
                          const rows = (j.data || []) as unknown[];
                          const mapped = rows.map((raw: unknown) => {
                            const x = raw as Record<string, unknown>;
                            const mapStatus = (s: string) => s === 'approved' ? 'confirmed' : s === 'rejected' ? 'cancelled' : 'pending';
                            return {
                              id: String(x.ID ?? x.id ?? ''),
                              guest_name: String(x.GuestName ?? x.guest_name ?? ''),
                              guest_email: String(x.GuestEmail ?? x.guest_email ?? ''),
                              check_in: String(x.CheckIn ?? x.check_in ?? ''),
                              check_out: String(x.CheckOut ?? x.check_out ?? ''),
                              total_price: Number(x.TotalPrice ?? x.total_price ?? 0),
                              status: mapStatus(String(x.Status ?? x.status ?? 'requested')) as Booking['status'],
                              number_of_guests: Number(x.NumberOfGuests ?? x.number_of_guests ?? 0),
                            };
                          });
                          setBookings(mapped);
                        }}>
                          <CheckCircle2 className='h-3.5 w-3.5' />
                          Aprovar
                        </Button>
                        <Button size='sm' variant='destructive' className='gap-2 w-full sm:w-auto shadow-none' onClick={async () => {
                          const token = localStorage.getItem('token');
                          if (!token) return;
                          const res = await fetch(`${API}/bookings/${b.id}/reject`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
                          if (!res.ok) { toast.error('Erro ao rejeitar'); return; }
                          toast.success('Reserva rejeitada');
                          const r = await fetch(`${API}/bookings`, { headers: { Authorization: `Bearer ${token}` } });
                          const j = await r.json();
                          const rows = (j.data || []) as unknown[];
                          const mapped = rows.map((raw: unknown) => {
                            const x = raw as Record<string, unknown>;
                            const mapStatus = (s: string) => s === 'approved' ? 'confirmed' : s === 'rejected' ? 'cancelled' : 'pending';
                            return {
                              id: String(x.ID ?? x.id ?? ''),
                              guest_name: String(x.GuestName ?? x.guest_name ?? ''),
                              guest_email: String(x.GuestEmail ?? x.guest_email ?? ''),
                              check_in: String(x.CheckIn ?? x.check_in ?? ''),
                              check_out: String(x.CheckOut ?? x.check_out ?? ''),
                              total_price: Number(x.TotalPrice ?? x.total_price ?? 0),
                              status: mapStatus(String(x.Status ?? x.status ?? 'requested')) as Booking['status'],
                              number_of_guests: Number(x.NumberOfGuests ?? x.number_of_guests ?? 0),
                            };
                          });
                          setBookings(mapped);
                        }}>
                          <XCircle className='h-3.5 w-3.5' />
                          Recusar
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className='grid grid-cols-2 gap-4 text-sm'>
                      <div className='flex flex-col gap-1'>
                        <span className='text-xs text-muted-foreground'>Check-in</span>
                        <div className='flex items-center gap-1.5 font-medium'>
                          <Calendar className='h-3.5 w-3.5 text-muted-foreground' />
                          {new Date(b.check_in).toLocaleDateString('pt-BR')}
                        </div>
                      </div>
                      <div className='flex flex-col gap-1'>
                        <span className='text-xs text-muted-foreground'>Check-out</span>
                        <div className='flex items-center gap-1.5 font-medium'>
                          <Calendar className='h-3.5 w-3.5 text-muted-foreground' />
                          {new Date(b.check_out).toLocaleDateString('pt-BR')}
                        </div>
                      </div>
                      <div className='flex flex-col gap-1'>
                        <span className='text-xs text-muted-foreground'>Hóspedes</span>
                        <div className='flex items-center gap-1.5 font-medium'>
                          <User className='h-3.5 w-3.5 text-muted-foreground' />
                          {b.number_of_guests}
                        </div>
                      </div>
                      <div className='flex flex-col gap-1'>
                        <span className='text-xs text-muted-foreground'>Total</span>
                        <div className='flex items-center gap-1.5 font-medium text-primary'>
                          <Badge variant='outline' className='h-5 px-1.5 text-[10px] border-primary/20 text-primary bg-primary/5'>R$</Badge>
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(b.total_price)}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {bookings.filter((b) => b.status === 'pending').length === 0 && (
                <div className='text-muted-foreground text-sm italic'>Sem solicitações pendentes no momento</div>
              )}
            </div>
          </div>
          <div className='mt-10'>
            <h2 className='text-xl font-semibold mb-4 text-foreground'>Reservas Confirmadas</h2>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6'>
              {bookings.filter((b) => b.status === 'confirmed').map((b) => (
                <Card key={b.id} className='relative overflow-hidden bg-white border border-border/50 shadow-sm hover:shadow-md transition-all duration-300 rounded-xl'>
                  <CardHeader className='pb-3'>
                    <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3'>
                      <div className='flex items-center gap-3 min-w-0'>
                        <div className='h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm'>
                          {(b.guest_name || '?').split(' ').filter(Boolean).map((s) => s[0]).slice(0, 2).join('').toUpperCase()}
                        </div>
                        <div className='min-w-0'>
                          <CardTitle className='text-base font-semibold m-0'>{b.guest_name}</CardTitle>
                          <div className='flex items-center text-xs text-muted-foreground min-w-0 mt-0.5'>
                            <Mail className='h-3 w-3 mr-1 shrink-0' />
                            <span className='truncate'>{b.guest_email}</span>
                          </div>
                        </div>
                      </div>
                      <div className='flex flex-col sm:flex-row sm:flex-wrap gap-2 w-full sm:w-auto'>
                        <Button size='sm' variant='outline' className='gap-2 w-full sm:w-auto shadow-none' onClick={() => { navigate(`/chat/${b.id}`); }}>
                          Chat
                        </Button>
                        <Button
                          size='sm'
                          variant='secondary'
                          className='gap-2 w-full sm:w-auto shadow-none'
                          onClick={() => {
                            const from = new Date(b.check_in).toISOString().split('T')[0];
                            const to = new Date(b.check_out).toISOString().split('T')[0];
                            navigate(`/dashboard?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}#calendar`);
                          }}
                        >
                          Ver reserva
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className='grid grid-cols-2 gap-4 text-sm'>
                      <div className='flex flex-col gap-1'>
                        <span className='text-xs text-muted-foreground'>Check-in</span>
                        <div className='flex items-center gap-1.5 font-medium'>
                          <Calendar className='h-3.5 w-3.5 text-muted-foreground' />
                          {new Date(b.check_in).toLocaleDateString('pt-BR')}
                        </div>
                      </div>
                      <div className='flex flex-col gap-1'>
                        <span className='text-xs text-muted-foreground'>Check-out</span>
                        <div className='flex items-center gap-1.5 font-medium'>
                          <Calendar className='h-3.5 w-3.5 text-muted-foreground' />
                          {new Date(b.check_out).toLocaleDateString('pt-BR')}
                        </div>
                      </div>
                      <div className='flex flex-col gap-1'>
                        <span className='text-xs text-muted-foreground'>Hóspedes</span>
                        <div className='flex items-center gap-1.5 font-medium'>
                          <User className='h-3.5 w-3.5 text-muted-foreground' />
                          {b.number_of_guests}
                        </div>
                      </div>
                      <div className='flex flex-col gap-1'>
                        <span className='text-xs text-muted-foreground'>Total</span>
                        <div className='flex items-center gap-1.5 font-medium text-primary'>
                          <Badge variant='outline' className='h-5 px-1.5 text-[10px] border-primary/20 text-primary bg-primary/5'>R$</Badge>
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(b.total_price)}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {bookings.filter((b) => b.status === 'confirmed').length === 0 && (
                <div className='text-muted-foreground text-sm italic'>Sem reservas confirmadas no momento</div>
              )}
            </div>
          </div>
          <Dialog open={showDialog} onOpenChange={setShowDialog}>
            <DialogContent className='bg-white border-border text-foreground sm:max-w-[500px]'>
              <DialogHeader>
                <DialogTitle className='text-foreground'>Chat com o hóspede</DialogTitle>
              </DialogHeader>
              {selectedBooking && (
                <div className='space-y-4'>
                  <div className='grid grid-cols-2 gap-4 p-3 bg-muted/30 rounded-lg'>
                    <div>
                      <p className='text-xs text-muted-foreground font-medium uppercase tracking-wider'>Hóspede</p>
                      <p className='font-semibold text-sm'>{selectedBooking.guest_name}</p>
                      <p className='text-xs text-muted-foreground truncate'>{selectedBooking.guest_email}</p>
                    </div>
                    <div>
                      <p className='text-xs text-muted-foreground font-medium uppercase tracking-wider'>Período</p>
                      <p className='font-semibold text-sm'>{new Date(selectedBooking.check_in).toLocaleDateString('pt-BR')} — {new Date(selectedBooking.check_out).toLocaleDateString('pt-BR')}</p>
                    </div>
                  </div>
                  <div className='h-64 overflow-y-auto space-y-3 p-1'>
                    {messages.map((m) => {
                      const isOwnerMsg = Boolean(m.is_from_owner);
                      const initials = getInitials(isOwnerMsg ? (localStorage.getItem('owner_name') || m.sender_email || 'Você') : (selectedBooking?.guest_name || m.sender_email || 'Hóspede'));
                      return (
                        <div key={m.id} className={`flex items-end gap-2 ${isOwnerMsg ? 'justify-end' : 'justify-start'}`}>
                          {!isOwnerMsg && (
                            <div className='h-7 w-7 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[10px] font-bold shadow-sm'>{initials}</div>
                          )}
                          <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm shadow-sm ${isOwnerMsg ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-white border border-border text-foreground rounded-bl-sm'}`}>
                            <div className='font-medium leading-relaxed'>{m.message}</div>
                            <div className={`mt-1 text-[10px] text-right ${isOwnerMsg ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                          </div>
                          {isOwnerMsg && (
                            <div className='h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold shadow-sm'>{initials}</div>
                          )}
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                    {messages.length === 0 && <div className='text-center text-sm text-muted-foreground py-8'>Sem mensagens</div>}
                  </div>
                  <div className='flex gap-2 pt-2'>
                    <input className='flex-1 px-3 py-2 rounded-md border border-input bg-background text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring' placeholder='Escreva uma mensagem...' value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendReply()} />
                    <Button onClick={sendReply} size='sm'>Enviar</Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
          {/* calendário removido */}
          <ICalSync />
        </div>
      </div>
    </div>
  );
}
