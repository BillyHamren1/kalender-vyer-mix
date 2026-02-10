
import React, { useState } from 'react';
import { FileText, Edit2, Save, X } from 'lucide-react';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface InternalNotesProps {
  notes: string;
  bookingId: string;
  isSaving?: boolean;
  onSave: (notes: string) => Promise<void>;
}

export const InternalNotes = ({ notes, bookingId, isSaving = false, onSave }: InternalNotesProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(notes || '');

  const handleEdit = () => {
    setEditValue(notes || '');
    setIsEditing(true);
  };

  const handleSave = async () => {
    try {
      await onSave(editValue);
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving internal notes:', error);
    }
  };

  const handleCancel = () => {
    setEditValue(notes || '');
    setIsEditing(false);
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-1.5 text-base">
            <FileText className="h-4 w-4" />
            <span>Interna anteckningar</span>
          </CardTitle>
          {!isEditing && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleEdit}
              className="h-7 w-7 p-0"
            >
              <Edit2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0 px-4 pb-3">
        {isEditing ? (
          <div className="space-y-2">
            <Textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              placeholder="Lägg till interna anteckningar här..."
              className="min-h-[100px] text-sm"
              disabled={isSaving}
            />
            <div className="flex gap-2">
              <Button
                onClick={handleSave}
                size="sm"
                disabled={isSaving}
                className="h-7"
              >
                <Save className="h-3 w-3 mr-1" />
                {isSaving ? 'Sparar...' : 'Spara'}
              </Button>
              <Button
                onClick={handleCancel}
                variant="ghost"
                size="sm"
                disabled={isSaving}
                className="h-7"
              >
                <X className="h-3 w-3 mr-1" />
                Avbryt
              </Button>
            </div>
          </div>
        ) : (
          <div 
            className={`text-sm cursor-pointer rounded p-2 transition-colors ${
              notes ? 'text-gray-700' : 'text-gray-400 italic hover:bg-gray-50'
            }`}
            onClick={handleEdit}
          >
            {notes ? (
              <p className="whitespace-pre-wrap">{notes}</p>
            ) : (
              <p>Klicka för att lägga till anteckningar...</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
