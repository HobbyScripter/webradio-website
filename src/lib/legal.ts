/**
 * Legal pages.
 *
 * `/impressum` and `/datenschutz` are permanent parts of the site. Their routes,
 * the footer links and the in-page navigation are unconditional: no environment
 * variable, role, account status or feature flag enables or disables them.
 *
 * The `LEGAL_*` variables below are not an activation switch. They only carry
 * the operator facts the texts need. While a required fact is missing, the page
 * still answers normally but renders a clearly marked notice instead of a
 * plausible-looking placeholder, because inventing operator details is not an
 * option. As soon as every required value is present, the texts are rendered.
 *
 * `noindex` is not access control: the page is reachable for every visitor in
 * both states.
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
    label: 'Speicherdauer des Audit-Protokolls',
    required: true,
  },
  {
    key: 'retentionRateLimits',
    variable: 'LEGAL_RETENTION_RATE_LIMITS',
    label: 'Speicherdauer der Rate-Limit-Daten',
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

export type LegalSection = { heading: string; paragraphs: string[] };

/**
 * Impressum. Only the operator details are variable; the structure follows the
 * usual § 5 DDG facts and adds nothing that has not been confirmed.
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
      heading: 'Angaben gemäß § 5 DDG',
      paragraphs: [
        `${operator.name}\n${operator.street}\n${operator.postalCode} ${operator.city}\n${operator.country}`,
        contact,
      ],
    },
    ...(operator.representedBy
      ? [{ heading: 'Vertretung', paragraphs: [operator.representedBy] }]
      : []),
    ...(register ? [{ heading: 'Registereintrag', paragraphs: [register] }] : []),
    {
      heading: 'Verantwortlich für den Inhalt',
      paragraphs: [`${operator.responsibleForContent}`],
    },
    {
      heading: 'Hinweis zu dieser Website',
      paragraphs: [
        'Diese Website stellt Informationen, Downloads und einen Katalog für das quelloffene Desktop-Programm WebRadio bereit. Plugins und Themes werden von Dritten eingereicht und vor der Veröffentlichung geprüft.',
        'Diese Seite ersetzt keine rechtliche Prüfung der Angaben.',
      ],
    },
  ];
}

/**
 * Datenschutzerklärung. Every statement below describes the verified technical
 * state of the application:
 *   - transactional e-mail delivery is paused (no provider is called),
 *   - there is no analytics, tracking or advertising,
 *   - sessions use one HttpOnly cookie plus the database session row.
 */
export function privacySections(operator: OperatorDetails): LegalSection[] {
  return [
    {
      heading: '1. Verantwortlicher',
      paragraphs: [
        `${operator.name}, ${operator.street}, ${operator.postalCode} ${operator.city}, ${operator.country}`,
        `Kontakt: ${operator.email}${operator.phone ? `, ${operator.phone}` : ''}`,
      ],
    },
    {
      heading: '2. Hosting und Datenbank',
      paragraphs: [
        `Die Website wird bei ${operator.hostingProvider} betrieben (Region: ${operator.hostingRegion}). Die Datenbank wird bei ${operator.databaseProvider} betrieben (Region: ${operator.databaseRegion}).`,
        'Dabei verarbeitet der Hosting-Anbieter technisch notwendige Verbindungs- und Serverprotokolldaten. Mit den Anbietern sind die erforderlichen Vereinbarungen zur Auftragsverarbeitung zu schließen; die Angaben hierzu sind vor der Veröffentlichung zu prüfen.',
      ],
    },
    {
      heading: '3. Konto und Anmeldung',
      paragraphs: [
        'Bei der Registrierung speichern wir die E-Mail-Adresse, den freiwilligen Anzeigenamen, einen bcrypt-Hash des Passworts, die Rolle des Kontos sowie Zeitstempel.',
        'Ein Konto ist nach der Registrierung sofort nutzbar. Eine Bestätigung der E-Mail-Adresse ist derzeit nicht erforderlich und wird derzeit nicht versendet; die E-Mail-Adresse gilt damit nicht als nachgewiesen bestätigt.',
        'Rechtsgrundlage und Speicherdauer sind vor der Veröffentlichung zu bestätigen.',
      ],
    },
    {
      heading: '4. Sitzungen und Cookies',
      paragraphs: [
        'Für die Anmeldung wird ein technisch notwendiges Cookie gesetzt (HttpOnly, SameSite=Lax, unter HTTPS Secure). Es enthält ein verschlüsseltes Token, das auf einen Datensatz in der Sitzungstabelle verweist. Die Sitzung endet nach 30 Tagen, beim Abmelden oder wenn sie widerrufen wird.',
        `Speicherdauer: ${operator.retentionSessions}`,
        'Es werden keine Analyse-, Marketing- oder Tracking-Cookies eingesetzt.',
      ],
    },
    {
      heading: '5. Sicherheits- und Audit-Protokoll',
      paragraphs: [
        'Sicherheitsrelevante Vorgänge (z. B. Registrierung, Anmeldung, Rollenwechsel, Moderations- und Sperrentscheidungen) werden mit Zeitpunkt, Aktion und einer reduzierten Akteursangabe protokolliert.',
        `Speicherdauer: ${operator.retentionAuditLogs}`,
      ],
    },
    {
      heading: '6. Missbrauchserkennung und Rate-Limits',
      paragraphs: [
        'Zur Abwehr von automatisierten Angriffen und Massenanfragen werden Zähler gespeichert. Der Schlüssel ist ein SHA-256-Digest aus Zweck, normalisierter Kennung und Zeitfenster; E-Mail-Adressen oder IP-Adressen werden dafür nicht im Klartext gespeichert.',
        `Speicherdauer: ${operator.retentionRateLimits}`,
      ],
    },
    {
      heading: '7. E-Mail-Versand',
      paragraphs: [
        `Ein Versand von Verifizierungs- und Passwort-Reset-E-Mails ist derzeit deaktiviert; es findet kein Versand statt, und es werden dafür keine Nachrichten an einen Zustelldienst übergeben. Vorgesehener Anbieter für eine spätere Aktivierung: ${operator.mailProvider}.`,
        'Bestehende Bestätigungs- und Passwort-Reset-Funktionen bleiben technisch vorhanden und können nach einer Aktivierung genutzt werden. Über die Aktivierung wird an dieser Stelle informiert.',
      ],
    },
    {
      heading: '8. Meldungen und Moderation',
      paragraphs: [
        'Angemeldete Nutzer können Katalogeinträge melden. Gespeichert werden dabei die meldende Person, das gemeldete Ziel, ein Grund und der optionale Freitext der Meldung. Meldungen werden ausschließlich von berechtigten Administratoren geprüft; eine Meldung allein löst keine Maßnahme aus.',
      ],
    },
    {
      heading: '9. Empfänger und Drittlandtransfers',
      paragraphs: [
        'Eine Weitergabe an Dritte erfolgt nur an die genannten Dienstleister (Hosting, Datenbank) sowie im Rahmen gesetzlicher Pflichten. Ob dabei Daten in Drittländer übermittelt werden, hängt von den tatsächlich gewählten Regionen ab und ist vor der Veröffentlichung zu prüfen.',
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
        'Diese Informationen beschreiben den technischen Stand der Anwendung. Sie sind vor einer Veröffentlichung rechtlich zu prüfen und an den tatsächlichen Betrieb anzupassen.',
      ],
    },
  ];
}

