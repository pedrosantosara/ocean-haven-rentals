import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, User, Bot, Phone, Mail, CalendarDays, Clock, MapPin, DollarSign, Star, ChevronLeft } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Message {
  id: string;
  booking_id: string;
  sender_email: string;
  is_from_owner: boolean;
  message: string;
  created_at: string;
}

interface Booking {
  id: string;
  guest_name: string;
  guest_email: string;
  check_in: string;
  check_out: string;
  status: string;
  total_price: number;
  number_of_guests: number;
}

interface MessagesPageProps {
  onNavClick?: (section: string) => void;
}

export const MessagesPage: React.FC<MessagesPageProps> = ({ onNavClick }) => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadBookings();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const loadBookings = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const API = 'http://localhost:3005';

      const res = await fetch(`${API}/bookings`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      if (res.ok) {
        const data = await res.json();
        const mapped = (data.data || []).map((b: { ID?: string; id?: string; GuestName?: string; guest_name?: string; GuestEmail?: string; guest_email?: string; CheckIn?: string; check_in?: string; CheckOut?: string; check_out?: string; Status?: string; status?: string; TotalPrice?: number; total_price?: number; NumberOfGuests?: number; number_of_guests?: number }) => ({
          id: b.ID || b.id || '',
          guest_name: b.GuestName || b.guest_name || '',
          guest_email: b.GuestEmail || b.guest_email || '',
          check_in: b.CheckIn || b.check_in || '',
          check_out: b.CheckOut || b.check_out || '',
          status: b.Status || b.status || '',
          total_price: b.TotalPrice || b.total_price || 0,
          number_of_guests: b.NumberOfGuests || b.number_of_guests || 0
        }));
        setBookings(mapped);
      }
    } catch (error) {
      console.error('Error loading bookings:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (bookingId: string) => {
    try {
      const token = localStorage.getItem('token');
      const API = 'http://localhost:3005';

      const res = await fetch(`${API}/messages?booking_id=${bookingId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      if (res.ok) {
        const data = await res.json();
        type ApiMessage = { ID?: number; id?: number; BookingID?: string; booking_id?: string; SenderEmail?: string; sender_email?: string; IsFromOwner?: boolean; is_from_owner?: boolean; Message?: string; message?: string; CreatedAt?: string; created_at?: string };
        const mapped = (data.data || []).map((m: ApiMessage) => ({
          id: String(m.ID ?? m.id ?? Date.now()),
          booking_id: String(m.BookingID ?? m.booking_id ?? bookingId),
          sender_email: String(m.SenderEmail ?? m.sender_email ?? ''),
          is_from_owner: Boolean(m.IsFromOwner ?? m.is_from_owner ?? false),
          message: String(m.Message ?? m.message ?? ''),
          created_at: String(m.CreatedAt ?? m.created_at ?? new Date().toISOString()),
        }));
        setMessages(mapped);
      }
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const handleSelectBooking = (booking: Booking) => {
    setSelectedBooking(booking);
    loadMessages(booking.id);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const bid = params.get('booking_id');
    if (bid && bookings.length > 0 && !selectedBooking) {
      const found = bookings.find(b => b.id === bid);
      if (found) {
        handleSelectBooking(found);
      }
    }
  }, [bookings, selectedBooking]);

  useEffect(() => {
    if (!selectedBooking) return;
    const token = localStorage.getItem('token');
    if (!token) return;
    const APIWS = 'ws://localhost:3005';
    const url = `${APIWS}/ws/messages?booking_id=${encodeURIComponent(selectedBooking.id)}&token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    ws.onmessage = (evt: MessageEvent) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg && msg.type === 'message' && msg.data && msg.data.booking_id === selectedBooking.id) {
          setMessages((prev) => [...prev, {
            id: Date.now().toString(),
            booking_id: selectedBooking.id,
            sender_email: String(msg.data.sender_email || ''),
            is_from_owner: Boolean(msg.data.is_from_owner),
            message: String(msg.data.message || ''),
            created_at: String(msg.data.created_at || new Date().toISOString()),
          }]);
        }
      } catch (_) { /* ignore */ }
    };
    return () => { try { ws.close(); } catch (_) { /* ignore */ } };
  }, [selectedBooking]);

  const handleSend = async () => {
    if (!inputText.trim() || !selectedBooking) return;

    try {
      const token = localStorage.getItem('token');
      const API = 'http://localhost:3005';

      const res = await fetch(`${API}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          BookingID: selectedBooking.id,
          Message: inputText
        })
      });

      if (res.ok) {
        setInputText('');
        loadMessages(selectedBooking.id);
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
      case 'confirmed':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'cancelled':
      case 'rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-zinc-100 text-zinc-800';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'approved':
      case 'confirmed':
        return 'Confirmado';
      case 'pending':
        return 'Pendente';
      case 'cancelled':
      case 'rejected':
        return 'Cancelado';
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="text-center">
          <MessageSquare className="w-8 h-8 text-zinc-400 mx-auto mb-4" />
          <p className="text-zinc-600">Carregando mensagens...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full">
      <div className="flex h-full">
        {/* Sidebar - Bookings List */}
        <div className={`w-full md:w-80 bg-white border-r border-zinc-200 overflow-y-auto ${selectedBooking ? 'hidden md:block' : ''}`}>
          <div className="p-4 border-b border-zinc-200">
            <h2 className="text-lg font-semibold text-zinc-900">Conversas</h2>
            <p className="text-sm text-zinc-500">{bookings.length} reservas ativas</p>
          </div>

          <div className="divide-y divide-zinc-100">
            {bookings.map((booking) => (
              <button
                key={booking.id}
                onClick={() => handleSelectBooking(booking)}
                className={`w-full p-4 text-left hover:bg-zinc-50 transition-colors ${selectedBooking?.id === booking.id ? 'bg-blue-50 border-r-2 border-blue-500' : ''
                  }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-600 font-semibold text-sm">
                    {getInitials(booking.guest_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-sm font-medium text-zinc-900 truncate">{booking.guest_name}</h3>
                      <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(booking.status)}`}>
                        {getStatusLabel(booking.status)}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-500 truncate mb-2">{booking.guest_email}</p>
                    <div className="flex items-center gap-4 text-xs text-zinc-400">
                      <span>{format(new Date(booking.check_in), 'dd/MM', { locale: ptBR })} - {format(new Date(booking.check_out), 'dd/MM', { locale: ptBR })}</span>
                      <span>R$ {booking.total_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {bookings.length === 0 && (
            <div className="p-8 text-center">
              <MessageSquare className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
              <p className="text-zinc-600 font-medium mb-2">Nenhuma conversa ainda</p>
              <p className="text-sm text-zinc-500">As conversas aparecerão aqui quando houver reservas</p>
            </div>
          )}
        </div>

        {/* Chat Area */}
        <div className={`flex-1 flex flex-col ${!selectedBooking ? 'hidden md:flex' : ''}`}>
          {selectedBooking ? (
            <>
              {/* Chat Header */}
              <div className="bg-white border-b border-zinc-200 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setSelectedBooking(null)}
                      className="p-2 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors md:hidden"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold">
                      {getInitials(selectedBooking.guest_name)}
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-zinc-900">{selectedBooking.guest_name}</h2>
                      <p className="text-sm text-zinc-500">{selectedBooking.guest_email}</p>
                    </div>
                  </div>

                </div>
              </div>

              {/* Booking Info */}
              <div className="bg-white border-b border-zinc-200 px-6 py-3">
                <div className="flex items-center gap-6 text-sm">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-zinc-400" />
                    <span className="text-zinc-600">
                      {format(new Date(selectedBooking.check_in), 'dd/MM/yyyy', { locale: ptBR })} - {format(new Date(selectedBooking.check_out), 'dd/MM/yyyy', { locale: ptBR })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-600">{selectedBooking.number_of_guests} hóspedes</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-zinc-400" />
                    <span className="text-zinc-600">
                      R$ {selectedBooking.total_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {messages.map((msg) => {
                  const isHost = msg.is_from_owner;
                  const senderName = isHost ? 'Você' : selectedBooking.guest_name;
                  let special: any = null;
                  try { special = JSON.parse(msg.message); } catch {}
                  const isPaymentInvite = special && special.type === 'payment_invite';

                  return (
                    <div key={msg.id} className={`flex ${isHost ? 'justify-end' : 'justify-start'}`}>
                      <div className={`flex gap-3 max-w-[70%] ${isHost ? 'flex-row-reverse' : ''}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold ${isHost
                            ? 'bg-zinc-100 text-zinc-600'
                            : 'bg-blue-100 text-blue-600'
                          }`}>
                          {isHost ? <User size={14} /> : getInitials(selectedBooking.guest_name)}
                        </div>
                        <div>
                          <div className={`p-3 rounded-2xl text-sm ${isHost
                              ? 'bg-zinc-900 text-white rounded-tr-none'
                              : 'bg-white border border-zinc-200 text-zinc-900 rounded-tl-none shadow-sm'
                            }`}>
                            {isPaymentInvite ? (
                              <div className="space-y-2">
                                <div className="font-medium">{String(special.text || '')}</div>
                                <button className="w-full px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs font-semibold opacity-90 cursor-not-allowed">
                                  {String(special.cta || 'Pagar agora')}
                                </button>
                              </div>
                            ) : (
                              msg.message
                            )}
                          </div>
                          <div className="flex items-center gap-1 mt-1">
                            <span className="text-xs text-zinc-500">
                              {(() => { const d = new Date(msg.created_at); return isNaN(d.getTime()) ? '' : format(d, 'HH:mm', { locale: ptBR }); })()}
                            </span>
                            {msg.is_from_owner && (
                              <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                                <Bot size={10} />
                                Você
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <div className="bg-white border-t border-zinc-200 p-4">
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="Digite sua mensagem..."
                    className="flex-1 border border-zinc-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                  <button
                    onClick={handleSend}
                    className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-zinc-50">
              <div className="text-center">
                <MessageSquare className="w-16 h-16 text-zinc-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-zinc-900 mb-2">Selecione uma conversa</h3>
                <p className="text-zinc-500">Escolha uma reserva ao lado para começar a conversar</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};