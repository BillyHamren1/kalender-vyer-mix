import { useState } from "react";
import PageShell from "@/components/layout/PageShell";
import DataSectionCard from "@/components/shared/DataSectionCard";
import StatusBadge from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// =============================================
// Types
// =============================================

interface EndpointDoc {
  id: string;
  method: "POST" | "GET";
  name: string;
  path: string;
  description: string;
  auth: boolean;
  requestBody?: FieldDoc[];
  responseBody: FieldDoc[];
  errorCodes: ErrorCode[];
  example: { request?: string; response: string };
}

interface FieldDoc {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

interface ErrorCode {
  code: number;
  meaning: string;
}

// =============================================
// Endpoint data
// =============================================

const ENDPOINTS: EndpointDoc[] = [
  {
    id: "create-session",
    method: "POST",
    name: "create-site-scan-session",
    path: "/functions/v1/create-site-scan-session",
    description: "Skapar en ny upload-session och en tillhörande scan. Anropas av native-appen när ett scanningspass startar.",
    auth: true,
    requestBody: [
      { name: "title", type: "string", required: true, description: "Scan-titel, max 255 tecken" },
      { name: "description", type: "string", required: false, description: "Beskrivning, max 2000 tecken" },
      { name: "scan_type", type: "string", required: false, description: "T.ex. lidar_terrain, photogrammetry" },
      { name: "device_platform", type: "string", required: false, description: "T.ex. iOS" },
      { name: "device_model", type: "string", required: false, description: "T.ex. iPhone 15 Pro" },
      { name: "app_version", type: "string", required: false, description: "T.ex. 1.2.0" },
      { name: "metadata", type: "object", required: false, description: "Fritt JSON-objekt med extra info" },
    ],
    responseBody: [
      { name: "ok", type: "boolean", required: true, description: "true vid lyckad operation" },
      { name: "session_id", type: "uuid", required: true, description: "Sessionens ID" },
      { name: "session_token", type: "string", required: true, description: "Token för efterföljande anrop" },
      { name: "site_scan_id", type: "uuid", required: true, description: "Scanens ID" },
      { name: "status", type: "string", required: true, description: "Scanens initialstatus (draft)" },
      { name: "allowed_asset_types", type: "string[]", required: true, description: "Tillåtna asset-kategorier" },
      { name: "next_step", type: "string", required: true, description: "upload_assets" },
    ],
    errorCodes: [
      { code: 400, meaning: "Ogiltig JSON" },
      { code: 401, meaning: "Saknad eller ogiltig auth-token" },
      { code: 405, meaning: "Fel HTTP-metod (använd POST)" },
      { code: 422, meaning: "Valideringsfel (t.ex. title saknas)" },
      { code: 500, meaning: "Internt serverfel" },
    ],
    example: {
      request: `{
  "title": "Tomtskanning Storgatan 12",
  "scan_type": "lidar_terrain",
  "device_platform": "iOS",
  "device_model": "iPhone 15 Pro",
  "app_version": "1.2.0",
  "metadata": { "project_id": "abc-123" }
}`,
      response: `{
  "ok": true,
  "session_id": "a1b2c3d4-...",
  "session_token": "Xk9mPq2w-AbCd-...",
  "site_scan_id": "e5f6g7h8-...",
  "status": "draft",
  "allowed_asset_types": [
    "raw_session_json", "point_cloud", "mesh",
    "preview_image", "heightmap", "metadata_json"
  ],
  "next_step": "upload_assets"
}`,
    },
  },
  {
    id: "register-asset",
    method: "POST",
    name: "register-site-scan-asset",
    path: "/functions/v1/register-site-scan-asset",
    description: "Registrerar en uppladdad fil i databasen. Anropas efter att filen redan laddats upp till rätt storage bucket.",
    auth: true,
    requestBody: [
      { name: "session_token", type: "string", required: true, description: "Token från create-session" },
      { name: "site_scan_id", type: "uuid", required: true, description: "Scan-ID" },
      { name: "asset_type", type: "string", required: true, description: "En av: raw_session_json, point_cloud, mesh, preview_image, heightmap, metadata_json" },
      { name: "storage_bucket", type: "string", required: true, description: "Bucket-namn (site-scan-raw, site-scan-processed, site-scan-preview)" },
      { name: "storage_path", type: "string", required: true, description: "Sökväg: {scan_id}/{category}/{file_name}" },
      { name: "file_name", type: "string", required: true, description: "Originalfilnamn" },
      { name: "mime_type", type: "string", required: true, description: "MIME-typ, valideras mot asset_type" },
      { name: "file_size", type: "integer", required: true, description: "Filstorlek i bytes, max 500 MB" },
      { name: "checksum", type: "string", required: true, description: "SHA-256 eller liknande" },
    ],
    responseBody: [
      { name: "ok", type: "boolean", required: true, description: "true vid lyckad registrering" },
      { name: "asset_id", type: "uuid", required: true, description: "Asset-postens ID" },
      { name: "site_scan_id", type: "uuid", required: true, description: "Scanens ID" },
      { name: "asset_type", type: "string", required: true, description: "Den angivna typen" },
      { name: "db_asset_type", type: "string", required: true, description: "Mappat DB enum-värde" },
      { name: "status", type: "string", required: true, description: "registered" },
    ],
    errorCodes: [
      { code: 401, meaning: "Ogiltig auth-token" },
      { code: 404, meaning: "Session eller scan hittades inte" },
      { code: 409, meaning: "Duplikat (samma bucket+path), session ej aktiv, scan arkiverad" },
      { code: 422, meaning: "Valideringsfel (felaktig typ, MIME, bucket-mismatch)" },
      { code: 500, meaning: "Internt serverfel" },
    ],
    example: {
      request: `{
  "session_token": "Xk9mPq2w-AbCd-...",
  "site_scan_id": "e5f6g7h8-...",
  "asset_type": "raw_session_json",
  "storage_bucket": "site-scan-raw",
  "storage_path": "e5f6g7h8-.../raw/scan_data.json",
  "file_name": "scan_data.json",
  "mime_type": "application/json",
  "file_size": 2048576,
  "checksum": "sha256:abc123..."
}`,
      response: `{
  "ok": true,
  "asset_id": "f1a2b3c4-...",
  "site_scan_id": "e5f6g7h8-...",
  "asset_type": "raw_session_json",
  "db_asset_type": "raw_payload",
  "status": "registered"
}`,
    },
  },
  {
    id: "finalize",
    method: "POST",
    name: "finalize-site-scan-upload",
    path: "/functions/v1/finalize-site-scan-upload",
    description: "Avslutar upload-sessionen. Verifierar assets, uppdaterar status och skapar processing-jobb om möjligt.",
    auth: true,
    requestBody: [
      { name: "session_token", type: "string", required: true, description: "Token från create-session" },
      { name: "site_scan_id", type: "uuid", required: true, description: "Scan-ID" },
    ],
    responseBody: [
      { name: "ok", type: "boolean", required: true, description: "true vid lyckad finalisering" },
      { name: "site_scan_id", type: "uuid", required: true, description: "Scanens ID" },
      { name: "session_id", type: "uuid", required: true, description: "Sessionens ID" },
      { name: "current_status", type: "string", required: true, description: "uploaded" },
      { name: "asset_summary", type: "object", required: true, description: "Antal, storlek, has_raw_data, has_preview etc." },
      { name: "ready_for_processing", type: "boolean", required: true, description: "Om raw data finns" },
      { name: "processing_job_id", type: "uuid|null", required: true, description: "ID om jobb skapades" },
      { name: "next_step", type: "string", required: true, description: "processing_queued eller awaiting_manual_review" },
      { name: "warnings", type: "string[]", required: false, description: "Varningar om saknad data" },
    ],
    errorCodes: [
      { code: 401, meaning: "Ogiltig auth-token" },
      { code: 404, meaning: "Session eller scan hittades inte" },
      { code: 409, meaning: "Session redan slutförd, scan redan finaliserad/arkiverad" },
      { code: 422, meaning: "Inga assets registrerade" },
      { code: 500, meaning: "Internt serverfel" },
    ],
    example: {
      request: `{
  "session_token": "Xk9mPq2w-AbCd-...",
  "site_scan_id": "e5f6g7h8-..."
}`,
      response: `{
  "ok": true,
  "site_scan_id": "e5f6g7h8-...",
  "session_id": "a1b2c3d4-...",
  "current_status": "uploaded",
  "asset_summary": {
    "total_assets": 3,
    "total_size_bytes": 15728640,
    "counts_by_type": { "raw_payload": 1, "preview_image": 1, "other": 1 },
    "has_raw_data": true,
    "has_preview": true
  },
  "ready_for_processing": true,
  "processing_job_id": "j1k2l3m4-...",
  "next_step": "processing_queued"
}`,
    },
  },
  {
    id: "process",
    method: "POST",
    name: "process-site-scan",
    path: "/functions/v1/process-site-scan",
    description: "Bearbetar en scan: läser metadata, extraherar terrain-metrics, kopplar asset-paths och uppdaterar status till ready/failed.",
    auth: true,
    requestBody: [
      { name: "site_scan_id", type: "uuid", required: true, description: "Scan att bearbeta" },
      { name: "processing_job_id", type: "uuid", required: false, description: "Jobb att uppdatera med resultat" },
    ],
    responseBody: [
      { name: "ok", type: "boolean", required: true, description: "true vid slutförd bearbetning" },
      { name: "site_scan_id", type: "uuid", required: true, description: "Scanens ID" },
      { name: "final_status", type: "string", required: true, description: "ready eller failed" },
      { name: "processing_job_id", type: "uuid|null", required: true, description: "Jobb-ID om angivet" },
      { name: "steps", type: "StepResult[]", required: true, description: "Resultat per analyssteg" },
      { name: "metrics_saved", type: "integer", required: true, description: "Antal sparade metrics" },
      { name: "fields_updated", type: "string[]", required: true, description: "Uppdaterade fält på scan" },
    ],
    errorCodes: [
      { code: 401, meaning: "Ogiltig auth-token" },
      { code: 404, meaning: "Scan hittades inte" },
      { code: 409, meaning: "Scan kan inte bearbetas (redan ready/archived)" },
      { code: 422, meaning: "Inga assets, ogiltigt UUID" },
      { code: 500, meaning: "Internt serverfel" },
    ],
    example: {
      request: `{
  "site_scan_id": "e5f6g7h8-...",
  "processing_job_id": "j1k2l3m4-..."
}`,
      response: `{
  "ok": true,
  "site_scan_id": "e5f6g7h8-...",
  "final_status": "ready",
  "processing_job_id": "j1k2l3m4-...",
  "steps": [
    { "name": "resolve_asset_paths", "success": true, "message": "Linked 3 path(s)" },
    { "name": "extract_terrain_metrics", "success": true, "message": "Extracted 7 metric(s)" },
    { "name": "persist_scan_updates", "success": true, "message": "Updated 8 field(s)" },
    { "name": "persist_metrics", "success": true, "message": "Saved 7 metric(s)" }
  ],
  "metrics_saved": 7,
  "fields_updated": ["preview_image_path", "min_height", "max_height", ...]
}`,
    },
  },
  {
    id: "list-scans",
    method: "GET",
    name: "list-site-scans",
    path: "Supabase Client → site_scans",
    description: "Listar scans med sökning, statusfilter, sortering och pagination. Körs direkt via Supabase JS-klienten (public SELECT RLS).",
    auth: false,
    requestBody: [
      { name: "search", type: "string", required: false, description: "Sök i title/description (ilike)" },
      { name: "status", type: "string|string[]", required: false, description: "Filtrera på en eller flera statusar" },
      { name: "scan_type", type: "string", required: false, description: "Filtrera på scan_type" },
      { name: "sort_by", type: "string", required: false, description: "created_at | updated_at | uploaded_at | title" },
      { name: "sort_order", type: "string", required: false, description: "asc | desc (default: desc)" },
      { name: "page", type: "integer", required: false, description: "Sidnummer (default: 1)" },
      { name: "page_size", type: "integer", required: false, description: "Rader per sida (default: 25)" },
    ],
    responseBody: [
      { name: "data", type: "SiteScanRow[]", required: true, description: "Array med scans" },
      { name: "count", type: "integer", required: true, description: "Totalt antal matchande" },
      { name: "page", type: "integer", required: true, description: "Nuvarande sida" },
      { name: "page_size", type: "integer", required: true, description: "Rader per sida" },
      { name: "total_pages", type: "integer", required: true, description: "Antal sidor" },
    ],
    errorCodes: [{ code: 500, meaning: "Databasfel" }],
    example: {
      response: `{
  "data": [{ "id": "...", "title": "Scan 1", "status": "ready", ... }],
  "count": 42,
  "page": 1,
  "page_size": 25,
  "total_pages": 2
}`,
    },
  },
  {
    id: "get-scan",
    method: "GET",
    name: "get-site-scan",
    path: "Supabase Client → site_scans + relations",
    description: "Hämtar komplett scan med metrics, assets, processing-jobb, annotations och externa länkar. Parallella queries.",
    auth: false,
    responseBody: [
      { name: "...SiteScanRow", type: "object", required: true, description: "Alla fält från site_scans" },
      { name: "metrics", type: "SiteScanMetricRow[]", required: true, description: "Mätvärden" },
      { name: "assets", type: "SiteScanAssetRow[]", required: true, description: "Alla assets" },
      { name: "processing_jobs", type: "ProcessingJobRow[]", required: true, description: "Jobbhistorik" },
      { name: "annotations", type: "AnnotationRow[]", required: true, description: "Annotations" },
      { name: "links", type: "LinkRow[]", required: true, description: "Externa kopplingar" },
    ],
    errorCodes: [
      { code: 404, meaning: "Scan hittades inte" },
      { code: 500, meaning: "Databasfel" },
    ],
    example: {
      response: `{
  "id": "e5f6g7h8-...",
  "title": "Tomtskanning Storgatan 12",
  "status": "ready",
  "metrics": [{ "metric_key": "height_range", "metric_value": 4.5, "metric_unit": "m" }],
  "assets": [{ "asset_type": "pointcloud", "file_name": "cloud.ply", "file_size": 10485760 }],
  "processing_jobs": [...],
  "annotations": [],
  "links": []
}`,
    },
  },
  {
    id: "get-assets",
    method: "GET",
    name: "get-site-scan-assets",
    path: "Supabase Client → site_scan_assets",
    description: "Hämtar alla assets för en scan, sorterade efter typ och datum.",
    auth: false,
    responseBody: [
      { name: "[]", type: "SiteScanAssetRow[]", required: true, description: "Array med asset_type, file_name, file_size, mime_type, storage_bucket, storage_path, checksum" },
    ],
    errorCodes: [{ code: 500, meaning: "Databasfel" }],
    example: {
      response: `[
  {
    "id": "...", "asset_type": "pointcloud",
    "file_name": "cloud.ply", "file_size": 10485760,
    "mime_type": "application/x-ply",
    "storage_bucket": "site-scan-processed",
    "storage_path": "e5f6.../pointcloud/cloud.ply"
  }
]`,
    },
  },
  {
    id: "get-processing",
    method: "GET",
    name: "get-site-scan-processing-history",
    path: "Supabase Client → site_scan_processing_jobs",
    description: "Hämtar alla processing-jobb för en scan, sorterade nyast först.",
    auth: false,
    responseBody: [
      { name: "[]", type: "ProcessingJobRow[]", required: true, description: "job_type, status, started_at, completed_at, error_message, input_payload, output_payload" },
    ],
    errorCodes: [{ code: 500, meaning: "Databasfel" }],
    example: {
      response: `[
  {
    "id": "...", "job_type": "pointcloud_generation",
    "status": "ready",
    "started_at": "2025-01-15T10:30:00Z",
    "completed_at": "2025-01-15T10:31:45Z",
    "error_message": null
  }
]`,
    },
  },
];

// =============================================
// Mobile flow
// =============================================

const MOBILE_FLOW_STEPS = [
  { step: 1, title: "Skapa session", endpoint: "create-site-scan-session", description: "Appen autentiserar och skapar en session + scan. Spara session_token och site_scan_id.", status: "draft" as const },
  { step: 2, title: "Samla scan-data", endpoint: "Lokalt på enhet", description: "LiDAR-data, bilder och metadata samlas i appen. Beräkna checksums.", status: null },
  { step: 3, title: "Ladda upp filer", endpoint: "Supabase Storage API", description: "Ladda upp varje fil till rätt bucket med korrekt path: {scan_id}/{category}/{file_name}.", status: "uploading" as const },
  { step: 4, title: "Registrera assets", endpoint: "register-site-scan-asset", description: "Registrera varje uppladdad fil i databasen. En POST per fil med session_token.", status: "uploading" as const },
  { step: 5, title: "Finalisera", endpoint: "finalize-site-scan-upload", description: "Markera upload som klar. Backend validerar assets och skapar processing-jobb.", status: "uploaded" as const },
  { step: 6, title: "Backend bearbetar", endpoint: "process-site-scan", description: "Extraherar metrics, kopplar paths, sätter scan-status till ready. Kan triggas automatiskt eller manuellt.", status: "processing" as const },
  { step: 7, title: "Läs resultat", endpoint: "get-site-scan", description: "Hämta komplett scan med metrics, assets och jobbhistorik.", status: "ready" as const },
];

// =============================================
// Asset type mapping table
// =============================================

const ASSET_TYPE_MAP = [
  { category: "raw_session_json", dbType: "raw_payload", bucket: "site-scan-raw", mimes: "application/json, application/octet-stream, application/zip" },
  { category: "point_cloud", dbType: "pointcloud", bucket: "site-scan-processed", mimes: "application/octet-stream, application/x-ply, application/x-las, application/x-laz" },
  { category: "mesh", dbType: "mesh", bucket: "site-scan-processed", mimes: "application/octet-stream, application/x-ply, model/obj, model/gltf-binary, model/usdz" },
  { category: "preview_image", dbType: "preview_image", bucket: "site-scan-preview", mimes: "image/jpeg, image/png, image/webp" },
  { category: "heightmap", dbType: "heightmap", bucket: "site-scan-processed", mimes: "image/png, image/tiff, application/octet-stream" },
  { category: "metadata_json", dbType: "other", bucket: "site-scan-raw", mimes: "application/json" },
];

// =============================================
// Components
// =============================================

function MethodBadge({ method }: { method: string }) {
  return (
    <span className={cn(
      "inline-block w-14 text-center text-[10px] font-bold font-mono rounded py-0.5",
      method === "POST" ? "bg-[hsl(var(--status-uploaded)/0.12)] text-[hsl(var(--status-uploaded))]" : "bg-[hsl(var(--status-ready)/0.12)] text-[hsl(var(--status-ready))]"
    )}>
      {method}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-6 w-6 shrink-0"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="h-3 w-3 text-[hsl(var(--status-ready))]" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
}

function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div className="rounded-lg border border-border bg-[hsl(var(--surface-inset))] overflow-hidden">
      {label && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/30">
          <span className="text-[10px] font-mono text-muted-foreground uppercase">{label}</span>
          <CopyButton text={code} />
        </div>
      )}
      <pre className="p-3 text-xs font-mono text-foreground/90 overflow-x-auto whitespace-pre">{code}</pre>
    </div>
  );
}

