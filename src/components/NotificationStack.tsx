import React from 'react';
import { X } from 'lucide-react';
import type { Notification } from '../types';

interface NotificationStackProps {
  notifications: Notification[];
  onRemoveNotification: (id: string) => void;
}

const NotificationStack: React.FC<NotificationStackProps> = ({ 
  notifications, 
  onRemoveNotification 
}) => {
  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'success':
        return '✓';
      case 'error':
        return '⚠';
      case 'achievement':
        return '🏆';
      default:
        return 'ℹ';
    }
  };

  const getNotificationStyles = (type: Notification['type']) => {
    switch (type) {
      case 'success':
        return 'bg-emerald-900/90 border-emerald-500/50 text-emerald-100';
      case 'error':
        return 'bg-red-900/90 border-red-500/50 text-red-100';
      case 'achievement':
        return 'bg-yellow-900/90 border-yellow-500/50 text-yellow-100';
      default:
        return 'bg-blue-900/90 border-blue-500/50 text-blue-100';
    }
  };

  return (
    <div className="fixed top-2 sm:top-4 right-2 sm:right-4 z-[60] space-y-2 max-w-[calc(100vw-1rem)] sm:max-w-md">
      {notifications.map(notification => (
        <div
          key={notification.id}
          className={`p-3 sm:p-4 rounded-lg shadow-lg backdrop-blur-md border transition-all transform animate-in slide-in-from-right duration-300 text-sm ${getNotificationStyles(notification.type)}`}
        >
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5 text-lg">
              {getNotificationIcon(notification.type)}
            </div>
            <div className="flex-1 text-xs sm:text-sm font-medium break-words">
              {notification.message}
            </div>
            <button
              onClick={() => onRemoveNotification(notification.id)}
              className="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity"
              aria-label="Close notification"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default NotificationStack;