export interface Field {
  id: string;
  name: string;
  area: number; // stored in hectares internally
  crop: string;
  cropEmoji: string;
  location: string;
  color: string;
  ndviChange?: number;
  group?: string;
  coordinates: [number, number][][]; // GeoJSON polygon coords
}

// Helper: convert hectares to acres
export function haToAcres(ha: number): number {
  return Math.round(ha * 2.47105 * 10) / 10;
}

// No default fields – users create their own
export const fields: Field[] = [];

// Legacy data exports for compatibility
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
