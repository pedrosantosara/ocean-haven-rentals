import { Navigation } from "@/components/Navigation";
import { Hero } from "@/components/Hero";
import { BookingCalendar } from "@/components/BookingCalendar";
import { Footer } from "@/components/Footer";

const Index = () => {
  return (
    <div className="min-h-screen">
      <Navigation />
      <Hero />
      <BookingCalendar />
      
      <section className="py-20 px-4 bg-gradient-wave">
        <div className="container mx-auto text-center">
          <h2 className="text-4xl font-bold mb-8 text-gradient">Por que escolher nossa casa?</h2>
          <div className="grid md:grid-cols-3 gap-8 mt-12">
            <div className="p-6 glass-ocean rounded-lg">
              <div className="text-5xl mb-4">🌊</div>
              <h3 className="text-2xl font-bold mb-2">Vista para o Mar</h3>
              <p className="text-muted-foreground">
                Acorde todos os dias com uma vista deslumbrante do oceano
              </p>
            </div>
            <div className="p-6 glass-ocean rounded-lg">
              <div className="text-5xl mb-4">⭐</div>
              <h3 className="text-2xl font-bold mb-2">Luxo e Conforto</h3>
              <p className="text-muted-foreground">
                Móveis de primeira linha e todas as comodidades modernas
              </p>
            </div>
            <div className="p-6 glass-ocean rounded-lg">
              <div className="text-5xl mb-4">🏖️</div>
              <h3 className="text-2xl font-bold mb-2">Acesso Direto à Praia</h3>
              <p className="text-muted-foreground">
                A poucos passos da areia branca e águas cristalinas
              </p>
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
};

export default Index;
