import React from 'react';
import { Users } from 'lucide-react';
import type { LeaderboardEntry } from '../types';

interface HeaderProps {
  profiles: LeaderboardEntry[];
  children: React.ReactNode;
}

const Header: React.FC<HeaderProps> = ({ profiles, children }) => {
  return (
    <header className="container-main">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 sm:gap-0 mb-6 sm:mb-8 pt-4">
        <div>
          <h1 className="text-heading-1 bg-clip-text text-transparent gradient-primary">
            Weigh-in Wednesday
          </h1>
          <p className="text-caption flex items-center gap-2 mt-1">
            <Users size={14} /> {profiles.length} participants tracking
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          {children}
        </div>
      </div>
    </header>
  );
};

export default Header;