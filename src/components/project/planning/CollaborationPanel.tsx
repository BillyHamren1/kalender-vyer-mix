import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageSquare, Send, ChevronRight, ChevronLeft, FileText, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface CollaborationPanelProps {
  collapsed: boolean;
  onToggle: () => void;
}

const CollaborationPanel = ({ collapsed, onToggle }: CollaborationPanelProps) => {
  return (
    <div
      className={cn(
        "transition-all duration-300 ease-in-out shrink-0",
        collapsed ? "w-12" : "w-80"
      )}
    >
      {collapsed ? (
        <div className="h-full flex flex-col items-center pt-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="h-9 w-9 rounded-xl"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="mt-4 flex flex-col gap-3 items-center">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <MessageSquare className="h-4 w-4 text-primary" />
            </div>
            <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center">
              <FileText className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center relative">
              <Bell className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        </div>
      ) : (
        <Card className="h-full border-border/50 shadow-sm flex flex-col">
          <CardHeader className="pb-2 px-4 pt-3 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-semibold">Samarbete</CardTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggle}
              className="h-7 w-7 rounded-lg"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </CardHeader>

          <div className="px-4 pb-2">
            <Tabs defaultValue="chat" className="w-full">
              <TabsList className="w-full h-8 p-0.5 bg-muted/50">
                <TabsTrigger value="chat" className="flex-1 text-xs h-7 data-[state=active]:shadow-sm">
                  <MessageSquare className="h-3 w-3 mr-1" />
                  Chatt
                </TabsTrigger>
                <TabsTrigger value="notes" className="flex-1 text-xs h-7 data-[state=active]:shadow-sm">
                  <FileText className="h-3 w-3 mr-1" />
                  Noteringar
                </TabsTrigger>
                <TabsTrigger value="activity" className="flex-1 text-xs h-7 data-[state=active]:shadow-sm">
                  <Bell className="h-3 w-3 mr-1" />
                  Aktivitet
                </TabsTrigger>
              </TabsList>

              <TabsContent value="chat" className="mt-2">
                <div className="flex flex-col h-[calc(100vh-380px)] min-h-[300px]">
                  <div className="flex-1 flex items-center justify-center text-center p-4">
                    <div>
                      <div className="h-12 w-12 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-3">
                        <MessageSquare className="h-6 w-6 text-muted-foreground/50" />
                      </div>
                      <p className="text-sm font-medium text-muted-foreground">Projektchatt</p>
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        Kommunicera med teamet direkt här
                      </p>
                    </div>
                  </div>
                  <div className="border-t border-border/40 pt-3 pb-1">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Skriv ett meddelande..."
                        className="text-sm h-9"
                        disabled
                      />
                      <Button size="icon" className="h-9 w-9 shrink-0" disabled>
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="notes" className="mt-2">
                <div className="flex items-center justify-center h-[calc(100vh-380px)] min-h-[300px] text-center p-4">
                  <div>
                    <div className="h-12 w-12 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-3">
                      <FileText className="h-6 w-6 text-muted-foreground/50" />
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">Projektnoteringar</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      Anteckningar och beslut
                    </p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="activity" className="mt-2">
                <div className="flex items-center justify-center h-[calc(100vh-380px)] min-h-[300px] text-center p-4">
                  <div>
                    <div className="h-12 w-12 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-3">
                      <Bell className="h-6 w-6 text-muted-foreground/50" />
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">Aktivitetslogg</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      Senaste ändringar i projektet
                    </p>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </Card>
      )}
    </div>
  );
};

export default CollaborationPanel;
