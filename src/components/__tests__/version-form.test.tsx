import { fireEvent, render, screen } from '@testing-library/react';
import VersionForm from '@/components/dashboard/VersionForm';

const listPayload = {
  repository: { fullName: 'owner/repo', url: 'https://github.com/owner/repo' },
  stale: false,
  fetchedAt: '2026-10-30T10:00:00.000Z',
  releases: [
    {
      id: 1,
      tagName: 'v1.2.3',
      version: '1.2.3',
      name: 'Version 1.2.3',
      publishedAt: '2026-10-01T10:00:00.000Z',
      htmlUrl: 'https://github.com/owner/repo/releases/tag/v1.2.3',
      isPrerelease: false,
      notes: 'Fehler behoben.',
      assets: [
        {
          name: 'plugin-1.2.3.zip',
          size: 204_800,
          downloadUrl:
            'https://github.com/owner/repo/releases/download/v1.2.3/plugin-1.2.3.zip',
          digest: `sha256:${'a'.repeat(64)}`,
          contentType: 'application/zip',
        },
      ],
    },
    {
      id: 2,
      tagName: 'v2.0.0-beta.1',
      version: '2.0.0',
      name: 'Beta',
      publishedAt: '2026-10-20T10:00:00.000Z',
      htmlUrl: 'https://github.com/owner/repo/releases/tag/v2.0.0-beta.1',
      isPrerelease: true,
      notes: 'Vorschau.',
      assets: [],
    },
  ],
};

function renderForm(repositoryUrl?: string | null) {
  return render(
    <VersionForm
      action={() => {}}
      kindLabel="Plugin"
      entryId="plugin-1"
      slug="mein-plugin"
      cancelHref="/developer/plugins/mein-plugin"
      repositoryUrl={repositoryUrl}
    />,
  );
}

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('VersionForm', () => {
  it('keeps the manual input available by default', () => {
    renderForm();

    expect(screen.getByRole('radio', { name: 'Manuell eintragen' })).toBeChecked();
    expect(screen.queryByLabelText('GitHub-Repository')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Version \(SemVer\)/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Download-URL/)).toBeInTheDocument();
  });

  it('prefills the stored repository and opens the GitHub mode without fetching', () => {
    renderForm('https://github.com/owner/repo');

    expect(screen.getByRole('radio', { name: 'Aus GitHub-Releases übernehmen' })).toBeChecked();
    expect(screen.getByLabelText('GitHub-Repository')).toHaveValue(
      'https://github.com/owner/repo',
    );
    // The list is loaded on demand, never during render.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads releases and copies the selected release into the form', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => listPayload,
    });

    renderForm();
    fireEvent.click(screen.getByLabelText('Aus GitHub-Releases übernehmen'));
    fireEvent.change(screen.getByLabelText('GitHub-Repository'), {
      target: { value: 'github.com/owner/repo' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Releases laden' }));

    expect(await screen.findByText('Version 1.2.3')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/developer/github/releases?url=github.com%2Fowner%2Frepo',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    );
    expect(screen.getByText('Pre-Release')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /v1\.2\.3/ }));

    expect((screen.getByLabelText(/Version \(SemVer\)/) as HTMLInputElement).value).toBe('1.2.3');
    expect((screen.getByLabelText(/Dateigröße/) as HTMLInputElement).value).toBe('204800');
    expect((screen.getByLabelText(/Download-URL/) as HTMLInputElement).value).toBe(
      'https://github.com/owner/repo/releases/download/v1.2.3/plugin-1.2.3.zip',
    );
    expect((screen.getByLabelText(/Prüfsumme/) as HTMLInputElement).value).toBe(
      `sha256:${'a'.repeat(64)}`,
    );
    expect((screen.getByLabelText('Versionshinweise') as HTMLTextAreaElement).value).toBe(
      'Fehler behoben.',
    );
  });

  it('explains a release without download files and keeps manual fields', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ...listPayload, releases: [listPayload.releases[1]] }),
    });

    renderForm();
    fireEvent.click(screen.getByLabelText('Aus GitHub-Releases übernehmen'));
    fireEvent.change(screen.getByLabelText('GitHub-Repository'), {
      target: { value: 'github.com/owner/repo' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Releases laden' }));

    fireEvent.click(await screen.findByRole('radio', { name: /v2\.0\.0-beta\.1/ }));

    expect(
      screen.getByText(/keine Download-Dateien hinterlegt/),
    ).toBeInTheDocument();
    expect((screen.getByLabelText(/Version \(SemVer\)/) as HTMLInputElement).value).toBe('2.0.0');
    expect((screen.getByLabelText(/Dateigröße/) as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('button', { name: /Version für Plugin speichern/ })).toBeEnabled();
  });

  it('shows the concrete API error and lets the developer continue manually', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        error: 'GITHUB_NOT_FOUND',
        message: 'Repository nicht gefunden. Prüfe die Schreibweise oder ob das Repository privat ist.',
      }),
    });

    renderForm();
    fireEvent.click(screen.getByLabelText('Aus GitHub-Releases übernehmen'));
    fireEvent.change(screen.getByLabelText('GitHub-Repository'), {
      target: { value: 'github.com/owner/missing' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Releases laden' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Repository nicht gefunden');
    fireEvent.click(screen.getByLabelText('Manuell eintragen'));
    expect(screen.getByLabelText(/Version \(SemVer\)/)).toBeEnabled();
  });

  it('reports a repository without releases', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ...listPayload, releases: [] }),
    });

    renderForm();
    fireEvent.click(screen.getByLabelText('Aus GitHub-Releases übernehmen'));
    fireEvent.change(screen.getByLabelText('GitHub-Repository'), {
      target: { value: 'github.com/owner/repo' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Releases laden' }));

    expect(
      await screen.findByText(/keine veröffentlichten Releases/),
    ).toBeInTheDocument();
  });
});
