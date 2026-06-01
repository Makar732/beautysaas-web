import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className = '', ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label className="text-sm font-medium text-gray-700">{label}</label>
        )}
        <input
          ref={ref}
          {...props}
          className={`w-full px-4 py-3 rounded-xl border transition-all duration-200 outline-none
            ${error
              ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-200 bg-red-50'
              : 'border-gray-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 bg-white'
            } text-gray-900 placeholder:text-gray-400 ${className}`}
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        {hint && !error && <p className="text-sm text-gray-500">{hint}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
