import React from 'react';
import type { LeaderboardEntry } from '../types';

interface LeaderboardCardProps {
  person: LeaderboardEntry;
  index: number;
  onClick: (person: LeaderboardEntry) => void;
}

const LeaderboardCard: React.FC<LeaderboardCardProps> = ({ person, index, onClick }) => {
  const isTopThree = index < 3;
  const rankColors = [
    'from-yellow-500 to-amber-600', 
    'from-slate-300 to-slate-400', 
    'from-amber-700 to-amber-800'
  ];

  const cardStyles = index === 0
    ? 'bg-yellow-500/10 border-yellow-500/50 shadow-glow-yellow'
    : isTopThree
    ? 'bg-white/10 border-white/20'
    : 'bg-white/5 border-white/10';

  return (
    <div
      onClick={() => onClick(person)}
      className={`card-leaderboard ${cardStyles}`}
    >
      {index === 0 && (
        <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/5 via-transparent to-yellow-500/5 animate-pulse" />
      )}

      <div className="relative flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-0">
        <div className="flex items-center gap-3 sm:gap-4">
          {isTopThree ? (
            <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br ${rankColors[index]} flex items-center justify-center text-xl sm:text-2xl shadow-lg flex-shrink-0`}>
              {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
            </div>
          ) : (
            <span className="w-10 sm:w-12 text-center text-2xl sm:text-3xl font-black italic opacity-30 flex-shrink-0">
              #{index + 1}
            </span>
          )}

          <div className="min-w-0 flex-1">
            <h3 className="text-heading-3 truncate">{person.name}</h3>
            <div className="flex flex-col sm:flex-row gap-1 sm:gap-4 text-caption mt-1">
              <span>
                Current: <span className="text-white font-mono">{person.current_weight || '--'}kg</span>
              </span>
              <span>
                Lost: <span className="text-emerald-400 font-mono">-{person.weight_lost?.toFixed(1) || '0'}kg</span>
              </span>
            </div>
          </div>
        </div>

        <div className="text-center sm:text-right sm:flex-shrink-0">
          <div className="text-2xl sm:text-3xl font-mono font-black bg-gradient-to-r from-emerald-400 to-blue-400 bg-clip-text text-transparent">
            {person.percentage_lost?.toFixed(1) || '0'}%
          </div>
          <div className="text-xs text-slate-400 uppercase tracking-widest">Progress</div>
        </div>
      </div>

      <div className="progress-bar mt-3 sm:mt-4">
        <div
          className="progress-fill"
          style={{ width: `${Math.min(Math.max(person.percentage_lost || 0, 0), 100)}%` }}
        >
          <div className="absolute inset-0 bg-white/20 animate-pulse" />
        </div>
      </div>

      <div className="mt-2 flex justify-between text-xs sm:text-xs text-slate-500">
        <span>Start: {person.baseline_weight}kg</span>
        <span>Goal: {person.goal_weight}kg</span>
      </div>
    </div>
  );
};

export default LeaderboardCard;