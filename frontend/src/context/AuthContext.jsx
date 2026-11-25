import React, { createContext, useContext, useState, useEffect } from 'react';

export const PROFILES = [
  {
    id: 'parinita',
    name: 'Parinita',
    title: 'Lead Fraud Strategist',
    role: 'SIU Director & Model Governance Lead',
    badge: 'SIU Tier-III',
    badgeColor: 'border-indigo-400 bg-indigo-500/10 text-indigo-300',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
    clearance: 'Unrestricted Adjudication & Governance Audit',
    email: 'parinita@claimtriage.internal',
    assignedDivision: 'Commercial & Bodily Injury Fraud Matrix',
  },
  {
    id: 'buvanesh',
    name: 'Buvanesh',
    title: 'Senior SIU Forensic Examiner',
    role: 'Organized Staged Incident Specialist',
    badge: 'SIU Tier-II',
    badgeColor: 'border-amber-400 bg-amber-500/10 text-amber-300',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    clearance: 'Field Forensic Review & Law Enforcement Referral',
    email: 'buvanesh@claimtriage.internal',
    assignedDivision: 'Automobile Collision & Ring Investigations',
  },
  {
    id: 'nirmalya',
    name: 'Nirmalya',
    title: 'Claims Intake Specialist',
    role: 'FNOL Screening & Initial Intake Analyst',
    badge: 'Adjuster Tier-I',
    badgeColor: 'border-emerald-400 bg-emerald-500/10 text-emerald-300',
    avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&auto=format&fit=crop&q=80',
    clearance: 'Intake Verification & Expedited Fast-Track',
    email: 'nirmalya@claimtriage.internal',
    assignedDivision: 'Personal Auto First Notice of Loss',
  },
];

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [reviewCapacity, setReviewCapacity] = useState(10); // Default 10%
  const [isLoadingSession, setIsLoadingSession] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('claim_triage_session');
      if (saved) {
        const parsed = JSON.parse(saved);
        const match = PROFILES.find(p => p.id === parsed.id) || PROFILES[0];
        setCurrentUser(match);
      }
    } catch {
      // Fallback
    } finally {
      setIsLoadingSession(false);
    }
  }, []);

  const login = (profileId) => {
    const profile = PROFILES.find(p => p.id === profileId) || PROFILES[0];
    setCurrentUser(profile);
    localStorage.setItem('claim_triage_session', JSON.stringify({ id: profile.id, loggedInAt: new Date().toISOString() }));
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem('claim_triage_session');
  };

  const switchProfile = (profileId) => {
    login(profileId);
  };

  return (
    <AuthContext.Provider value={{
      currentUser,
      login,
      logout,
      switchProfile,
      reviewCapacity,
      setReviewCapacity,
      isLoadingSession,
      allProfiles: PROFILES,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
