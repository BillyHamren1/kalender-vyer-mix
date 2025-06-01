
import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PREDEFINED_LIGHT_COLORS, getContrastTextColor } from '@/utils/staffColors';

interface ColorPickerProps {
  selectedColor: string;
  onColorChange: (color: string) => void;
  staffName?: string;
}

const ColorPicker: React.FC<ColorPickerProps> = ({ 
  selectedColor, 
  onColorChange, 
  staffName = "John Doe" 
}) => {
  return (
    <div className="space-y-4">
      <div className="text-sm font-medium text-gray-700">Välj färg för personal</div>
      
      {/* Color Preview */}
      <Card className="w-full">
        <CardContent className="p-4">
          <div className="text-xs text-gray-500 mb-2">Förhandsvisning:</div>
          <div 
            className="inline-block px-3 py-1 rounded text-xs font-medium border"
            style={{ 
              backgroundColor: selectedColor,
              color: getContrastTextColor(selectedColor),
              borderColor: '#e5e7eb'
            }}
          >
            {staffName}
          </div>
        </CardContent>
      </Card>

      {/* Color Grid */}
      <div className="grid grid-cols-6 gap-2">
        {PREDEFINED_LIGHT_COLORS.map((color) => (
          <Button
            key={color}
            variant="outline"
            size="sm"
            className={`h-8 w-full p-0 border-2 transition-all ${
              selectedColor === color 
                ? 'border-blue-500 ring-2 ring-blue-200' 
                : 'border-gray-200 hover:border-gray-300'
            }`}
            style={{ backgroundColor: color }}
            onClick={() => onColorChange(color)}
            title={`Välj färg: ${color}`}
          >
            {selectedColor === color && (
              <div className="w-3 h-3 rounded-full bg-blue-600"></div>
            )}
          </Button>
        ))}
      </div>
      
      {/* Custom Color Input */}
      <div className="space-y-2">
        <label className="text-xs text-gray-600">Eller ange en anpassad färg:</label>
        <div className="flex gap-2">
          <input
            type="color"
            value={selectedColor}
            onChange={(e) => onColorChange(e.target.value)}
            className="w-12 h-8 rounded border border-gray-300 cursor-pointer"
          />
          <input
            type="text"
            value={selectedColor}
            onChange={(e) => onColorChange(e.target.value)}
            className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded"
            placeholder="#E3F2FD"
          />
        </div>
      </div>
    </div>
  );
};

export default ColorPicker;
