import { Button } from './ui/button';
import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import heroVideo from '@/assets/videos/video-casa.mp4';
import posterImage from '@/assets/piscina-home.jpg';

export const Hero = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [loaded, setLoaded] = useState(false);

  const scrollToBooking = () => {
    document.getElementById('book')?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduce.matches) return;
    const connection = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection;
    if (connection && connection.effectiveType && ['slow-2g', '2g'].includes(connection.effectiveType)) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !loaded) {
        el.src = heroVideo;
        el.play().catch(() => {});
        setLoaded(true);
      }
    }, { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, [loaded]);

  return (
    <section className='relative h-screen w-full overflow-hidden'>
      <video
        ref={videoRef}
        className='absolute inset-0 w-full h-full object-cover'
        preload='none'
        poster={posterImage}
        loop
        muted
        playsInline
      />

      {/* Overlay (escurecimento do vídeo) */}
      <div className='absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-background' />

      {/* Conteúdo principal */}
      <div className='relative z-10 flex flex-col items-center justify-center h-full text-center text-white px-4 gap-6 md:gap-8'>
        <h1 className='text-4xl md:text-6xl font-bold mb-4'>
          Sua casa de luxo em Maragogi
        </h1>
        <p className='text-lg md:text-2xl mb-8 max-w-2xl'>
          Experimente conforto, exclusividade e o mar mais azul do Brasil.
        </p>
        <Button onClick={scrollToBooking} variant='gradient' className='transition'>
          Reservar agora
          <ChevronDown className='ml-2 h-4 w-4' />
        </Button>
      </div>

      {/* Floating Water Effects */}
      <div className='absolute inset-0 overflow-hidden pointer-events-none'>
        <div className='absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-ripple' />
        <div className='absolute top-1/3 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-ripple animation-delay-1000' />
      </div>

      {/* Content */}
      <div className='relative h-full flex flex-col items-center justify-center text-center px-4 z-10'>
        <h1 className='text-5xl md:text-7xl font-bold mb-6 animate-fade-in text-white drop-shadow-2xl'>
          Seu Paraíso na Praia
        </h1>
        <p className='text-xl md:text-2xl mb-8 max-w-2xl text-white/90 drop-shadow-lg animate-fade-in animation-delay-200'>
          Luxo, conforto e vista para o mar. Reserve agora sua experiência
          inesquecível.
        </p>
        <Button
          onClick={scrollToBooking}
          size='lg'
          variant='gradient'
          className='hover:scale-105 transition-transform animate-fade-in animation-delay-400'
        >
          Reservar Agora
        </Button>
      </div>

      {/* Scroll Indicator */}
      <div className='absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce'>
        <ChevronDown className='h-8 w-8 text-white/80' />
      </div>
    </section>
  );
};
