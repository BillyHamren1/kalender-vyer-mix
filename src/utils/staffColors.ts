
// Staff color utilities for generating and managing staff colors

export const PREDEFINED_LIGHT_COLORS = [
  '#E3F2FD', // Light Blue
  '#E8F5E8', // Light Green
  '#FFF3E0', // Light Orange
  '#F3E5F5', // Light Purple
  '#E0F2F1', // Light Teal
  '#FFF8E1', // Light Yellow
  '#FCE4EC', // Light Pink
  '#F1F8E9', // Light Lime
  '#FFF3E0', // Light Amber
  '#E8EAF6', // Light Indigo
  '#F3E5F5', // Light Lavender
  '#E0F7FA', // Light Cyan
];

export const generateLightColor = (): string => {
  const colors = PREDEFINED_LIGHT_COLORS;
  return colors[Math.floor(Math.random() * colors.length)];
};

export const getContrastTextColor = (backgroundColor: string): string => {
  // Convert hex to RGB
  const hex = backgroundColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  // Calculate relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  // Return dark text for light backgrounds, light text for dark backgrounds
  return luminance > 0.7 ? '#374151' : '#1F2937';
};

export const adjustColorOpacity = (color: string, opacity: number): string => {
  const hex = color.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};
