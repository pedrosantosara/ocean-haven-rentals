import { Navigation } from "@/components/Navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { Footer } from "@/components/Footer";

// 🔹 Importa automaticamente todas as imagens por pasta
const imageImports = import.meta.glob("@/assets/images/**/*.{jpg,jpeg,png,webp}", {
  eager: true,
});

type RoomType = string;

interface RoomGallery {
  name: string;
  key: RoomType;
  images: string[];
  description: string;
}

// 🔹 Agrupa automaticamente as imagens por pasta
const groupImagesByFolder = (): Record<string, string[]> => {
  const grouped: Record<string, string[]> = {};
  Object.keys(imageImports).forEach((path) => {
    const topMatch = path.match(/images\/([^/]+)\//);
    if (!topMatch) return;
    const top = topMatch[1];
    if (top === "Rooms") {
      const subMatch = path.match(/images\/Rooms\/([^/]+)\//);
      if (subMatch) {
        const sub = subMatch[1];
        if (!grouped[sub]) grouped[sub] = [];
        // @ts-expect-error: Vite ESM glob generates modules with a default export
        grouped[sub].push(imageImports[path].default);
        return;
      }
    }
    if (!grouped[top]) grouped[top] = [];
    // @ts-expect-error: Vite ESM glob generates modules with a default export
    grouped[top].push(imageImports[path].default);
  });
  return grouped;
};

const groupedImages = groupImagesByFolder();

const baseSections: RoomGallery[] = [
  { name: "Entrada", key: "Entrance", images: groupedImages.Entrance || [], description: "Entrada principal e áreas de acesso" },
  { name: "Cozinha e Lavanderia", key: "KitchenLaundry", images: groupedImages.KitchenLaundry || [], description: "Cozinha gourmet e lavanderia completa" },
  { name: "Sala de Estar", key: "LivingRoom", images: groupedImages.LivingRoom || [], description: "Ambiente social com vista e conforto" },
  { name: "Área da Piscina e Bar", key: "PoolBar", images: groupedImages.PoolBar || [], description: "Espaço externo com piscina e bar molhado" },
  { name: "Banheiros", key: "Restroom", images: groupedImages.Restroom || [], description: "Banheiros modernos e bem iluminados" },
];

const roomKeys = Object.keys(groupedImages).filter(
  (k) => !["Entrance", "KitchenLaundry", "LivingRoom", "PoolBar", "Restroom", "Rooms"].includes(k)
);

const roomSections: RoomGallery[] = [
  ...baseSections,
  ...roomKeys.map((k) => ({
    name: k,
    key: k,
    images: groupedImages[k] || [],
    description: `Imagens do quarto ${k}`,
  })),
];

export default function Gallery() {
  const [active, setActive] = useState<RoomType>("all");

  const filteredImages =
    active === "all"
      ? roomSections.flatMap((r) => r.images.map((img) => ({ ...r, image: img })))
      : roomSections
          .find((r) => r.key === active)
          ?.images.map((img) => ({ ...roomSections.find((r) => r.key === active)!, image: img })) || [];

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <div className="pt-24 pb-12 px-4">
        <div className="container mx-auto">
          <h1 className="text-5xl font-bold text-center mb-4 text-gradient animate-fade-in">
            Galeria da Casa
          </h1>
          <p className="text-xl text-center text-muted-foreground mb-12">
            Explore cada cômodo do nosso paraíso à beira-mar
          </p>

          <Tabs value={active} onValueChange={(v) => setActive(v as RoomType)} className="w-full">
            <TabsList className="flex overflow-x-auto md:overflow-x-visible flex-nowrap md:flex-wrap justify-start md:justify-center h-auto mb-8 bg-card/40 backdrop-blur-sm p-2 rounded-2xl gap-2">
              <TabsTrigger
                value="all"
                className="shrink-0 md:shrink data-[state=active]:bg-gradient-ocean data-[state=active]:text-white data-[state=active]:shadow-ocean"
              >
                Todos
              </TabsTrigger>
              {roomSections.map((room) => (
                <TabsTrigger
                  key={room.key}
                  value={room.key}
                  className="shrink-0 md:shrink data-[state=active]:bg-gradient-ocean data-[state=active]:text-white data-[state=active]:shadow-ocean"
                >
                  {room.name}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value={active}>
              <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {filteredImages.map((room, i) => (
                  <Card
                    key={i}
                    className="overflow-hidden glass-ocean border-primary/20 hover:shadow-ocean transition-all duration-300 hover:scale-105"
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    <CardContent className="p-0">
                      <div className="relative h-60 overflow-hidden">
                        <img
                          src={room.image}
                          alt={room.name}
                          loading="lazy"
                          className="w-full h-full object-cover transition-transform duration-300 hover:scale-110"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                        <div className="absolute bottom-4 left-4">
                          <h3 className="text-lg font-bold text-white">{room.name}</h3>
                          <p className="text-sm text-white/90">{room.description}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
      <Footer />
    </div>
  );
}
