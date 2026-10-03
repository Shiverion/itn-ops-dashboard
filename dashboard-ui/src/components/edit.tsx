import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { canEdit, type SaveReply } from '../api';
import { fmtIdrFull } from '../format';
import type { Cell, RawRow } from '../types';

// One edit dialog for every kind of row. Panels describe the fields (forms.ts)
// and what saving does; the dialog handles layout, validation hints, saving
// state and errors. The server validates everything again (planEdit).

export type FieldType = 'text' | 'textarea' | 'date' | 'number' | 'money' | 'select' | 'email' | 'url';

export interface FieldSpec {
  name: string;
  label: string;
  type?: FieldType;
  options?: string[];
  required?: boolean;
  hint?: string;
  readOnly?: boolean;
  wide?: boolean;
  min?: number;
  max?: number;
}

export interface EditRequest {
  title: string;
  description?: string;
  fields: FieldSpec[];
  initial?: Record<string, Cell | undefined>;
  submitLabel?: string;
  submit: (values: Record<string, string>) => Promise<SaveReply>;
  /** Shows a Delete button (asks for confirmation first). */
  remove?: { label: string; run: () => Promise<SaveReply> };
}

interface EditApi {
  enabled: boolean;
  open: (request: EditRequest) => void;
}

const EditContext = createContext<EditApi>({ enabled: false, open: () => {} });

export function useEdit(): EditApi {
  return useContext(EditContext);
}

/** Initial form values from a row's raw sheet fields. */
export function fromRaw(raw: RawRow | undefined, extra: Record<string, Cell> = {}): Record<string, Cell> {
  return { ...(raw ?? {}), ...extra };
}

export function EditProvider({ children, onSaved }: { children: ReactNode; onSaved: (message: string) => void }) {
  const [request, setRequest] = useState<EditRequest | null>(null);
  const api: EditApi = { enabled: canEdit(), open: setRequest };
  return (
    <EditContext.Provider value={api}>
      {children}
      {request && (
        <EditDialog
          request={request}
          onClose={() => setRequest(null)}
          onSaved={(message) => {
            setRequest(null);
            onSaved(message);
          }}
        />
      )}
    </EditContext.Provider>
  );
}

const inputClass =
  'w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-ink/50 focus:outline-none disabled:bg-chip disabled:text-ink-2';

function initialValues(request: EditRequest): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of request.fields) {
    const v = request.initial?.[f.name];
    out[f.name] = v === undefined || v === null ? '' : String(v);
  }
  return out;
}

function EditDialog({ request, onClose, onSaved }: { request: EditRequest; onClose: () => void; onSaved: (message: string) => void }) {
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(request));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const first = useRef<HTMLDivElement>(null);

  useEffect(() => {
    first.current?.querySelector<HTMLElement>('input:not([disabled]),select:not([disabled]),textarea:not([disabled])')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const set = (name: string, value: string) => setValues((v) => ({ ...v, [name]: value }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const missing = request.fields.filter((f) => f.required && !f.readOnly && !values[f.name]?.trim()).map((f) => f.label);
    if (missing.length) {
      setError(`Please fill in: ${missing.join(', ')}.`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const sent: Record<string, string> = {};
      for (const f of request.fields) if (!f.readOnly) sent[f.name] = values[f.name] ?? '';
      const reply = await request.submit(sent);
      onSaved(reply.message ?? 'Saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1f1814]/50 p-0 sm:items-center sm:p-4" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-title"
        onSubmit={onSubmit}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-xl border border-line bg-surface shadow-xl sm:rounded-xl"
      >
        <div className="border-b border-line px-5 py-4">
          <h2 id="edit-title" className="font-heading text-lg font-semibold text-ink">
            {request.title}
          </h2>
          {request.description && <p className="mt-1 text-sm text-ink-2">{request.description}</p>}
        </div>
        <div ref={first} className="grid flex-1 gap-4 overflow-y-auto px-5 py-4 sm:grid-cols-2">
          {request.fields.map((f) => (
            <Field key={f.name} spec={f} value={values[f.name] ?? ''} onChange={(v) => set(f.name, v)} />
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line px-5 py-3">
          {request.remove && (
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                if (!window.confirm(`Delete ${request.remove!.label}? Its details are kept in the AuditLog.`)) return;
                setSaving(true);
                setError('');
                try {
                  onSaved((await request.remove!.run()).message ?? 'Deleted.');
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err));
                  setSaving(false);
                }
              }}
              className="mr-auto rounded-md px-3 py-2 text-sm font-medium text-critical hover:bg-critical/10 disabled:opacity-50"
            >
              Delete
            </button>
          )}
          {error && (
            <p role="alert" className="mr-auto max-w-full text-sm text-critical">
              {error}
            </p>
          )}
          <button type="button" onClick={onClose} disabled={saving} className="rounded-md px-3 py-2 text-sm font-medium text-ink-2 hover:bg-chip disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60">
            {saving ? 'Saving…' : (request.submitLabel ?? 'Save')}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ spec, value, onChange }: { spec: FieldSpec; value: string; onChange: (v: string) => void }) {
  const id = `f-${spec.name}`;
  const type = spec.type ?? 'text';
  const common = { id, name: spec.name, disabled: spec.readOnly, required: spec.required && !spec.readOnly, className: inputClass };
  let control: ReactNode;
  if (type === 'textarea') {
    control = <textarea {...common} rows={3} value={value} onChange={(e) => onChange(e.target.value)} />;
  } else if (type === 'select') {
    const options = spec.options ?? [];
    control = (
      <select {...common} value={value} onChange={(e) => onChange(e.target.value)}>
        {!spec.required && <option value="">—</option>}
        {spec.required && !options.includes(value) && <option value="">Choose…</option>}
        {options.filter((o) => o !== '').map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  } else {
    const inputType = type === 'money' ? 'number' : type === 'url' ? 'url' : type;
    control = (
      <input
        {...common}
        type={inputType}
        inputMode={type === 'money' || type === 'number' ? 'decimal' : undefined}
        min={type === 'money' ? 0 : spec.min}
        max={spec.max}
        step={type === 'money' ? 1 : type === 'number' ? 'any' : undefined}
        placeholder={type === 'url' ? 'https://drive.google.com/…' : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  const moneyHint = type === 'money' && value && Number.isFinite(Number(value)) ? fmtIdrFull(Number(value)) : '';
  return (
    <div className={spec.wide || type === 'textarea' ? 'sm:col-span-2' : ''}>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-ink-2">
        {spec.label}
        {spec.required && !spec.readOnly && <span className="text-critical"> *</span>}
      </label>
      {control}
      {(spec.hint || moneyHint) && <p className="mt-1 text-xs text-muted">{moneyHint || spec.hint}</p>}
    </div>
  );
}

/** Small text button used for row actions ("Edit", "Mark paid"). Hidden when editing isn't available. */
export function RowAction({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  const { enabled } = useEdit();
  if (!enabled) return null;
  return (
    <button type="button" onClick={onClick} className="rounded px-1.5 py-0.5 text-xs font-medium text-ink-2 underline decoration-line underline-offset-4 hover:text-ink hover:decoration-ink">
      {children}
    </button>
  );
}

/** "+ Add …" button for panel headers. Hidden when editing isn't available. */
export function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  const { enabled } = useEdit();
  if (!enabled) return null;
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink hover:bg-chip">
      <span aria-hidden="true">+</span> {children}
    </button>
  );
}
