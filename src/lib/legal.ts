/**
 * Central operator dataset and legal page content.
 *
 * Impressum, Datenschutzerklärung and Nutzungsbedingungen are generated from a
 * single `OperatorDetails` record, so the three pages cannot drift apart. The
 * `LEGAL_*` variables carry the operator facts; they are not an activation
 * switch and never enable or disable a page.
 *
 * While a required fact is missing, the page answers normally but renders a
 * clearly marked notice instead of a plausible-looking placeholder, because
 * inventing operator details is not an option. As soon as every required value
 * is present, the texts below are rendered.
 *
 * Every statement about processing is derived from this application's code:
 * session cookie, database session row, audit log, hashed rate-limit counters,
 * abuse reports and the (currently paused) transactional e-mail path. There is
 * no analytics, no tracking, no consent banner and no cookie settings page.
 *
 * Nothing here is legal advice. The texts describe the verified technical state
 * of the application and must be reviewed by a qualified person together with
 * the operator details.
 */

export type OperatorDetails = {
  name: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  email: string;
  phone: string | null;
  representedBy: string | null;
  registerCourt: string | null;
  registerNumber: string | null;
  vatId: string | null;
  responsibleForContent: string;
  hostingProvider: string;
  hostingRegion: string;
  databaseProvider: string;
  databaseRegion: string;
  mailProvider: string;
  retentionSessions: string;
  retentionAuditLogs: string;
  retentionRateLimits: string;
  supervisoryAuthority: string;
};

type FieldSpec = {
  key: keyof OperatorDetails;
  variable: string;
  label: string;
  required: boolean;
};

export const OPERATOR_FIELDS: readonly FieldSpec[] = [
  { key: 'name', variable: 'LEGAL_OPERATOR_NAME', label: 'Anbietername', required: true },
  { key: 'street', variable: 'LEGAL_OPERATOR_STREET', label: 'Straße und Hausnummer', required: true },
  { key: 'postalCode', variable: 'LEGAL_OPERATOR_POSTAL_CODE', label: 'Postleitzahl', required: true },
  { key: 'city', variable: 'LEGAL_OPERATOR_CITY', label: 'Ort', required: true },
  { key: 'country', variable: 'LEGAL_OPERATOR_COUNTRY', label: 'Land', required: true },
  { key: 'email', variable: 'LEGAL_OPERATOR_EMAIL', label: 'Kontakt-E-Mail', required: true },
  { key: 'phone', variable: 'LEGAL_OPERATOR_PHONE', label: 'Telefon', required: false },
  { key: 'representedBy', variable: 'LEGAL_OPERATOR_REPRESENTED_BY', label: 'Vertretungsberechtigte Person', required: false },
  { key: 'registerCourt', variable: 'LEGAL_OPERATOR_REGISTER_COURT', label: 'Registergericht', required: false },
  { key: 'registerNumber', variable: 'LEGAL_OPERATOR_REGISTER_NUMBER', label: 'Registernummer', required: false },
  { key: 'vatId', variable: 'LEGAL_OPERATOR_VAT_ID', label: 'Umsatzsteuer-ID', required: false },
  {
    key: 'responsibleForContent',
    variable: 'LEGAL_OPERATOR_CONTENT_RESPONSIBLE',
    label: 'Verantwortlich für den Inhalt',
    required: true,
  },
  { key: 'hostingProvider', variable: 'LEGAL_HOSTING_PROVIDER', label: 'Hosting-Anbieter', required: true },
  { key: 'hostingRegion', variable: 'LEGAL_HOSTING_REGION', label: 'Hosting-Region', required: true },
  { key: 'databaseProvider', variable: 'LEGAL_DATABASE_PROVIDER', label: 'Datenbank-Anbieter', required: true },
  { key: 'databaseRegion', variable: 'LEGAL_DATABASE_REGION', label: 'Datenbank-Region', required: true },
  { key: 'mailProvider', variable: 'LEGAL_MAIL_PROVIDER', label: 'E-Mail-Anbieter', required: true },
  {
    key: 'retentionSessions',
    variable: 'LEGAL_RETENTION_SESSIONS',
    label: 'Speicherdauer von Sitzungen',
    required: true,
  },
  {
    key: 'retentionAuditLogs',
    variable: 'LEGAL_RETENTION_AUDIT_LOGS',
    label: 'Speicherdauer des Sicherheitsprotokolls',
    required: true,
  },
  {
    key: 'retentionRateLimits',
    variable: 'LEGAL_RETENTION_RATE_LIMITS',
    label: 'Speicherdauer der Missbrauchszähler',
    required: true,
  },
  {
    key: 'supervisoryAuthority',
    variable: 'LEGAL_SUPERVISORY_AUTHORITY',
    label: 'Zuständige Aufsichtsbehörde',
    required: true,
  },
];

