/**
 * Конвертирует Date в строку 'YYYY-MM-DD' по ЛОКАЛЬНОМУ времени.
 * Без UTC сдвига.
 */
export function formatDateToString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Парсит 'YYYY-MM-DD' в Date без UTC сдвига.
 * new Date('2026-06-03') → UTC → сдвиг → 2 июня ❌
 * Эта функция → локальная полночь → 3 июня ✅
 */
export function parseDateFromString(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Форматирует Date в читаемый русский формат.
 * Например: "вторник, 3 июня"
 */
export function formatDateRU(date: Date): string {
  return date.toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}