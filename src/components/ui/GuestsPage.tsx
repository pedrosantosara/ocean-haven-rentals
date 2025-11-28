import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Mail,
  Phone,
  CalendarDays,
  DollarSign,
  MapPin,
  MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface GuestsPageProps {
  onNavClick?: (section: string) => void;
}

interface Guest {
  id: string;
  name: string;
  email: string;
  phone: string;
  totalBookings: number;
  totalSpent: number;
  lastStay: string;
  status: 'active' | 'completed' | 'cancelled';
  paymentStatus: 'paid' | 'pending' | 'unpaid';
}

export const GuestsPage: React.FC<GuestsPageProps> = ({ onNavClick }) => {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  useEffect(() => {
    loadGuests();
  }, []);

  const loadGuests = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const API = 'http://localhost:3005';

      // Load bookings and group by guest
      const res = await fetch(`${API}/bookings`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (res.ok) {
        const data = await res.json();
        const bookings = data.data || [];

        // Group by guest email
        const guestMap = new Map();

        bookings.forEach(
          (booking: {
            ID?: string;
            id?: string;
            GuestName?: string;
            guest_name?: string;
            GuestEmail?: string;
            guest_email?: string;
            GuestPhone?: string;
            guest_phone?: string;
            TotalPrice?: number;
            total_price?: number;
            CheckOut?: string;
            check_out?: string;
            Status?: string;
            status?: string;
          }) => {
            const email = booking.GuestEmail || booking.guest_email;
            const name = booking.GuestName || booking.guest_name;
            const phone = booking.GuestPhone || booking.guest_phone || '';
            const total = booking.TotalPrice || booking.total_price || 0;
            const checkOut = booking.CheckOut || booking.check_out;
            const status = booking.Status || booking.status;
            const paymentStatus: Guest['paymentStatus'] =
              status === 'paid'
                ? 'paid'
                : status === 'approved'
                ? 'pending'
                : 'unpaid';

            if (guestMap.has(email)) {
              const guest = guestMap.get(email);
              guest.totalBookings += 1;
              guest.totalSpent += total;
              if (new Date(checkOut) > new Date(guest.lastStay)) {
                guest.lastStay = checkOut;
                guest.paymentStatus = paymentStatus;
                guest.status =
                  status === 'paid'
                    ? 'completed'
                    : status === 'approved'
                    ? 'completed'
                    : status === 'requested'
                    ? 'active'
                    : 'cancelled';
              }
            } else {
              guestMap.set(email, {
                id: email,
                name: name,
                email: email,
                phone: phone,
                totalBookings: 1,
                totalSpent: total,
                lastStay: checkOut,
                status:
                  status === 'paid'
                    ? 'completed'
                    : status === 'approved'
                    ? 'completed'
                    : status === 'requested'
                    ? 'active'
                    : 'cancelled',
                paymentStatus,
              });
            }
          }
        );

        setGuests(Array.from(guestMap.values()));
      }
    } catch (error) {
      console.error('Error loading guests:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredGuests = guests.filter((guest) => {
    const matchesSearch =
      guest.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      guest.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter =
      filterStatus === 'all' ||
      (filterStatus === 'active' && guest.status === 'active') ||
      (filterStatus === 'completed' &&
        (guest.status === 'completed' || guest.status === 'cancelled'));
    return matchesSearch && matchesFilter;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'completed':
        return 'bg-blue-100 text-blue-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-zinc-100 text-zinc-800';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active':
        return 'Ativo';
      case 'completed':
        return 'Concluído';
      case 'cancelled':
        return 'Cancelado';
      default:
        return status;
    }
  };

  const getPaymentColor = (status: Guest['paymentStatus']) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-amber-100 text-amber-800';
      default:
        return 'bg-zinc-100 text-zinc-800';
    }
  };

  const getPaymentLabel = (status: Guest['paymentStatus']) => {
    switch (status) {
      case 'paid':
        return 'Pagamento realizado';
      case 'pending':
        return 'Pendente pagamento';
      default:
        return 'Pagamento não iniciado';
    }
  };

  return (
    <div className=''>
      {/* Header */}
      <div className='bg-white border-b border-zinc-200 px-6 py-4'>
        <div className='flex items-center justify-between'>
          <div>
            <h1 className='text-2xl font-semibold text-zinc-900'>Hóspedes</h1>
            <p className='text-sm text-zinc-500 mt-1'>
              Gerencie seus hóspedes e histórico de reservas
            </p>
          </div>
          <div className='flex items-center gap-3'>
            <div className='flex bg-zinc-100 rounded-lg p-1'>
              <button
                onClick={() => setFilterStatus('all')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  filterStatus === 'all'
                    ? 'bg-white text-zinc-900 shadow-sm'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setFilterStatus('active')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  filterStatus === 'active'
                    ? 'bg-white text-zinc-900 shadow-sm'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Ativos
              </button>
              <button
                onClick={() => setFilterStatus('completed')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  filterStatus === 'completed'
                    ? 'bg-white text-zinc-900 shadow-sm'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Concluídos
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className='bg-white border-b border-zinc-200 px-6 py-4'>
        <div className='relative'>
          <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-400 w-4 h-4' />
          <input
            type='text'
            placeholder='Buscar hóspedes por nome ou email...'
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className='w-full pl-10 pr-4 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-900'
          />
        </div>
      </div>

      {/* Guests List */}
      <div className='p-6'>
        {loading ? (
          <div className='text-center py-12'>
            <div className='w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4'>
              <Users className='w-8 h-8 text-zinc-400' />
            </div>
            <p className='text-zinc-600'>Carregando hóspedes...</p>
          </div>
        ) : filteredGuests.length === 0 ? (
          <div className='text-center py-12'>
            <div className='w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4'>
              <Users className='w-8 h-8 text-zinc-400' />
            </div>
            <p className='text-zinc-600 font-medium mb-2'>
              Nenhum hóspede encontrado
            </p>
            <p className='text-sm text-zinc-500'>
              {searchTerm
                ? 'Tente ajustar sua busca'
                : 'Comece a receber reservas para ver seus hóspedes aqui'}
            </p>
          </div>
        ) : (
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6'>
            {filteredGuests.map((guest) => (
              <div
                key={guest.id}
                className='bg-white rounded-xl shadow-sm border border-zinc-200 p-6 hover:shadow-md transition-shadow'
              >
                <div className='flex items-start justify-between gap-2 mb-4'>
                  <div className='flex items-center gap-3 min-w-0 flex-1'>
                    <div className='w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-600 font-semibold text-lg shrink-0'>
                      {guest.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .toUpperCase()
                        .slice(0, 2)}
                    </div>
                    <div className='min-w-0 flex-1'>
                      <h3 className='font-semibold text-zinc-900 text-base md:text-lg md:truncate'>
                        {guest.name}
                      </h3>
                      <p className='text-sm text-zinc-500 truncate'>
                        {guest.email}
                      </p>
                    </div>
                  </div>
                  <div className='flex flex-col items-end gap-1 shrink-0'>
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${getStatusColor(
                        guest.status
                      )}`}
                    >
                      {getStatusLabel(guest.status)}
                    </span>
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${getPaymentColor(
                        guest.paymentStatus
                      )}`}
                    >
                      {getPaymentLabel(guest.paymentStatus)}
                    </span>
                  </div>
                </div>

                <div className='space-y-3'>
                  <div className='flex items-center justify-between text-sm'>
                    <span className='text-zinc-600'>Total de reservas</span>
                    <span className='font-medium text-zinc-900'>
                      {guest.totalBookings}
                    </span>
                  </div>

                  <div className='flex items-center justify-between text-sm'>
                    <span className='text-zinc-600'>Total gasto</span>
                    <span className='font-medium text-zinc-900'>
                      R${' '}
                      {guest.totalSpent.toLocaleString('pt-BR', {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>

                  {guest.lastStay && (
                    <div className='flex items-center justify-between text-sm'>
                      <span className='text-zinc-600'>Última estadia</span>
                      <span className='font-medium text-zinc-900'>
                        {format(new Date(guest.lastStay), 'dd/MM/yyyy', {
                          locale: ptBR,
                        })}
                      </span>
                    </div>
                  )}
                </div>

                {guest.phone && (
                  <div className='mt-4 pt-4 border-t border-zinc-100'>
                    <div className='flex items-center gap-2 text-sm text-zinc-600'>
                      <Phone className='w-4 h-4' />
                      <span>{guest.phone}</span>
                    </div>
                  </div>
                )}

                <div className='mt-4 flex gap-2'>
                  <Button
                    onClick={() => onNavClick?.('messages')}
                    className='flex-1'
                    variant='gradient'
                  >
                    <MessageSquare className='w-4 h-4 mr-2' />
                    Abrir chat
                  </Button>
                  <Button variant='outline'>
                    <Mail className='w-4 h-4 mr-2' />
                    Enviar email
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
