"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/errors";
import { cn } from "@/lib/utils";

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  pendingLabel?: string;
  children?: React.ReactNode;
  variant?: "primary" | "danger" | "quiet";
  /** Ask for confirmation before submitting (sensitive operations). */
  confirm?: string;
  /** Several submit buttons in one form: each is sent as `intent=<value>`. Replaces the single submit button. */
  intents?: { value: string; label: string; variant?: "primary" | "danger" | "quiet" }[];
  className?: string;
};

const VARIANTS = {
  primary: "bg-forest text-ivory hover:bg-forest-700",
  danger: "bg-st-late text-white hover:opacity-90",
  quiet: "border border-line text-forest hover:bg-ivory",
};

/** Form wrapper that shows pending state and the success / error message of a server action. */
export function ActionForm({
  action, submitLabel, pendingLabel = "جارٍ الحفظ…", children, variant = "primary", confirm, className, intents,
}: Props) {
  const [state, formAction, pending] = useActionState(action, {} as ActionState);

  return (
    <form
      action={formAction}
      className={cn(className ?? "space-y-3")}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      {state.error ? (
        <p role="alert" className="rounded bg-st-late/10 px-3 py-2 text-sm text-st-late">{state.error}</p>
      ) : null}
      {state.ok ? (
        <p role="status" className="rounded bg-st-ok/10 px-3 py-2 text-sm text-st-ok">{state.ok}</p>
      ) : null}
      {intents ? (
        <div className="flex flex-wrap gap-2">
          {intents.map((i) => (
            <button
              key={i.value} type="submit" name="intent" value={i.value} disabled={pending}
              className={cn("rounded px-4 py-2 text-sm font-medium disabled:opacity-60", VARIANTS[i.variant ?? "quiet"])}
            >
              {pending ? pendingLabel : i.label}
            </button>
          ))}
        </div>
      ) : (
        <button
          type="submit"
          disabled={pending}
          className={cn("rounded px-4 py-2 text-sm font-medium disabled:opacity-60", VARIANTS[variant])}
        >
          {pending ? pendingLabel : submitLabel}
        </button>
      )}
    </form>
  );
}

export function Field({
  label, name, type = "text", defaultValue, required, dir, hint, autoComplete,
}: {
  label: string; name: string; type?: string; defaultValue?: string; required?: boolean;
  dir?: "ltr" | "rtl"; hint?: string; autoComplete?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm font-medium">{label}</label>
      <input
        id={name} name={name} type={type} defaultValue={defaultValue} required={required}
        dir={dir} autoComplete={autoComplete}
        className="w-full rounded border border-line bg-white px-3 py-2 text-start focus:border-forest"
      />
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function TextArea({
  label, name, defaultValue, rows = 4, required, hint,
}: { label: string; name: string; defaultValue?: string; rows?: number; required?: boolean; hint?: string }) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm font-medium">{label}</label>
      <textarea
        id={name} name={name} rows={rows} defaultValue={defaultValue} required={required}
        className="w-full rounded border border-line bg-white px-3 py-2 text-sm focus:border-forest"
      />
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function Select({
  label, name, options, defaultValue = "", required, placeholder,
}: {
  label: string; name: string; options: { value: string; label: string }[];
  defaultValue?: string; required?: boolean; placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm font-medium">{label}</label>
      <select
        id={name} name={name} defaultValue={defaultValue} required={required}
        className="w-full rounded border border-line bg-white px-3 py-2 text-sm focus:border-forest"
      >
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
