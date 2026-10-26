import { render, screen } from '@testing-library/react';
import AccountWarnings from '@/components/dashboard/AccountWarnings';

describe('AccountWarnings', () => {
  it('renders nothing when the account has no warnings', () => {
    const { container } = render(<AccountWarnings warnings={[]} />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('Verwarnungen')).not.toBeInTheDocument();
  });

  it('shows date and reason of every warning and states that no mail was sent', () => {
    render(
      <AccountWarnings
        warnings={[
          {
            id: 'warning-1',
            issuedAt: '2026-10-20T10:00:00.000Z',
            reason: 'Die Beschreibung enthielt nachweislich falsche Angaben.',
          },
          { id: 'warning-2', issuedAt: '2026-10-18T09:30:00.000Z', reason: null },
        ]}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Verwarnungen' })).toBeInTheDocument();
    expect(screen.getByText(/keine Nachricht verschickt/)).toBeInTheDocument();
    expect(screen.getByText(/20\.10\.2026/)).toBeInTheDocument();
    expect(screen.getByText(/18\.10\.2026/)).toBeInTheDocument();
    expect(
      screen.getByText('Die Beschreibung enthielt nachweislich falsche Angaben.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Keine Begründung hinterlegt.')).toBeInTheDocument();
  });
});
