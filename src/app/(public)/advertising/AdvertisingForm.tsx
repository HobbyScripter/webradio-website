'use client';

import { useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { CheckIcon } from '@/components/ui/icons';
import {
  advertisingApplicationFormSchema,
  type AdFormat,
  type AdPlacementType,
} from '@/lib/advertising/validations';
import { fieldClass } from '@/components/admin/portal-ui';

type FormState = {
  companyName: string;
  contactName: string;
  email: string;
  websiteUrl: string;
  phone: string;
  adFormat: AdFormat;
  placement: AdPlacementType;
  desiredStartDate: string;
  desiredEndDate: string;
  description: string;
  desiredBudget: string;
  customMessage: string;
  privacyConsent: boolean;
};

const INITIAL: FormState = {
  companyName: '',
  contactName: '',
  email: '',
  websiteUrl: '',
  phone: '',
  adFormat: 'BANNER',
  placement: 'HOMEPAGE',
  desiredStartDate: '',
  desiredEndDate: '',
  description: '',
  desiredBudget: '',
  customMessage: '',
  privacyConsent: false,
};

const labelClass =
  'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-300';

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }
  return (
    <p role="alert" className="mt-1 text-xs text-rose-300">
      {message}
    </p>
  );
}

export function AdvertisingForm() {
  const [formData, setFormData] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value, type } = event.target;
    setFormData((previous) => ({
      ...previous,
      [name]: type === 'checkbox' ? (event.target as HTMLInputElement).checked : value,
    }));

    if (errors[name]) {
      setErrors((previous) => ({ ...previous, [name]: '' }));
    }
  };

  const applyIssues = (issues: { path: string; message: string }[]) => {
    const fieldErrors: Record<string, string> = {};
    for (const issue of issues) {
      if (issue.path && !fieldErrors[issue.path]) {
        fieldErrors[issue.path] = issue.message;
      }
    }
    setErrors(fieldErrors);
    return Object.keys(fieldErrors).length > 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrors({});
    setSubmitError('');

    try {
      const validated = advertisingApplicationFormSchema.parse(formData);

      const response = await fetch('/api/advertising/application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validated),
      });

      const result = (await response.json()) as {
        error?: string;
        message?: string;
        issues?: { path: string; message: string }[];
      };

      if (response.ok) {
        setSubmitSuccess(true);
        return;
      }

      if (result.issues && applyIssues(result.issues)) {
        return;
      }

      setSubmitError(result.message || result.error || 'Fehler beim Absenden der Bewerbung.');
    } catch (error) {
      if (error instanceof z.ZodError) {
        applyIssues(
          error.issues.map((issue) => ({
            path: String(issue.path[0] ?? ''),
            message: issue.message,
          })),
        );
      } else {
        setSubmitError('Fehler beim Absenden der Bewerbung.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitSuccess) {
    return (
      <div className="py-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-emerald-400/25 bg-emerald-500/10">
          <CheckIcon className="h-8 w-8 text-emerald-300" />
        </div>
        <h3 className="text-xl font-semibold text-white">Bewerbung erfolgreich eingereicht</h3>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-zinc-400">
          Wir prüfen Ihre Anfrage und setzen uns innerhalb von 5 Werktagen mit Ihnen in Verbindung.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="companyName" className={labelClass}>
            Unternehmensname *
          </label>
          <input
            id="companyName"
            name="companyName"
            className={fieldClass}
            value={formData.companyName}
            onChange={handleChange}
          />
          <FieldError message={errors['companyName']} />
        </div>

        <div>
          <label htmlFor="contactName" className={labelClass}>
            Ansprechpartner *
          </label>
          <input
            id="contactName"
            name="contactName"
            className={fieldClass}
            value={formData.contactName}
            onChange={handleChange}
          />
          <FieldError message={errors['contactName']} />
        </div>

        <div>
          <label htmlFor="email" className={labelClass}>
            Geschäftliche E-Mail *
          </label>
          <input
            id="email"
            name="email"
            type="email"
            className={fieldClass}
            value={formData.email}
            onChange={handleChange}
          />
          <FieldError message={errors['email']} />
        </div>

        <div>
          <label htmlFor="websiteUrl" className={labelClass}>
            Unternehmenswebsite
          </label>
          <input
            id="websiteUrl"
            name="websiteUrl"
            className={fieldClass}
            value={formData.websiteUrl}
            onChange={handleChange}
            placeholder="https://…"
          />
          <FieldError message={errors['websiteUrl']} />
        </div>

        <div>
          <label htmlFor="phone" className={labelClass}>
            Telefonnummer
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            className={fieldClass}
            value={formData.phone}
            onChange={handleChange}
          />
          <FieldError message={errors['phone']} />
        </div>

        <div>
          <label htmlFor="adFormat" className={labelClass}>
            Gewünschte Werbeform *
          </label>
          <select
            id="adFormat"
            name="adFormat"
            className={fieldClass}
            value={formData.adFormat}
            onChange={handleChange}
          >
            <option value="BANNER">Bannerwerbung</option>
            <option value="SPONSOR_CARD">Sponsorenkarte</option>
            <option value="LOGO_LINK">Unternehmenslogo mit Verlinkung</option>
            <option value="CUSTOM">Individuelle Anfrage</option>
          </select>
          <FieldError message={errors['adFormat']} />
        </div>

        <div>
          <label htmlFor="placement" className={labelClass}>
            Gewünschte Platzierung *
          </label>
          <select
            id="placement"
            name="placement"
            className={fieldClass}
            value={formData.placement}
            onChange={handleChange}
          >
            <option value="HOMEPAGE">Startseite</option>
            <option value="DOWNLOAD_PAGE">Download-Seite</option>
            <option value="PUBLIC_PAGES">Öffentliche Informationsseiten</option>
          </select>
          <FieldError message={errors['placement']} />
        </div>

        <div>
          <label htmlFor="desiredStartDate" className={labelClass}>
            Gewünschter Start
          </label>
          <input
            id="desiredStartDate"
            name="desiredStartDate"
            type="date"
            className={fieldClass}
            value={formData.desiredStartDate}
            onChange={handleChange}
          />
          <FieldError message={errors['desiredStartDate']} />
        </div>

        <div>
          <label htmlFor="desiredEndDate" className={labelClass}>
            Gewünschtes Ende
          </label>
          <input
            id="desiredEndDate"
            name="desiredEndDate"
            type="date"
            className={fieldClass}
            value={formData.desiredEndDate}
            onChange={handleChange}
          />
          <FieldError message={errors['desiredEndDate']} />
        </div>

        <div>
          <label htmlFor="desiredBudget" className={labelClass}>
            Gewünschtes Budget
          </label>
          <input
            id="desiredBudget"
            name="desiredBudget"
            className={fieldClass}
            value={formData.desiredBudget}
            onChange={handleChange}
          />
          <FieldError message={errors['desiredBudget']} />
        </div>
      </div>

      <div>
        <label htmlFor="description" className={labelClass}>
          Beschreibung des Unternehmens oder Angebots *
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          className={fieldClass}
          value={formData.description}
          onChange={handleChange}
        />
        <FieldError message={errors['description']} />
      </div>

      <div>
        <label htmlFor="customMessage" className={labelClass}>
          Individuelle Nachricht
        </label>
        <textarea
          id="customMessage"
          name="customMessage"
          rows={3}
          className={fieldClass}
          value={formData.customMessage}
          onChange={handleChange}
        />
        <FieldError message={errors['customMessage']} />
      </div>

      <div className="flex items-start gap-2">
        <input
          id="privacyConsent"
          name="privacyConsent"
          type="checkbox"
          checked={formData.privacyConsent}
          onChange={handleChange}
          className="mt-1 h-4 w-4 rounded border-white/20 bg-white/5 text-violet-600 focus:ring-violet-500"
        />
        <div>
          <label htmlFor="privacyConsent" className="text-sm text-zinc-300">
            Ich stimme zu, dass meine Daten zur Bearbeitung dieser Bewerbung verwendet werden. *
          </label>
          <FieldError message={errors['privacyConsent']} />
        </div>
      </div>

      {submitError ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-200"
        >
          {submitError}
        </div>
      ) : null}

      <Button type="submit" size="lg" disabled={isSubmitting} className="w-full sm:w-auto">
        {isSubmitting ? 'Wird gesendet…' : 'Bewerbung absenden'}
      </Button>
    </form>
  );
}
