import { Navigation } from '@/components/Navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { useNavigate, useLocation } from 'react-router-dom';
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
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [showPayment, setShowPayment] = useState(false);
  const [publishableKey, setPublishableKey] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [isPaying, setIsPaying] = useState(false);
  const paymentContainerRef = useRef<HTMLDivElement | null>(null);
  const stripeRef = useRef<unknown>(null);
  const elementsRef = useRef<unknown>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const [paymentInvite, setPaymentInvite] = useState<{
    pt?: string;
    bookingId?: string;
  } | null>(null);
  const navBooking = (location.state as LocationState | null)?.booking || null;
  const [guestEmailInput, setGuestEmailInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [isRequestingCode, setIsRequestingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [codeRequested, setCodeRequested] = useState(false);
  const [showGuestAuth, setShowGuestAuth] = useState(false);
  const [fullNameInput, setFullNameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const ptParam = new URLSearchParams(window.location.search).get('pt') || '';
  const guestEmail = (() => {
    if (guestEmailInput.trim()) return guestEmailInput.trim();
    try {
      const raw = localStorage.getItem('guest_booking_session');
      if (!raw) return '';
      const s = JSON.parse(raw) as { guest_email?: string };
      return String(s.guest_email || '').trim();
    } catch {
      return '';
    }
  })();

  const loadStripeScript = async () => {
    const hasStripe = (window as unknown as { Stripe?: unknown }).Stripe;
    if (hasStripe) return;
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://js.stripe.com/v3';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('stripe_js_load_failed'));
      document.body.appendChild(s);
    });
  };

  const handlePay = async () => {
    if (!booking) return;
    if (booking.status !== 'confirmed') {
      toast.error('A reserva precisa ser aceita antes do pagamento');
      return;
    }
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setShowGuestAuth(true);
        toast.error('Verifique sua identidade para continuar');
        return;
      }
      const API = 'http://localhost:3005';
      const params = new URLSearchParams(window.location.search);
      const pt = params.get('pt');
      const url = `${API}/bookings/${booking.id}/payment-intent`;
      const headers: Record<string, string> = {};
      headers.Authorization = `Bearer ${token}`;
      const r = await fetch(url, { method: 'POST', headers });
      if (!r.ok) {
        toast.error('Falha ao iniciar pagamento');
        return;
      }
      const j = await r.json();
      setPublishableKey(String(j.publishable_key || ''));
      setClientSecret(String(j.client_secret || ''));
      await loadStripeScript();
      const w = window as unknown as { Stripe: (key: string) => unknown };
      const stripe = w.Stripe(String(j.publishable_key || '')) as unknown as {
        elements: (opts: { clientSecret: string }) => unknown;
      };
      const elements = stripe.elements({
        clientSecret: String(j.client_secret || ''),
      }) as unknown as {
        create: (type: string) => { mount: (el: HTMLElement) => void };
      };
      const paymentElement = elements.create('payment');
      stripeRef.current = stripe;
      elementsRef.current = elements;
      setShowPayment(true);
      setTimeout(() => {
        if (paymentContainerRef.current) {
          paymentContainerRef.current.innerHTML = '';
          paymentElement.mount(paymentContainerRef.current);
        }
      }, 0);
    } catch (_e) {
      toast.error('Falha ao iniciar pagamento');
    }
  };

  const requestCode = async () => {
    if (!booking) return;
    const email = guestEmailInput.trim();
    if (!email) {
      toast.error('Informe seu email');
      return;
    }
    try {
      setIsRequestingCode(true);
      const API = 'http://localhost:3005';
      const res = await fetch(`${API}/auth/request-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Email: email, BookingID: booking.id }),
      });
      if (res.ok) {
        setCodeRequested(true);
        toast.success('Código enviado para seu email');
      } else {
        const j = await res.json().catch(() => ({}));
        toast.error(String(j.error || 'Erro ao enviar código'));
      }
    } finally {
      setIsRequestingCode(false);
    }
  };

  const verifyCode = async () => {
    if (!booking) return;
    const email = guestEmailInput.trim();
    const code = codeInput.trim();
    if (!email || !code) {
      toast.error('Preencha email e código');
      return;
    }
    try {
      setIsVerifyingCode(true);
      const API = 'http://localhost:3005';
      const res = await fetch(`${API}/auth/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          Email: email,
          BookingID: booking.id,
          Code: code,
        }),
      });
      if (res.ok) {
        const j = await res.json();
        const token = String(j.token || '');
        if (token) {
          localStorage.setItem('token', token);
          setShowGuestAuth(false);
          toast.success('Verificação concluída');
          await loadBookingAndMessages();
        } else {
          toast.error('Token inválido');
        }
      } else {
        const j = await res.json().catch(() => ({}));
        toast.error(String(j.error || 'Código inválido'));
      }
    } finally {
      setIsVerifyingCode(false);
    }
  };

  const confirmPay = async () => {
    if (!booking || !stripeRef.current || !elementsRef.current) return;
    try {
      setIsPaying(true);
      const stripe = stripeRef.current;
      const elements = elementsRef.current;
      const result = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
      });
      if (result.error) {
        toast.error('Pagamento não confirmado');
        setIsPaying(false);
        return;
      }
      const token = localStorage.getItem('token');
      const API = 'http://localhost:3005';
      const r = await fetch(`${API}/bookings/${booking.id}/mark-paid`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const jr = await r.json();
      if (jr.paid) {
        toast.success('Pagamento confirmado');
        setShowPayment(false);
        await loadBookingAndMessages();
      } else {
        toast.error('Pagamento pendente');
      }
    } catch {
      toast.error('Erro ao confirmar pagamento');
    } finally {
      setIsPaying(false);
    }
  };

  const loadBookingAndMessages = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    const API = 'http://localhost:3005';
    const meRes = await fetch(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (meRes.ok) {
      const me = await meRes.json();
      if (me.is_owner) {
        navigate('/dashboard');
        return;
      }
    }
    const res = await fetch(`${API}/bookings/mine`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const j = await res.json();
      const rows = (j.data || []) as Array<Record<string, unknown>>;
      const mapped: Booking[] = rows.map((raw) => ({
        id: String(raw.ID ?? raw.id ?? ''),
        status: ((): Booking['status'] => {
          switch (raw.Status ?? raw.status) {
            case 'approved':
              return 'confirmed';
            case 'rejected':
              return 'cancelled';
            case 'requested':
              return 'pending';
            case 'paid':
              return 'completed';
            default:
              return 'pending';
          }
        })(),
        check_in: String(raw.CheckIn ?? raw.check_in ?? ''),
        check_out: String(raw.CheckOut ?? raw.check_out ?? ''),
        number_of_guests: Number(
          raw.NumberOfGuests ?? raw.number_of_guests ?? 0
        ),
        subtotal_price: Number(raw.SubtotalPrice ?? raw.subtotal_price ?? 0),
        discount_amount: Number(raw.DiscountAmount ?? raw.discount_amount ?? 0),
        total_price: Number(raw.TotalPrice ?? raw.total_price ?? 0),
      }));
      setAllBookings(mapped);
      const params = new URLSearchParams(window.location.search);
      const qid = params.get('bookingId') || undefined;
      const targetId = (
        navBooking?.id ||
        qid ||
        (rows[0] &&
          String(
            (rows[0] as Record<string, unknown>).ID ??
              (rows[0] as Record<string, unknown>).id ??
              ''
          )) ||
        ''
      ).toString();
      const raw = rows.find(
        (r) =>
          String(
            (r as Record<string, unknown>).ID ??
              (r as Record<string, unknown>).id ??
              ''
          ) === targetId
      ) as Record<string, unknown> | undefined;
      if (raw) {
        const mapStatus = (s: unknown): Booking['status'] => {
          switch (s) {
            case 'approved':
              return 'confirmed';
            case 'rejected':
              return 'cancelled';
            case 'requested':
              return 'pending';
            case 'paid':
              return 'completed';
            default:
              return 'pending';
          }
        };
        const latest: Booking = {
          id: String(raw.ID ?? raw.id ?? ''),
          status: mapStatus(raw.Status ?? raw.status),
          check_in: String(raw.CheckIn ?? raw.check_in ?? ''),
          check_out: String(raw.CheckOut ?? raw.check_out ?? ''),
          number_of_guests: Number(
            raw.NumberOfGuests ?? raw.number_of_guests ?? 0
          ),
          subtotal_price: Number(raw.SubtotalPrice ?? raw.subtotal_price ?? 0),
          discount_amount: Number(
            raw.DiscountAmount ?? raw.discount_amount ?? 0
          ),
          total_price: Number(raw.TotalPrice ?? raw.total_price ?? 0),
        };
        setBooking(latest);
        loadMessages(latest.id);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (navBooking) {
      setBooking(navBooking);
      setLoading(false);
    }
  }, [navBooking]);

  useEffect(() => {
    if (localStorage.getItem('token')) return;
    try {
      const raw = localStorage.getItem('guest_booking_session');
      if (!raw) return;
      const s = JSON.parse(raw) as {
        last_booking_id?: string;
        check_in?: string;
        check_out?: string;
        number_of_guests?: number;
        total_price?: number;
        guest_name?: string;
        guest_email?: string;
      };
      if (
        s.last_booking_id &&
        s.check_in &&
        s.check_out &&
        s.number_of_guests &&
        s.total_price !== undefined
      ) {
        setBooking({
          id: String(s.last_booking_id),
          status: 'pending',
          check_in: String(s.check_in),
          check_out: String(s.check_out),
          number_of_guests: Number(s.number_of_guests),
          subtotal_price: undefined,
          discount_amount: undefined,
          total_price: Number(s.total_price),
        });
        if (s.guest_email) setGuestEmailInput(String(s.guest_email));
        setShowGuestAuth(true);
      }
    } catch (_e) {
      void 0;
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadBookingAndMessages();
  }, [loadBookingAndMessages]);

  useEffect(() => {
    if (!booking) return;
    const token = localStorage.getItem('token');
    const params = new URLSearchParams(window.location.search);
    const pt = params.get('pt') || '';
    if (!token && !pt && !guestEmail) return;
    const wsUrl = token
      ? `ws://localhost:3005/ws/messages?booking_id=${booking.id}&token=${token}`
      : pt
      ? `ws://localhost:3005/ws/messages?booking_id=${
          booking.id
        }&pt=${encodeURIComponent(pt)}`
      : `ws://localhost:3005/ws/messages?booking_id=${
          booking.id
        }&guest_email=${encodeURIComponent(guestEmail)}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => console.log('Connected to chat WS');
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'message' && data.data) {
          const d = data.data;
          setMessages((prev) => {
            const exists = prev.some(
              (m) => m.created_at === d.created_at && m.message === d.message
            );
            if (exists) return prev;
            return [
              ...prev,
              {
                id: `ws-${Date.now()}`,
                booking_id: d.booking_id,
                sender_id: d.sender_email,
                message: d.message,
                is_from_owner: d.is_from_owner,
                created_at: d.created_at,
              },
            ];
          });
          try {
            const special = JSON.parse(String(d.message));
            if (special && special.type === 'payment_invite') {
              setBooking((prev) =>
                prev && prev.id === d.booking_id
                  ? { ...prev, status: 'confirmed' }
                  : prev
              );
              const cu = String(
                (special as Record<string, unknown>).checkout_url || ''
              );
              try {
                const u = new URL(cu);
                const pt = u.searchParams.get('pt') || undefined;
                const bid = u.searchParams.get('bookingId') || undefined;
                if (pt && bid) {
                  setPaymentInvite({ pt, bookingId: bid });
                }
              } catch (_e) {
                /* non-local checkout url */
              }
            }
          } catch (_e) {
            void 0;
          }
        } else if (data.type === 'status_update' && data.data) {
          const d = data.data as { booking_id?: string; status?: string };
          const st = String(d.status || '').toLowerCase();
          const mapped: Booking['status'] =
            st === 'confirmed'
              ? 'confirmed'
              : st === 'cancelled'
              ? 'cancelled'
              : st === 'completed'
              ? 'completed'
              : 'pending';
          setBooking((prev) =>
            prev && prev.id === d.booking_id
              ? { ...prev, status: mapped }
              : prev
          );
        }
      } catch (e) {
        console.error('WS error', e);
      }
    };

    return () => ws.close();
  }, [booking?.id, guestEmail]);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pt = params.get('pt') || undefined;
    const bid = params.get('bookingId') || undefined;
    const email = params.get('email') || '';
    if (pt && bid) {
      setPaymentInvite({ pt, bookingId: bid });
    }
    if (email) {
      setGuestEmailInput(email);
    }
  }, []);

  useEffect(() => {
    if (!paymentInvite || !booking) return;
    if (paymentInvite.bookingId !== booking.id) return;
    if (booking.status !== 'confirmed') return;
    if (localStorage.getItem('token')) {
      handlePay();
    } else {
      setShowGuestAuth(true);
    }
  }, [paymentInvite, booking]);

  const loadMessages = async (bookingId: string) => {
    const token = localStorage.getItem('token');
    const API = 'http://localhost:3005';
    const params = new URLSearchParams(window.location.search);
    const pt = params.get('pt') || '';
    if (!token && !pt && !guestEmail) return;
    const url = token
      ? `${API}/messages?booking_id=${bookingId}`
      : pt
      ? `${API}/messages?booking_id=${bookingId}&pt=${encodeURIComponent(pt)}`
      : `${API}/messages?booking_id=${bookingId}&guest_email=${encodeURIComponent(
          guestEmail
        )}`;
    const headers = token
      ? { Authorization: `Bearer ${token}` }
      : (undefined as unknown as Record<string, string>);
    const res = await fetch(url, {
      headers: headers as Record<string, string>,
    });
    if (res.ok) {
      const j = await res.json();
      setMessages(j.data || []);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !booking) return;
    const token = localStorage.getItem('token');
    const API = 'http://localhost:3005';
    const params = new URLSearchParams(window.location.search);
    const pt = params.get('pt') || '';
    const url = token
      ? `${API}/messages`
      : pt
      ? `${API}/messages?pt=${encodeURIComponent(pt)}`
      : `${API}/messages`;
    const headers: Record<string, string> = token
      ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      : { 'Content-Type': 'application/json' };
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(
        token || pt
          ? { BookingID: booking.id, Message: newMessage }
          : {
              BookingID: booking.id,
              Message: newMessage,
              GuestEmail: guestEmail,
            }
      ),
    });
    if (!res.ok) {
      toast.error('Erro ao enviar mensagem');
      return;
    }
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
      completed: 'Pago',
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
          <div className='flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8'>
            <div>
              <h1 className='text-2xl font-semibold tracking-tight text-zinc-900'>
                Minhas Reservas
              </h1>
              <p className='text-sm text-zinc-500 mt-1'>
                Acompanhe suas reservas atuais e passadas.
              </p>
            </div>
          </div>

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
                            <p>
                              Itens incluídos: roupa de cama, Wi‑Fi, limpeza.
                            </p>
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
                    <div className='flex flex-col md:flex-row md:items-end md:justify-between gap-3'></div>
                    <div className='mt-6 w-full rounded-xl border border-primary/20 bg-card/40 p-6 shadow-ocean'>
                      {booking.status === 'confirmed' &&
                        !localStorage.getItem('token') && (
                          <div className='mb-6 p-4 border border-zinc-200 rounded-lg bg-white'>
                            <p className='text-sm font-semibold text-zinc-900'>
                              Verificar identidade
                            </p>
                            <p className='text-xs text-zinc-500 mb-3'>
                              Digite seu email para receber um código e entrar
                              com segurança.
                            </p>
                            <div className='flex gap-2 mb-2'>
                              <input
                                type='email'
                                placeholder='seu@email.com'
                                value={guestEmailInput}
                                onChange={(e) =>
                                  setGuestEmailInput(e.target.value)
                                }
                                className='flex-1 border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
                              />
                              <Button
                                onClick={requestCode}
                                disabled={isRequestingCode}
                              >
                                {isRequestingCode
                                  ? 'Enviando...'
                                  : 'Enviar código'}
                              </Button>
                            </div>
                            {codeRequested && (
                              <div className='flex gap-2'>
                                <input
                                  type='text'
                                  placeholder='Código'
                                  value={codeInput}
                                  onChange={(e) => setCodeInput(e.target.value)}
                                  className='flex-1 border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
                                />
                                <Button
                                  onClick={verifyCode}
                                  disabled={isVerifyingCode}
                                >
                                  {isVerifyingCode
                                    ? 'Verificando...'
                                    : 'Validar e entrar'}
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      <p className='text-sm md:text-base font-semibold text-muted-foreground tracking-wide'>
                        Price details
                      </p>
                      <div className='mt-3 space-y-2'>
                        <div className='flex items-center justify-between text-sm text-muted-foreground'>
                          <span>Hóspedes</span>
                          <span className='font-medium'>
                            {booking.number_of_guests}
                          </span>
                        </div>
                        <div className='flex items-center justify-between text-sm text-muted-foreground'>
                          <span>Subtotal</span>
                          <span className='font-medium'>
                            {new Intl.NumberFormat('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            }).format(
                              typeof booking.subtotal_price === 'string'
                                ? parseFloat(booking.subtotal_price)
                                : booking.subtotal_price ?? 0
                            )}
                          </span>
                        </div>
                        <div className='flex items-center justify-between text-sm text-green-600'>
                          <span>Desconto</span>
                          <span className='font-medium'>
                            -
                            {new Intl.NumberFormat('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            }).format(
                              typeof booking.discount_amount === 'string'
                                ? parseFloat(booking.discount_amount)
                                : booking.discount_amount ?? 0
                            )}
                          </span>
                        </div>
                        <div className='border-t border-primary/20 my-3' />
                        <div className='flex items-center justify-between'>
                          <span className='text-sm md:text-base font-semibold'>
                            Total (BRL)
                          </span>
                          <span className='text-2xl md:text-3xl font-extrabold text-gradient'>
                            {new Intl.NumberFormat('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            }).format(
                              typeof booking.total_price === 'string'
                                ? parseFloat(booking.total_price)
                                : booking.total_price
                            )}
                          </span>
                        </div>
                        {booking.status === 'confirmed' && (
                          <>
                            <Button
                              onClick={() => booking && handlePay(booking)}
                              className='w-full shadow-ocean mx-auto'
                              variant='gradient'
                            >
                              Processar Pagamento
                            </Button>
                            {showPayment && (
                              <div className='mt-4 w-full rounded-xl border border-primary/20 bg-card/40 p-6 shadow-ocean'>
                                <div ref={paymentContainerRef} />
                                <Button
                                  onClick={confirmPay}
                                  className='w-full mt-4'
                                  disabled={isPaying}
                                >
                                  {isPaying ? 'Processando...' : 'Pagar'}
                                </Button>
                              </div>
                            )}
                          </>
                        )}
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

          <Card className='bg-white border border-zinc-200 rounded-xl shadow-sm'>
            <CardHeader>
              <CardTitle>Mensagens</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                ref={messagesContainerRef}
                className='space-y-4 mb-4 max-h-96 overflow-y-auto'
              >
                {messages.length === 0 ? (
                  <p className='text-center text-muted-foreground py-8'>
                    Nenhuma mensagem ainda. Envie uma mensagem se tiver alguma
                    dúvida!
                  </p>
                ) : (
                  messages.map((msg) => {
                    let special: Record<string, unknown> | null = null;
                    try {
                      special = JSON.parse(msg.message) as Record<
                        string,
                        unknown
                      >;
                    } catch (_e) {
                      special = null;
                    }
                    const isPayment = Boolean(
                      special &&
                        (special as Record<string, unknown>).type ===
                          'payment_invite'
                    );
                    const isOwnerMsg = Boolean(msg.is_from_owner);
                    return (
                      <div
                        key={msg.id}
                        className={`flex items-end gap-2 ${
                          isOwnerMsg ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        {!isOwnerMsg && (
                          <div className='h-6 w-6 sm:h-7 sm:w-7 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-[10px] font-bold shadow'>
                            H
                          </div>
                        )}
                        <div
                          className={`max-w-[85%] sm:max-w-[70%] px-3 py-2 rounded-2xl text-xs sm:text-sm shadow ${
                            isOwnerMsg
                              ? 'bg-primary text-primary-foreground rounded-br-sm'
                              : 'bg-accent text-accent-foreground rounded-bl-sm'
                          }`}
                        >
                          {isPayment ? (
                            <div className='space-y-3'>
                              <div className='font-medium'>
                                {String(
                                  (special as Record<string, unknown>).text ??
                                    ''
                                )}
                              </div>
                              <Button
                                onClick={handlePay}
                                className='w-full'
                                variant='gradient'
                              >
                                {String(
                                  (special as Record<string, unknown>).cta ??
                                    'Pagar agora'
                                )}
                              </Button>
                            </div>
                          ) : (
                            <div className='font-medium'>{msg.message}</div>
                          )}
                          <div className='mt-1 text-[10px] text-white/70 text-right'>
                            {new Date(msg.created_at).toLocaleTimeString(
                              'pt-BR',
                              { hour: '2-digit', minute: '2-digit' }
                            )}
                          </div>
                        </div>
                        {isOwnerMsg && (
                          <div className='h-6 w-6 sm:h-7 sm:w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold shadow'>
                            P
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div className='flex gap-2'>
                <Textarea
                  placeholder='Digite sua mensagem...'
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  rows={3}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                />
                <Button onClick={sendMessage}>
                  <Send className='h-4 w-4' />
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className='mt-8 bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden'>
            <div className='p-4 border-b border-zinc-200'>
              <h2 className='font-medium text-zinc-900'>Reservas Passadas</h2>
            </div>
            <div className='p-6 space-y-4'>
              {allBookings
                .filter((b) => new Date(b.check_out) < new Date())
                .map((b) => (
                  <div
                    key={b.id}
                    className='p-4 border border-zinc-200 rounded-lg'
                  >
                    <div className='flex items-center justify-between'>
                      <div className='font-medium text-zinc-900'>
                        Reserva #{b.id.slice(0, 8)}
                      </div>
                      {getStatusBadge(b.status)}
                    </div>
                    <div className='grid grid-cols-2 gap-3 mt-3 text-sm'>
                      <div>
                        <div className='text-zinc-500'>Check-in</div>
                        <div className='font-medium'>
                          {format(new Date(b.check_in), 'dd MMM yyyy', {
                            locale: ptBR,
                          })}
                        </div>
                      </div>
                      <div>
                        <div className='text-zinc-500'>Check-out</div>
                        <div className='font-medium'>
                          {format(new Date(b.check_out), 'dd MMM yyyy', {
                            locale: ptBR,
                          })}
                        </div>
                      </div>
                      <div>
                        <div className='text-zinc-500'>Hóspedes</div>
                        <div className='font-medium'>{b.number_of_guests}</div>
                      </div>
                      <div>
                        <div className='text-zinc-500'>Total</div>
                        <div className='font-medium'>
                          R${' '}
                          {Number(b.total_price).toLocaleString('pt-BR', {
                            minimumFractionDigits: 2,
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
