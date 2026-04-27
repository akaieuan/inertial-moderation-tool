import { useEffect, useState } from "react";
import { Cloud, Cpu, MonitorCog, Plus } from "lucide-react";
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
import { Switch } from "./ui/switch.js";
import { cn } from "../lib/utils.js";
import type { SkillSummary } from "../lib/api.js";

type ExecutionModel = SkillSummary["executionModel"];

const EXECUTION_OPTIONS: Array<{
  value: ExecutionModel;
  label: string;
  hint: string;
  Icon: typeof Cpu;
}> = [
  {
    value: "in-process",
    label: "in-process",
    hint: "Runs inside the runciter — fastest, free.",
    Icon: Cpu,
  },
  {
    value: "local-server",
    label: "local-server",
    hint: "Runs on a sidecar process on this machine.",
    Icon: MonitorCog,
  },
  {
    value: "remote-api",
    label: "remote-api",
    hint: "Calls a hosted API — data leaves the machine.",
    Icon: Cloud,
  },
];

interface SkillCreateSheetProps {
  onCreated?: (skill: SkillSummary) => void;
}

export function SkillCreateSheet({ onCreated }: SkillCreateSheetProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [provider, setProvider] = useState("local");
  const [executionModel, setExecutionModel] = useState<ExecutionModel>("in-process");
  const [dataLeavesMachine, setDataLeavesMachine] = useState(false);
  const [cost, setCost] = useState("");

  useEffect(() => {
    if (executionModel === "remote-api") setDataLeavesMachine(true);
    else if (executionModel === "in-process") setDataLeavesMachine(false);
  }, [executionModel]);

  const reset = () => {
    setName("");
    setDescription("");
    setProvider("local");
    setExecutionModel("in-process");
    setDataLeavesMachine(false);
    setCost("");
  };

  const submit = () => {
    if (!name.trim()) {
      toast.error("Skill needs a name");
      return;
    }
    const skill: SkillSummary = {
      name: name.trim(),
      version: "0.1.0",
      provider: provider.trim() || "local",
      executionModel,
      dataLeavesMachine,
      costEstimateUsd: cost.trim() ? Number(cost) : null,
      description: description.trim() || null,
    };
    onCreated?.(skill);
    toast.success(`Added ${skill.name}`, {
      description: "Wired into demo state. Reload to reset.",
    });
    setOpen(false);
    reset();
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add skill
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[440px] flex-col gap-0 p-0 sm:max-w-[440px]">
        <SheetHeader className="px-5 pb-3 pt-5">
          <SheetTitle className="text-base font-medium">Add a skill</SheetTitle>
          <SheetDescription>
            Register a classifier or tool with the runciter. Demo only — does not persist.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 pb-4">
          <Section label="Identity">
            <Field label="Name" hint="Lowercase, hyphenated. Convention: <modality>-<verb>-<target>.">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. text-classify-toxicity"
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 font-mono text-[13px] placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </Field>
            <Field label="Description">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What signal does this skill emit?"
                rows={2}
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-1.5 text-[13px] placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </Field>
            <Field label="Provider">
              <input
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                placeholder="anthropic / regex / transformers.js"
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-[13px] placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </Field>
          </Section>

          <Section label="Execution">
            <div className="flex flex-col gap-1.5">
              {EXECUTION_OPTIONS.map(({ value, label, hint, Icon }) => {
                const active = executionModel === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setExecutionModel(value)}
                    className={cn(
                      "flex items-start gap-2.5 rounded-md border p-2.5 text-left transition-colors",
                      active
                        ? "border-foreground/30 bg-card"
                        : "border-border bg-card/40 hover:bg-card/60",
                    )}
                  >
                    <Icon
                      className={cn(
                        "mt-0.5 h-3.5 w-3.5 shrink-0",
                        active ? "text-foreground" : "text-muted-foreground",
                      )}
                      strokeWidth={1.5}
                    />
                    <div className="min-w-0">
                      <div className="font-mono text-[12px] text-foreground">{label}</div>
                      <div className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                        {hint}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </Section>

          <Section label="Privacy">
            <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-card/40 p-3">
              <div>
                <div className="text-[12px] font-medium">Data leaves the machine</div>
                <div className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  When on, the runciter sends event content to an external endpoint. Auto-set by remote-api.
                </div>
              </div>
              <Switch
                checked={dataLeavesMachine}
                onCheckedChange={setDataLeavesMachine}
                disabled={executionModel !== "local-server"}
              />
            </div>
          </Section>

          <Section label="Cost">
            <Field label="Estimate (USD per call)" hint="Leave blank for free / unknown.">
              <input
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="0.003"
                inputMode="decimal"
                disabled={executionModel === "in-process"}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 font-mono text-[13px] placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              />
            </Field>
          </Section>
        </div>

        <SheetFooter className="flex-row justify-end gap-2 border-t border-border px-5 py-3">
          <SheetClose asChild>
            <Button variant="ghost" size="sm">
              Cancel
            </Button>
          </SheetClose>
          <Button size="sm" onClick={submit}>
            Add skill
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 first:mt-0">
      <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] text-muted-foreground">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-muted-foreground/70">{hint}</p>}
    </div>
  );
}
