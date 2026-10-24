'use client';

import { useId, useRef } from 'react';
import { TrashIcon } from '@/components/ui/icons';

/**
 * Destructive server action behind a native confirmation dialog.
 *
 * `<dialog>` handles focus trapping, Escape and the backdrop for free. The
 * surrounding form only submits when the user confirms, and the server action
 * re-checks authorization and ownership regardless of what the client sent.
 */
export default function DangerActionForm({
  action,
  fields,
  title,
  description,
  confirmLabel = 'Endgültig löschen',
  triggerLabel = 'Löschen',
  tone = 'rose',
  hideIcon = false,
}: {
  action: (formData: FormData) => void | Promise<void>;
  fields: Record<string, string>;
  title: string;
  description: string;
  confirmLabel?: string;
  triggerLabel?: string;
  tone?: 'rose' | 'amber';
  /** Destructive actions without a delete meaning (e.g. unpublish) hide it. */
  hideIcon?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  const triggerClasses =
    tone === 'rose'
      ? 'border-rose-500/30 text-rose-300 hover:bg-rose-500/10'
      : 'border-amber-500/30 text-amber-300 hover:bg-amber-500/10';

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 ${triggerClasses}`}
      >
        {hideIcon ? null : <TrashIcon className="h-4 w-4" />}
        {triggerLabel}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={(event) => {
          // A click on the backdrop (not on the inner panel) closes the dialog.
          if (event.target === dialogRef.current) {
            dialogRef.current?.close();
          }
        }}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-zinc-950 p-0 text-zinc-100 backdrop:bg-black/70"
      >
        <form ref={formRef} action={action} className="p-6">
          {Object.entries(fields).map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}

          <h2 id={titleId} className="text-lg font-semibold text-white">
            {title}
          </h2>
          <p id={descriptionId} className="mt-2 text-sm leading-relaxed text-zinc-400">
            {description}
          </p>

          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
            >
              {confirmLabel}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