export type LegalDetails = {
  /** True when every required operator detail is present. */
  complete: boolean;
  /** Human-readable labels of missing required fields — never values. */
  missing: string[];
  operator: OperatorDetails;
};

function read(env: Record<string, string | undefined>, name: string): string {
  return (env[name] ?? '').trim();
}

/**
 * Read the operator details. `missing` lists human-readable field labels only —
 * never values, so the list is safe to render and to log.
 */
export function getLegalDetails(
  env: Record<string, string | undefined> = process.env,
): LegalDetails {
  const values = new Map<keyof OperatorDetails, string>();
  const missing: string[] = [];

  for (const field of OPERATOR_FIELDS) {
    const value = read(env, field.variable);
    values.set(field.key, value);
    if (field.required && value === '') {
      missing.push(field.label);
    }
  }

  const operator: OperatorDetails = {
    name: values.get('name') ?? '',
    street: values.get('street') ?? '',
    postalCode: values.get('postalCode') ?? '',
    city: values.get('city') ?? '',
    country: values.get('country') ?? '',
    email: values.get('email') ?? '',
    phone: values.get('phone') || null,
    representedBy: values.get('representedBy') || null,
    registerCourt: values.get('registerCourt') || null,
    registerNumber: values.get('registerNumber') || null,
    vatId: values.get('vatId') || null,
    responsibleForContent: values.get('responsibleForContent') ?? '',
    hostingProvider: values.get('hostingProvider') ?? '',
    hostingRegion: values.get('hostingRegion') ?? '',
    databaseProvider: values.get('databaseProvider') ?? '',
    databaseRegion: values.get('databaseRegion') ?? '',
    mailProvider: values.get('mailProvider') ?? '',
    retentionSessions: values.get('retentionSessions') ?? '',
    retentionAuditLogs: values.get('retentionAuditLogs') ?? '',
    retentionRateLimits: values.get('retentionRateLimits') ?? '',
    supervisoryAuthority: values.get('supervisoryAuthority') ?? '',
  };

  return {
    complete: missing.length === 0,
    missing,
    operator,
  };
}

export type LegalTable = {
  columns: string[];
  rows: string[][];
};

export type LegalSection = {
  heading: string;
  paragraphs: string[];
  /** Rendered as an `<address>` element with real line breaks. */
  address?: string[];
  table?: LegalTable;
};

/**
 * Name of the session cookie. NextAuth prefixes its cookies with `__Secure-`
 * when the site is served over HTTPS, so both spellings are documented.
 */
export const SESSION_COOKIE_NAME = 'next-auth.session-token';
export const SESSION_COOKIE_NAME_SECURE = '__Secure-next-auth.session-token';

/**
 * Transactional e-mail is only delivered when delivery is switched on and a
 * provider plus sender are configured — the same gate `src/lib/email.ts`
 * applies. The privacy text states exactly that, instead of claiming a delivery
 * that does not take place.
 */
export function isMailDeliveryConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (read(env, 'EMAIL_DELIVERY_ENABLED').toLowerCase() !== 'true') {
    return false;
  }

  const configured =
    read(env, 'RESEND_API_KEY') !== '' || read(env, 'EMAIL_SERVER_HOST') !== '';
  return read(env, 'EMAIL_FROM') !== '' && configured;
}

