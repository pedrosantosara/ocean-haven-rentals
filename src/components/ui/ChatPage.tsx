import React, { useState, useEffect, useRef } from 'react';
import { Send, Sparkles, User, Bot, Loader2, Phone, Mail, CalendarDays, Clock, MapPin, DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ChatMessage {
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

interface ChatPageProps {
  bookingId?: string;
  onNavClick?: (section: string) => void;
}

export const ChatPage: React.FC<ChatPageProps> = ({ bookingId, onNavClick }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (bookingId) {
      loadChatData();
      connectWebSocket();
    }
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [bookingId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadChatData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const API = 'http://localhost:3005';
      
      // Load booking details
      const bookingRes = await fetch(`${API}/bookings`, { 
        headers: token ? { Authorization: `Bearer ${token}` } : {} 
      });
      
      if (bookingRes.ok) {
        const data = await bookingRes.json();
        const foundBooking = (data.data || []).find((b: { ID?: string; id?: string }) => b.ID === bookingId || b.id === bookingId);
        if (foundBooking) {
          setBooking({
            id: foundBooking.ID || foundBooking.id,
            guest_name: foundBooking.GuestName || foundBooking.guest_name,
            guest_email: foundBooking.GuestEmail || foundBooking.guest_email,
            check_in: foundBooking.CheckIn || foundBooking.check_in,
            check_out: foundBooking.CheckOut || foundBooking.check_out,
            status: foundBooking.Status || foundBooking.status,
            total_price: foundBooking.TotalPrice || foundBooking.total_price,
            number_of_guests: foundBooking.NumberOfGuests || foundBooking.number_of_guests
          });
        }
      }
      
      // Load messages
      const messagesRes = await fetch(`${API}/messages?booking_id=${bookingId}`, { 
        headers: token ? { Authorization: `Bearer ${token}` } : {} 
      });
      
      if (messagesRes.ok) {
        const data = await messagesRes.json();
        setMessages(data.data || []);
      }
    } catch (error) {
      console.error('Error loading chat data:', error);
    } finally {
      setLoading(false);
    }
  };

  const connectWebSocket = () => {
    const token = localStorage.getItem('token');
    if (!token || !bookingId) return;
    
    const url = `ws://localhost:3005/ws/messages?booking_id=${encodeURIComponent(bookingId)}&token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg && msg.type === 'message' && msg.data && msg.data.booking_id === bookingId) {
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            booking_id: bookingId,
            sender_email: msg.data.sender_email || '',
            is_from_owner: Boolean(msg.data.is_from_owner),
            message: msg.data.message || '',
            created_at: msg.data.created_at || new Date().toISOString()
          }]);
        }
      } catch (e) {
        console.error('Error parsing WebSocket message:', e);
      }
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    ws.onclose = () => {
      console.log('WebSocket connection closed');
    };
  };

  const handleSend = async () => {
    if (!inputText.trim() || !bookingId) return;
    
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
          BookingID: bookingId,
          Message: inputText
        })
      });
      
      if (res.ok) {
        setInputText('');
        setSuggestion(null);
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleGenerateAi = async () => {
    if (!booking) return;
    setIsGenerating(true);
    
    // Simulate AI generation
    setTimeout(() => {
      const aiSuggestion = `Olá ${booking.guest_name}! Espero que esteja tudo bem. Sobre sua pergunta, posso ajudar com isso. Por favor, me avise se precisar de mais alguma coisa!`;
      setSuggestion(aiSuggestion);
      setIsGenerating(false);
    }, 2000);
  };

  const acceptSuggestion = () => {
    if (suggestion) {
      setInputText(suggestion);
      setSuggestion(null);
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-zinc-600 mx-auto mb-4" />
          <p className="text-zinc-600">Carregando conversa...</p>
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-600">Reserva não encontrada</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <div className="bg-white border-b border-zinc-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-600 font-semibold">
              {getInitials(booking.guest_name)}
            </div>
            <div>
              <h1 className="text-xl font-semibold text-zinc-900">{booking.guest_name}</h1>
              <p className="text-sm text-zinc-500">{booking.guest_email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors">
              <Phone className="w-5 h-5" />
            </button>
            <button className="p-2 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors">
              <Mail className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Booking Details */}
      <div className="bg-white border-b border-zinc-200 px-6 py-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-zinc-600 mb-1">
              <CalendarDays className="w-4 h-4" />
              <span>Check-in</span>
            </div>
            <p className="text-sm font-medium text-zinc-900">
              {format(new Date(booking.check_in), 'dd/MM/yyyy', { locale: ptBR })}
            </p>
          </div>
          <div>
            <div className="flex items-center gap-2 text-sm text-zinc-600 mb-1">
              <CalendarDays className="w-4 h-4" />
              <span>Check-out</span>
            </div>
            <p className="text-sm font-medium text-zinc-900">
              {format(new Date(booking.check_out), 'dd/MM/yyyy', { locale: ptBR })}
            </p>
          </div>
          <div>
            <div className="flex items-center gap-2 text-sm text-zinc-600 mb-1">
              <span>Hóspedes</span>
            </div>
            <p className="text-sm font-medium text-zinc-900">{booking.number_of_guests} hóspedes</p>
          </div>
          <div>
            <div className="flex items-center gap-2 text-sm text-zinc-600 mb-1">
              <DollarSign className="w-4 h-4" />
              <span>Total</span>
            </div>
            <p className="text-sm font-medium text-zinc-900">
              R$ {booking.total_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex flex-col h-[calc(100vh-200px)]">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((msg) => {
            const isHost = msg.is_from_owner;
            const senderName = isHost ? 'Você' : booking.guest_name;
            
            return (
              <div key={msg.id} className={`flex ${isHost ? 'justify-end' : 'justify-start'}`}>
                <div className={`flex gap-3 max-w-[70%] ${isHost ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold ${
                    isHost 
                      ? 'bg-zinc-100 text-zinc-600' 
                      : 'bg-blue-100 text-blue-600'
                  }`}>
                    {isHost ? <User size={14} /> : getInitials(booking.guest_name)}
                  </div>
                  <div>
                    <div className={`p-3 rounded-2xl text-sm ${
                      isHost 
                        ? 'bg-zinc-900 text-white rounded-tr-none' 
                        : 'bg-white border border-zinc-200 text-zinc-900 rounded-tl-none shadow-sm'
                    }`}>
                      {msg.message}
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-xs text-zinc-500">
                        {format(new Date(msg.created_at), 'HH:mm', { locale: ptBR })}
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

        {/* AI Suggestion */}
        {suggestion && (
          <div className="bg-blue-50 border-t border-blue-200 p-4">
            <div className="flex items-center gap-2 text-blue-700 text-xs font-bold uppercase mb-2">
              <Bot size={14} />
              Sugestão da IA
            </div>
            <p className="text-sm text-zinc-700 italic mb-3">"{suggestion}"</p>
            <div className="flex gap-2">
              <button
                onClick={acceptSuggestion}
                className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
              >
                Usar sugestão
              </button>
              <button
                onClick={() => setSuggestion(null)}
                className="px-3 py-1.5 bg-white border border-blue-200 text-blue-600 text-xs rounded hover:bg-blue-50 transition-colors"
              >
                Descartar
              </button>
            </div>
          </div>
        )}

        {/* Input Area */}
        <div className="bg-white border-t border-zinc-200 p-4">
          <div className="flex gap-3">
            <button
              onClick={handleGenerateAi}
              disabled={isGenerating}
              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-blue-100 disabled:opacity-50"
              title="Gerar resposta com IA"
            >
              {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
            </button>
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
      </div>
    </div>
  );
};