/**
 * Nutzungsregeln. Deliberately factual: the site hosts a catalogue of
 * third-party submissions, reviews them before publication, and can remove
 * content or restrict accounts. No automatic detection is claimed.
 */
export function termsSections(operator: OperatorDetails): LegalSection[] {
  return [
    {
      heading: '1. Geltungsbereich',
      paragraphs: [
        `Diese Regeln gelten für die Nutzung der Website von ${operator.name} sowie für Konten, Entwickleranträge und eingereichte Kataloginhalte.`,
      ],
    },
    {
      heading: '2. Konto',
      paragraphs: [
        'Für Entwicklerfunktionen und Meldungen ist ein Konto erforderlich. Zugangsdaten sind geheim zu halten. Ein Konto darf nicht automatisiert oder missbräuchlich angelegt werden.',
        'Ein Anspruch auf ein Konto oder auf eine bestimmte Rolle besteht nicht.',
      ],
    },
    {
      heading: '3. Verbotene Inhalte',
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
        'Einreichungen werden vor der Veröffentlichung geprüft. Es findet keine automatische Erkennung aller rechtswidrigen Inhalte statt; eine Prüfung ist keine Garantie für die Rechtmäßigkeit eines Inhalts.',
        'Bei hinreichendem Verdacht kann ein Inhalt vorläufig eingeschränkt, bei festgestellten Verstößen entfernt und dauerhaft gesperrt werden. Eine Entfernung ist für die einreichende Person nicht erneut einreichbar.',
      ],
    },
    {
      heading: '6. Meldungen',
      paragraphs: [
        `Problematische Inhalte können über die Meldefunktion oder per E-Mail an ${operator.email} gemeldet werden. Eine Meldung ist ein Hinweis und keine Feststellung eines Verstoßes.`,
      ],
    },
    {
      heading: '7. Maßnahmen bei Verstößen',
      paragraphs: [
        'Je nach Schwere, Wiederholung und Umständen kommen eine Verwarnung, die Einschränkung oder Entfernung von Inhalten sowie eine befristete oder dauerhafte Sperrung des Kontos in Betracht.',
        'Maßnahmen werden mit Zeitpunkt, handelnder Administration und Begründung protokolliert. Eine Sperre beendet bestehende Sitzungen sofort.',
      ],
    },
    {
      heading: '8. Entwicklerzugang',
      paragraphs: [
        'Entwicklerrechte werden nicht automatisch mit der Registrierung vergeben. Ein Antrag wird von der Administration geprüft und kann genehmigt oder abgelehnt werden; ein Anspruch auf Freischaltung besteht nicht.',
        'Bei Verstößen können Entwicklerrechte entzogen werden.',
      ],
    },
    {
      heading: '9. Änderungen und Kontakt',
      paragraphs: [
        `Diese Regeln können angepasst werden, wenn sich Funktionen oder rechtliche Anforderungen ändern. Rückfragen und Beschwerden: ${operator.email}.`,
      ],
    },
  ];
}
