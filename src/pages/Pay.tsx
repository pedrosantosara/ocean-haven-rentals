import React, { useEffect, useRef, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const Pay: React.FC = () => {
  const { bookingId } = useParams();
  const location = useLocation();
  const [clientSecret, setClientSecret] = useState('');
  const [publishableKey, setPublishableKey] = useState('');
  const [isPaying, setIsPaying] = useState(false);
  const paymentContainerRef = useRef<HTMLDivElement | null>(null);
  const stripeRef = useRef<any>(null);
  const elementsRef = useRef<any>(null);

  const getToken = () => new URLSearchParams(location.search).get('t') || '';

  const loadStripeScript = async () => {
    if ((window as any).Stripe) return;
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://js.stripe.com/v3';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('stripe_js_load_failed'));
      document.body.appendChild(s);
    });
  };

  const init = async () => {
    try {
      const API = 'http://localhost:3005';
      const token = getToken();
      const r = await fetch(`${API}/bookings/${bookingId}/payment-intent?t=${encodeURIComponent(token)}`, { method: 'POST' });
      if (!r.ok) { toast.error('Link inválido ou expirado'); return; }
      const j = await r.json();
      setPublishableKey(String(j.publishable_key || ''));
      setClientSecret(String(j.client_secret || ''));
      await loadStripeScript();
      const stripe = (window as any).Stripe(String(j.publishable_key || ''));
      const elements = stripe.elements({ clientSecret: String(j.client_secret || '') });
      const paymentElement = elements.create('payment');
      stripeRef.current = stripe;
      elementsRef.current = elements;
      if (paymentContainerRef.current) { paymentContainerRef.current.innerHTML = ''; paymentElement.mount(paymentContainerRef.current); }
    } catch {
      toast.error('Erro ao iniciar pagamento');
    }
  };

  useEffect(() => { init(); }, []);

  const confirmPay = async () => {
    if (!stripeRef.current || !elementsRef.current) return;
    try {
      setIsPaying(true);
      const stripe = stripeRef.current;
      const elements = elementsRef.current;
      const result = await stripe.confirmPayment({ elements, redirect: 'if_required' });
      if (result.error) { toast.error('Pagamento não confirmado'); setIsPaying(false); return; }
      const API = 'http://localhost:3005';
      const token = getToken();
      const r = await fetch(`${API}/bookings/${bookingId}/mark-paid?t=${encodeURIComponent(token)}`, { method: 'POST' });
      const jr = await r.json();
      if (jr.paid) { toast.success('Pagamento confirmado'); }
      else { toast.error(`Pagamento pendente (${jr.status || ''})`); }
    } catch {
      toast.error('Erro ao confirmar pagamento');
    } finally {
      setIsPaying(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-xl px-4 pt-24 pb-12">
        <h1 className="text-3xl font-bold mb-6">Finalizar Pagamento</h1>
        <div className="rounded-xl border border-primary/20 bg-card/40 p-6 shadow-ocean">
          <div ref={paymentContainerRef} />
          <Button className="w-full mt-4" onClick={confirmPay} disabled={isPaying}>
            {isPaying ? 'Processando...' : 'Pagar'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Pay;