import { render, screen } from '@testing-library/react';
import Footer from '@/components/public/Footer';
import AuthLayout from '@/app/[locale]/(auth)/layout';
import ErrorBoundary from '@/app/[locale]/error';
import NotFound from '@/app/[locale]/not-found';
import DatenschutzPage, {
  generateMetadata as datenschutzMetadata,
} from '@/app/[locale]/(public)/datenschutz/page';
import ImpressumPage, { generateMetadata as impressumMetadata } from '@/app/[locale]/(public)/impressum/page';
import NutzungsbedingungenPage, {
  generateMetadata as termsMetadata,
} from '@/app/[locale]/(public)/nutzungsbedingungen/page';
import { OPERATOR_FIELDS } from '@/lib/legal';

// The cache wrapper needs the Next cache runtime; without a database the public
// pages render the built-in text, which is what these tests assert.
jest.mock('@/lib/cached-content', () => ({
  getCachedLegalDocument: jest.fn(async () => null),
}));

// `generateMetadata` is locale-aware now; the tests render the German pages.
const DE_PARAMS = { params: Promise.resolve({ locale: 'de' }) };

const LEGAL_VARIABLES = OPERATOR_FIELDS.map((field) => field.variable);
const COMPLETE_ENV: Record<string, string> = Object.fromEntries(
  OPERATOR_FIELDS.map((field) => [field.variable, `Testwert ${field.key}`]),
);

const saved: Record<string, string | undefined> = {};

beforeAll(() => {
  for (const variable of LEGAL_VARIABLES) {
    saved[variable] = process.env[variable];
  }
});

beforeEach(() => {
  for (const variable of LEGAL_VARIABLES) {
    delete process.env[variable];
  }
});

afterEach(() => {
  for (const variable of LEGAL_VARIABLES) {
    delete process.env[variable];
  }
});

afterAll(() => {
  for (const variable of LEGAL_VARIABLES) {
    const value = saved[variable];
    if (value === undefined) {
      delete process.env[variable];
    } else {
      process.env[variable] = value;
    }
  }
});

const PAGE_PROPS = { params: Promise.resolve({ locale: 'de' as const }) };

function setCompleteEnv() {
  for (const [variable, value] of Object.entries(COMPLETE_ENV)) {
    process.env[variable] = value;
  }
}

describe('legal pages without any LEGAL_ configuration', () => {
  it('renders the Impressum and states which details are still missing', async () => {
    const page = await ImpressumPage(PAGE_PROPS);
    render(page);

    expect(screen.getByRole('heading', { level: 1, name: 'Impressum' })).toBeInTheDocument();
    expect(screen.getByText('Angaben noch nicht vollständig')).toBeInTheDocument();
  });

  it('renders the Datenschutzerklärung and states which details are still missing', async () => {
    const page = await DatenschutzPage(PAGE_PROPS);
    render(page);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Datenschutzerklärung' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Angaben noch nicht vollständig')).toBeInTheDocument();
  });

  it('renders the Nutzungsbedingungen and states which details are still missing', async () => {
    const page = await NutzungsbedingungenPage(PAGE_PROPS);
    render(page);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Nutzungsbedingungen' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Angaben noch nicht vollständig')).toBeInTheDocument();
  });

  it('renders both pages without any session or role context', async () => {
    // No NextAuth provider, no session mock, no role: rendering must not require
    // authentication at all.
    const impressum = await ImpressumPage(PAGE_PROPS);
    const { unmount } = render(impressum);
    expect(screen.getByRole('link', { name: 'Datenschutz' })).toHaveAttribute(
      'href',
      '/de/datenschutz',
    );
    unmount();

    const datenschutz = await DatenschutzPage(PAGE_PROPS);
    render(datenschutz);
    expect(screen.getByRole('link', { name: 'Impressum' })).toHaveAttribute('href', '/de/impressum');
  });

  it('keeps incomplete texts out of search indexes without blocking the page', async () => {
    expect((await impressumMetadata(DE_PARAMS)).robots).toEqual({ index: false, follow: false });
    expect((await datenschutzMetadata(DE_PARAMS)).robots).toEqual({ index: false, follow: false });
    expect((await termsMetadata(DE_PARAMS)).robots).toEqual({ index: false, follow: false });
  });

  it('renders no bracketed placeholders in the incomplete notice', async () => {
    const impressum = await ImpressumPage(PAGE_PROPS);
    render(impressum);

    const container = screen.getByText('Angaben noch nicht vollständig');
    expect(container.textContent).not.toMatch(/\[.*\]/);
  });
});

