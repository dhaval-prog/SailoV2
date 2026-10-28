// Starter Pune localities with their real-world coordinates (WGS84). They seed the map
// before live data arrives (and offline). Live data from Mapbox / OpenStreetMap
// replaces these positions when it loads, and adds every other locality it finds.
// Each row: name, latitude, longitude, part of the city, major (shown from zoom level 2).

export const SEED_REGIONS = [
  // level 1: the two cities by their civic centres; the four parts of Pune sit at the
  // centre of their own localities (worked out in geo.js)
  { name: 'Pune', lat: 18.5204, lng: 73.8567 },
  { name: 'Pimpri-Chinchwad', lat: 18.6298, lng: 73.7997 },
];

export const SEED = [
  // East Pune
  ['Hadapsar', 18.5089, 73.9260, 'East', 1], ['Magarpatta City', 18.5157, 73.9294, 'East', 0], ['Amanora Park Town', 18.5186, 73.9420, 'East', 0],
  ['Keshav Nagar', 18.5310, 73.9460, 'East', 0], ['Mundhwa', 18.5332, 73.9300, 'East', 0], ['Kharadi', 18.5515, 73.9410, 'East', 1],
  ['Chandan Nagar', 18.5640, 73.9330, 'East', 0], ['Viman Nagar', 18.5679, 73.9143, 'East', 1], ['Wadgaon Sheri', 18.5530, 73.9230, 'East', 0],
  ['Kalyani Nagar', 18.5463, 73.9033, 'East', 1], ['Yerawada', 18.5530, 73.8860, 'East', 1], ['Vishrantwadi', 18.5760, 73.8780, 'East', 0],
  ['Dhanori', 18.5910, 73.8990, 'East', 0], ['Lohegaon', 18.5990, 73.9300, 'East', 1], ['Wagholi', 18.5808, 73.9787, 'East', 1],
  ['Manjari', 18.5050, 73.9700, 'East', 0], ['Mundhwa-Keshav Nagar', 18.5355, 73.9395, 'East', 0], ['Sade Satra Nali', 18.5120, 73.9530, 'East', 0],
  // Central Pune
  ['Shivajinagar', 18.5308, 73.8475, 'Central', 1], ['Deccan Gymkhana', 18.5167, 73.8414, 'Central', 1], ['FC Road', 18.5236, 73.8410, 'Central', 0],
  ['JM Road', 18.5205, 73.8475, 'Central', 0], ['Camp', 18.5150, 73.8780, 'Central', 1], ['Pune Station', 18.5286, 73.8743, 'Central', 1],
  ['Koregaon Park', 18.5362, 73.8940, 'Central', 1], ['Bund Garden', 18.5390, 73.8820, 'Central', 0], ['Swargate', 18.5018, 73.8636, 'Central', 1],
  ['Sadashiv Peth', 18.5100, 73.8500, 'Central', 0], ['Shaniwar Peth', 18.5195, 73.8540, 'Central', 0], ['Narayan Peth', 18.5160, 73.8520, 'Central', 0],
  ['Kasba Peth', 18.5210, 73.8590, 'Central', 0], ['Rasta Peth', 18.5180, 73.8670, 'Central', 0], ['Nana Peth', 18.5130, 73.8680, 'Central', 0],
  ['Bhawani Peth', 18.5080, 73.8680, 'Central', 0], ['Raviwar Peth', 18.5140, 73.8600, 'Central', 0], ['Ghorpadi', 18.5190, 73.8990, 'Central', 0],
  // West Pune
  ['Kothrud', 18.5074, 73.8077, 'West', 1], ['Karve Nagar', 18.4900, 73.8180, 'West', 0], ['Warje', 18.4850, 73.8000, 'West', 1],
  ['Bavdhan', 18.5150, 73.7800, 'West', 0], ['Baner', 18.5590, 73.7868, 'West', 1], ['Balewadi', 18.5760, 73.7790, 'West', 0],
  ['Aundh', 18.5580, 73.8075, 'West', 1], ['Pashan', 18.5400, 73.7950, 'West', 0], ['Sus', 18.5450, 73.7500, 'West', 0],
  ['Mahalunge', 18.5700, 73.7550, 'West', 0], ['Wakad', 18.5990, 73.7620, 'West', 1], ['Hinjewadi', 18.5913, 73.7389, 'West', 1],
  ['Tathawade', 18.6170, 73.7480, 'West', 0], ['Pimple Saudagar', 18.5990, 73.7980, 'West', 1], ['Pimple Nilakh', 18.5800, 73.7880, 'West', 0],
  ['Pimple Gurav', 18.5900, 73.8130, 'West', 0],
  // South Pune
  ['Katraj', 18.4529, 73.8652, 'South', 1], ['Kondhwa', 18.4770, 73.8900, 'South', 1], ['NIBM Road', 18.4800, 73.9050, 'South', 0],
  ['Wanowrie', 18.4930, 73.9000, 'South', 1], ['Fatima Nagar', 18.5020, 73.9000, 'South', 0], ['Bibwewadi', 18.4750, 73.8650, 'South', 1],
  ['Dhankawadi', 18.4600, 73.8550, 'South', 0], ['Ambegaon', 18.4560, 73.8370, 'South', 0], ['Narhe', 18.4500, 73.8200, 'South', 0],
  ['Sinhagad Road', 18.4800, 73.8250, 'South', 1], ['Anand Nagar', 18.4870, 73.8290, 'South', 0], ['Vadgaon Budruk', 18.4650, 73.8250, 'South', 0],
  ['Undri', 18.4590, 73.9170, 'South', 1], ['Mohammadwadi', 18.4780, 73.9250, 'South', 0], ['Pisoli', 18.4500, 73.9050, 'South', 0],
  ['Yewalewadi', 18.4480, 73.8890, 'South', 0],
  // North Pune
  ['Khadki', 18.5640, 73.8460, 'North', 1], ['Bopodi', 18.5700, 73.8330, 'North', 0], ['Dapodi', 18.5830, 73.8300, 'North', 0],
  ['Pimpri', 18.6279, 73.8009, 'North', 1], ['Chinchwad', 18.6440, 73.7900, 'North', 1], ['Akurdi', 18.6480, 73.7700, 'North', 0],
  ['Nigdi', 18.6510, 73.7630, 'North', 1], ['Bhosari', 18.6300, 73.8480, 'North', 1], ['Moshi', 18.6730, 73.8500, 'North', 1],
  ['Chikhali', 18.6800, 73.8150, 'North', 0], ['Charholi', 18.6400, 73.8950, 'North', 0], ['Dighi', 18.6150, 73.8730, 'North', 0],
  ['Alandi Road', 18.6000, 73.8700, 'North', 0],
];
