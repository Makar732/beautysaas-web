import { ReactNode, ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'amber';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  children,
  loading,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 active:scale-95 cursor-pointer';

  const variants = {
    primary:
      'bg-emerald-700 hover:bg-emerald-600 text-white focus:ring-emerald-500 shadow-lg shadow-emerald-900/20',
    secondary:
      'bg-white/10 hover:bg-white/20 text-white border border-white/20 focus:ring-white/30 backdrop-blur-sm',
    ghost:
      'bg-transparent hover:bg-gray-100 text-gray-700 focus:ring-gray-300',
    danger:
      'bg-red-600 hover:bg-red-500 text-white focus:ring-red-500',
    amber:
      'bg-amber-400 hover:bg-amber-300 text-gray-900 focus:ring-amber-400 shadow-lg shadow-amber-500/30',
  };

  const sizes = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-4 text-lg',
  };

  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`${base} ${variants[variant]} ${sizes[size]} ${disabled || loading ? 'opacity-60 cursor-not-allowed active:scale-100' : ''} ${className}`}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
