import React from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl';
  className?: string;
}

const Modal: React.FC<ModalProps> = ({ 
  onClose, 
  title, 
  children, 
  maxWidth = 'md',
  className = ''
}) => {
  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '4xl': 'max-w-4xl'
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="modal-backdrop overflow-y-auto"
      onClick={handleBackdropClick}
    >
      <div className={`card-modal ${maxWidthClasses[maxWidth]} my-8 ${className}`}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-heading-2">{title}</h2>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="p-2 bg-white/5 rounded-lg hover:bg-white/10 transition"
            aria-label="Close modal"
          >
            <X size={24} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

export default Modal;
