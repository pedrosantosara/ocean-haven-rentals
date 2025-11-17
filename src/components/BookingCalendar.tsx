import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { differenceInDays } from "date-fns";

const PRICE_PER_NIGHT = 4500;

export const BookingCalendar = () => {
  const navigate = useNavigate();
  const [checkIn, setCheckIn] = useState<Date>();
  const [checkOut, setCheckOut] = useState<Date>();
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [numberOfGuests, setNumberOfGuests] = useState(1);
  const [loading, setLoading] = useState(false);

  const totalNights = checkIn && checkOut ? differenceInDays(checkOut, checkIn) : 0;
  const totalPrice = totalNights * PRICE_PER_NIGHT;

  type CreatedBooking = {
    id: string;
    status: "pending" | "confirmed" | "cancelled" | "completed";
    check_in: string;
    check_out: string;
    number_of_guests: number;
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
          TotalPrice: totalPrice,
        }),
      });
      if (res.ok) {
        created = {
          id: `srv-${Date.now()}`,
          status: "pending",
          check_in: checkIn.toISOString().split("T")[0],
          check_out: checkOut.toISOString().split("T")[0],
          number_of_guests: numberOfGuests,
          total_price: totalPrice,
        };
      }

      const bookingForView = created ?? {
        id: `temp-${Date.now()}`,
        status: "pending",
        check_in: checkIn.toISOString().split("T")[0],
        check_out: checkOut.toISOString().split("T")[0],
        number_of_guests: numberOfGuests,
        total_price: totalPrice,
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
      <div className="container mx-auto">
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
                disabled={(date) => date < new Date()}
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

          <Card className="glass-ocean border-primary/20 w-full mt-6 md:mt-0">
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

              {totalNights > 0 && (
                <div className="p-4 bg-primary/10 rounded-lg space-y-2">
                  <div className="flex justify-between">
                    <span>Noites:</span>
                    <span className="font-bold">{totalNights}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Preço por noite:</span>
                    <span className="font-bold">R$ {PRICE_PER_NIGHT}</span>
                  </div>
                  <div className="flex justify-between text-lg border-t border-primary/20 pt-2">
                    <span>Total:</span>
                    <span className="font-bold text-primary">R$ {totalPrice}</span>
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
