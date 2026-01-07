import React from 'react';
import { Plus, Users, LogOut, Lock } from 'lucide-react';

interface FloatingActionsProps {
  isAdmin: boolean;
  onAddWeight: () => void;
  onAddProfile: () => void;
  onAdminToggle: () => void;
}

const FloatingActions: React.FC<FloatingActionsProps> = ({
  isAdmin,
  onAddWeight,
  onAddProfile,
  onAdminToggle
}) => {
  return (
    <>
      {isAdmin && (
        <div className="fixed bottom-20 sm:bottom-24 right-4 sm:right-6 flex flex-col gap-2 sm:gap-3">
          <button
            onClick={onAddWeight}
            className="p-3 sm:p-4 bg-blue-600 rounded-full shadow-lg hover:bg-blue-500 transition backdrop-blur-md"
            title="Add Weight"
            aria-label="Add new weight entry"
          >
            <Plus size={20} className="sm:hidden" />
            <Plus size={24} className="hidden sm:block" />
          </button>
          <button
            onClick={onAddProfile}
            className="p-3 sm:p-4 bg-cyan-600 rounded-full shadow-lg hover:bg-cyan-500 transition backdrop-blur-md"
            title="Add Profile"
            aria-label="Add new profile"
          >
            <Users size={20} className="sm:hidden" />
            <Users size={24} className="hidden sm:block" />
          </button>
        </div>
      )}

      <button
        onClick={onAdminToggle}
        className={`fixed bottom-4 sm:bottom-6 right-4 sm:right-6 p-3 sm:p-4 rounded-full shadow-lg transition backdrop-blur-md ${
          isAdmin ? 'bg-red-600 hover:bg-red-500' : 'bg-slate-700 hover:bg-slate-600'
        }`}
        title={isAdmin ? 'Logout' : 'Admin Login'}
        aria-label={isAdmin ? 'Logout from admin' : 'Login as admin'}
      >
        {isAdmin ? (
          <>
            <LogOut size={20} className="sm:hidden" />
            <LogOut size={24} className="hidden sm:block" />
          </>
        ) : (
          <>
            <Lock size={20} className="sm:hidden" />
            <Lock size={24} className="hidden sm:block" />
          </>
        )}
      </button>
    </>
  );
};

export default FloatingActions;