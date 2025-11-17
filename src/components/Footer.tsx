import { Facebook, Instagram, Mail, Phone, Twitter } from "lucide-react";

export const Footer = () => {
  return (
    <footer className="bg-gradient-ocean text-white mt-16">
      <div className="container mx-auto px-4 py-10">
        <div className="grid gap-8 md:grid-cols-3 items-start">
          <div>
            <h4 className="text-xl font-bold">Casa Pura Vida</h4>
            <p className="mt-2 text-sm opacity-90">Beachfront rental in Maragogi, Alagoas</p>
            <div className="mt-3 space-y-1 text-sm">
              <p className="flex items-center gap-2"><Phone className="h-4 w-4" /> +55 (82) 99999-9999</p>
              <p className="flex items-center gap-2"><Mail className="h-4 w-4" /> contato@casapuravida.com</p>
            </div>
          </div>
          <div className="md:text-center">
            <h4 className="text-xl font-bold">Follow Us</h4>
            <div className="mt-3 flex md:justify-center gap-3">
              <a href="#" aria-label="Instagram" className="inline-flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 transition-colors p-2">
                <Instagram className="h-5 w-5" />
              </a>
              <a href="#" aria-label="Facebook" className="inline-flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 transition-colors p-2">
                <Facebook className="h-5 w-5" />
              </a>
              <a href="#" aria-label="Twitter" className="inline-flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 transition-colors p-2">
                <Twitter className="h-5 w-5" />
              </a>
            </div>
          </div>
          <div className="md:text-right">
            <h4 className="text-xl font-bold">Contact</h4>
            <p className="mt-2 text-sm opacity-90">Maragogi • Alagoas • Brazil</p>
            <p className="text-sm opacity-90">Open daily • Check-in 14:00 • Check-out 11:00</p>
          </div>
        </div>
        <div className="mt-8 border-t border-white/30 pt-4 text-sm flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
          <p>© 2025 Casa Pura Vida. All rights reserved.</p>
          <p className="opacity-90">Made with love by the ocean.</p>
        </div>
      </div>
    </footer>
  );
};