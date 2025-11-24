import React, { useState } from 'react';
import { NewDashboard } from '@/components/ui/newDashboard';
import { CalendarPage } from '@/components/ui/CalendarPage';
import { MessagesPage } from '@/components/ui/MessagesPage';
import { SyncPage } from '@/components/ui/SyncPage';
import { GuestsPage } from '@/components/ui/GuestsPage';
import { SettingsPage } from '@/components/ui/SettingsPage';

const NewDashboardPage = () => {
  const [activeSection, setActiveSection] = useState('dashboard');

  const handleNavClick = (section: string) => {
    setActiveSection(section);
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

  return (
    <div className="min-h-screen bg-zinc-50">
      {renderContent()}
    </div>
  );
};

export default NewDashboardPage;