function FieldTable({ fields, title }: { fields: FieldDoc[]; title: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">{title}</p>
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/30 border-b border-border">
              <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Fält</th>
              <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Typ</th>
              <th className="text-center px-3 py-1.5 font-medium text-muted-foreground w-16">Krav</th>
              <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Beskrivning</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((f, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                <td className="px-3 py-1.5 font-mono font-medium">{f.name}</td>
                <td className="px-3 py-1.5 font-mono text-muted-foreground">{f.type}</td>
                <td className="px-3 py-1.5 text-center">
                  {f.required ? (
                    <span className="text-[hsl(var(--status-failed))] font-bold">●</span>
                  ) : (
                    <span className="text-muted-foreground/40">○</span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">{f.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EndpointSection({ ep }: { ep: EndpointDoc }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-card hover:bg-muted/30 transition-colors text-left"
      >
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
        <MethodBadge method={ep.method} />
        <span className="text-sm font-semibold font-heading">{ep.name}</span>
        {ep.auth && <Badge variant="outline" className="text-[9px] font-mono ml-auto shrink-0">AUTH</Badge>}
      </button>

      {open && (
        <div className="border-t border-border bg-card/50 p-4 space-y-4">
          <p className="text-sm text-muted-foreground">{ep.description}</p>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Path:</span>
            <code className="font-mono bg-muted/50 rounded px-2 py-0.5">{ep.path}</code>
          </div>

          {ep.requestBody && <FieldTable fields={ep.requestBody} title="Request Body" />}
          <FieldTable fields={ep.responseBody} title="Response" />

          {/* Error codes */}
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Felkoder</p>
            <div className="flex flex-wrap gap-2">
              {ep.errorCodes.map((e, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 text-xs font-mono bg-muted/50 rounded px-2 py-1">
                  <span className={cn("font-bold", e.code >= 500 ? "text-destructive" : e.code >= 400 ? "text-[hsl(var(--status-uploading))]" : "")}>{e.code}</span>
                  <span className="text-muted-foreground">{e.meaning}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Examples */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {ep.example.request && <CodeBlock code={ep.example.request} label="Request" />}
            <CodeBlock code={ep.example.response} label="Response" />
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================
// Page
// =============================================

const ApiDocs = () => {
  return (
    <PageShell
      title="API Docs"
      description="Intern dokumentation för SiteScan native-app integration."
      badge={<Badge variant="outline" className="font-mono text-[10px]">v1.0</Badge>}
    >
      {/* Auth info */}
      <DataSectionCard title="Autentisering" description="Alla write-endpoints kräver JWT">
        <div className="space-y-2 text-sm">
          <p>Skicka JWT-token i <code className="font-mono bg-muted/50 rounded px-1.5 py-0.5 text-xs">Authorization: Bearer &lt;token&gt;</code> headern.</p>
          <p className="text-muted-foreground text-xs">Läs-endpoints (list/get) använder public RLS-policies och kräver ingen autentisering. Write-endpoints verifierar token server-side.</p>
        </div>
      </DataSectionCard>

      {/* Mobile flow */}
      <DataSectionCard title="Rekommenderat mobilflöde" description="Steg-för-steg för native-appen">
        <div className="space-y-0">
          {MOBILE_FLOW_STEPS.map((step, i) => (
            <div key={step.step} className="flex gap-3 relative">
              {/* Vertical line */}
              {i < MOBILE_FLOW_STEPS.length - 1 && (
                <div className="absolute left-[15px] top-[30px] bottom-0 w-px bg-border" />
              )}
              {/* Step indicator */}
              <div className="h-[30px] w-[30px] rounded-full border-2 border-primary/30 bg-card flex items-center justify-center shrink-0 z-10">
                <span className="text-[10px] font-bold font-mono text-primary">{step.step}</span>
              </div>
              {/* Content */}
              <div className="pb-4 min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-semibold">{step.title}</span>
                  {step.status && <StatusBadge status={step.status} />}
                </div>
                <p className="text-xs text-muted-foreground">{step.description}</p>
                <code className="text-[10px] font-mono text-primary/70 mt-0.5 block">{step.endpoint}</code>
              </div>
            </div>
          ))}
        </div>
      </DataSectionCard>

      {/* Status flow */}
      <DataSectionCard title="Statusflöde" description="Scan-status genom hela livscykeln">
        <div className="flex flex-wrap items-center gap-2">
          {(["draft", "uploading", "uploaded", "processing", "ready"] as const).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <StatusBadge status={s} />
              {i < 4 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs text-muted-foreground">Vid fel:</span>
          <StatusBadge status="failed" />
          <span className="text-xs text-muted-foreground mx-1">Manuellt:</span>
          <StatusBadge status="archived" />
        </div>
      </DataSectionCard>

      {/* Asset type mapping */}
      <DataSectionCard title="Asset type mapping" description="Kategori → DB-typ → Bucket → Tillåtna MIME-typer" noPadding>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[700px]">
            <thead>
              <tr className="bg-muted/30 border-b border-border">
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Kategori (API)</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">DB-typ (enum)</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Bucket</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">MIME-typer</th>
              </tr>
            </thead>
            <tbody>
              {ASSET_TYPE_MAP.map((a) => (
                <tr key={a.category} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-mono font-medium">{a.category}</td>
                  <td className="px-4 py-2 font-mono text-muted-foreground">{a.dbType}</td>
                  <td className="px-4 py-2 font-mono text-muted-foreground">{a.bucket}</td>
                  <td className="px-4 py-2 text-muted-foreground">{a.mimes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataSectionCard>

      {/* Endpoints */}
      <div>
        <h2 className="text-sm font-semibold font-heading mb-3">Endpoints</h2>
        <div className="space-y-2">
          {ENDPOINTS.map((ep) => (
            <EndpointSection key={ep.id} ep={ep} />
          ))}
        </div>
      </div>
    </PageShell>
  );
};

export default ApiDocs;
