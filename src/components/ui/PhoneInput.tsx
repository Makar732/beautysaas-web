import { useState, useEffect } from 'react';

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  label?: string;
  error?: string;
}

// Форматирует строку цифр в маску +7 (XXX) XXX-XX-XX
function formatPhone(digits: string): string {
  if (digits.length === 0) return '';
  if (digits.length <= 1) return `+7 (`;
  if (digits.length <= 4) return `+7 (${digits.slice(1)}`;
  if (digits.length <= 7) return `+7 (${digits.slice(1, 4)}) ${digits.slice(4)}`;
  if (digits.length <= 9)
    return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
}

export function PhoneInput({
  value,
  onChange,
  placeholder,
  className,
  label,
  error,
}: PhoneInputProps) {
  const [display, setDisplay] = useState('');

  // Синхронизируем display когда value меняется снаружи
  useEffect(() => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    setDisplay(formatPhone(digits));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 11);
    onChange(digits);
    setDisplay(formatPhone(digits));
  };

  const handleFocus = () => {
    if (!value || value.replace(/\D/g, '').length === 0) {
      onChange('7');
      setDisplay('+7 (');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const allowed = [
      'Backspace',
      'Delete',
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'Tab',
      'Home',
      'End',
    ];
    if (allowed.includes(e.key)) return;
    if (e.ctrlKey || e.metaKey) return;
    if (!/^\d$/.test(e.key)) {
      e.preventDefault();
    }
  };

  // Базовые стили — идентичны компоненту Input.tsx (тёмная тема дашборда)
  const baseInputClass =
    'w-full rounded-xl border bg-gray-800 border-white/10 px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 transition-colors pr-10';

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-gray-300 mb-1.5 ml-0.5">
          {label}
        </label>
      )}
      <input
        type="tel"
        inputMode="numeric"
        value={display}
        onChange={handleChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || '+7 (___) ___-__-__'}
        className={className ?? baseInputClass}
      />
      {error && <p className="text-red-400 text-xs mt-1.5 ml-0.5">{error}</p>}
    </div>
  );
}

// Утилита для проверки — введены ли все 11 цифр
export function isPhoneComplete(value: string): boolean {
  return value.replace(/\D/g, '').length === 11;
}