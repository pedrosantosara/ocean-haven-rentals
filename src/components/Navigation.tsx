import { Button } from "./ui/button";
import { Waves, Calendar, Image, LayoutDashboard, LogOut, User, Menu } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, Link } from "react-router-dom";
import { useEffect, useState } from "react";
type SupabaseUser = { id?: string };
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "./ui/sheet";

export const Navigation = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    setUser(token ? {} : null);
    if (token) { checkOwnerStatus(); }
  }, []);

  const checkOwnerStatus = async () => {
    const token = localStorage.getItem("token");
    if (!token) { setIsOwner(false); return; }
    const API = "http://localhost:3005";
    const res = await fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { setIsOwner(false); return; }
    const j = await res.json();
    setIsOwner(!!j.user?.is_owner);
  };

  const handleLogout = async () => {
    localStorage.removeItem("token");
    navigate("/");
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass-ocean border-b border-white/20">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group">
            <Waves className="h-8 w-8 text-primary animate-wave" />
            <span className="text-2xl font-bold text-gradient">Casa Pura Vida</span>
          </Link>

          <div className="hidden md:flex items-center gap-4">
            <Link to="/gallery">
              <Button variant="ghost" size="sm" className="gap-2">
                <Image className="h-4 w-4" />
                Galeria
              </Button>
            </Link>
            <Link to="/#book">
              <Button variant="ghost" size="sm" className="gap-2">
                <Calendar className="h-4 w-4" />
                Reservar
              </Button>
            </Link>
            {user ? (
              <>
                {isOwner ? (
                  <Link to="/dashboard">
                    <Button variant="ghost" size="sm" className="gap-2">
                      <LayoutDashboard className="h-4 w-4" />
                      Dashboard
                    </Button>
                  </Link>
                ) : (
                  <Link to="/my-booking">
                    <Button variant="ghost" size="sm" className="gap-2">
                      <User className="h-4 w-4" />
                      Minhas Reservas
                    </Button>
                  </Link>
                )}
                <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2">
                  <LogOut className="h-4 w-4" />
                  Sair
                </Button> 
              </>
            ) : (
              <Link to="/auth">
                <Button size="sm" className="gap-2 hover:bg-green-400">
                  Entrar
                </Button>
              </Link>
            )}
          </div>

          {/* Mobile menu */}
          <div className="md:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Abrir menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="border-l border-border">
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    <Waves className="h-6 w-6 text-primary" />
                    Casa Pura Vida
                  </SheetTitle>
                </SheetHeader>
                <div className="mt-6 flex flex-col gap-2">
                  <Link to="/gallery">
                    <Button variant="ghost" className="w-full justify-start gap-3">
                      <Image className="h-4 w-4" />
                      Galeria
                    </Button>
                  </Link>
                  <Link to="/#book">
                    <Button variant="ghost" className="w-full justify-start gap-3">
                      <Calendar className="h-4 w-4" />
                      Reservar
                    </Button>
                  </Link>
                  {user ? (
                    <>
                      {isOwner ? (
                        <Link to="/dashboard">
                          <Button variant="ghost" className="w-full justify-start gap-3">
                            <LayoutDashboard className="h-4 w-4" />
                            Dashboard
                          </Button>
                        </Link>
                      ) : (
                        <Link to="/my-booking">
                          <Button variant="ghost" className="w-full justify-start gap-3">
                            <User className="h-4 w-4" />
                            Minhas Reservas
                          </Button>
                        </Link>
                      )}
                      <Button variant="ghost" className="w-full justify-start gap-3" onClick={handleLogout}>
                        <LogOut className="h-4 w-4" />
                        Sair
                      </Button>
                    </>
                  ) : (
                    <Link to="/auth">
                      <Button className="w-full justify-start gap-3">
                        Entrar
                      </Button>
                    </Link>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </nav>
  );
};
