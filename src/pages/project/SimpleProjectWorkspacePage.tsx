import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, Check, Circle, Mail, Plus, Save, Send, StickyNote, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AddSupplierDialog from "@/components/project/suppliers/AddSupplierDialog";
import BookingInfoExpanded from "@/components/project/BookingInfoExpanded";
import ProjectFiles from "@/components/project/ProjectFiles";
import { useProjectSuppliers } from "@/hooks/useProjectSuppliers";
import { useSupplierRequests } from "@/hooks/useSupplierRequests";
import {
  createProjectTask,
  deleteProjectFile,
  deleteProjectTask,
  fetchBookingAttachments,
  fetchProject,
  fetchProjectFiles,
  fetchProjectTasks,
  updateProjectTask,
  uploadProjectFile,
} from "@/services/projectService";
import { fetchSupplierRequestThreads, saveSimpleProjectNotes, SIMPLE_SUPPLIER_STATUS, SIMPLE_THREAD_STATUS } from "@/services/simpleProjectWorkspaceService";
import type { MergedSupplier } from "@/types/supplier";

const formatDate = (value?: string | null) => value ? new Intl.DateTimeFormat("sv-SE").format(new Date(value)) : "Ej angivet";

export default function SimpleProjectWorkspacePage() {
  const { projectId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [newTodo, setNewTodo] = useState("");
  const [notes, setNotes] = useState<string | null>(null);
  const [addSupplierOpen, setAddSupplierOpen] = useState(false);
  const [requestSupplier, setRequestSupplier] = useState<MergedSupplier | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const { sendSupplierRequest, isSending } = useSupplierRequests();

  const projectQuery = useQuery({ queryKey: ["simple-project", projectId], queryFn: () => fetchProject(projectId), enabled: !!projectId });
  const tasksQuery = useQuery({ queryKey: ["simple-project-tasks", projectId], queryFn: () => fetchProjectTasks(projectId), enabled: !!projectId });
  const filesQuery = useQuery({ queryKey: ["project-files", projectId], queryFn: () => fetchProjectFiles(projectId), enabled: !!projectId });
  const threadsQuery = useQuery({ queryKey: ["supplier-request-threads", projectId], queryFn: () => fetchSupplierRequestThreads(projectId), enabled: !!projectId });
  const { suppliers, isLoading: suppliersLoading, addSupplier } = useProjectSuppliers(projectId);
  const project = projectQuery.data;
  const booking = project?.booking;
  const bookingId = project?.booking_id || booking?.id || null;
  const attachmentsQuery = useQuery({ queryKey: ["booking-attachments", bookingId], queryFn: () => fetchBookingAttachments(bookingId!), enabled: !!bookingId });
  const currentNotes = notes ?? booking?.internalnotes ?? project?.internalnotes ?? "";

  const fileMutation = useMutation({
    mutationFn: (action: { type: "upload"; file: File } | { type: "delete"; id: string; url: string }) =>
      action.type === "upload" ? uploadProjectFile(projectId, action.file) : deleteProjectFile(action.id, action.url),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project-files", projectId] }),
    onError: () => toast.error("Kunde inte uppdatera projektets filer"),
  });

  const taskMutation = useMutation({
    mutationFn: async (action: { type: "add"; title: string } | { type: "toggle"; id: string; completed: boolean } | { type: "delete"; id: string }) => {
      if (action.type === "add") return createProjectTask({ project_id: projectId, title: action.title });
      if (action.type === "toggle") return updateProjectTask(action.id, { completed: action.completed });
      return deleteProjectTask(action.id);
    },
    onSuccess: () => { setNewTodo(""); queryClient.invalidateQueries({ queryKey: ["simple-project-tasks", projectId] }); },
    onError: () => toast.error("Kunde inte spara uppgiften"),
  });
  const notesMutation = useMutation({
    mutationFn: () => saveSimpleProjectNotes(projectId, bookingId, currentNotes),
    onSuccess: () => { toast.success(bookingId ? "Anteckningen är sparad på bokningen" : "Anteckningen är sparad på projektet"); queryClient.invalidateQueries({ queryKey: ["simple-project", projectId] }); },
    onError: () => toast.error("Kunde inte spara anteckningen"),
  });

  const openRequest = (supplier: MergedSupplier) => {
    setRequestSupplier(supplier);
    setSubject(`Förfrågan – ${booking?.booking_number || project?.name || "bokning"}`);
    setMessage(`Vi vill gärna be om besked och offert för ${supplier.service_type || "er leverans"}.\n\nDatum: ${formatDate(booking?.eventdate || project?.eventdate)}\nPlats: ${booking?.deliveryaddress || project?.deliveryaddress || "Ej angiven"}`);
  };
  const sendRequest = async () => {
    if (!requestSupplier) return;
    const ok = await sendSupplierRequest({ projectSupplierLinkId: requestSupplier.link_id, subject, message });
    if (ok) {
      setRequestSupplier(null);
      queryClient.invalidateQueries({ queryKey: ["supplier-request-threads", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-supplier-links", projectId] });
    }
  };

  const timeline = useMemo(() => threadsQuery.data ?? [], [threadsQuery.data]);
  if (projectQuery.isLoading) return <div className="p-8 text-muted-foreground">Laddar projekt…</div>;
  if (!project) return <div className="p-8"><p>Projektet hittades inte.</p><Button className="mt-4" onClick={() => navigate("/projects")}>Till projekt</Button></div>;

  const displayBooking = booking || {
    id: project.id,
    client: project.client || "Internt projekt",
    eventdate: project.eventdate,
    rigdaydate: project.rigdaydate,
    rigdowndate: project.rigdowndate,
    deliveryaddress: project.deliveryaddress,
    delivery_city: project.delivery_city,
    delivery_postal_code: project.delivery_postal_code,
    contact_name: project.contact_name,
    contact_phone: project.contact_phone,
    contact_email: project.contact_email,
    booking_number: null,
    carry_more_than_10m: null,
    ground_nails_allowed: null,
    exact_time_needed: null,
    exact_time_info: null,
    rental_only: false,
    internalnotes: project.internalnotes,
  };

  return (
    <div className="theme-purple min-h-full overflow-y-auto" style={{ background: "var(--gradient-page)" }}>
      <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        <header className="rounded-2xl border border-primary/30 bg-primary p-5 text-primary-foreground shadow-lg shadow-primary/15">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><Button variant="ghost" size="sm" className="-ml-2 mb-2 text-primary-foreground hover:bg-white/15 hover:text-primary-foreground" onClick={() => navigate("/projects")}><ArrowLeft className="mr-2 h-4 w-4" />Alla projekt</Button><h1 className="text-2xl font-semibold">{project.name}</h1><p className="mt-1 text-sm text-primary-foreground/75">{booking?.booking_number ? `Bokning ${booking.booking_number} · ` : ""}{booking?.client || project.client || "Internt projekt"}</p></div>
            <Button variant="outline" className="border-white/30 bg-white/10 text-primary-foreground hover:bg-white/20 hover:text-primary-foreground" onClick={() => navigate("/calendar")}><CalendarDays className="mr-2 h-4 w-4" />Personal i kalendern</Button>
          </div>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3"><div><span className="text-primary-foreground/65">Event</span><div className="font-medium">{formatDate(booking?.eventdate || project.eventdate)}</div></div><div><span className="text-primary-foreground/65">Plats</span><div className="font-medium">{booking?.deliveryaddress || project.deliveryaddress || "Ej angiven"}</div></div><div><span className="text-primary-foreground/65">Kontakt</span><div className="font-medium">{booking?.contact_name || project.contact_name || "Ej angiven"}</div></div></div>
        </header>

        <Tabs defaultValue="booking" className="space-y-5">
          <TabsList className="grid h-auto w-full grid-cols-2 rounded-xl border border-primary/20 bg-primary/10 p-1">
            <TabsTrigger value="booking" className="py-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Bokningsinformation</TabsTrigger>
            <TabsTrigger value="planning" className="py-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Projektplanering</TabsTrigger>
          </TabsList>

          <TabsContent value="booking" className="mt-0 space-y-5">
            <section aria-labelledby="booking-core-heading" className="space-y-3">
              <div><h2 id="booking-core-heading" className="text-lg font-semibold">Bokning och leverans</h2><p className="text-sm text-muted-foreground">Adress, kontakt, datum, markspik och allt som ska levereras.</p></div>
              <BookingInfoExpanded booking={displayBooking} projectLeader={project.project_leader} bookingAttachments={attachmentsQuery.data || []} showProductsHeading />
            </section>
            <Card><CardHeader><CardTitle className="flex items-center gap-2"><StickyNote className="h-5 w-5" />Interninformation</CardTitle></CardHeader><CardContent className="space-y-3"><Textarea rows={7} value={currentNotes} onChange={(event) => setNotes(event.target.value)} placeholder="Det teamet behöver veta om bokningen…" /><div className="flex justify-end"><Button onClick={() => notesMutation.mutate()} disabled={notesMutation.isPending}><Save className="mr-2 h-4 w-4" />Spara</Button></div></CardContent></Card>
            <ProjectFiles files={filesQuery.data || []} bookingAttachments={attachmentsQuery.data || []} isUploading={fileMutation.isPending} onUpload={({ file }) => fileMutation.mutate({ type: "upload", file })} onDelete={({ id, url }) => fileMutation.mutate({ type: "delete", id, url })} />
          </TabsContent>

          <TabsContent value="planning" className="mt-0">
            <main className="grid gap-5 lg:grid-cols-2">
              <Card><CardHeader><CardTitle className="flex items-center gap-2"><Check className="h-5 w-5" />Att göra</CardTitle></CardHeader><CardContent className="space-y-3">
                <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (newTodo.trim()) taskMutation.mutate({ type: "add", title: newTodo.trim() }); }}><Input aria-label="Ny uppgift" value={newTodo} onChange={(event) => setNewTodo(event.target.value)} placeholder="Lägg till en enkel uppgift…" /><Button type="submit" disabled={!newTodo.trim() || taskMutation.isPending}><Plus className="h-4 w-4" /></Button></form>
                {tasksQuery.data?.length ? tasksQuery.data.map((task) => <div key={task.id} className="group flex items-center gap-3 rounded-lg border p-3"><button aria-label={task.completed ? "Markera som ej klar" : "Markera som klar"} onClick={() => taskMutation.mutate({ type: "toggle", id: task.id, completed: !task.completed })}>{task.completed ? <Check className="h-5 w-5 text-emerald-600" /> : <Circle className="h-5 w-5 text-muted-foreground" />}</button><span className={`flex-1 text-sm ${task.completed ? "text-muted-foreground line-through" : ""}`}>{task.title}</span>{task.deadline && <span className="text-xs text-muted-foreground">{formatDate(task.deadline)}</span>}<Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100" onClick={() => taskMutation.mutate({ type: "delete", id: task.id })}>Ta bort</Button></div>) : <p className="py-6 text-center text-sm text-muted-foreground">Inga uppgifter ännu.</p>}
              </CardContent></Card>
              <Card><CardHeader className="flex-row items-center justify-between"><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Leverantörer</CardTitle><Button size="sm" variant="outline" onClick={() => setAddSupplierOpen(true)}><Plus className="mr-2 h-4 w-4" />Lägg till</Button></CardHeader><CardContent className="space-y-3">
                {suppliersLoading ? <p className="text-sm text-muted-foreground">Laddar…</p> : suppliers.length ? suppliers.map((supplier) => <div key={supplier.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><div><div className="font-medium">{supplier.name}</div><div className="text-xs text-muted-foreground">{supplier.service_type || "Leverantör"} · {supplier.email || "E-post saknas"}</div></div><div className="flex items-center gap-2"><Badge variant="secondary">{SIMPLE_SUPPLIER_STATUS[supplier.status]}</Badge><Button size="sm" onClick={() => openRequest(supplier)} disabled={!supplier.email}><Mail className="mr-2 h-4 w-4" />Förfrågan</Button></div></div>) : <p className="py-6 text-center text-sm text-muted-foreground">Inga leverantörer kopplade ännu.</p>}
              </CardContent></Card>
              <Card className="lg:col-span-2"><CardHeader><CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" />Leverantörsdialog</CardTitle></CardHeader><CardContent className="space-y-3">
                {timeline.length ? timeline.map((item) => <div key={item.id} className="rounded-lg border p-3 text-sm"><div className="flex justify-between gap-3"><span className="font-medium">{item.subject}</span><Badge variant="outline">{SIMPLE_THREAD_STATUS[item.status] || item.status}</Badge></div><div className="mt-1 text-xs text-muted-foreground">{item.recipient_name || item.recipient_email} · {formatDate(item.responded_at || item.sent_at || item.created_at)}</div>{item.response_message && <p className="mt-2 rounded bg-muted p-2">{item.response_message}</p>}</div>) : <p className="py-6 text-center text-sm text-muted-foreground">Skickade förfrågningar och svar visas här.</p>}
              </CardContent></Card>
            </main>
          </TabsContent>
        </Tabs>
      </div>

      <AddSupplierDialog open={addSupplierOpen} onOpenChange={setAddSupplierOpen} onAdd={addSupplier} projectId={projectId} />
      <Dialog open={!!requestSupplier} onOpenChange={(open) => !open && setRequestSupplier(null)}><DialogContent><DialogHeader><DialogTitle>Skicka förfrågan till {requestSupplier?.name}</DialogTitle></DialogHeader><div className="space-y-4"><div><Label>Ämne</Label><Input value={subject} onChange={(event) => setSubject(event.target.value)} /></div><div><Label>Meddelande</Label><Textarea rows={9} value={message} onChange={(event) => setMessage(event.target.value)} /></div><p className="text-xs text-muted-foreground">Mejlet skickas från din organisations verifierade Planning-adress. Svaret sparas automatiskt på bokningen.</p></div><DialogFooter><Button variant="outline" onClick={() => setRequestSupplier(null)}>Avbryt</Button><Button onClick={sendRequest} disabled={!subject.trim() || !message.trim() || isSending}><Send className="mr-2 h-4 w-4" />{isSending ? "Skickar…" : "Skicka"}</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
