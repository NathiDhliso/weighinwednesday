import React from 'react';
import { Users } from 'lucide-react';
import type { LeaderboardEntry } from '../types';

interface HeaderProps {
  profiles: LeaderboardEntry[];
  children: React.ReactNode;
}

const Header: React.FC<HeaderProps> = ({ profiles, children }) => {
  return (
    <header className="container-main pt-4 sm:pt-6">
      <div className="flex flex-col gap-3 sm:gap-4 mb-4 sm:mb-6">
        {/* Title Section */}
        <div className="min-w-0">
          <h1 className="text-heading-1 bg-clip-text text-transparent gradient-primary">
            Weigh-in Wednesday
          </h1>
          <p className="text-caption flex items-center gap-2 mt-1">
            <Users size={14} /> {profiles.length} participants tracking
          </p>
        </div>
        
        {/* Action Buttons - Mobile Optimized */}
        <div className="flex flex-wrap gap-2 relative">
          {children}
        </div>
      </div>
    </header>
  );
};

export default Header;