import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Calendar, Trash2, RefreshCw, Copy, Hotel, Globe } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface CalendarSync { id: number; platform: string; url: string; created_at?: string }

export function ICalSync() {
  const [syncs, setSyncs] = useState<CalendarSync[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPlatform, setNewPlatform] = useState("");
  const [newUrl, setNewUrl] = useState("");

  useEffect(() => {
    loadSyncs();
  }, []);

  const loadSyncs = async () => {
    const token = localStorage.getItem("token");
    const API = "http://localhost:3005";
    const res = await fetch(`${API}/ical`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) { toast.error("Erro ao carregar sincronizações"); }
    else { const j = await res.json(); setSyncs(j.data || []); }
    setLoading(false);
  };

  const addSync = async () => {
    if (!newPlatform.trim() || !newUrl.trim()) {
      toast.error("Preencha todos os campos");
      return;
    }
    const token = localStorage.getItem("token");
    if (!token) { toast.error("Faça login"); return; }
    const API = "http://localhost:3005";
    const res = await fetch(`${API}/ical`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ platform: newPlatform, url: newUrl }),
    });
    if (!res.ok) { toast.error("Erro ao adicionar sincronização"); return; }
    toast.success("Sincronização adicionada");
    setNewPlatform("");
    setNewUrl("");
    loadSyncs();
  };

  const removeSync = async (id: number) => {
    const token = localStorage.getItem("token");
    if (!token) { toast.error("Faça login"); return; }
    const API = "http://localhost:3005";
    const res = await fetch(`${API}/ical/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { toast.error("Erro ao remover"); return; }
    toast.success("Sincronização removida");
    loadSyncs();
  };

  const syncNow = async (_id: number) => {
    toast.info("Sincronização iniciada... (funcionalidade em desenvolvimento)");
    loadSyncs();
  };

  return (
    <Card className="glass-ocean border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Sincronização de Calendários
        </CardTitle>
        <CardDescription>
          Sincronize com Airbnb, Booking.com e outras plataformas via iCal
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="bg-background/50 border-border">
            <CardHeader>
              <CardTitle>Adicionar Calendário</CardTitle>
              <CardDescription>Informe a plataforma e a URL do iCal</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="Plataforma (ex: Airbnb, Booking.com)"
                value={newPlatform}
                onChange={(e) => setNewPlatform(e.target.value)}
              />
              <Input
                placeholder="URL do iCal"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
              />
              <Button onClick={addSync} variant="gradient" className="w-full">
                Adicionar à lista
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-3">
            <Card className="bg-background/50 border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Hotel className="h-4 w-4" /> Airbnb
                </CardTitle>
                <CardDescription>Exemplo de integração via iCal</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setNewPlatform("Airbnb");
                    setNewUrl("");
                  }}
                  className="w-full"
                >
                  Usar exemplo do Airbnb
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-background/50 border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Hotel className="h-4 w-4" /> Booking.com
                </CardTitle>
                <CardDescription>Exemplo de integração via iCal</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setNewPlatform("Booking.com");
                    setNewUrl("");
                  }}
                  className="w-full"
                >
                  Usar exemplo do Booking.com
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-background/50 border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-4 w-4" /> Nosso iCal URL
                </CardTitle>
                <CardDescription>Compartilhe seu calendário público</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex gap-2">
                  <Input readOnly value={`http://localhost:3005/calendar/merged.ics`} />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => navigator.clipboard.writeText(`http://localhost:3005/calendar/merged.ics`)}
                    title="Copiar URL"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Existing syncs */}
        <div className="space-y-3">
          {loading ? (
            <p className="text-center text-muted-foreground">Carregando...</p>
          ) : syncs.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">
              Nenhum calendário sincronizado
            </p>
          ) : (
            syncs.map((sync) => (
              <div
                key={sync.id}
                className="flex items-center justify-between p-4 rounded-lg bg-background/50 border border-border"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold">{sync.platform}</p>
                    <Badge variant={"default"}>Ativo</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate max-w-md">
                    {sync.url}
                  </p>
                  {sync.created_at && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Adicionado:{" "}
                      {format(new Date(sync.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => syncNow(sync.id)}
                    title="Sincronizar agora"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="destructive"
                    onClick={() => removeSync(sync.id)}
                    title="Remover"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
