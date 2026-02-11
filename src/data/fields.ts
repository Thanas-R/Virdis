export interface Field {
  id: string;
  name: string;
  area: number;
  crop: string;
  cropEmoji: string;
  location: string;
  color: string;
  ndviChange?: number;
  group?: string;
  coordinates: [number, number][][]; // GeoJSON polygon coords
}

// Fields around Deltebre, Tarragona, Spain
export const fields: Field[] = [
  {
    id: "1",
    name: "Field#1234",
    area: 3.2,
    crop: "Maize",
    cropEmoji: "🌾",
    location: "Deltebre, Tarragona, Espa…",
    color: "#D4A853",
    ndviChange: 0.15,
    group: "Agroloop",
    coordinates: [[
      [0.7180, 40.7230],
      [0.7200, 40.7250],
      [0.7230, 40.7240],
      [0.7210, 40.7215],
      [0.7180, 40.7230],
    ]],
  },
  {
    id: "2",
    name: "Field#2345",
    area: 1.7,
    crop: "Grapes",
    cropEmoji: "🍇",
    location: "Deltebre, Tarragona, Espa…",
    color: "#C75B7A",
    ndviChange: 0.18,
    group: "Agroloop",
    coordinates: [[
      [0.7130, 40.7200],
      [0.7145, 40.7220],
      [0.7170, 40.7210],
      [0.7155, 40.7190],
      [0.7130, 40.7200],
    ]],
  },
  {
    id: "3",
    name: "Field#3456",
    area: 2.8,
    crop: "Sunflower",
    cropEmoji: "🌻",
    location: "Deltebre, Tarragona, Espa…",
    color: "#5BB8C7",
    ndviChange: 0.27,
    group: "Agroloop",
    coordinates: [[
      [0.7240, 40.7240],
      [0.7270, 40.7260],
      [0.7300, 40.7245],
      [0.7280, 40.7225],
      [0.7240, 40.7240],
    ]],
  },
  {
    id: "4",
    name: "Field#4567",
    area: 3.9,
    crop: "Maize",
    cropEmoji: "🌾",
    location: "Deltebre, Tarragona, Espa…",
    color: "#8B9A5B",
    ndviChange: -0.12,
    group: "Agroloop",
    coordinates: [[
      [0.7200, 40.7170],
      [0.7230, 40.7190],
      [0.7270, 40.7180],
      [0.7260, 40.7155],
      [0.7220, 40.7150],
      [0.7200, 40.7170],
    ]],
  },
  {
    id: "5",
    name: "Field#5678",
    area: 1.4,
    crop: "Sunflower",
    cropEmoji: "🌻",
    location: "Deltebre, Tarragona, Espa…",
    color: "#5BB8C7",
    ndviChange: 0.13,
    group: "Agroloop",
    coordinates: [[
      [0.7240, 40.7140],
      [0.7255, 40.7160],
      [0.7280, 40.7150],
      [0.7265, 40.7130],
      [0.7240, 40.7140],
    ]],
  },
  {
    id: "6",
    name: "Field#6789",
    area: 2.5,
    crop: "Apple",
    cropEmoji: "🍏",
    location: "Deltebre, Tarragona, Espa…",
    color: "#7BC75B",
    coordinates: [[
      [0.7140, 40.7140],
      [0.7155, 40.7165],
      [0.7175, 40.7155],
      [0.7160, 40.7130],
      [0.7140, 40.7140],
    ]],
  },
];

// Precipitation data for weather charts
export const accumulatedPrecipitation = [
  { month: "Apr", fiveYearAvg: 10, current: 5, growth: 8 },
  { month: "May", fiveYearAvg: 25, current: 18, growth: 22 },
  { month: "Jun", fiveYearAvg: 40, current: 35, growth: 38 },
  { month: "Jul", fiveYearAvg: 55, current: 70, growth: 50 },
  { month: "Aug", fiveYearAvg: 80, current: 110, growth: 75 },
  { month: "Sep", fiveYearAvg: 120, current: 170, growth: 100 },
  { month: "Oct", fiveYearAvg: 160, current: 225, growth: 140 },
];

export const dailyPrecipitation = [
  { month: "Apr", fiveYearAvg: 2, current: 1 },
  { month: "May", fiveYearAvg: 4, current: 3 },
  { month: "Jun", fiveYearAvg: 3, current: 5 },
  { month: "Jul", fiveYearAvg: 6, current: 15 },
  { month: "Aug", fiveYearAvg: 8, current: 22 },
  { month: "Sep", fiveYearAvg: 5, current: 12 },
  { month: "Oct", fiveYearAvg: 3, current: 4 },
];
