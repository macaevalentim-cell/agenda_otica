function toNull(value) {
  return (value === undefined || value === '') ? null : value;
}

function formatDateToYYYYMMDD(date) {
  if (!date) return null;
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function isValidDate(dateStr) {
  return !isNaN(new Date(dateStr).getTime());
}

module.exports = { toNull, formatDateToYYYYMMDD, isValidDate };