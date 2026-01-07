import React from 'react';

interface FormFieldProps {
  label: string;
  type?: 'text' | 'select' | 'date';
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  required?: boolean;
  children?: React.ReactNode; // For select options
  helpText?: string;
}

const FormField: React.FC<FormFieldProps> = ({
  label,
  type = 'text',
  value,
  onChange,
  error,
  placeholder,
  required = false,
  children,
  helpText
}) => {
  const inputClasses = `form-input ${error ? 'form-input-error' : 'form-input-success'}`;

  const renderInput = () => {
    switch (type) {
      case 'select':
        return (
          <select
            className={inputClasses}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={required}
          >
            {children}
          </select>
        );
      case 'date':
        return (
          <input
            type="date"
            className={inputClasses}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={required}
          />
        );
      default:
        return (
          <input
            type="text"
            className={inputClasses}
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={required}
          />
        );
    }
  };

  return (
    <div className="mb-4">
      <label className="block text-caption mb-2">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {renderInput()}
      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
      {helpText && !error && <p className="text-caption mt-1">{helpText}</p>}
    </div>
  );
};

export default FormField;