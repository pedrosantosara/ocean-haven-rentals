import { useEffect, useMemo, useState } from "react";
import { format as formatDate } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { differenceInDays } from "date-fns";

let BASE_PRICE = 5000;
let WEEKEND_PRICE = 6000;
const WEEKEND_DAYS = new Set([5, 6]);

function computePricing(checkIn?: Date, checkOut?: Date) {
  if (!checkIn || !checkOut) {
    return {
      nights: 0,
      weekdayNights: 0,
      weekendNights: 0,
      subtotal: 0,
      discountPercent: 0,
      discountAmount: 0,
      total: 0,
    };
  }
  const nights = differenceInDays(checkOut, checkIn);
  let weekendNights = 0;
  let weekdayNights = 0;
  let subtotal = 0;
  for (let i = 0; i < nights; i++) {
    const d = new Date(checkIn);
    d.setDate(d.getDate() + i);
    const dow = d.getDay();
    const isWeekend = WEEKEND_DAYS.has(dow);
    if (isWeekend) {
      weekendNights++;
      subtotal += WEEKEND_PRICE;
    } else {
      weekdayNights++;
      subtotal += BASE_PRICE;
    }
  }
  const discountPercent = nights >= 28 ? 0.05 : nights >= 7 ? 0.03 : 0;
  const discountAmount = subtotal * discountPercent;
  const total = Math.round(subtotal - discountAmount);
  return { nights, weekdayNights, weekendNights, subtotal, discountPercent, discountAmount, total };
}

const formatBRL = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