describe('legal pages with complete operator details', () => {
  it('renders the Impressum with a real address element and no fabricated party', async () => {
    setCompleteEnv();

    const { container } = render(await ImpressumPage(PAGE_PROPS));

    expect(screen.getByRole('heading', { name: 'Anbieter' })).toBeInTheDocument();
    const address = container.querySelector('address');
    expect(address).not.toBeNull();
    expect(address?.textContent).toContain('Testwert name');
    expect(address?.textContent).toContain('Testwert street');
    expect(container.textContent?.toLowerCase()).not.toContain('vercel.com');
    expect(container.textContent).not.toMatch(/\[.*\]/);
  });

  it('renders the privacy summary and the data table from the central dataset', async () => {
    setCompleteEnv();

    render(await DatenschutzPage(PAGE_PROPS));

    expect(screen.getByRole('heading', { name: 'Kurzfassung' })).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Rechtsgrundlage' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/next-auth\.session-token/).length).toBeGreaterThan(0);
    expect(document.body.textContent?.toLowerCase()).not.toContain('vercel.com');
  });

  it('renders the terms with a link to the Impressum', async () => {
    setCompleteEnv();

    render(await NutzungsbedingungenPage(PAGE_PROPS));

    expect(screen.getByRole('heading', { name: '1. Geltungsbereich' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Impressum' }).length).toBeGreaterThan(0);
  });

  it('drops the noindex when the text is complete', async () => {
    setCompleteEnv();

    expect((await impressumMetadata(DE_PARAMS)).robots).toBeUndefined();
    expect((await datenschutzMetadata(DE_PARAMS)).robots).toBeUndefined();
    expect((await termsMetadata(DE_PARAMS)).robots).toBeUndefined();
  });
});

describe('permanent legal links', () => {
  it('links Impressum, Datenschutz and Nutzungsbedingungen in the footer without any configuration', () => {
    render(<Footer />);

    expect(screen.getByRole('link', { name: 'Impressum' })).toHaveAttribute('href', '/de/impressum');
    expect(screen.getByRole('link', { name: 'Datenschutz' })).toHaveAttribute('href', '/de/datenschutz');
    expect(screen.getByRole('link', { name: 'Nutzungsbedingungen' })).toHaveAttribute(
      'href',
      '/de/nutzungsbedingungen',
    );
  });

  it('links both pages from the auth layout used by login and registration', async () => {
    render(
      await AuthLayout({
        children: <div>Anmeldeformular</div>,
        params: Promise.resolve({ locale: 'de' }),
      }),
    );

    expect(screen.getByRole('link', { name: 'Impressum' })).toHaveAttribute('href', '/de/impressum');
    expect(screen.getByRole('link', { name: 'Datenschutz' })).toHaveAttribute('href', '/de/datenschutz');
  });

  it('links both pages from the not-found and error pages', async () => {
    const { unmount } = render(await NotFound());
    expect(screen.getByRole('link', { name: 'Impressum' })).toHaveAttribute('href', '/de/impressum');
    expect(screen.getByRole('link', { name: 'Datenschutz' })).toHaveAttribute('href', '/de/datenschutz');
    unmount();

    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary error={new Error('Testfehler')} reset={() => {}} />);
    expect(screen.getByRole('link', { name: 'Impressum' })).toHaveAttribute('href', '/de/impressum');
    expect(screen.getByRole('link', { name: 'Datenschutz' })).toHaveAttribute('href', '/de/datenschutz');
    consoleError.mockRestore();
  });
});
