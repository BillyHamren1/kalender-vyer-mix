import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, Users, Truck, User } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import MessageThread from "./MessageThread";
import { useProjectMessages } from "@/hooks/useProjectMessages";
import type { MergedSupplier } from "@/types/supplier";
import type { ProjectMessageType } from "@/types/projectMessage";

interface ProjectCommunicationProps {
  projectId: string;
  senderName: string;
  suppliers: MergedSupplier[];
}

const tabClass =
  "relative px-4 py-2.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none bg-transparent text-muted-foreground data-[state=active]:text-primary font-medium transition-colors hover:text-foreground text-sm";

const ProjectCommunication = ({ projectId, senderName, suppliers }: ProjectCommunicationProps) => {
  const [activeTab, setActiveTab] = useState<ProjectMessageType>("internal");
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("all");

  const supplierFilter = activeTab === "supplier" && selectedSupplierId !== "all"
    ? selectedSupplierId
    : undefined;

  const { messages, isLoading, sendMessage, isSending } = useProjectMessages(
    projectId,
    activeTab,
    supplierFilter
  );

  const handleSend = (text: string) => {
    sendMessage({
      project_id: projectId,
      type: activeTab,
      message: text,
      sender_name: senderName,
      related_supplier_id: activeTab === "supplier" && selectedSupplierId !== "all"
        ? selectedSupplierId
        : null,
    });
  };

  const confirmedSuppliers = suppliers.filter(s => s.status !== "cancelled");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-primary/10">
          <MessageSquare className="h-4 w-4 text-primary" />
        </div>
        <h2 className="text-base font-semibold text-foreground tracking-tight">Kommunikation</h2>
      </div>

      <div className="border border-border/40 rounded-xl bg-card overflow-hidden">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ProjectMessageType)}>
          <div className="border-b border-border/40 flex items-center justify-between px-2">
            <TabsList className="h-auto p-0 bg-transparent gap-0">
              <TabsTrigger value="internal" className={tabClass}>
                <Users className="h-3.5 w-3.5 mr-1.5" />
                Internt
              </TabsTrigger>
              <TabsTrigger value="supplier" className={tabClass}>
                <Truck className="h-3.5 w-3.5 mr-1.5" />
                Leverantörer
              </TabsTrigger>
              <TabsTrigger value="client" className={tabClass}>
                <User className="h-3.5 w-3.5 mr-1.5" />
                Kund
              </TabsTrigger>
            </TabsList>

            {/* Supplier filter */}
            {activeTab === "supplier" && confirmedSuppliers.length > 0 && (
              <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId}>
                <SelectTrigger className="h-8 w-[180px] text-xs rounded-lg mr-2">
                  <SelectValue placeholder="Alla leverantörer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alla leverantörer</SelectItem>
                  {confirmedSuppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}{s.service_type ? ` (${s.service_type})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="h-[400px]">
            <TabsContent value="internal" className="h-full m-0">
              <MessageThread
                messages={messages}
                isLoading={isLoading}
                isSending={isSending}
                onSend={handleSend}
                emptyText="Inga interna meddelanden ännu. Skriv till ditt team."
                placeholder="Skriv till teamet..."
              />
            </TabsContent>
            <TabsContent value="supplier" className="h-full m-0">
              <MessageThread
                messages={messages}
                isLoading={isLoading}
                isSending={isSending}
                onSend={handleSend}
                emptyText={
                  confirmedSuppliers.length === 0
                    ? "Lägg till underleverantörer för att starta kommunikation."
                    : "Inga meddelanden med leverantörer ännu."
                }
                placeholder="Skriv till leverantör..."
              />
            </TabsContent>
            <TabsContent value="client" className="h-full m-0">
              <MessageThread
                messages={messages}
                isLoading={isLoading}
                isSending={isSending}
                onSend={handleSend}
                emptyText="Ingen kundkommunikation loggad ännu."
                placeholder="Logga kundkommunikation..."
              />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
};

export default ProjectCommunication;
