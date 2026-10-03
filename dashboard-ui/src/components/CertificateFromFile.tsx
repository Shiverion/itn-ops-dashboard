import { useRef, useState } from 'react';
import { ACCEPT_FILES, draftFromFiles, saveEdit, uploadFile } from '../api';
import { evidenceFields } from '../forms';
import type { Options } from '../types';
import { useEdit } from './edit';

/**
 * "Add from file": pick the certificate type and the scan/PDF; it is stored in
 * the shared drive (Certificates/<type>), the AI reads it, and the certificate
 * form opens filled in for checking before anything is saved to the sheet.
 */
export function CertificateFromFile({ options, onClose }: { options: Options; onClose: () => void }) {
  const edit = useEdit();
  const [type, setType] = useState(options.evidenceTypes[0] ?? 'Other');
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<'' | 'upload' | 'read'>('');
  const [error, setError] = useState('');
  const picker = useRef<HTMLInputElement>(null);

  const run = async () => {
    if (!file) return;
    setError('');
    try {
      setStep('upload');
      const uploaded = await uploadFile(file, { certificateType: type });
      setStep('read');
      let draft: Record<string, string> = {};
      let note = '';
      try {
        draft = (await draftFromFiles('certificate', [uploaded.id])).draft;
        note = draft.Notes ? `AI note: ${draft.Notes}` : 'Filled in by AI from the file. Check every field before saving.';
      } catch (e) {
        note = `The AI couldn’t read the file (${e instanceof Error ? e.message : e}); fill in the fields yourself.`;
      }
      onClose();
      edit.open({
        title: 'Add a certificate',
        description: note,
        fields: evidenceFields(options),
        initial: { Type: draft.Type || type, NameOrNumber: draft.NameOrNumber, Issuer: draft.Issuer, Scope: draft.Scope, ValidFrom: draft.ValidFrom, ValidUntil: draft.ValidUntil, DocumentURL: uploaded.url },
        submit: (v) => saveEdit('evidence', null, v),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1f1814]/50 sm:items-center sm:p-4" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && !step && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="cff-title" className="w-full max-w-md rounded-t-xl border border-line bg-surface p-5 shadow-xl sm:rounded-xl">
        <h2 id="cff-title" className="font-heading text-lg font-semibold text-ink">
          Add a certificate from a file
        </h2>
        <p className="mt-1 text-sm text-ink-2">Stored in the ITN Ops Files shared drive under Certificates/{type}; the AI then fills in the form for you to check.</p>
        <label className="mt-4 block text-xs font-medium text-ink-2" htmlFor="cff-type">
          Type
        </label>
        <select id="cff-type" value={type} onChange={(e) => setType(e.target.value)} disabled={!!step} className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink">
          {options.evidenceTypes.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <input ref={picker} type="file" accept={ACCEPT_FILES} className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button type="button" onClick={() => picker.current?.click()} disabled={!!step} className="mt-4 w-full rounded-md border border-dashed border-line px-3 py-4 text-sm text-ink hover:bg-chip">
          {file ? `📎 ${file.name}` : 'Choose the scan or PDF…'}
        </button>
        {error && (
          <p role="alert" className="mt-3 text-sm text-critical">
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={!!step} className="rounded-md px-3 py-2 text-sm font-medium text-ink-2 hover:bg-chip disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={run} disabled={!file || !!step} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60">
            {step === 'upload' ? 'Uploading…' : step === 'read' ? 'Reading…' : 'Upload & read'}
          </button>
        </div>
      </div>
    </div>
  );
}
