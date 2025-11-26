import React, { useEffect, useState } from 'react';
import { NewDashboard } from '@/components/ui/newDashboard';
import { CalendarPage } from '@/components/ui/CalendarPage';
import { MessagesPage } from '@/components/ui/MessagesPage';
import { SyncPage } from '@/components/ui/SyncPage';
import { GuestsPage } from '@/components/ui/GuestsPage';
import { SettingsPage } from '@/components/ui/SettingsPage';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, CalendarDays, MessageSquare, Users, RefreshCw, Settings, User } from 'lucide-react';

const NewDashboardPage = () => {
  const [activeSection, setActiveSection] = useState('dashboard');
  const navigate = useNavigate();
  const [isOwner, setIsOwner] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) { navigate('/auth'); return; }
        const API = 'http://localhost:3005';
        const r = await fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
        const j = await r.json();
        const owner = Boolean(j.user?.is_owner);
        const fullName = String(j.user?.full_name || j.user?.email || '');
        setUserName(fullName);
        setUserRole(owner ? 'Owner' : 'Guest');
        setIsOwner(owner);
        if (!owner) { navigate('/my-booking'); }
      } catch {
        // ignore
      }
    })();
  }, [navigate]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('booking_id')) {
      setActiveSection('messages');
    }
  }, []);

  const [mobileOpen, setMobileOpen] = useState(false);
  const [userName, setUserName] = useState<string>('');
  const [userRole, setUserRole] = useState<string>('Owner');

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'calendar', label: 'Calendário', icon: CalendarDays },
    { id: 'messages', label: 'Mensagens', icon: MessageSquare },
    { id: 'guests', label: 'Hóspedes', icon: Users },
    { id: 'sync', label: 'Sincronização iCal', icon: RefreshCw },
    { id: 'settings', label: 'Configurações', icon: Settings }
  ];

  const handleNavClick = (section: string) => {
    setActiveSection(section);
    setMobileOpen(false);
  };

  const renderContent = () => {
    switch (activeSection) {
      case 'dashboard':
        return <NewDashboard onNavClick={handleNavClick} />;
      case 'calendar':
        return <CalendarPage onNavClick={handleNavClick} />;
      case 'messages':
        return <MessagesPage onNavClick={handleNavClick} />;
      case 'guests':
        return <GuestsPage onNavClick={handleNavClick} />;
      case 'sync':
        return <SyncPage onNavClick={handleNavClick} />;
      case 'settings':
        return <SettingsPage onNavClick={handleNavClick} />;
      default:
        return <NewDashboard onNavClick={handleNavClick} />;
    }
  };

  if (isOwner !== true) { return null; }
  return (
    <div className="flex h-screen bg-zinc-50 text-zinc-900 antialiased">
      {/* Sidebar Navigation */}
      <nav className="w-64 border-r border-zinc-200 bg-white flex-col justify-between hidden md:flex shrink-0 h-full">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-zinc-900 rounded-lg flex items-center justify-center text-white">
              <span className="font-semibold tracking-tighter text-sm">H.</span>
            </div>
            <span className="text-lg font-semibold tracking-tight">HOSTIFY</span>
          </div>

          <div className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors w-full text-left ${activeSection === item.id
                    ? 'bg-zinc-100 text-zinc-900'
                    : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'
                    }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-4 border-t border-zinc-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center">
              <User className="w-4 h-4 text-zinc-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{userName}</p>
              <p className="text-xs text-zinc-500 truncate">{userRole}</p>
            </div>
            <button className="text-zinc-400 hover:text-zinc-900" onClick={() => { localStorage.removeItem('token'); navigate('/auth'); }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        {/* Header mobile */}
        <header className="md:hidden h-16 border-b border-zinc-200 bg-white flex items-center justify-between px-4 shrink-0 z-20">
          <span className="font-semibold tracking-tight">HOSTIFY</span>
          <button className="p-2 text-zinc-500" onClick={() => setMobileOpen(true)}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 md:p-10 scroll-smooth">
          <div className="mx-auto space-y-10">
            {renderContent()}
          </div>
        </div>

        {mobileOpen && (
          <div className="md:hidden fixed inset-0 z-30">
            <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)}></div>
            <div className="absolute left-0 top-0 bottom-0 w-72 bg-white border-r border-zinc-200 shadow-lg p-5 flex flex-col gap-2">
              <div className="flex items-center justify-between mb-4">
                <span className="font-semibold tracking-tight">HOSTIFY</span>
                <button className="p-2 text-zinc-500" onClick={() => setMobileOpen(false)}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavClick(item.id)}
                      className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors w-full text-left ${activeSection === item.id ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'
                        }`}
                    >
                      <Icon className="w-4 h-4" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default NewDashboardPage;