import { Navigation } from '@/components/Navigation';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useLocation, useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import { Send } from 'lucide-react';
import { Footer } from '@/components/Footer';
import casaVideo from '@/assets/videos/video-casa.mp4';

export default function MyBooking() {
  const navigate = useNavigate();
  const location = useLocation();
  type Booking = {
    id: string;
    status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
    check_in: string;
    check_out: string;
    number_of_guests: number;
    subtotal_price?: number | string;
    discount_amount?: number | string;
    total_price: number | string;
  };
  type LocationState = { booking?: Booking };
  type Message = {
    id: string;
    booking_id: string;
    sender_id: string | null;
    message: string;
    is_from_owner: boolean;
    created_at: string;
  };
  const [booking, setBooking] = useState<Booking | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const handlePay = async () => {
    if (!booking) return;
    try {
      const amountNumber =
        typeof booking.total_price === 'string'
          ? parseFloat(booking.total_price)
          : booking.total_price;
      const amountCents = Math.round(amountNumber * 100);
      const { data, error } = await supabase.functions.invoke(
        'create-payment',
        {
          body: { bookingId: booking.id, amount: amountCents },
        }
      );
      if (error) throw error;
      window.location.href = data.url;
    } catch (error: unknown) {
      toast.error('Falha ao iniciar pagamento');
    }
  };

  const loadBookingAndMessages = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }
    const API = 'http://localhost:3005';
    const res = await fetch(`${API}/bookings/mine`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const j = await res.json();
      const rows = (j.data || []) as unknown[];
      const raw = rows[0] as Record<string, unknown> | undefined;
      if (raw) {
        const mapStatus = (s: unknown): Booking['status'] => {
          switch (s) {
            case 'approved': return 'confirmed';
            case 'rejected': return 'cancelled';
            case 'requested': return 'pending';
            default: return 'pending';
          }
        };
        const latest: Booking = {
          id: String(raw.ID ?? raw.id ?? ''),
          status: mapStatus(raw.Status ?? raw.status),
          check_in: String(raw.CheckIn ?? raw.check_in ?? ''),
          check_out: String(raw.CheckOut ?? raw.check_out ?? ''),
          number_of_guests: Number(raw.NumberOfGuests ?? raw.number_of_guests ?? 0),
          subtotal_price: Number(raw.SubtotalPrice ?? raw.subtotal_price ?? 0),
          discount_amount: Number(raw.DiscountAmount ?? raw.discount_amount ?? 0),
          total_price: Number(raw.TotalPrice ?? raw.total_price ?? 0),
        };
        setBooking(latest);
        loadMessages(latest.id);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const stateBooking = (location.state as LocationState)?.booking;
    if (stateBooking) {
      setBooking(stateBooking as Booking);
      setLoading(false);
      return;
    }
    loadBookingAndMessages();
  }, [loadBookingAndMessages, location.state]);

  const loadMessages = async (bookingId: string) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const API = 'http://localhost:3005';
    const res = await fetch(`${API}/messages?booking_id=${bookingId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) { const j = await res.json(); setMessages(j.data || []); }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !booking) return;
    const token = localStorage.getItem('token');
    if (!token) { toast.error('Faça login'); return; }
    const API = 'http://localhost:3005';
    const res = await fetch(`${API}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ BookingID: booking.id, Message: newMessage }),
    });
    if (!res.ok) { toast.error('Erro ao enviar mensagem'); return; }
    setNewMessage('');
    loadMessages(booking.id);
    toast.success('Mensagem enviada!');
  };

  const getStatusBadge = (status: Booking['status']) => {
    const variants: Record<
      Booking['status'],
      'secondary' | 'default' | 'destructive' | 'outline'
    > = {
      pending: 'secondary',
      confirmed: 'default',
      cancelled: 'destructive',
      completed: 'outline',
    };
    const labels: Record<Booking['status'], string> = {
      pending: 'Pendente',
      confirmed: 'Confirmada',
      cancelled: 'Cancelada',
      completed: 'Concluída',
    };
    return <Badge variant={variants[status]}>{labels[status]}</Badge>;
  };

  if (loading) {
    return (
      <div className='min-h-screen bg-background'>
        <Navigation />
        <div className='pt-24 flex items-center justify-center'>
          <p>Carregando...</p>
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className='min-h-screen bg-background'>
        <Navigation />
        <div className='pt-24 pb-12 px-4'>
          <div className='container mx-auto text-center'>
            <h1 className='text-4xl font-bold mb-4'>
              Nenhuma reserva encontrada
            </h1>
            <p className='text-muted-foreground mb-8'>
              Você ainda não tem reservas.
            </p>
            <Button onClick={() => navigate('/#book')}>
              Fazer uma Reserva
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-background'>
      <Navigation />

      <div className='pt-24 pb-12 px-4'>
        <div className='container mx-auto max-w-4xl'>
          <h1 className='text-5xl font-bold mb-12 text-gradient'>
            Minha Reserva
          </h1>

          <Card className='glass-ocean border-primary/20 mb-8'>
            <CardHeader>
              <div className='flex justify-between items-start'>
                <div>
                  <CardTitle>Detalhes da Reserva</CardTitle>
                  <CardDescription>
                    Código: {booking.id.slice(0, 8)}
                  </CardDescription>
                </div>
                {getStatusBadge(booking.status)}
              </div>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='grid md:grid-cols-2 gap-6 items-stretch'>
                <div className='md:h-full'>
                  <div className='relative h-full min-h-[12rem] md:min-h-[16rem] rounded-lg overflow-hidden bg-muted'>
                    <video
                      src={casaVideo}
                      className='w-full h-full object-cover'
                      autoPlay
                      muted
                      loop
                      playsInline
                      preload='metadata'
                    />
                    <div className='absolute bottom-3 right-3'>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant='outline'
                            size='sm'
                            className='shadow-ocean bg-background/70 backdrop-blur-sm'
                          >
                            Mais detalhes
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent side='top' align='end' className='w-64'>
                          <div className='space-y-2 text-sm'>
                            <p>Suíte premium com vista para o mar.</p>
                            <p>Check-in a partir das 14h, check-out até 11h.</p>
                            <p>Itens incluídos: roupa de cama, Wi‑Fi, limpeza.</p>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                </div>
                <div>
                      <div className='grid sm:grid-cols-2 gap-4'>
                        <div>
                          <p className='text-sm text-muted-foreground'>Check-in</p>
                      <p className='font-bold'>
                        {format(
                          new Date(booking.check_in),
                          "dd 'de' MMMM 'de' yyyy",
                          {
                            locale: ptBR,
                          }
                        )}
                      </p>
                    </div>
                    <div>
                      <p className='text-sm text-muted-foreground'>Check-out</p>
                      <p className='font-bold'>
                        {format(
                          new Date(booking.check_out),
                          "dd 'de' MMMM 'de' yyyy",
                          {
                            locale: ptBR,
                          }
                        )}
                      </p>
                    </div>
                    <div>
                      <p className='text-sm text-muted-foreground'>Hóspedes</p>
                      <p className='font-bold'>{booking.number_of_guests}</p>
                    </div>
                      </div>
                      <div className='mt-6 w-full'>
                        <div className='flex flex-col md:flex-row md:items-end md:justify-between gap-3'>
                        </div>
                        <div className='mt-6 w-full rounded-xl border border-primary/20 bg-card/40 p-6 shadow-ocean'>
                          <p className='text-sm md:text-base font-semibold text-muted-foreground tracking-wide'>
                            Price details
                          </p>
                          <div className='mt-3 space-y-2'>
                            <div className='flex items-center justify-between text-sm text-muted-foreground'>
                              <span>Hóspedes</span>
                              <span className='font-medium'>{booking.number_of_guests}</span>
                            </div>
                            <div className='flex items-center justify-between text-sm text-muted-foreground'>
                              <span>Subtotal</span>
                              <span className='font-medium'>
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                                  typeof booking.subtotal_price === 'string' ? parseFloat(booking.subtotal_price) : (booking.subtotal_price ?? 0)
                                )}
                              </span>
                            </div>
                            <div className='flex items-center justify-between text-sm text-green-600'>
                              <span>Desconto</span>
                              <span className='font-medium'>
                                -{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                                  typeof booking.discount_amount === 'string' ? parseFloat(booking.discount_amount) : (booking.discount_amount ?? 0)
                                )}
                              </span>
                            </div>
                            <div className='border-t border-primary/20 my-3' />
                            <div className='flex items-center justify-between'>
                              <span className='text-sm md:text-base font-semibold'>
                                Total (BRL)
                              </span>
                              <span className='text-2xl md:text-3xl font-extrabold text-gradient'>
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                                  typeof booking.total_price === 'string' ? parseFloat(booking.total_price) : booking.total_price
                                )}
                              </span>
                            </div>
                            <Button
                              onClick={handlePay}
                              className='w-full shadow-ocean mx-auto'
                              variant='gradient'
                            >
                          Processar Pagamento
                        </Button>
                      </div>
                      <p className='mt-3 text-xs md:text-sm text-muted-foreground'>
                        Price breakdown
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className='glass-ocean border-primary/20'>
            <CardHeader>
              <CardTitle>Mensagens</CardTitle>
              <CardDescription>
                Entre em contato conosco sobre sua reserva
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className='space-y-4 mb-4 max-h-96 overflow-y-auto'>
                {messages.length === 0 ? (
                  <p className='text-center text-muted-foreground py-8'>
                    Nenhuma mensagem ainda. Envie uma mensagem se tiver alguma
                    dúvida!
                  </p>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-4 rounded-lg ${
                        msg.is_from_owner ? 'bg-primary/10' : 'bg-accent/10'
                      }`}
                    >
                      <p className='font-bold text-sm mb-1'>
                        {msg.is_from_owner ? 'Proprietário' : 'Você'}
                      </p>
                      <p>{msg.message}</p>
                      <p className='text-xs text-muted-foreground mt-2'>
                        {format(
                          new Date(msg.created_at),
                          "dd/MM/yyyy 'às' HH:mm",
                          {
                            locale: ptBR,
                          }
                        )}
                      </p>
                    </div>
                  ))
                )}
              </div>

              <div className='flex gap-2'>
                <Textarea
                  placeholder='Digite sua mensagem...'
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  rows={3}
                />
                <Button onClick={sendMessage} className='bg-gradient-ocean'>
                  <Send className='h-4 w-4' />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <Footer />
    </div>
  );
}
