import { Navigation } from '@/components/Navigation';
import { useState } from 'react';
import { Hero } from '@/components/Hero';
import { BookingCalendar } from '@/components/BookingCalendar';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import piscinaHome from '@/assets/images/piscina-home.jpg';
import sala11 from '@/assets/images/LivingRoom/foto-sala-11.jpg';
import piscina12 from '@/assets/images/PoolBar/foto-piscina-bar-12.jpg';
import airbnbBadge from '@/assets/images/Airbnb-Badge.jpg';
import { Star } from 'lucide-react';

const Index = () => {
  return (
    <div className='min-h-screen'>
      <Navigation />
      <Hero />
      <BookingCalendar />

      <section className='py-20 px-4 bg-gradient-wave'>
        <div className='container mx-auto text-center'>
          <h2 className='text-4xl font-bold mb-8 text-gradient'>
            Por que escolher nossa casa?
          </h2>
          <div className='grid md:grid-cols-3 gap-8 mt-12'>
            <div className='p-6 glass-ocean rounded-lg'>
              <div className='text-5xl mb-4'>🌊</div>
              <h3 className='text-2xl font-bold mb-2'>Vista para o Mar</h3>
              <p className='text-muted-foreground'>
                Acorde todos os dias com uma vista deslumbrante do oceano
              </p>
            </div>
            <div className='p-6 glass-ocean rounded-lg'>
              <div className='text-5xl mb-4'>⭐</div>
              <h3 className='text-2xl font-bold mb-2'>Luxo e Conforto</h3>
              <p className='text-muted-foreground'>
                Móveis de primeira linha e todas as comodidades modernas
              </p>
            </div>
            <div className='p-6 glass-ocean rounded-lg'>
              <div className='text-5xl mb-4'>🏖️</div>
              <h3 className='text-2xl font-bold mb-2'>Acesso Direto à Praia</h3>
              <p className='text-muted-foreground'>
                A poucos passos da areia branca e águas cristalinas
              </p>
            </div>
          </div>
        </div>
      </section>
      <section className='py-20 px-4'>
        <div className='container mx-auto'>
          <div className='text-center mb-10'>
            <h2 className='text-4xl font-bold text-gradient'>Avaliações</h2>
            <p className='text-muted-foreground mt-2'>
              O que dizem nossos hóspedes em outros sites
            </p>
          </div>

          <div className='max-w-3xl mx-auto mb-10'>
            <div className='rounded-2xl overflow-hidden border border-primary/30 glass-ocean shadow-ocean p-3 md:p-4 bg-white'>
              <img
                src={airbnbBadge}
                alt='Airbnb Superhost Badge'
                className='mx-auto h-24 md:h-32 object-contain'
              />
            </div>
          </div>

          {(() => {
            const reviews = [
              {
                name: 'Clive',
                years: '9 years on Airbnb',
                rating: 5,
                date: 'August 2025',
                stay: 'Stayed about a week',
                text: 'Truly exceptional and beyond expectation. Would highly highly recommend and only one word to describe the overall experience - spectacular! From initial booking to final checkout simply seamless and the chefs cooking was simply fantastic!! Than you to all for an incredible stay!!!',
                response: {
                  from: 'Midia',
                  date: 'August 2025',
                  text: 'We are so happy that you all had a wonderful stay at Casa Pura Vida and we look forward to host your group in the near future. Thank you',
                },
              },
              {
                name: 'Gomes',
                years: '10 years on Airbnb',
                rating: 5,
                date: 'October 2025',
                stay: 'Stayed a few nights',
                text: 'From the moment we booked Casa Pura Vida, we knew it was the perfect home for our family long weekend—and it still exceeded every expectation. The house is beautiful, comfortable, and spotless. Communication with Mídia and Jacyara was caring and effortless; everything was smooth from booking to checkout. Jacyara even arranged a private boat (lancha) trip to the Maragogi natural pools—simply unforgettable. The heated pool and jacuzzi were so relaxing we almost forgot we had the seaside right there! Chef Lurdinha cooked delicious meals that went far beyond what we imagined, and Janaina was wonderful too. Thank you, Mídia, Jacyara, Lurdinha and Janaina, for making our four days truly special. We left with full hearts and beautiful memories—and we can’t wait to come back. 💚',
              },
              {
                name: 'Gabriel',
                years: '7 years on Airbnb',
                rating: 5,
                date: 'September 2025',
                stay: 'Stayed a few nights',
                text: 'Our stay was perfect! The house is brand new, beautiful, super comfortable and impeccably clean, with everything we need for incredible days. The location is excellent, close to the beach and in a quiet area, perfect for resting. The host was extremely attentive and helpful, always available and ready to help. It exceeded all our expectations. The employees were also extremely helpful and solicitous.',
                translated: 'Translated from Portuguese',
                response: {
                  from: 'Midia',
                  date: 'September 2025',
                  text: 'We at Casa Pura Vida are very happy that you have enjoyed your vacation. We hope to see you again and next time stay longer.',
                },
              },
              {
                name: 'Gisella',
                location: 'San Isidro, Argentina',
                rating: 5,
                date: 'October 2025',
                stay: 'Stayed with kids',
                text: "The house is spectacular! Just like the photos. Super functional, comfortable, all equipped with excellent quality furniture. Beautiful bathrooms. It's a super plus to have a cook and have them send you the groceries. The heated pool is super usable, as are the kayaks. It is located in a very safe private neighborhood with access to the sea. Midia is always attending, as is Jacy. They also recommended very good walks. We really enjoyed the stay!! We will come back and recommend it!",
                translated: 'Translated from Spanish',
              },
              {
                name: 'Braulio',
                location: 'Rodríguez, Uruguay',
                rating: 5,
                date: 'July 2025',
                stay: 'Stayed with kids',
                text: 'Excellent house, new and of superior quality. Heated pool, everything works perfectly. Very attentive staff, very good cooking!! Very safe and clean, perfect for family vacations!',
                translated: 'Translated from Spanish',
                response: {
                  from: 'Midia',
                  date: 'July 2025',
                  text: 'Thank you Bráulio! We are very happy that you had a awesome vacation! Came back anytime',
                },
              },
              {
                name: 'Marianela',
                location: 'Ituzaingó, Argentina',
                rating: 5,
                date: 'August 2025',
                stay: 'Stayed with kids',
                text: "Our week with family and friends in this spectacular, new, clean, comfortable house was beautiful and we will certainly return. Midiam is very attentive to everything you need. Not to mention the staff, all attentive to our needs, especially the cook Eli, a sweetheart and very good cook. The heated pool, the quincho area, the impeccable sheets and towels, the wide distribution of rooms and spaces make a unique and dream house. It has beach towels, kayaks, children's vests, many beautiful details! It's inside a very safe condominium, you can walk to the beach, and there's a market that delivers everything you need to your home. And the cook makes breakfast, lunch and dinner! We also had a car to go to different beaches. But you can stay there comfortably if you don't have a car. Everything is beautiful! Thank you Midiam!!",
                translated: 'Translated from Spanish',
                response: {
                  from: 'Midia',
                  date: 'August 2025',
                  text: 'Dear Marianela, it was a pleasure to have you at Casa Pura Vida! Your satisfaction is our main goal. We thank you for choosing Casa Pura Vida for your vacation and we look forward to see you again',
                },
              },
              {
                name: 'Michel',
                location: 'Bassersdorf, Switzerland',
                rating: 5,
                date: 'April 2025',
                stay: 'Group trip',
                text: 'What a beautiful house. More beautiful than in the photos. Communication with Midiam was great. She always responded quickly and was extremely accommodating. The highlight of the stay was Li & Lu! The cook and the housekeeper. Li is a fantastic cook, Lu always attentive. 2 wonderful people,',
                translated: 'Translated from German',
              },
              {
                name: 'Ana Carla',
                years: '10 years on Airbnb',
                rating: 5,
                date: 'May 2025',
                stay: 'Stayed a few nights',
                text: 'wonderful house, complete with all the necessities for a good stay!',
                translated: 'Translated from Portuguese',
                response: {
                  from: 'Midia',
                  date: 'May 2025',
                  text: 'We are so pleased that you had a great stay at Casa Pura Pura Vida! We always appreciate your opinion and we hope to have the opportunity to host you and your family and friends again. Thank you',
                },
              },
              {
                name: 'Lucas',
                years: '9 years on Airbnb',
                rating: 5,
                date: 'April 2025',
                stay: 'Stayed a few nights',
                text: 'Very new the house! Great location all close by! We all like it!!! Tasty food',
              },
            ];

            const images = [piscinaHome, sala11, piscina12];
            type Review = {
              name: string;
              years?: string;
              location?: string;
              rating: number;
              date: string;
              stay?: string;
              text: string;
              translated?: string;
              response?: { from: string; date: string; text: string };
            };
            const ReviewCard = ({ r, img }: { r: Review; img: string }) => {
              const [open, setOpen] = useState(false);
              const short =
                r.text.length > 220 ? r.text.slice(0, 220) + '…' : r.text;
              return (
                <div className='rounded-xl overflow-hidden border border-primary/20 bg-card/40 shadow-ocean glass-ocean'>
                  <img
                    src={img}
                    alt='Casa Pura Vida'
                    className='w-full h-44 object-cover'
                  />
                  <div className='p-4 space-y-3'>
                    <div className='flex items-start justify-between gap-3'>
                      <div className='min-w-0'>
                        <h3 className='text-lg font-bold truncate'>{r.name}</h3>
                        <p className='text-xs text-muted-foreground truncate'>
                          {r.location || r.years || 'Airbnb'}
                        </p>
                      </div>
                      <div className='text-right shrink-0'>
                        <div className='flex items-center justify-end gap-1'>
                          {Array.from({ length: r.rating }).map((_, i) => (
                            <Star
                              key={i}
                              className='w-5 h-5 text-amber-500 fill-amber-500 stroke-amber-500 drop-shadow'
                            />
                          ))}
                        </div>
                        <p className='text-xs text-muted-foreground mt-1'>
                          {r.date}
                        </p>
                      </div>
                    </div>
                    {r.stay && (
                      <p className='text-xs text-muted-foreground'>{r.stay}</p>
                    )}
                    <p className='text-sm text-zinc-700'>
                      {open ? r.text : short}
                    </p>
                    {r.translated && (
                      <p className='text-xs text-zinc-500'>
                        {r.translated} • Show original
                      </p>
                    )}
                    {open && r.response && (
                      <div className='pt-3 border-t border-primary/20 space-y-1'>
                        <p className='text-xs font-medium text-zinc-700'>
                          Response from {r.response.from} • {r.response.date}
                        </p>
                        <p className='text-sm text-zinc-700'>
                          {r.response.text}
                        </p>
                      </div>
                    )}
                    <div className='pt-1'>
                      <Button
                        variant='outline'
                        size='sm'
                        className='rounded-full h-8 px-3 text-xs border-blue-200 text-blue-700 hover:bg-blue-50'
                        onClick={() => setOpen((v) => !v)}
                      >
                        {open ? 'Ver menos' : 'Ver mais'}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            };
            return (
              <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
                {reviews.map((r, idx) => (
                  <ReviewCard
                    key={idx}
                    r={r}
                    img={images[idx % images.length]}
                  />
                ))}
              </div>
            );
          })()}

          <div className='mt-8 text-center'>
            <Button asChild variant='gradient'>
              <a href='#book' className='rounded-md'>
                Ver disponibilidade
              </a>
            </Button>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
};

export default Index;
