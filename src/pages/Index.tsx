import React from 'react';
import { Link } from 'react-router-dom';
import { Calendar, FolderKanban, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const Index = () => {
  const navigationCards = [
    {
      title: 'Personalplanering',
      icon: Calendar,
      path: '/calendar',
      description: 'Hantera scheman och planering'
    },
    {
      title: 'Projekthantering',
      icon: FolderKanban,
      path: '/projects',
      description: 'Hantera projekt och uppgifter'
    },
    {
      title: 'Personaladministration',
      icon: Users,
      path: '/staff-management',
      description: 'Hantera personal och resurser'
    }
  ];

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-6">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold text-foreground mb-2">EventFlow</h1>
          <p className="text-muted-foreground">Välj ett område att arbeta med</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {navigationCards.map((card) => {
            const Icon = card.icon;
            return (
              <Link key={card.path} to={card.path}>
                <Card className="h-full transition-all duration-200 hover:shadow-lg hover:scale-[1.02] cursor-pointer border-2 hover:border-primary">
                  <CardContent className="flex flex-col items-center justify-center p-8 text-center">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                      <Icon className="w-8 h-8 text-primary" />
                    </div>
                    <h2 className="text-xl font-semibold text-foreground mb-2">{card.title}</h2>
                    <p className="text-sm text-muted-foreground">{card.description}</p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Index;