/**
 * Identifiers for the built-in texts of this module. They are written to the
 * consent record when no operator-published version exists, so a registration
 * always stores which version was accepted and when.
 */
export const BUILTIN_LEGAL_DOCUMENT_IDS = {
  IMPRESSUM: 'builtin:impressum:1',
  DATENSCHUTZ: 'builtin:datenschutz:1',
  NUTZUNGSBEDINGUNGEN: 'builtin:nutzungsbedingungen:1',
} as const;

/**
 * Impressum. The structure follows the usual § 5 DDG facts and adds nothing
 * that has not been confirmed.
 */
export function impressumSections(operator: OperatorDetails): LegalSection[] {
  const contact = [
    operator.phone ? `Telefon: ${operator.phone}` : null,
    `E-Mail: ${operator.email}`,
  ]
    .filter(Boolean)
    .join('\n');

  const register = [
    operator.registerCourt && operator.registerNumber
      ? `Register: ${operator.registerCourt}, ${operator.registerNumber}`
      : null,
    operator.vatId ? `Umsatzsteuer-ID: ${operator.vatId}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return [
    {
      heading: 'Anbieter',
      address: [
        operator.name,
        operator.street,
        `${operator.postalCode} ${operator.city}`,
        operator.country,
      ],
      paragraphs: [],
    },
    {
      heading: 'Kontakt',
      paragraphs: [contact],
    },
    ...(operator.representedBy
      ? [{ heading: 'Vertretung', paragraphs: [operator.representedBy] }]
      : []),
    ...(register ? [{ heading: 'Registereintrag', paragraphs: [register] }] : []),
    {
      heading: 'Verantwortlich für den Inhalt',
      paragraphs: [operator.responsibleForContent],
    },
    {
      heading: 'Über diese Website',
      paragraphs: [
        'Diese Website stellt Informationen, Downloads und einen Katalog für das quelloffene Desktop-Programm WebRadio bereit. Plugins und Themes werden von Dritten eingereicht und vor der Veröffentlichung geprüft.',
      ],
    },
  ];
}

/**
 * Datenschutzerklärung. A short summary at the top, then one section per
 * processing activity that actually exists in this application.
 */
export function privacySections(operator: OperatorDetails, mailConfigured = false): LegalSection[] {
  const sharedRecipients = `${operator.hostingProvider}, ${operator.databaseProvider}`;

  const categories: LegalTable = {
    columns: ['Zweck', 'Daten', 'Rechtsgrundlage', 'Speicherdauer', 'Empfänger'],
    rows: [
      [
        'Konto bereitstellen und anmelden',
        'E-Mail-Adresse, Anzeigename, nicht umkehrbarer Prüfwert des Passworts, Rolle des Kontos, Zeitstempel',
        'Art. 6 Abs. 1 lit. b DSGVO',
        'bis zur Löschung des Kontos',
        sharedRecipients,
      ],
      [
        'Sitzung aufrechterhalten',
        'Sitzungskennung im Cookie, Zeitpunkt, IP-Adresse, Browserkennung',
        'Art. 6 Abs. 1 lit. b und lit. f DSGVO',
        operator.retentionSessions,
        sharedRecipients,
      ],
      [
        'Sicherheitsvorfälle nachvollziehen',
        'Zeitpunkt, Vorgang, beteiligtes Konto, IP-Adresse, Browserkennung',
        'Art. 6 Abs. 1 lit. f DSGVO',
        operator.retentionAuditLogs,
        sharedRecipients,
      ],
      [
        'Automatisierte Angriffe abwehren',
        'Zählerstand, nicht umkehrbarer Prüfwert der Kennung, Zeitfenster',
        'Art. 6 Abs. 1 lit. f DSGVO',
        operator.retentionRateLimits,
        operator.databaseProvider,
      ],
      [
        'Meldungen zu Kataloginhalten bearbeiten',
        'meldendes Konto, gemeldetes Ziel, Grund, Beschreibung',
        'Art. 6 Abs. 1 lit. f DSGVO',
        operator.retentionAuditLogs,
        sharedRecipients,
      ],
      ...(mailConfigured
        ? [
            [
              'Bestätigungs- und Passwort-Reset-E-Mails zustellen',
              'E-Mail-Adresse, einmalig gültiger Link, Zeitpunkt',
              'Art. 6 Abs. 1 lit. b DSGVO',
              'bis zum Ablauf oder zur Verwendung des Links',
              operator.mailProvider,
            ],
          ]
        : []),
    ],
  };

  return [
    {
      heading: 'Kurzfassung',
      paragraphs: [
        'Diese Website verarbeitet nur Daten, die für Konto, Anmeldung, Katalog und Missbrauchsschutz erforderlich sind. Es gibt keine Analyse- oder Werbedienste, keine Profile und keine Weitergabe zu Werbezwecken.',
      ],
      table: categories,
    },
    {
      heading: '1. Verantwortlicher',
      paragraphs: [
        `Verantwortlich für die Datenverarbeitung auf dieser Website ist ${operator.name}, ${operator.street}, ${operator.postalCode} ${operator.city}, ${operator.country}.`,
        `Kontakt: ${operator.email}${operator.phone ? `, Telefon ${operator.phone}` : ''}. Die Anbieterangaben stehen auch im [Impressum](/impressum).`,
      ],
    },
    {
      heading: '2. Hosting und Datenbank',
      paragraphs: [
        `Die Website wird bei ${operator.hostingProvider} betrieben (Region: ${operator.hostingRegion}). Die Datenbank wird bei ${operator.databaseProvider} betrieben (Region: ${operator.databaseRegion}).`,
        'Der Hosting-Anbieter verarbeitet beim Aufruf einer Seite technisch notwendige Verbindungsdaten: IP-Adresse, Zeitpunkt, aufgerufene Adresse, übertragene Datenmenge und Statuscode. Diese Protokolle dienen dem sicheren Betrieb und der Fehleranalyse.',
      ],
    },
    {
      heading: '3. Konto und Anmeldung',
      paragraphs: [
        'Bei der Registrierung speichert die Website die E-Mail-Adresse, den freiwilligen Anzeigenamen, einen nicht umkehrbaren Prüfwert des Passworts, die Rolle des Kontos und Zeitstempel. Das Passwort selbst wird nicht gespeichert.',
        'Ein Konto ist nach der Registrierung sofort nutzbar. Eine Bestätigung der E-Mail-Adresse ist nicht erforderlich.',
        'Bei der Registrierung wird festgehalten, welcher Fassung der Nutzungsbedingungen und der Datenschutzerklärung zugestimmt wurde und zu welchem Zeitpunkt. Diese Angaben werden nicht überschrieben.',
      ],
    },
    {
      heading: '4. Sitzung und Cookie',
      paragraphs: [
        `Für die Anmeldung setzt die Website ein technisch notwendiges Cookie mit dem Namen \`${SESSION_COOKIE_NAME}\`, unter HTTPS \`${SESSION_COOKIE_NAME_SECURE}\`. Es ist für Skripte unlesbar (HttpOnly), wird nur bei same-site Anfragen gesendet (SameSite=Lax) und ist unter HTTPS verschlüsselt übertragen (Secure).`,
        'Der Inhalt ist eine verschlüsselte Sitzungskennung, die auf einen Datensatz in der Datenbank verweist. Weitere Cookies werden nicht gesetzt; insbesondere keine Analyse-, Marketing- oder Tracking-Cookies. Eine Einwilligung ist für dieses Cookie nicht erforderlich, weil es für die Anmeldung unentbehrlich ist.',
        `Die Sitzung endet nach 30 Tagen, beim Abmelden oder wenn sie beendet wird. ${operator.retentionSessions}`,
      ],
    },
    {
      heading: '5. Sicherheitsprotokoll',
      paragraphs: [
        'Sicherheitsrelevante Vorgänge werden mit Zeitpunkt, Vorgang, beteiligtem Konto, IP-Adresse und Browserkennung protokolliert. Dazu gehören Registrierung, Anmeldung, Passwort- und Rollenänderungen, Moderationsentscheidungen, Meldungen und Kontosperren. Das Protokoll dient dem Nachweis und der Nachvollziehbarkeit von Entscheidungen.',
        `Speicherdauer: ${operator.retentionAuditLogs}`,
      ],
    },
    {
      heading: '6. Missbrauchsschutz',
      paragraphs: [
        'Zur Abwehr automatisierter Anmelde- und Registrierversuche speichert die Website Zähler. Der Schlüssel ist ein nicht umkehrbarer Prüfwert aus Zweck, normalisierter Kennung und Zeitfenster; E-Mail-Adressen und IP-Adressen werden dafür nicht im Klartext abgelegt.',
        `Speicherdauer: ${operator.retentionRateLimits}`,
      ],
    },
    {
      heading: '7. E-Mail-Versand',
      paragraphs: mailConfigured
        ? [
            `Bestätigungs- und Passwort-Reset-E-Mails werden über ${operator.mailProvider} an die bei der Registrierung angegebene Adresse versendet. Die Links sind zeitlich begrenzt und nur einmal verwendbar; gespeichert wird nur ein nicht umkehrbarer Prüfwert des Links.`,
          ]
        : [
            'Der Versand von Bestätigungs- und Passwort-Reset-E-Mails ist derzeit nicht eingerichtet. Es werden daher keine solchen E-Mails versendet und keine Adressen an einen Zustelldienst übergeben.',
          ],
    },
    {
      heading: '8. Meldungen zu Kataloginhalten',
      paragraphs: [
        'Angemeldete Konten können Kataloginhalte melden. Gespeichert werden das meldende Konto, das gemeldete Ziel, der gewählte Grund und eine optionale Beschreibung. Meldungen prüft ausschließlich die Administration; eine Meldung allein löst keine Maßnahme aus.',
      ],
    },
    {
      heading: '9. Empfänger',
      paragraphs: [
        `Empfänger der Daten sind ausschließlich die genannten Dienstleister (${operator.hostingProvider}, ${operator.databaseProvider}${mailConfigured ? `, ${operator.mailProvider}` : ''}) sowie Stellen, an die eine gesetzliche Pflicht zur Weitergabe besteht. Andere Empfänger gibt es nicht.`,
      ],
    },
    {
      heading: '10. Rechte der betroffenen Personen',
      paragraphs: [
        `Betroffene Personen haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch. Anfragen richten sich an ${operator.email}.`,
        `Beschwerden können bei der zuständigen Aufsichtsbehörde erhoben werden: ${operator.supervisoryAuthority}.`,
      ],
    },
    {
      heading: '11. Stand',
      paragraphs: [
        'Diese Erklärung beschreibt die Datenverarbeitung der derzeit betriebenen Website. Änderungen an der Anwendung werden in dieser Erklärung nachgeführt.',
      ],
    },
  ];
}

