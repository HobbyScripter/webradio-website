import { render, screen } from '@testing-library/react';
import CatalogEntryForm from '@/components/dashboard/CatalogEntryForm';

const baseProps = {
  action: () => {},
  mode: 'create' as const,
  cancelHref: '/developer/plugins',
};

describe('CatalogEntryForm repository field', () => {
  it('offers the optional GitHub repository for plugins', () => {
    render(<CatalogEntryForm {...baseProps} kindLabel="Plugin" />);

    const field = screen.getByLabelText(/GitHub-Repository/);
    expect(field).toHaveAttribute('name', 'repositoryUrl');
    expect(field).toHaveValue('');
    expect(screen.getByText(/Zusatzpfade wie/)).toBeInTheDocument();
  });

  it('does not add the field to the theme form', () => {
    render(<CatalogEntryForm {...baseProps} kindLabel="Theme" />);

    expect(screen.queryByLabelText(/GitHub-Repository/)).not.toBeInTheDocument();
  });

  it('prefills the stored repository when editing', () => {
    render(
      <CatalogEntryForm
        {...baseProps}
        mode="edit"
        kindLabel="Plugin"
        entryId="plugin-1"
        initial={{
          slug: 'mein-plugin',
          name: 'Mein Plugin',
          description: 'Eine Beschreibung für das Plugin.',
          repositoryUrl: 'https://github.com/owner/repo',
        }}
      />,
    );

    expect(screen.getByLabelText(/GitHub-Repository/)).toHaveValue(
      'https://github.com/owner/repo',
    );
  });
});
