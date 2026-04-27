import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Cloud,
  Cpu,
  Eye,
  EyeOff,
  MonitorCog,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet.js";
import { Button } from "./ui/button.js";
import { Skeleton } from "./ui/skeleton.js";
import {
  addSkillRegistration,
  getSkillCatalog,
  type SkillCatalogEntry,
  type SkillExecutionModel,
  type SkillRegistration,
} from "../lib/api.js";
import { cn } from "../lib/utils.js";

const EXECUTION_ICON: Record<SkillExecutionModel, typeof Cpu> = {
  "in-process": Cpu,
  "local-server": MonitorCog,
  "remote-api": Cloud,
};

interface SkillCreateSheetProps {
  /** Called with the freshly-persisted registration after a successful add. */
  onCreated?: (reg: SkillRegistration) => void;
}

export function SkillCreateSheet({ onCreated }: SkillCreateSheetProps) {
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<SkillCatalogEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [picked, setPicked] = useState<SkillCatalogEntry | null>(null);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Fetch catalog the first time the sheet opens; cache afterwards.
  useEffect(() => {
    if (!open || catalog || loadError) return;
    let cancelled = false;
    getSkillCatalog()
      .then((c) => !cancelled && setCatalog(c))
      .catch((err) =>
        !cancelled && setLoadError(err instanceof Error ? err.message : String(err)),
      );
    return () => {
      cancelled = true;
    };
  }, [open, catalog, loadError]);

  const reset = () => {
    setPicked(null);
    setConfig({});
    setSubmitting(false);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  const submit = async () => {
    if (!picked) return;
    // Catalog-side required-field check.
    for (const f of picked.configFields) {
      if (f.required && !(config[f.key] ?? "").trim()) {
        toast.error(`${picked.displayName} needs ${f.label}`);
        return;
      }
    }
    setSubmitting(true);
    try {
      const reg = await addSkillRegistration({
        instanceId: "default",
        catalogId: picked.catalogId,
        displayName: picked.displayName,
        providerConfig: config,
        enabled: true,
        createdBy: "ieuan@local",
      });
      onCreated?.(reg);
      toast.success(`Added ${picked.displayName}`);
      setOpen(false);
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add skill
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-[480px] flex-col gap-0 p-0 sm:max-w-[480px]"
      >
        <SheetHeader className="px-5 pb-3 pt-5">
          <SheetTitle className="flex items-center gap-2 text-base font-medium">
            {picked && (
              <button
                type="button"
                onClick={reset}
                aria-label="Back to catalog"
                className="-ml-1 inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
            )}
            {picked ? `Configure ${picked.displayName}` : "Add a skill"}
          </SheetTitle>
          <SheetDescription>
            {picked
              ? `Provide the credentials this skill needs and it will register on submit.`
              : `Pick a skill module to enable on this instance. New entries land here whenever a new module ships.`}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 pb-4">
          {loadError && (
            <div className="my-4 rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-700 dark:text-rose-300">
              Failed to load catalog: {loadError}
            </div>
          )}
          {!catalog && !loadError && <CatalogSkeleton />}
          {catalog && !picked && (
            <CatalogGrid catalog={catalog} onPick={setPicked} />
          )}
          {picked && (
            <ConfigForm
              entry={picked}
              values={config}
              onChange={(k, v) => setConfig((prev) => ({ ...prev, [k]: v }))}
            />
          )}
        </div>

        <SheetFooter className="flex-row justify-end gap-2 border-t border-border px-5 py-3">
          <SheetClose asChild>
            <Button variant="ghost" size="sm">
              Cancel
            </Button>
          </SheetClose>
          {picked && (
            <Button size="sm" onClick={submit} disabled={submitting}>
              {submitting ? "Adding…" : "Add skill"}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function CatalogGrid({
  catalog,
  onPick,
}: {
  catalog: SkillCatalogEntry[];
  onPick: (entry: SkillCatalogEntry) => void;
}) {
  // User-addable entries first; defaults grouped at the bottom for completeness.
  const ordered = useMemo(() => {
    const addable = catalog.filter((e) => !e.defaultEnabled);
    const defaults = catalog.filter((e) => e.defaultEnabled);
    return [...addable, ...defaults];
  }, [catalog]);

  return (
    <div className="my-4 flex flex-col gap-2">
      {ordered.map((entry) => (
        <button
          key={entry.catalogId}
          type="button"
          onClick={() => onPick(entry)}
          disabled={entry.defaultEnabled}
          className={cn(
            "group grid grid-cols-[auto_1fr_auto] items-start gap-3 rounded-md border p-3 text-left transition-colors",
            entry.defaultEnabled
              ? "cursor-not-allowed border-border bg-muted/30 opacity-70"
              : "border-border bg-card/40 hover:border-foreground/30 hover:bg-card/60",
          )}
        >
          <CatalogIcon entry={entry} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-[13px] font-medium text-foreground">
                {entry.displayName}
              </span>
              {entry.defaultEnabled && <DefaultChip />}
            </div>
            <div className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
              {entry.description}
            </div>
            {entry.envVarHint && (
              <div className="mt-1 font-mono text-[10px] text-muted-foreground/70">
                requires {entry.envVarHint}
              </div>
            )}
          </div>
          <CostChip entry={entry} />
        </button>
      ))}
    </div>
  );
}

function ConfigForm({
  entry,
  values,
  onChange,
}: {
  entry: SkillCatalogEntry;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div className="my-4 flex flex-col gap-4">
      <div className="rounded-md border border-border bg-card/40 p-3">
        <div className="flex items-start gap-3">
          <CatalogIcon entry={entry} />
          <div className="min-w-0">
            <div className="text-[13px] font-medium">{entry.displayName}</div>
            <div className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              {entry.description}
            </div>
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-[6rem_1fr] gap-y-1 text-[11px]">
          <dt className="text-muted-foreground">Family</dt>
          <dd className="font-mono text-foreground">{entry.family}</dd>
          <dt className="text-muted-foreground">Provider</dt>
          <dd className="font-mono text-foreground">{entry.provider}</dd>
          <dt className="text-muted-foreground">Cost</dt>
          <dd className="font-mono tabular-nums text-foreground">
            {entry.costEstimateUsd === 0
              ? "free"
              : `$${entry.costEstimateUsd.toFixed(5)} / call`}
          </dd>
        </dl>
      </div>

      {entry.configFields.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">
          No configuration required — this skill is enabled by default at boot.
        </p>
      ) : (
        entry.configFields.map((field) => (
          <ConfigField
            key={field.key}
            field={field}
            value={values[field.key] ?? ""}
            onChange={(v) => onChange(field.key, v)}
          />
        ))
      )}
    </div>
  );
}

function ConfigField({
  field,
  value,
  onChange,
}: {
  field: SkillCatalogEntry["configFields"][number];
  value: string;
  onChange: (value: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div>
      <label className="mb-1 flex items-center gap-1 text-[11px] text-muted-foreground">
        <span>{field.label}</span>
        {field.required && <span className="text-rose-500">*</span>}
      </label>
      <div className="relative">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type={field.type === "secret" && !revealed ? "password" : "text"}
          placeholder={field.placeholder}
          className={cn(
            "w-full rounded-md border border-input bg-background px-3 py-1.5 font-mono text-[13px]",
            "placeholder:text-muted-foreground/70",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            field.type === "secret" && "pr-9",
          )}
        />
        {field.type === "secret" && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? "Hide value" : "Reveal value"}
            className="absolute right-1.5 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
          >
            {revealed ? (
              <EyeOff className="h-3.5 w-3.5" strokeWidth={1.5} />
            ) : (
              <Eye className="h-3.5 w-3.5" strokeWidth={1.5} />
            )}
          </button>
        )}
      </div>
      {field.description && (
        <p className="mt-1 text-[11px] text-muted-foreground/70">
          {field.description}
        </p>
      )}
    </div>
  );
}

function CatalogIcon({ entry }: { entry: SkillCatalogEntry }) {
  const Icon = EXECUTION_ICON[entry.executionModel];
  return (
    <span
      className={cn(
        "mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
        entry.dataLeavesMachine
          ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      )}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
    </span>
  );
}

function CostChip({ entry }: { entry: SkillCatalogEntry }) {
  if (entry.costEstimateUsd === 0)
    return (
      <span className="font-mono text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
        free
      </span>
    );
  return (
    <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
      ${entry.costEstimateUsd.toFixed(5)}
    </span>
  );
}

function DefaultChip() {
  return (
    <span className="inline-flex items-center rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
      default
    </span>
  );
}

function CatalogSkeleton() {
  return (
    <div className="my-4 flex flex-col gap-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}
