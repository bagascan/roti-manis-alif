export const formatRupiah = (value: number | string) => {
  if (value === null || value === undefined || value === '') return '';
  const num = typeof value === 'string' ? parseFloat(value.toString().replace(/\./g, '')) : value;
  if (isNaN(num)) return '';
  // Ensure it's a number before calling toLocaleString
  return Number(num).toLocaleString('id-ID');
};

export const parseRupiah = (value: string) => {
  if (!value) return 0;
  // Remove all dots (thousands separator) and then parse as integer
  const cleanedValue = value.replace(/\./g, '');
  return parseInt(cleanedValue, 10) || 0;
};

// Fungsi untuk mendapatkan string YYYY-MM-DD dalam waktu lokal
export const getLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};