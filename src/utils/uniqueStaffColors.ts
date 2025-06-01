
import { PREDEFINED_LIGHT_COLORS } from './staffColors';

interface StaffColorAssignment {
  staffId: string;
  color: string;
}

// Track assigned colors to ensure uniqueness
let colorAssignments: StaffColorAssignment[] = [];

export const getUniqueColorForStaff = (staffId: string, existingColor?: string): string => {
  // If staff already has a color assignment, return it
  const existingAssignment = colorAssignments.find(assignment => assignment.staffId === staffId);
  if (existingAssignment) {
    return existingAssignment.color;
  }

  // If existing color is provided and not already used, use it
  if (existingColor && !colorAssignments.some(assignment => assignment.color === existingColor)) {
    colorAssignments.push({ staffId, color: existingColor });
    return existingColor;
  }

  // Find an unused color
  const usedColors = new Set(colorAssignments.map(assignment => assignment.color));
  const availableColors = PREDEFINED_LIGHT_COLORS.filter(color => !usedColors.has(color));

  // If all colors are used, start reusing them but with a slight variation
  let selectedColor: string;
  if (availableColors.length > 0) {
    selectedColor = availableColors[0];
  } else {
    // Generate a slight variation of an existing color
    const baseColor = PREDEFINED_LIGHT_COLORS[colorAssignments.length % PREDEFINED_LIGHT_COLORS.length];
    selectedColor = adjustColorSaturation(baseColor, (colorAssignments.length % 3) * 0.1);
  }

  colorAssignments.push({ staffId, color: selectedColor });
  return selectedColor;
};

// Helper function to adjust color saturation for variations
const adjustColorSaturation = (hexColor: string, adjustment: number): string => {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);

  // Convert to HSL, adjust saturation, convert back
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const diff = max - min;
  const sum = max + min;
  const lightness = sum / 2;

  if (diff === 0) return hexColor; // Grayscale

  const saturation = lightness > 0.5 ? diff / (2 - sum) : diff / sum;
  const newSaturation = Math.max(0, Math.min(1, saturation + adjustment));

  // Convert back to RGB (simplified)
  const adjustedR = Math.round(r + (adjustment * 50));
  const adjustedG = Math.round(g + (adjustment * 30));
  const adjustedB = Math.round(b + (adjustment * 20));

  const clampedR = Math.max(200, Math.min(255, adjustedR));
  const clampedG = Math.max(200, Math.min(255, adjustedG));
  const clampedB = Math.max(200, Math.min(255, adjustedB));

  return `#${clampedR.toString(16).padStart(2, '0')}${clampedG.toString(16).padStart(2, '0')}${clampedB.toString(16).padStart(2, '0')}`;
};

export const resetColorAssignments = () => {
  colorAssignments = [];
};

export const getAllColorAssignments = () => {
  return [...colorAssignments];
};
