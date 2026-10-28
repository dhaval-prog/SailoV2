// The world beyond Pune: ocean regions (which decide the local fish) and a starter list of
// city charts shown as pins on the world map. Any other city can be found with search.

// Rough marine regions by latitude/longitude, checked in order (first match wins).
export const REGIONS = [
  { id: 'north', name: 'Cold northern waters', test: (lat) => lat >= 45 },
  { id: 'southern', name: 'Southern seas', test: (lat, lng) => lat <= -10 && lng >= 100 },
  { id: 'arabian', name: 'Arabian Sea & Indian Ocean', test: (lat, lng) => lat < 32 && lat > -45 && lng >= 30 && lng < 100 },
  { id: 'westpac', name: 'West Pacific', test: (lat, lng) => lng >= 100 || lng <= -170 },
  { id: 'atlantic', name: 'Atlantic & Mediterranean', test: (lat, lng) => lng > -30 && lng < 45 },
  { id: 'americas', name: 'Americas', test: () => true },
];
export const regionAt = (lat, lng) => REGIONS.find(r => r.test(lat, lng));
export const regionName = id => REGIONS.find(r => r.id === id)?.name || '';

// Starter city charts for the world map: name, state / region, country, ISO code, lat, lng
export const WORLD_CITIES = [
  ['Pune', 'Maharashtra', 'India', 'IN', 18.5204, 73.8567], ['Mumbai', 'Maharashtra', 'India', 'IN', 19.0728, 72.8826], ['Goa', 'Goa', 'India', 'IN', 15.4909, 73.8278],
  ['Kochi', 'Kerala', 'India', 'IN', 9.9312, 76.2673], ['Chennai', 'Tamil Nadu', 'India', 'IN', 13.0827, 80.2707], ['Kolkata', 'West Bengal', 'India', 'IN', 22.5726, 88.3639],
  ['Visakhapatnam', 'Andhra Pradesh', 'India', 'IN', 17.6868, 83.2185], ['Bengaluru', 'Karnataka', 'India', 'IN', 12.9716, 77.5946], ['Delhi', 'Delhi', 'India', 'IN', 28.6139, 77.209],
  ['Colombo', 'Western Province', 'Sri Lanka', 'LK', 6.9271, 79.8612], ['Malé', 'Kaafu', 'Maldives', 'MV', 4.1755, 73.5093], ['Karachi', 'Sindh', 'Pakistan', 'PK', 24.8607, 67.0011],
  ['Dubai', 'Dubai', 'United Arab Emirates', 'AE', 25.2048, 55.2708], ['Muscat', 'Muscat', 'Oman', 'OM', 23.588, 58.3829], ['Doha', 'Doha', 'Qatar', 'QA', 25.2854, 51.531],
  ['Dhaka', 'Dhaka', 'Bangladesh', 'BD', 23.8103, 90.4125], ['Singapore', '', 'Singapore', 'SG', 1.3521, 103.8198], ['Bangkok', 'Bangkok', 'Thailand', 'TH', 13.7563, 100.5018],
  ['Phuket', 'Phuket', 'Thailand', 'TH', 7.8804, 98.3923], ['Kuala Lumpur', 'Kuala Lumpur', 'Malaysia', 'MY', 3.139, 101.6869], ['Jakarta', 'Jakarta', 'Indonesia', 'ID', -6.2088, 106.8456],
  ['Bali', 'Bali', 'Indonesia', 'ID', -8.6705, 115.2126], ['Manila', 'Metro Manila', 'Philippines', 'PH', 14.5995, 120.9842], ['Ho Chi Minh City', 'Ho Chi Minh City', 'Vietnam', 'VN', 10.8231, 106.6297],
  ['Hong Kong', '', 'Hong Kong', 'HK', 22.3193, 114.1694], ['Shanghai', 'Shanghai', 'China', 'CN', 31.2304, 121.4737], ['Beijing', 'Beijing', 'China', 'CN', 39.9042, 116.4074],
  ['Taipei', 'Taipei', 'Taiwan', 'TW', 25.033, 121.5654], ['Seoul', 'Seoul', 'South Korea', 'KR', 37.5665, 126.978], ['Busan', 'Busan', 'South Korea', 'KR', 35.1796, 129.0756],
  ['Tokyo', 'Tokyo', 'Japan', 'JP', 35.6762, 139.6503], ['Osaka', 'Osaka', 'Japan', 'JP', 34.6937, 135.5023], ['Sapporo', 'Hokkaido', 'Japan', 'JP', 43.0618, 141.3545],
  ['Sydney', 'New South Wales', 'Australia', 'AU', -33.8688, 151.2093], ['Melbourne', 'Victoria', 'Australia', 'AU', -37.8136, 144.9631], ['Perth', 'Western Australia', 'Australia', 'AU', -31.9505, 115.8605],
  ['Brisbane', 'Queensland', 'Australia', 'AU', -27.4698, 153.0251], ['Auckland', 'Auckland', 'New Zealand', 'NZ', -36.8485, 174.7633], ['Honolulu', 'Hawaii', 'United States', 'US', 21.3069, -157.8583],
  ['Cape Town', 'Western Cape', 'South Africa', 'ZA', -33.9249, 18.4241], ['Durban', 'KwaZulu-Natal', 'South Africa', 'ZA', -29.8587, 31.0218], ['Mombasa', 'Mombasa', 'Kenya', 'KE', -4.0435, 39.6682],
  ['Zanzibar', 'Zanzibar', 'Tanzania', 'TZ', -6.1659, 39.2026], ['Lagos', 'Lagos', 'Nigeria', 'NG', 6.5244, 3.3792], ['Dakar', 'Dakar', 'Senegal', 'SN', 14.7167, -17.4677],
  ['Casablanca', 'Casablanca-Settat', 'Morocco', 'MA', 33.5731, -7.5898], ['Alexandria', 'Alexandria', 'Egypt', 'EG', 31.2001, 29.9187], ['Istanbul', 'Istanbul', 'Turkey', 'TR', 41.0082, 28.9784],
  ['Athens', 'Attica', 'Greece', 'GR', 37.9838, 23.7275], ['Naples', 'Campania', 'Italy', 'IT', 40.8518, 14.2681], ['Venice', 'Veneto', 'Italy', 'IT', 45.4408, 12.3155],
  ['Barcelona', 'Catalonia', 'Spain', 'ES', 41.3874, 2.1686], ['Marseille', "Provence-Alpes-Côte d'Azur", 'France', 'FR', 43.2965, 5.3698], ['Lisbon', 'Lisbon', 'Portugal', 'PT', 38.7223, -9.1393],
  ['Paris', 'Île-de-France', 'France', 'FR', 48.8566, 2.3522], ['London', 'England', 'United Kingdom', 'GB', 51.5072, -0.1276], ['Dublin', 'Leinster', 'Ireland', 'IE', 53.3498, -6.2603],
  ['Amsterdam', 'North Holland', 'Netherlands', 'NL', 52.3676, 4.9041], ['Hamburg', 'Hamburg', 'Germany', 'DE', 53.5511, 9.9937], ['Copenhagen', 'Capital Region', 'Denmark', 'DK', 55.6761, 12.5683],
  ['Oslo', 'Oslo', 'Norway', 'NO', 59.9139, 10.7522], ['Bergen', 'Vestland', 'Norway', 'NO', 60.3913, 5.3221], ['Stockholm', 'Stockholm', 'Sweden', 'SE', 59.3293, 18.0686],
  ['Helsinki', 'Uusimaa', 'Finland', 'FI', 60.1699, 24.9384], ['Reykjavík', 'Capital Region', 'Iceland', 'IS', 64.1466, -21.9426], ['New York', 'New York', 'United States', 'US', 40.7128, -74.006],
  ['Boston', 'Massachusetts', 'United States', 'US', 42.3601, -71.0589], ['Miami', 'Florida', 'United States', 'US', 25.7617, -80.1918], ['San Francisco', 'California', 'United States', 'US', 37.7749, -122.4194],
  ['Los Angeles', 'California', 'United States', 'US', 34.0522, -118.2437], ['Seattle', 'Washington', 'United States', 'US', 47.6062, -122.3321], ['Vancouver', 'British Columbia', 'Canada', 'CA', 49.2827, -123.1207],
  ['Halifax', 'Nova Scotia', 'Canada', 'CA', 44.6488, -63.5752], ['Toronto', 'Ontario', 'Canada', 'CA', 43.6532, -79.3832], ['Havana', 'Havana', 'Cuba', 'CU', 23.1136, -82.3666],
  ['Cancún', 'Quintana Roo', 'Mexico', 'MX', 21.1619, -86.8515], ['Panama City', 'Panamá', 'Panama', 'PA', 8.9824, -79.5199], ['Cartagena', 'Bolívar', 'Colombia', 'CO', 10.391, -75.4794],
  ['Lima', 'Lima', 'Peru', 'PE', -12.0464, -77.0428], ['Valparaíso', 'Valparaíso', 'Chile', 'CL', -33.0472, -71.6127], ['Rio de Janeiro', 'Rio de Janeiro', 'Brazil', 'BR', -22.9068, -43.1729],
  ['Buenos Aires', 'Buenos Aires', 'Argentina', 'AR', -34.6037, -58.3816],
].map(([name, region, country, cc, lat, lng]) => ({ name, region, country, cc, lat, lng }));

/** Great-circle distance in km. */
export const kmBetween = (a, b) => { const r = Math.PI / 180, dl = (b.lat - a.lat) * r, dg = (b.lng - a.lng) * r, h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dg / 2) ** 2; return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h))); };
/** Sea-plane fare in coins: about 1 coin per 50 km, at least 2. */
export const fareFor = km => Math.max(2, Math.round(km / 50));