export const BookingCalendar = () => {
  const navigate = useNavigate();
  const [checkIn, setCheckIn] = useState<Date>();
  const [checkOut, setCheckOut] = useState<Date>();
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [numberOfGuests, setNumberOfGuests] = useState(1);
  const [loading, setLoading] = useState(false);
  const [busyDays, setBusyDays] = useState<Record<string, boolean>>({});
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const pricing = computePricing(checkIn, checkOut);

  type IcsEvent = { from: Date; to: Date };
  const parseICS = (icsText: string): IcsEvent[] => {
    const lines = icsText.split(/\r?\n/);
    const events: IcsEvent[] = [];
    let dtstart: Date | undefined;
    let dtend: Date | undefined;
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.startsWith('BEGIN:VEVENT')) { dtstart = undefined; dtend = undefined; continue; }
      if (line.startsWith('DTSTART')) { const [, val] = line.split(':'); dtstart = new Date(val.length === 8 ? `${val.slice(0,4)}-${val.slice(4,6)}-${val.slice(6,8)}` : val); continue; }
      if (line.startsWith('DTEND')) { const [, val] = line.split(':'); dtend = new Date(val.length === 8 ? `${val.slice(0,4)}-${val.slice(4,6)}-${val.slice(6,8)}` : val); continue; }
      if (line.startsWith('END:VEVENT')) { if (dtstart && dtend) { const inclusiveEnd = new Date(dtend); inclusiveEnd.setDate(inclusiveEnd.getDate() - 1); events.push({ from: dtstart, to: inclusiveEnd }); } dtstart = undefined; dtend = undefined; continue; }
    }
    return events;
  };

  const loadBusyDays = async () => {
    try {
      const API = "http://localhost:3005";
      const res = await fetch(`${API}/calendar/merged.ics?t=${Date.now()}`);
      if (!res.ok) return;
      const text = await res.text();
      const events = parseICS(text);
      const map: Record<string, boolean> = {};
      for (const ev of events) {
        const days: Date[] = [];
        const start = new Date(ev.from);
        const end = new Date(ev.to);
        const cur = new Date(start);
        while (cur <= end) { days.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
        for (const d of days) { map[formatDate(d, 'yyyy-MM-dd')] = true; }
      }
      setBusyDays(map);
    } catch (_) { return; }
  };

  useEffect(() => {
    loadBusyDays();
    const handler = () => { void loadBusyDays(); };
    document.addEventListener('ical:updated', handler as EventListener);
    const id = window.setInterval(() => { void loadBusyDays(); }, 10 * 60 * 1000);
    return () => { document.removeEventListener('ical:updated', handler as EventListener); window.clearInterval(id); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    (async () => {
      try {
        const API = "http://localhost:3005";
        const r = await fetch(`${API}/settings/public`);
        if (!r.ok) return;
        const j = await r.json();
        const s = j.settings || {};
        BASE_PRICE = Number(s.base_price || BASE_PRICE);
        WEEKEND_PRICE = Number(s.weekend_price || WEEKEND_PRICE);
        setSettingsLoaded(true);
      } catch (_) { return; }
    })();
  }, []);

  const disabledMatcher = useMemo(() => {
    return (date: Date) => {
      const today = new Date(); today.setHours(0,0,0,0);
      const key = formatDate(date, 'yyyy-MM-dd');
      return date < today || !!busyDays[key];
    };
  }, [busyDays]);

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
    if (!guestName.trim() || !guestEmail.trim()) {
      toast.error("Preencha nome e email");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(guestEmail)) {
      toast.error("Email inválido");
      return;
    }
    if (numberOfGuests < 1) {
      toast.error("Número de hóspedes inválido");
      return;
    }
    const API = "http://localhost:3005";

    setLoading(true);

    try {
      let created: CreatedBooking | null = null;
      const res = await fetch(`${API}/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          CheckIn: checkIn.toISOString(),
          CheckOut: checkOut.toISOString(),
          GuestName: guestName,
          GuestEmail: guestEmail,
          GuestPhone: guestPhone,
          NumberOfGuests: numberOfGuests,
          SubtotalPrice: pricing.subtotal,
          DiscountAmount: pricing.discountAmount,
          TotalPrice: pricing.total,
        }),
      });
      if (res.ok) {
        created = {
          id: `srv-${Date.now()}`,
          status: "pending",
          check_in: checkIn.toISOString().split("T")[0],
          check_out: checkOut.toISOString().split("T")[0],
          number_of_guests: numberOfGuests,
          subtotal_price: pricing.subtotal,
          discount_amount: pricing.discountAmount,
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
        discount_amount: pricing.discountAmount,
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
            <CardContent className="p-4">
              <Calendar
                mode="range"
                selected={{ from: checkIn, to: checkOut }}
                onSelect={(range) => {
                  setCheckIn(range?.from);
                  setCheckOut(range?.to);
                }}
                disabled={disabledMatcher}
                showOutsideDays
                numberOfMonths={2}
                className="w-full"
                classNames={{
                  months: "grid grid-cols-1 md:grid-cols-2 gap-4 w-full",
                  month: "space-y-4",
                  caption_label: "text-base md:text-lg font-semibold",
                  head_cell: "text-muted-foreground rounded-md w-9 sm:w-10 md:w-12 font-normal text-[0.8rem]",
                  cell: "h-9 w-9 sm:h-10 sm:w-10 md:h-12 md:w-12 text-center text-sm p-0 relative",
                  day: "h-9 w-9 sm:h-10 sm:w-10 md:h-12 md:w-12 p-0 font-normal",
                }}
              />
            </CardContent>
          </Card>

          <Card className="glass-ocean w-full rounded-xl border border-primary/20 bg-card/40 p-6 shadow-ocean">
            <CardHeader>
              <CardTitle>Informações do Hóspede</CardTitle>
              <CardDescription>Preencha seus dados</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome Completo</Label>
                <Input
                  id="name"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Seu nome"
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

              {pricing.nights > 0 && (
                <div className="p-4 bg-primary/10 rounded-lg space-y-2">
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Noites:</span>
                    <span className="font-medium">{pricing.nights}</span>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Noites de semana:</span>
                    <span className="font-medium">{pricing.weekdayNights} × {formatBRL(BASE_PRICE)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Finais de semana:</span>
                    <span className="font-medium">{pricing.weekendNights} × {formatBRL(WEEKEND_PRICE)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Subtotal:</span>
                    <span className="font-medium">{formatBRL(pricing.subtotal)}</span>
                  </div>
                  {pricing.discountPercent > 0 && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span>{pricing.nights >= 28 ? "Desconto mensal (5%)" : "Desconto semanal (3%)"}</span>
                      <span className="font-medium">- {formatBRL(pricing.discountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-baseline border-t border-primary/20 pt-3">
                    <span className="text-base md:text-lg font-semibold">Total:</span>
                    <span className="text-2xl md:text-3xl font-extrabold text-gradient">{formatBRL(pricing.total)}</span>
                  </div>
                </div>
              )}

              <Button
                onClick={handleBooking}
                className="w-full"
                variant="gradient"
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
