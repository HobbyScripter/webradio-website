import { render, screen } from '@testing-library/react';
import ChecksumCopy from '../public/ChecksumCopy';

describe('ChecksumCopy', () => {
  it('shows the hash without the algorithm prefix', () => {
    const hash = 'a'.repeat(64);
    render(<ChecksumCopy checksum={`sha256:${hash}`} />);

    expect(screen.getByText(hash)).toBeInTheDocument();
    expect(screen.queryByText(/sha256:/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Prüfsumme kopieren' })).toBeInTheDocument();
  });

  it('keeps a hash that has no prefix', () => {
    const hash = 'b'.repeat(64);
    render(<ChecksumCopy checksum={hash} />);

    expect(screen.getByText(hash)).toBeInTheDocument();
  });
});
