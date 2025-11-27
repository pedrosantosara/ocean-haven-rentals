import { useState, useEffect } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { differenceInDays, format } from "date-fns";

const formatBRL = (n: number | null | undefined) => (typeof n === "number" && isFinite(n) ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n) : "");

interface Pricing {
  subtotal: number;
  discount_amount: number;
  cleaning_fee: number;
  service_fee: number;
  total: number;
  nights: number;
  weekday_nights: number;
  weekend_nights: number;
  base_price: number;
  weekend_price: number;
  price_buckets?: { price: number; count: number }[];
}

interface OwnerSettings {
  base_price: number;
  weekend_price: number;
  cleaning_fee: number;
  service_fee: number;
  discount_weekly: number;
  discount_monthly: number;
}

export const BookingCalendar = () => {
  const navigate = useNavigate();
  const [checkIn, setCheckIn] = useState<Date>();
  const [checkOut, setCheckOut] = useState<Date>();
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [numberOfGuests, setNumberOfGuests] = useState(1);
  const [loading, setLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [monthsCount, setMonthsCount] = useState(1);
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [calculatingPrice, setCalculatingPrice] = useState(false);
  const [busySet, setBusySet] = useState<Set<string>>(new Set());
  const [ownerSettings, setOwnerSettings] = useState<OwnerSettings | null>(null);
  const busyDates = Array.from(busySet).map((s) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  });

  // Check authentication on mount
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      fetch("http://localhost:3005/auth/me", {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(res => {
        if (res.ok) return res.json();
        throw new Error("Not authenticated");
      })
      .then(data => {
        if (data.user) {
          setIsAuthenticated(true);
          if (data.user.full_name) setGuestName(data.user.full_name);
          if (data.user.email) setGuestEmail(data.user.email);
        }
      })
      .catch(() => setIsAuthenticated(false));
    }
    const updateMonths = () => setMonthsCount(window.innerWidth >= 768 ? 2 : 1);
    updateMonths();
    window.addEventListener("resize", updateMonths);
    return () => window.removeEventListener("resize", updateMonths);
  }, []);

  useEffect(() => {
    const API = "http://localhost:3005";
    fetch(`${API}/settings/public`).then(async (res) => {
      if (!res.ok) return;
      const j = await res.json();
      const s = j.settings || {};
      setOwnerSettings({
        base_price: Number(s.base_price || 0),
        weekend_price: Number(s.weekend_price || 0),
        cleaning_fee: Number(s.cleaning_fee || 0),
        service_fee: Number(s.service_fee || 0),
        discount_weekly: Number(s.discount_weekly || 0),
        discount_monthly: Number(s.discount_monthly || 0),
      });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const API = "http://localhost:3005";
    let cancelled = false;
    const parseIcsDate = (value: string): Date => {
      if (/^\d{8}$/.test(value)) {
        const y = Number(value.slice(0, 4));
        const m = Number(value.slice(4, 6)) - 1;
        const d = Number(value.slice(6, 8));
        return new Date(y, m, d);
      }
      if (/^\d{8}T\d{6}Z$/.test(value)) {
        const y = Number(value.slice(0, 4));
        const m = Number(value.slice(4, 6)) - 1;
        const d = Number(value.slice(6, 8));
        return new Date(y, m, d);
      }
      return new Date(value);
    };
    const parseICSEvents = (icsText: string): { date: string; type: 'reservation' | 'block' | 'ical'; source?: string }[] => {
      const events: { date: string; type: 'reservation' | 'block' | 'ical'; source?: string }[] = [];
      const lines = icsText.split(/\r?\n/);
      let current: { dtstart?: Date; dtend?: Date; summary?: string; categories?: string } = {};
      for (const raw of lines) {
        const line = raw.trim();
        if (line.startsWith('BEGIN:VEVENT')) { current = {}; continue; }
        if (line.startsWith('DTSTART')) { const [, val] = line.split(':'); current.dtstart = parseIcsDate(val); continue; }
        if (line.startsWith('DTEND')) { const [, val] = line.split(':'); current.dtend = parseIcsDate(val); continue; }
        if (line.startsWith('SUMMARY')) { const [, val] = line.split(':'); current.summary = val; continue; }
        if (line.startsWith('CATEGORIES')) { const [, val] = line.split(':'); current.categories = val; continue; }
        if (line.startsWith('END:VEVENT')) {
          if (current.dtstart && current.dtend) {
            const inclusiveEnd = new Date(current.dtend); inclusiveEnd.setDate(inclusiveEnd.getDate() - 1);
            const cur = new Date(current.dtstart);
            let type: 'reservation' | 'block' | 'ical' = 'reservation';
            let source = current.categories || 'Site';
            let color = '#10b981';
            const cat = (current.categories || '').toLowerCase();
            const sum = (current.summary || '').toLowerCase();
            if (cat.includes('block')) { type = 'block'; color = '#ef4444'; }
            else if (cat.includes('airbnb')) { source = 'Airbnb'; color = '#f59e0b'; }
            else if (cat.includes('booking')) { source = 'Booking.com'; color = '#3b82f6'; }
            else {
              if (sum.includes('airbnb')) { source = 'Airbnb'; color = '#f59e0b'; }
              else if (sum.includes('booking')) { source = 'Booking.com'; color = '#3b82f6'; }
            }
            while (cur <= inclusiveEnd) {
              const dateStr = format(cur, 'yyyy-MM-dd');
              events.push({ date: dateStr, type, source });
              cur.setDate(cur.getDate() + 1);
            }
          }
          current = {};
          continue;
        }
      }
      return events;
    };
    const loadICS = async () => {
      try {
        const res = await fetch(`${API}/calendar/merged.ics?t=${Date.now()}`);
        if (!res.ok) return;
        const icsText = await res.text();
        const events = parseICSEvents(icsText);
        const next = new Set<string>();
        for (const ev of events) { next.add(ev.date); }
        if (!cancelled) setBusySet(next);
      } catch (_) { /* ignore */ }
    };
    loadICS();
    const handler = () => { void loadICS(); };
    document.addEventListener('ical:updated', handler as EventListener);
    const id = window.setInterval(() => { void loadICS(); }, 10 * 60 * 1000);
    return () => { cancelled = true; document.removeEventListener('ical:updated', handler as EventListener); window.clearInterval(id); };
  }, []);

  useEffect(() => {
    if (!checkIn || !checkOut) {
      setPricing(null);
      return;
    }
    
    const fetchPricing = async () => {
      setCalculatingPrice(true);
      try {
        const res = await fetch("http://localhost:3005/bookings/calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            check_in: format(checkIn, 'yyyy-MM-dd'),
            check_out: format(checkOut, 'yyyy-MM-dd')
          })
        });
        
        if (res.ok) {
          const data = await res.json();
          setPricing(data);
        } else {
          console.error("Failed to calculate price");
          setPricing(null);
        }
      } catch (error) {
        console.error("Error calculating price:", error);
        setPricing(null);
      } finally {
        setCalculatingPrice(false);
      }
    };

    fetchPricing();
  }, [checkIn, checkOut]);

  type CreatedBooking = {
    id: string;
    status: "pending" | "confirmed" | "cancelled" | "completed";
    check_in: string;
    check_out: string;
    number_of_guests: number;
    subtotal_price: number;
    discount_amount: number;
    total_price: number;
  };

  const handleBooking = async () => {
    if (!checkIn || !checkOut) {
      toast.error("Selecione as datas de check-in e check-out");
      return;
    }
    // Only validate name/email if not authenticated (or if empty even if authenticated, but auth logic should handle it)
    if (!isAuthenticated && (!guestName.trim() || !guestEmail.trim())) {
      toast.error("Preencha nome e email");
      return;
    }
    if (!isAuthenticated && !/^\S+@\S+\.\S+$/.test(guestEmail)) {
      toast.error("Email inválido");
      return;
    }
    if (numberOfGuests < 1) {
      toast.error("Número de hóspedes inválido");
      return;
    }
    
    if (!pricing) {
       toast.error("Erro ao calcular preço. Tente novamente.");
       return;
    }

    const API = "http://localhost:3005";

    setLoading(true);

    try {
      let created: CreatedBooking | null = null;
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${API}/bookings`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          CheckIn: checkIn.toISOString(),
          CheckOut: checkOut.toISOString(),
          GuestName: guestName,
          GuestEmail: guestEmail,
          GuestPhone: guestPhone,
          NumberOfGuests: numberOfGuests,
          SubtotalPrice: pricing.subtotal,
          DiscountAmount: pricing.discount_amount,
          TotalPrice: pricing.total,
        }),
      });
      if (res.ok) {
        const j = await res.json();
        const bid = String(j.id || "");
        const tok = String(j.token || "");
        if (tok) { localStorage.setItem("token", tok); }
        created = {
          id: bid || `srv-${Date.now()}`,
          status: "pending",
          check_in: checkIn.toISOString().split("T")[0],
          check_out: checkOut.toISOString().split("T")[0],
          number_of_guests: numberOfGuests,
          subtotal_price: pricing.subtotal,
          discount_amount: pricing.discount_amount,
          total_price: pricing.total,
        };
      }

      const bookingForView = created ?? {
        id: `temp-${Date.now()}`,
        status: "pending",
        check_in: checkIn.toISOString().split("T")[0],
        check_out: checkOut.toISOString().split("T")[0],
        number_of_guests: numberOfGuests,
        subtotal_price: pricing.subtotal,
        discount_amount: pricing.discount_amount,
        total_price: pricing.total,
      };

      navigate("/my-booking", { state: { booking: bookingForView } });
      toast.success("Reserva criada! Abrindo detalhes...");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erro ao criar reserva";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="book" className="py-20 px-4">
      <div className="container mx-auto rounded-xl border border-primary/20 bg-card/40 pb-6 pt-6 shadow-ocean">
        <h2 className="text-4xl font-bold text-center mb-12 text-gradient">
          Reserve Sua Estadia
        </h2>

        <div className="grid md:grid-cols-[70%_30%] gap-8 w-full mx-auto">
          <Card className="glass-ocean border-primary/20 h-full">
            <CardHeader>
              <CardTitle>Selecione as Datas</CardTitle>
              <CardDescription>Escolha check-in e check-out</CardDescription>
            </CardHeader>
            <CardContent className="p-4 overflow-x-hidden">
              <Calendar
                mode="range"
                selected={{ from: checkIn, to: checkOut }}
                onSelect={(range) => {
                  const from = range?.from;
                  const to = range?.to;
                  if (!from || !to) { setCheckIn(from); setCheckOut(to); return; }
                  const cur = new Date(from);
                  let valid = true;
                  while (cur <= to) {
                    const key = format(cur, 'yyyy-MM-dd');
                    if (busySet.has(key)) { valid = false; break; }
                    cur.setDate(cur.getDate() + 1);
                  }
                  if (!valid) { toast.error('Intervalo inclui datas ocupadas'); return; }
                  setCheckIn(from);
                  setCheckOut(to);
                }}
                disabled={(date) => {
                  const today = new Date();
                  today.setHours(0,0,0,0);
                  const key = format(date, 'yyyy-MM-dd');
                  return date < today || busySet.has(key);
                }}
                modifiers={{ busy: busyDates, weekend: { daysOfWeek: [0, 6] } }}
                modifiersClassNames={{ busy: 'bg-red-50 text-red-600 !opacity-100', weekend: 'bg-accent/30' }}
                showOutsideDays
                numberOfMonths={monthsCount}
                className="w-full max-w-full p-2 md:p-3"
                classNames={{
                  months: 'flex flex-col md:flex-row md:space-x-4 space-y-4 md:space-y-0 w-full',
                  month: 'space-y-4',
                  table: 'w-full border-collapse',
                  head_row: 'grid grid-cols-7',
                  caption_label: 'text-lg md:text-xl font-bold tracking-tight',
                  head_cell: 'text-muted-foreground truncate font-medium text-[0.8rem]',
                  row: 'grid grid-cols-7 w-full mt-2',
                  cell: 'aspect-square w-full text-center text-sm p-0 relative rounded-lg overflow-hidden',
                  day: 'w-full h-full p-0 font-medium',
                }}
              />
              <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-red-50 border border-red-200" /> Ocupado</div>
                <div className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-accent/30 border border-accent" /> Fim de semana</div>
                <div className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-accent/60" /> Selecionado</div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-ocean w-full rounded-xl border border-primary/20 bg-card/40 p-6 shadow-ocean">
            <CardHeader>
              <CardTitle>Informações do Hóspede</CardTitle>
              <CardDescription>Preencha seus dados</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
              {!isAuthenticated && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome Completo</Label>
                    <Input
                      id="name"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="Seu nome completo"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      placeholder="seu@email.com"
                      required
                    />
                  </div>
                </>
              )}
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  placeholder="(00) 00000-0000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="guests">Número de Hóspedes</Label>
                <Input
                  id="guests"
                  type="number"
                  min="1"
                  max="10"
                  value={numberOfGuests}
                  onChange={(e) => setNumberOfGuests(parseInt(e.target.value))}
                />
              </div>

              {calculatingPrice && (
                 <div className="p-4 bg-primary/10 rounded-lg space-y-2">
                    <p className="text-center text-muted-foreground">Calculando preço...</p>
                 </div>
              )}

              {!calculatingPrice && pricing && pricing.nights > 0 && (
                <div className="p-4 bg-primary/10 rounded-lg space-y-2">
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Noites:</span>
                    <span className="font-medium">{pricing.nights}</span>
                  </div>
                  {pricing.discount_amount > 0 && pricing.nights >= 28 && (
                    <div className="flex justify-between text-sm text-green-700">
                      <span>Promoção mensal aplicada</span>
                      <span className="font-medium">5%</span>
                    </div>
                  )}
                  {pricing.discount_amount > 0 && pricing.nights >= 7 && pricing.nights < 28 && (
                    <div className="flex justify-between text-sm text-green-700">
                      <span>Promoção semanal aplicada</span>
                      <span className="font-medium">3%</span>
                    </div>
                  )}
                  {Array.isArray(pricing.price_buckets) && pricing.price_buckets.length > 0 ? (
                    pricing.price_buckets.map((b, idx) => (
                      <div key={idx} className="flex justify-between text-sm text-muted-foreground">
                        <span>Diárias:</span>
                        <span className="font-medium">{b.count}{(typeof b.price === 'number' && isFinite(b.price)) ? ` × ${formatBRL(b.price)}` : ''}</span>
                      </div>
                    ))
                  ) : (
                    <>
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Noites de semana:</span>
                        <span className="font-medium">{pricing.weekday_nights}{(typeof pricing.base_price === 'number' && isFinite(pricing.base_price)) ? ` × ${formatBRL(pricing.base_price)}` : ''}</span>
                      </div>
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Finais de semana:</span>
                        <span className="font-medium">{pricing.weekend_nights}{(typeof pricing.weekend_price === 'number' && isFinite(pricing.weekend_price)) ? ` × ${formatBRL(pricing.weekend_price)}` : ''}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Subtotal:</span>
                    <span className="font-medium">{formatBRL(pricing.subtotal)}</span>
                  </div>
                  {(pricing.cleaning_fee > 0 || pricing.service_fee > 0) && (
                     <>
                        {pricing.cleaning_fee > 0 && (
                            <div className="flex justify-between text-sm text-muted-foreground">
                                <span>Taxa de limpeza:</span>
                                <span className="font-medium">{formatBRL(pricing.cleaning_fee)}</span>
                            </div>
                        )}
                        {pricing.service_fee > 0 && (
                            <div className="flex justify-between text-sm text-muted-foreground">
                                <span>Taxa de serviço:</span>
                                <span className="font-medium">{formatBRL(pricing.service_fee)}</span>
                            </div>
                        )}
                     </>
                  )}
                  {pricing.discount_amount > 0 && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span>{pricing.nights >= 28 ? "Desconto mensal" : "Desconto semanal"}</span>
                      <span className="font-medium">- {formatBRL(pricing.discount_amount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-baseline border-t border-primary/20 pt-3 min-w-0 gap-2">
                    <span className="text-base md:text-lg font-semibold">Total:</span>
                    <span className="flex-1 text-right truncate text-2xl md:text-3xl font-extrabold text-gradient">{formatBRL(pricing.total)}</span>
                  </div>
                </div>
              )}
              {!calculatingPrice && !pricing && ownerSettings && (
                <div className="p-4 bg-primary/10 rounded-lg space-y-2">
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Diária base:</span>
                    <span className="font-medium">{formatBRL(ownerSettings.base_price)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Diária fim de semana:</span>
                    <span className="font-medium">{formatBRL(ownerSettings.weekend_price)}</span>
                  </div>
                  {(ownerSettings.cleaning_fee > 0 || ownerSettings.service_fee > 0) && (
                    <>
                      {ownerSettings.cleaning_fee > 0 && (
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>Taxa de limpeza:</span>
                          <span className="font-medium">{formatBRL(ownerSettings.cleaning_fee)}</span>
                        </div>
                      )}
                      {ownerSettings.service_fee > 0 && (
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>Taxa de serviço:</span>
                          <span className="font-medium">{formatBRL(ownerSettings.service_fee)}</span>
                        </div>
                      )}
                    </>
                  )}
                  {(ownerSettings.discount_weekly > 0 || ownerSettings.discount_monthly > 0) && (
                    <div className="flex justify-between text-sm text-green-700">
                      <span>Descontos:</span>
                      <span className="font-medium">{ownerSettings.discount_weekly > 0 ? `${ownerSettings.discount_weekly}% semanal` : ''}{ownerSettings.discount_monthly > 0 ? `${ownerSettings.discount_weekly > 0 ? ' • ' : ''}${ownerSettings.discount_monthly}% mensal` : ''}</span>
                    </div>
                  )}
                </div>
              )}

              <Button
                onClick={handleBooking}
                className="w-full"
                variant="gradient"
                disabled={loading || calculatingPrice || !pricing}
              >
                {loading ? "Processando..." : "Confirmar Reserva"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
};
