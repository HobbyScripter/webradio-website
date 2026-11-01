'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  CONTACT_EMAIL_MAX,
  CONTACT_MESSAGE_MAX,
  CONTACT_MESSAGE_MIN,
  CONTACT_NAME_MAX,
} from '@/lib/contact';

/**
 * Contact form for the Impressum. It is only rendered when the operator has
 * enabled it *and* a working e-mail path exists (`isContactFormEnabled`).
 */
export default function ContactForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [feedback, setFeedback] = useState<string | null>(null);

  const inputClass =
    'w-full rounded-xl border border-white/10 bg-[#07070a] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-violet-400/60 focus:outline-none focus:ring-2 focus:ring-violet-500/20';
  const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-300';

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState('sending');
    setFeedback(null);

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message, website }),
      });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        setState('error');
        setFeedback(body?.message ?? 'Die Nachricht konnte nicht gesendet werden.');
        return;
      }

      setState('sent');
      setFeedback('Danke, die Nachricht ist eingegangen.');
      setName('');
      setEmail('');
      setMessage('');
    } catch {
      setState('error');
      setFeedback('Die Nachricht konnte nicht gesendet werden. Bitte später erneut versuchen.');
    }
  }

  if (state === 'sent') {
    return (
      <div role="status" className="mt-8 rounded-xl border border-emerald-400/20 bg-emerald-500/[0.06] p-5">
        <h2 className="text-lg font-semibold text-emerald-100">Nachricht gesendet</h2>
        <p className="mt-2 text-sm text-emerald-100/80">{feedback}</p>
      </div>
    );
  }

  return (
    <section aria-labelledby="kontaktformular-heading" className="mt-10">
      <h2 id="kontaktformular-heading" className="text-lg font-semibold text-white">
        Kontaktformular
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
        Alternativ zur E-Mail kannst du hier eine Nachricht senden. Pflichtfelder sind
        gekennzeichnet.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        {feedback ? (
          <p
            role={state === 'error' ? 'alert' : 'status'}
            className={`rounded-xl border px-3.5 py-2.5 text-xs ${
              state === 'error'
                ? 'border-rose-500/20 bg-rose-500/10 text-rose-200'
                : 'border-white/10 bg-white/[0.03] text-zinc-300'
            }`}
          >
            {feedback}
          </p>
        ) : null}

        <div>
          <label htmlFor="contact-name" className={labelClass}>
            Name (optional)
          </label>
          <input
            id="contact-name"
            name="name"
            type="text"
            maxLength={CONTACT_NAME_MAX}
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="contact-email" className={labelClass}>
            E-Mail-Adresse <span aria-hidden="true">*</span>
          </label>
          <input
            id="contact-email"
            name="email"
            type="email"
            required
            maxLength={CONTACT_EMAIL_MAX}
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="contact-message" className={labelClass}>
            Nachricht <span aria-hidden="true">*</span>
          </label>
          <textarea
            id="contact-message"
            name="message"
            required
            rows={6}
            minLength={CONTACT_MESSAGE_MIN}
            maxLength={CONTACT_MESSAGE_MAX}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            className={`${inputClass} resize-y`}
          />
        </div>

        {/* Honeypot: real visitors never fill this hidden field. */}
        <div className="hidden" aria-hidden="true">
          <label htmlFor="contact-website">Website</label>
          <input
            id="contact-website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
          />
        </div>

        <Button type="submit" disabled={state === 'sending'} size="sm">
          {state === 'sending' ? 'Wird gesendet …' : 'Nachricht senden'}
        </Button>
      </form>
    </section>
  );
}
