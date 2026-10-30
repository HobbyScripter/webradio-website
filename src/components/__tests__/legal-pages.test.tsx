import { render, screen } from '@testing-library/react';
import Footer from '@/components/public/Footer';
import AuthLayout from '@/app/(auth)/layout';
import ErrorBoundary from '@/app/error';
import NotFound from '@/app/not-found';
import DatenschutzPage, {
  generateMetadata as datenschutzMetadata,
} from '@/app/(public)/datenschutz/page';
import ImpressumPage, { generateMetadata as impressumMetadata } from '@/app/(public)/impressum/page';
import { OPERATOR_FIELDS } from '@/lib/legal';

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

function setCompleteEnv() {
  for (const [variable, value] of Object.entries(COMPLETE_ENV)) {
    process.env[variable] = value;
  }
}

describe('legal pages without any LEGAL_ configuration', () => {
  it('renders the Impressum and states which details are still missing', () => {
    render(<ImpressumPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Impressum' })).toBeInTheDocument();
    expect(screen.getByText('Pflichtangaben noch nicht vollständig')).toBeInTheDocument();
  });

  it('renders the Datenschutzerklärung and states which details are still missing', () => {
    render(<DatenschutzPage />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Datenschutzerklärung' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Pflichtangaben noch nicht vollständig')).toBeInTheDocument();
  });

  it('renders both pages without any session or role context', () => {
    // No NextAuth provider, no session mock, no role: rendering must not require
    // authentication at all.
    const { unmount } = render(<ImpressumPage />);
    expect(screen.getByRole('link', { name: 'Datenschutz' })).toHaveAttribute(
      'href',
      '/datenschutz',
    );
    unmount();

    render(<DatenschutzPage />);
    expect(screen.getByRole('link', { name: 'Impressum' })).toHaveAttribute('href', '/impressum');
  });

  it('keeps incomplete texts out of search indexes without blocking the page', () => {
    expect(impressumMetadata().robots).toEqual({ index: false, follow: false });
    expect(datenschutzMetadata().robots).toEqual({ index: false, follow: false });
  });
});

describe('legal pages with complete operator details', () => {
  it('renders the actual Impressum and Datenschutz text', () => {
    setCompleteEnv();

    const { unmount } = render(<ImpressumPage />);
    expect(screen.getByRole('heading', { name: 'Angaben gemäß § 5 DDG' })).toBeInTheDocument();
    unmount();

    render(<DatenschutzPage />);
    expect(screen.getByRole('heading', { name: '1. Verantwortlicher' })).toBeInTheDocument();
  });

  it('drops the noindex when the text is complete', () => {
    setCompleteEnv();

    expect(impressumMetadata().robots).toBeUndefined();
    expect(datenschutzMetadata().robots).toBeUndefined();
  });
});

describe('permanent legal links', () => {
  it('links Impressum and Datenschutz in the footer without any configuration', () => {
    render(<Footer />);

    expect(screen.getByRole('link', { name: 'Impressum' })).toHaveAttribute('href', '/impressum');
    expect(screen.getByRole('link', { name: 'Datenschutz' })).toHaveAttribute('href', '/datenschutz');
  });

  it('keeps the footer links when every operator detail is present', () => {
    setCompleteEnv();

    render(<Footer />);

    expect(screen.getByRole('link', { name: 'Impressum' })).toHaveAttribute('href', '/impressum');
    expect(screen.getByRole('link', { name: 'Datenschutz' })).toHaveAttribute('href', '/datenschutz');
    expect(screen.queryByText(/noch nicht veröffentlicht/i)).not.toBeInTheDocument();
  });

  it('links both pages from the auth layout used by login and registration', () => {
    render(
      <AuthLayout>
        <div>Anmeldeformular</div>
      </AuthLayout>,
    );

    expect(screen.getByRole('link', { name: 'Impressum' })).toHaveAttribute('href', '/impressum');
    expect(screen.getByRole('link', { name: 'Datenschutz' })).toHaveAttribute('href', '/datenschutz');
  });

  it('links both pages from the not-found and error pages', () => {
    const { unmount } = render(<NotFound />);
    expect(screen.getByRole('link', { name: 'Impressum' })).toHaveAttribute('href', '/impressum');
    expect(screen.getByRole('link', { name: 'Datenschutz' })).toHaveAttribute('href', '/datenschutz');
    unmount();

    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary error={new Error('Testfehler')} reset={() => {}} />);
    expect(screen.getByRole('link', { name: 'Impressum' })).toHaveAttribute('href', '/impressum');
    expect(screen.getByRole('link', { name: 'Datenschutz' })).toHaveAttribute('href', '/datenschutz');
    consoleError.mockRestore();
  });
});
