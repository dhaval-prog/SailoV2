function haversineMeters(a, b) {
  const R = 6371e3;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, h)));
}
function formatDistance(meters) {
  if (meters < 1e3) return `${Math.max(10, Math.round(meters / 10) * 10)} m away`;
  return `${(meters / 1e3).toFixed(1)} km away`;
}
function haversineMiles(a, b) {
  return haversineMeters(a, b) / 1609.344;
}
function formatMiles(miles) {
  return `${Math.round(miles).toLocaleString("en-US")} miles`;
}
export {
  formatDistance,
  formatMiles,
  haversineMeters,
  haversineMiles
};
