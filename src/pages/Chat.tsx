import { Navigation } from '@/components/Navigation';
import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, Mail, User, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

export default function Chat() {
  type Booking = { id: string; guest_name: string; guest_email: string; guest_phone?: string; check_in: string; check_out: string; number_of_guests: number; status: 'pending'|'confirmed'|'cancelled'|'completed'; subtotal_price?: number; discount_amount?: number; total_price: number };
  type Message = { id: number; booking_id: string; sender_email: string; is_from_owner: boolean; message: string; created_at: string };
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const API = 'http://localhost:3005';

  const mapStatus = (s: string) => (s === 'approved' ? 'confirmed' : s === 'rejected' ? 'cancelled' : 'pending') as Booking['status'];

  const loadBooking = async () => {
    const token = localStorage.getItem('token');
    if (!token || !bookingId) return;
    const res = await fetch(`${API}/bookings`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { toast.error('Erro ao carregar reserva'); return; }
    const j = await res.json();
    const rows = (j.data || []) as unknown[];
    const found = rows.find((raw) => {
      const r = raw as Record<string, unknown>;
      const id = String(r.ID ?? r.id ?? '');
      return id === bookingId;
    }) as Record<string, unknown> | undefined;
    if (found) {
      const b: Booking = {
        id: String(found.ID ?? found.id ?? ''),
        guest_name: String(found.GuestName ?? found.guest_name ?? ''),
        guest_email: String(found.GuestEmail ?? found.guest_email ?? ''),
        guest_phone: String(found.GuestPhone ?? found.guest_phone ?? ''),
        check_in: String(found.CheckIn ?? found.check_in ?? ''),
        check_out: String(found.CheckOut ?? found.check_out ?? ''),
        number_of_guests: Number(found.NumberOfGuests ?? found.number_of_guests ?? 0),
        status: mapStatus(String(found.Status ?? found.status ?? 'requested')),
        subtotal_price: Number(found.SubtotalPrice ?? found.subtotal_price ?? 0),
        discount_amount: Number(found.DiscountAmount ?? found.discount_amount ?? 0),
        total_price: Number(found.TotalPrice ?? found.total_price ?? 0),
      };
      setBooking(b);
    }
  };

  const loadMessages = async () => {
    const token = localStorage.getItem('token');
    if (!token || !bookingId) { setMessages([]); return; }
    const res = await fetch(`${API}/messages?booking_id=${bookingId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const j = await res.json();
      const rows = (j.data || []) as unknown[];
      const mapped = rows.map((raw) => {
        const r = raw as Record<string, unknown>;
        return {
          id: Number(r.ID ?? r.id ?? Date.now()),
          booking_id: String(r.BookingID ?? r.booking_id ?? String(bookingId)),
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
    if (!bookingId || !reply.trim()) return;
    const token = localStorage.getItem('token');
    if (!token) { toast.error('Faça login como proprietário'); return; }
    const res = await fetch(`${API}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ BookingID: bookingId, Message: reply }) });
    if (!res.ok) { toast.error('Erro ao enviar mensagem'); return; }
    setReply('');
    toast.success('Mensagem enviada');
  };

  const cancelBooking = async () => {
    if (!bookingId) return;
    const token = localStorage.getItem('token');
    if (!token) { toast.error('Faça login como proprietário'); return; }
    const res = await fetch(`${API}/bookings/${bookingId}/reject`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { toast.error('Erro ao cancelar'); return; }
    toast.success('Reserva cancelada');
    await loadBooking();
  };

  const getStatusBadge = (status: Booking['status']) => {
    const classes: Record<Booking['status'], string> = {
      pending: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300',
      confirmed: 'bg-primary/20 text-primary',
      cancelled: 'bg-destructive/20 text-destructive',
      completed: 'bg-green-500/20 text-green-700 dark:text-green-300',
    };
    const labels: Record<Booking['status'], string> = {
      pending: 'Pendente',
      confirmed: 'Confirmada',
      cancelled: 'Cancelada',
      completed: 'Concluída',
    };
    return <Badge className={classes[status]}>{labels[status]}</Badge>;
  };

  const getInitials = (s: string) => {
    const parts = s.split(/\s+|@/).filter(Boolean);
    const a = (parts[0] || '').charAt(0);
    const b = (parts[1] || '').charAt(0);
    return (a + b).toUpperCase() || 'U';
  };

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || !bookingId) return;
    loadBooking();
    loadMessages();
    const url = `ws://localhost:3005/ws/messages?booking_id=${encodeURIComponent(bookingId)}&token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg && msg.type === 'message' && msg.data && msg.data.booking_id === bookingId) {
          setMessages((prev) => [...prev, { id: Date.now(), booking_id: String(bookingId), sender_email: String(msg.data.sender_email || ''), is_from_owner: Boolean(msg.data.is_from_owner), message: String(msg.data.message || ''), created_at: String(msg.data.created_at || new Date().toISOString()) }]);
        }
      } catch (e) { void e; }
    };
    ws.onclose = () => {};
    return () => { if (wsRef.current) { wsRef.current.close(); wsRef.current = null; } };
  }, [bookingId]);

  return (
    <div className='min-h-screen bg-background'>
      <Navigation />
      <div className='pt-20 sm:pt-24 pb-12 px-3 sm:px-4'>
        <div className='container mx-auto max-w-3xl'>
          <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6'>
            <h1 className='text-2xl sm:text-3xl font-bold text-gradient'>Chat</h1>
            <Button variant='outline' className='gap-2 w-full sm:w-auto' onClick={() => navigate(-1)}>
              <ArrowLeft className='h-4 w-4' />
              Voltar
            </Button>
          </div>

          {booking && (
            <Card className='glass-ocean border-gradient-ocean shadow-ocean mb-6'>
              <CardHeader>
                <div className='flex items-center justify-between'>
                  <div className='flex items-center gap-3'>
                    <div className='h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold'>
                      {getInitials(booking.guest_name || booking.guest_email)}
                    </div>
                    <div>
                      <CardTitle className='m-0 text-lg sm:text-xl'>{booking.guest_name}</CardTitle>
                      <div className='flex items-center text-xs sm:text-sm text-muted-foreground'>
                        <Mail className='h-4 w-4 mr-1' />
                        {booking.guest_email}
                      </div>
                    </div>
                  </div>
                  {getStatusBadge(booking.status)}
                </div>
              </CardHeader>
              <CardContent>
                <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                  <div className='flex items-center gap-2'>
                    <Calendar className='h-4 w-4 text-muted-foreground' />
                    <div>
                      <div className='text-xs text-muted-foreground'>Check-in</div>
                      <div className='font-semibold'>{new Date(booking.check_in).toLocaleDateString('pt-BR')}</div>
                    </div>
                  </div>
                  <div className='flex items-center gap-2'>
                    <Calendar className='h-4 w-4 text-muted-foreground' />
                    <div>
                      <div className='text-xs text-muted-foreground'>Check-out</div>
                      <div className='font-semibold'>{new Date(booking.check_out).toLocaleDateString('pt-BR')}</div>
                    </div>
                  </div>
                  <div className='flex items-center gap-2'>
                    <User className='h-4 w-4 text-muted-foreground' />
                    <div>
                      <div className='text-xs text-muted-foreground'>Hóspedes</div>
                      <div className='font-semibold'>{booking.number_of_guests}</div>
                    </div>
                  </div>
                  <div className='flex items-center gap-2'>
                    <Badge variant='default' className='mr-2'>R$</Badge>
                    <div>
                      <div className='text-xs text-muted-foreground'>Total</div>
                      <div className='font-semibold'>{new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(booking.total_price)}</div>
                    </div>
                  </div>
                </div>
                <div className='mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3'>
                  <a href={`mailto:${booking.guest_email}`} className='text-sm text-primary hover:underline'>Abrir email</a>
                  {booking.guest_phone && <a href={`tel:${booking.guest_phone}`} className='text-sm text-primary hover:underline'>Ligar para hóspede</a>}
                </div>
                <div className='mt-6'>
                  <Button
                    variant='gradient'
                    className='shadow-ocean w-full sm:w-auto'
                    onClick={() => {
                      const from = new Date(booking.check_in).toISOString().split('T')[0];
                      const to = new Date(booking.check_out).toISOString().split('T')[0];
                      navigate(`/dashboard?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}#calendar`);
                    }}
                  >
                    Ver no Calendário
                  </Button>
                </div>
                <div className='mt-4 flex gap-2'>
                  {booking.status !== 'cancelled' && (
                    <Button size='sm' variant='destructive' className='w-full sm:w-auto' onClick={cancelBooking}>Cancelar Reserva</Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <div className='flex items-center justify-between mb-3'>
            <h2 className='text-xl sm:text-2xl font-bold text-gradient'>Falar com o hóspede</h2>
            <div className='flex-1 h-px bg-gradient-ocean ml-3' />
          </div>

          <Card className='glass-ocean border-gradient-ocean shadow-ocean'>
            <CardContent className='flex flex-col gap-3'>
              <div className='flex-1 h-[50vh] sm:h-[60vh] overflow-auto space-y-3 py-2'>
                {messages.map((m) => {
                  const isOwnerMsg = Boolean(m.is_from_owner);
                  const initials = getInitials(isOwnerMsg ? (localStorage.getItem('owner_name') || m.sender_email || 'Você') : (booking?.guest_name || m.sender_email || 'Hóspede'));
                  return (
                    <div key={m.id} className={`flex items-end gap-2 ${isOwnerMsg ? 'justify-end' : 'justify-start'}`}>
                      {!isOwnerMsg && (
                        <div className='h-6 w-6 sm:h-7 sm:w-7 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-[10px] font-bold shadow'>{initials}</div>
                      )}
                      <div className={`max-w-[85%] sm:max-w-[70%] px-3 py-2 rounded-2xl text-xs sm:text-sm shadow ${isOwnerMsg ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-accent text-accent-foreground rounded-bl-sm'}`}>
                        <div className='font-medium'>{m.message}</div>
                        <div className='mt-1 text-[10px] text-white/70 text-right'>{new Date(m.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</div>
                      </div>
                      {isOwnerMsg && (
                        <div className='h-6 w-6 sm:h-7 sm:w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold shadow'>{initials}</div>
                      )}
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
                {messages.length === 0 && <div className='text-sm text-muted-foreground'>Sem mensagens</div>}
              </div>
              <div className='flex flex-col sm:flex-row gap-2'>
                <input className='flex-1 px-3 py-3 rounded border bg-background/40 text-white placeholder-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 border-white/30' placeholder='Escreva uma mensagem' value={reply} onChange={(e) => setReply(e.target.value)} />
                <Button onClick={sendReply} className='shadow-ocean w-full sm:w-auto' variant='gradient'>Enviar</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}