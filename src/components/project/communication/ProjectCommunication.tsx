import { useState, useEffect, useRef, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, Users, Truck, User, ListChecks } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import MessageThread from "./MessageThread";
import { useProjectMessages } from "@/hooks/useProjectMessages";
import { useJobChat } from "@/hooks/useJobChat";
import { sendJobMessage } from "@/services/jobChatService";
import { toast } from "sonner";
import type { MergedSupplier } from "@/types/supplier";
import type { ProjectMessage, ProjectMessageType } from "@/types/projectMessage";
import type { JobMessage } from "@/services/jobChatService";

interface ProjectCommunicationProps {
  projectId: string;
  /** Booking id for the project's group chat (job_messages). Required for the Internal tab. */
  bookingId: string | null;
  senderName: string;
  suppliers: MergedSupplier[];
  /** When set, auto-scrolls to internal tab with task reference pre-filled */
  linkedTaskRef?: { taskId: string; taskTitle: string } | null;
  onClearTaskRef?: () => void;
}

/** Adapt a job_messages row into the ProjectMessage shape MessageThread expects. */
const jobMessageToProjectMessage = (m: JobMessage, projectId: string): ProjectMessage => ({
  id: m.id,
  project_id: projectId,
  project_supplier_link_id: null,
  linked_task_id: null,
  type: 'internal',
  message: m.content,
  sender_name: m.sender_name,
  created_at: m.created_at,
});

const tabClass =
  "relative px-4 py-2.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none bg-transparent text-muted-foreground data-[state=active]:text-primary font-medium transition-colors hover:text-foreground text-sm";

const ProjectCommunication = ({ projectId, senderName, suppliers, linkedTaskRef, onClearTaskRef }: ProjectCommunicationProps) => {
  const [activeTab, setActiveTab] = useState<ProjectMessageType>("internal");
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("all");
  const sectionRef = useRef<HTMLDivElement>(null);

  // When a task reference is set, switch to internal tab and scroll into view
  useEffect(() => {
    if (linkedTaskRef) {
      setActiveTab("internal");
      setTimeout(() => {
        sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
  }, [linkedTaskRef]);

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
      project_supplier_link_id: activeTab === "supplier" && selectedSupplierId !== "all"
        ? selectedSupplierId
        : null,
      linked_task_id: linkedTaskRef?.taskId || null,
    });
    // Clear the task reference after sending
    if (linkedTaskRef && onClearTaskRef) {
      onClearTaskRef();
    }
  };

  const confirmedSuppliers = suppliers.filter(s => s.status !== "cancelled");

  return (
    <div ref={sectionRef} className="space-y-4">
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
              {linkedTaskRef && (
                <div className="flex items-center gap-2 px-4 py-2 bg-primary/5 border-b border-border/40">
                  <ListChecks className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="text-xs text-foreground/80 truncate">
                    Refererar till: <span className="font-medium">{linkedTaskRef.taskTitle}</span>
                  </span>
                  {onClearTaskRef && (
                    <button onClick={onClearTaskRef} className="text-xs text-muted-foreground hover:text-foreground ml-auto shrink-0">✕</button>
                  )}
                </div>
              )}
              <MessageThread
                messages={messages}
                isLoading={isLoading}
                isSending={isSending}
                onSend={handleSend}
                emptyText="Inga interna meddelanden ännu. Skriv till ditt team."
                placeholder={linkedTaskRef ? `Kommentera om "${linkedTaskRef.taskTitle}"...` : "Skriv till teamet..."}
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
