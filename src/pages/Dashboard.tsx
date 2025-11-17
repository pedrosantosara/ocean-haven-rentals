import { Navigation } from '@/components/Navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ICalSync } from '@/components/ICalSync';
import { ICSCalendarPreview } from '@/components/ICSCalendarPreview';
// Removido calendário grande
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Calendar, Mail, User, CheckCircle2, XCircle, CalendarDays, CalendarCheck, Wallet } from 'lucide-react';

export default function Dashboard() {
  type Booking = { id: string; guest_name: string; guest_email: string; check_in: string; check_out: string; total_price: number; status: 'pending'|'confirmed'|'cancelled'|'completed'; number_of_guests: number };
  const [stats, setStats] = useState<{ total_bookings: number; confirmed_bookings: number; total_revenue: number } | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
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
  return (
    <div className='min-h-screen bg-background'>
      <Navigation />

      <div className='pt-24 pb-12 px-4'>
        <div className='container mx-auto'>
          <h1 className='text-5xl font-bold mb-12 text-gradient'>Dashboard</h1>

          <div className='grid md:grid-cols-3 gap-6 mb-8'>
            <Card className='relative overflow-hidden glass-ocean border-gradient-ocean shadow-ocean hover:shadow-ocean transition-all duration-300'>
              <CardHeader>
                <div className='flex items-center justify-between'>
                  <CardTitle className='text-gradient'>Total de Reservas</CardTitle>
                  <div className='h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center'>
                    <CalendarDays className='h-5 w-5' />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className='text-4xl font-bold text-primary'>
                  {stats ? stats.total_bookings : '—'}
                </p>
              </CardContent>
            </Card>

            <Card className='relative overflow-hidden glass-ocean border-gradient-ocean shadow-ocean hover:shadow-ocean transition-all duration-300'>
              <CardHeader>
                <div className='flex items-center justify-between'>
                  <CardTitle className='text-gradient'>Reservas Confirmadas</CardTitle>
                  <div className='h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center'>
                    <CalendarCheck className='h-5 w-5' />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className='text-4xl font-bold text-primary'>
                  {stats ? stats.confirmed_bookings : '—'}
                </p>
              </CardContent>
            </Card>

            <Card className='relative overflow-hidden glass-ocean border-gradient-ocean shadow-ocean hover:shadow-ocean transition-all duration-300'>
              <CardHeader>
                <div className='flex items-center justify-between'>
                  <CardTitle className='text-gradient'>Receita Total</CardTitle>
                  <div className='h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center'>
                    <Wallet className='h-5 w-5' />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className='text-4xl font-bold text-primary'>
                  {stats ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.total_revenue) : '—'}
                </p>
              </CardContent>
            </Card>
          </div>

          <ICSCalendarPreview />
          <div className='mt-10'>
            <h2 className='text-2xl font-bold mb-4'>Solicitações Pendentes</h2>
            <div className='grid md:grid-cols-2 gap-6'>
              {bookings.filter((b) => b.status === 'pending').map((b) => (
                <Card key={b.id} className='relative overflow-hidden glass-ocean border-primary/30 shadow-ocean hover:shadow-ocean transition-all duration-300'>
                  <CardHeader>
                    <div className='flex items-center justify-between'>
                      <div className='flex items-center gap-3'>
                        <div className='h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold'>
                          {(b.guest_name || '?').split(' ').filter(Boolean).map((s) => s[0]).slice(0,2).join('').toUpperCase()}
                        </div>
                        <div>
                          <CardTitle className='m-0'>{b.guest_name}</CardTitle>
                          <div className='flex items-center text-sm text-muted-foreground'>
                            <Mail className='h-4 w-4 mr-1' />
                            {b.guest_email}
                          </div>
                        </div>
                      </div>
                      <div className='flex items-center gap-2'>
                        <Button size='sm' variant='gradient' className='gap-2' onClick={async () => {
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
                          <CheckCircle2 className='h-4 w-4' />
                          Aprovar
                        </Button>
                        <Button size='sm' variant='destructive' className='gap-2' onClick={async () => {
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
                          <XCircle className='h-4 w-4' />
                          Recusar
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className='grid grid-cols-2 gap-4'>
                      <div className='flex items-center gap-2'>
                        <Calendar className='h-4 w-4 text-muted-foreground' />
                        <div>
                          <div className='text-xs text-muted-foreground'>Check-in</div>
                          <div className='font-semibold'>{new Date(b.check_in).toLocaleDateString('pt-BR')}</div>
                        </div>
                      </div>
                      <div className='flex items-center gap-2'>
                        <Calendar className='h-4 w-4 text-muted-foreground' />
                        <div>
                          <div className='text-xs text-muted-foreground'>Check-out</div>
                          <div className='font-semibold'>{new Date(b.check_out).toLocaleDateString('pt-BR')}</div>
                        </div>
                      </div>
                      <div className='flex items-center gap-2'>
                        <User className='h-4 w-4 text-muted-foreground' />
                        <div>
                          <div className='text-xs text-muted-foreground'>Hóspedes</div>
                          <div className='font-semibold'>{b.number_of_guests}</div>
                        </div>
                      </div>
                      <div className='flex items-center gap-2'>
                        <Badge variant='default' className='mr-2'>R$</Badge>
                        <div>
                          <div className='text-xs text-muted-foreground'>Total</div>
                          <div className='font-semibold'>{new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(b.total_price)}</div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {bookings.filter((b) => b.status === 'pending').length === 0 && (
                <div className='text-muted-foreground'>Sem solicitações pendentes no momento</div>
              )}
            </div>
          </div>
          {/* calendário removido */}
          <ICalSync />
        </div>
      </div>
    </div>
  );
}