/**
 * Nutzungsbedingungen. Deliberately factual: the site hosts a catalogue of
 * third-party submissions, reviews them before publication, and can remove
 * content or restrict accounts. No automatic detection is claimed.
 */
export function termsSections(operator: OperatorDetails): LegalSection[] {
  return [
    {
      heading: '1. Geltungsbereich',
      paragraphs: [
        `Diese Nutzungsbedingungen gelten für die Nutzung der Website von ${operator.name} sowie für Konten, Entwickleranträge und eingereichte Kataloginhalte. Anbieterangaben und Kontakt stehen im [Impressum](/impressum).`,
      ],
    },
    {
      heading: '2. Konto',
      paragraphs: [
        'Für Entwicklerfunktionen und Meldungen ist ein Konto erforderlich. Zugangsdaten sind geheim zu halten. Ein Konto darf nicht automatisiert oder missbräuchlich angelegt werden.',
        'Konten haben eine von drei Stufen: registrierte Nutzer, Entwicklerkonten und Administration. Eine Registrierung vergibt immer nur die Stufe „registrierter Nutzer“; Entwicklerrechte werden über einen Antrag vergeben, Administrationsrechte ausschließlich durch die Betreiber.',
        'Ein Anspruch auf ein Konto oder auf besondere Rechte besteht nicht.',
      ],
    },
    {
      heading: '3. Nutzungsregeln',
      paragraphs: [
        'Nicht zulässig sind insbesondere rechtswidrige Inhalte, Malware oder Schadcode, Inhalte, die Rechte Dritter verletzen, irreführende Angaben sowie Spam.',
        'Katalogeinträge sind ausschließlich für das Programm WebRadio bestimmt. Beschreibungen, Screenshots und Versionslinks müssen den eingereichten Inhalt zutreffend darstellen.',
      ],
    },
    {
      heading: '4. Verantwortung für Inhalte',
      paragraphs: [
        'Für eingereichte Inhalte ist die einreichende Person im gesetzlich zulässigen Umfang verantwortlich. Sie versichert, über die erforderlichen Rechte zu verfügen.',
      ],
    },
    {
      heading: '5. Prüfung und Entfernung',
      paragraphs: [
        'Einreichungen prüft die Administration vor der Veröffentlichung. Eine solche Prüfung ist keine Garantie für die Rechtmäßigkeit eines Inhalts.',
        'Bei hinreichendem Verdacht wird ein Inhalt vorläufig eingeschränkt; bei festgestellten Verstößen wird er entfernt und dauerhaft gesperrt. Ein entferntes Angebot kann nicht erneut eingereicht werden.',
      ],
    },
    {
      heading: '6. Meldungen',
      paragraphs: [
        'Angemeldete Konten können problematische Inhalte über die [Meldefunktion](/report) melden. Die Meldung enthält das gemeldete Ziel, einen Grund und optional eine Beschreibung. Dasselbe Ziel kann pro Konto einmal gemeldet werden. Alternativ ist eine Nachricht an die im Impressum genannte Kontaktadresse möglich.',
        'Eine Meldung ist ein Hinweis und keine Feststellung eines Verstoßes. Die Administration prüft jede Meldung und hält die Entscheidung mit Begründung fest. Gegen eine Entscheidung kann Widerspruch über die im Impressum genannte Kontaktadresse eingelegt werden.',
      ],
    },
    {
      heading: '7. Maßnahmen bei Verstößen',
      paragraphs: [
        'Je nach Schwere, Wiederholung und Umständen kommt eine Verwarnung, die Einschränkung oder Entfernung von Inhalten sowie eine befristete oder dauerhafte Sperrung des Kontos in Betracht.',
        'Maßnahmen werden mit Zeitpunkt, handelnder Administration und Begründung protokolliert. Eine Sperre beendet bestehende Sitzungen sofort.',
      ],
    },
    {
      heading: '8. Entwicklerantrag',
      paragraphs: [
        'Entwicklerrechte werden nicht mit der Registrierung vergeben. Ein Antrag enthält eine Begründung von mindestens 50 Zeichen und optional eine Portfolio-Adresse. Pro Konto ist ein offener Antrag möglich; ein gestellter Antrag kann zurückgezogen werden.',
        'Die Administration entscheidet über den Antrag und begründet eine Ablehnung. Nach einer Ablehnung kann ein neuer Antrag gestellt werden. Bei Verstößen werden Entwicklerrechte entzogen.',
      ],
    },
    {
      heading: '9. Änderungen und Kontakt',
      paragraphs: [
        `Diese Nutzungsbedingungen werden angepasst, wenn sich Funktionen oder rechtliche Anforderungen ändern. Es gilt die bei der Registrierung angenommene Fassung; der Zeitpunkt der Annahme wird festgehalten. Rückfragen und Beschwerden: ${operator.email}.`,
      ],
    },
  ];
}
