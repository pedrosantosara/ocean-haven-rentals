import { useState, useEffect } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { differenceInDays } from "date-fns";

const BASE_PRICE = 5000;
const WEEKEND_PRICE = 6000;
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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [monthsCount, setMonthsCount] = useState(1);

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

  const pricing = computePricing(checkIn, checkOut);

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
            <CardContent className="p-4 overflow-x-hidden">
              <Calendar
                mode="range"
                selected={{ from: checkIn, to: checkOut }}
                onSelect={(range) => {
                  setCheckIn(range?.from);
                  setCheckOut(range?.to);
                }}
                disabled={(date) => date < new Date()}
                showOutsideDays
                numberOfMonths={monthsCount}
                className="w-full max-w-full"
                classNames={{
                  months: "flex flex-col md:flex-row md:space-x-4 space-y-4 md:space-y-0 w-full",
                  month: "space-y-3",
                  table: "w-full border-collapse",
                  head_row: "grid grid-cols-7",
                  caption_label: "text-base md:text-lg font-semibold",
                  head_cell: "text-muted-foreground truncate font-normal text-[0.75rem] md:text-[0.8rem]",
                  row: "grid grid-cols-7 w-full mt-2",
                  cell: "aspect-square w-full text-center text-xs md:text-sm p-0 relative",
                  day: "w-full h-full p-0 font-normal",
                }}
              />
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
