import React from 'react';
import { ListChecks } from 'lucide-react';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardContent } from '@/components/ui/card';

const MyPageTodos: React.FC = () => {
  return (
    <PageContainer theme="purple">
      <PageHeader
        icon={ListChecks}
        title="Mina todos"
        variant="purple"
        subtitle="Uppgifter tilldelade dig"
      />
      <Card>
        <CardContent className="py-12 text-center">
          <ListChecks className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Din samlade todo-vy kommer snart.</p>
        </CardContent>
      </Card>
    </PageContainer>
  );
};

export default MyPageTodos;
