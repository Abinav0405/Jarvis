export function getGreeting(userName) {
  const name = (userName || '').trim() || 'Boss';
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return `Good morning, ${name}.`;
  if (h >= 12 && h < 17) return `Good afternoon, ${name}.`;
  if (h >= 17 && h < 22) return `Good evening, ${name}.`;
  return `Still burning the midnight oil, ${name}.`;
}
