import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import LoginView from './views/LoginView';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import RegulatoryBanner from './components/layout/RegulatoryBanner';
import UserProfileModal from './components/layout/UserProfileModal';
import ClaimsQueueView from './views/ClaimsQueueView';
import AssessClaimView from './views/AssessClaimView';
import ModelLimitationsView from './views/ModelLimitationsView';
import DecisionsLogView from './views/DecisionsLogView';

export default function App() {
  const { currentUser, isLoadingSession } = useAuth();
  const [activeTab, setActiveTab] = useState('queue');
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // Sync with URL hash if present
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace('#', '');
      if (['queue', 'assess', 'model', 'decisions'].includes(hash)) {
        setActiveTab(hash);
      }
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    window.location.hash = tabId;
  };

  if (isLoadingSession) {
    return (
      <div className="min-h-screen bg-obsidian-950 flex items-center justify-center text-slate-400 font-mono text-sm">
        Initializing Security Environment...
      </div>
    );
  }

  if (!currentUser) {
    return <LoginView />;
  }

  return (
    <div className="min-h-screen flex text-slate-800">
      {/* Persistent Left Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        onOpenProfileModal={() => setIsProfileModalOpen(true)}
      />

      {/* Main Workspace Frame */}
      <div className="pl-72 flex-1 flex flex-col min-w-0">
        <Header onOpenProfileModal={() => setIsProfileModalOpen(true)} />

        <main className="pt-20 px-8 pb-12 flex-1 flex flex-col max-w-[1600px] w-full mx-auto">
          {activeTab === 'queue' && <ClaimsQueueView />}
          {activeTab === 'assess' && <AssessClaimView />}
          {activeTab === 'model' && <ModelLimitationsView />}
          {activeTab === 'decisions' && <DecisionsLogView />}

          {/* Regulatory Compliance Footer */}
          <RegulatoryBanner />
        </main>
      </div>

      {/* User Profile / Investigator Persona Switcher Modal */}
      <UserProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
      />
    </div>
  );
}
