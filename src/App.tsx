import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Gallery from "./pages/Gallery";
import Dashboard from "./pages/Dashboard";
import MyBooking from "./pages/MyBooking";
import Pay from "./pages/Pay";
import NotFound from "./pages/NotFound";
import Chat from "./pages/Chat";
import { NewDashboard } from "@/components/ui/newDashboard";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/chat/:bookingId" element={<Chat />} />
          <Route path="/my-booking" element={<MyBooking />} />
          <Route path="/pay/:bookingId" element={<Pay />} />
          <Route path="/new-dashboard" element={<NewDashboard />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
