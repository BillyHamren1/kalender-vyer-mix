import React from 'react';
import { Sparkles } from 'lucide-react';

const Index = () => {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-6 shadow-lg">
          <Sparkles className="w-8 h-8 text-primary-foreground" />
        </div>
        <h1 className="text-3xl font-bold text-foreground mb-2">Välkommen till EventFlow</h1>
        <p className="text-muted-foreground">Välj ett område i menyn till vänster för att börja</p>
      </div>
    </div>
  );
};

export default Index;
