/**
 * @jest-environment jsdom
 *
 * Icon selector: search, filtering, empty results, selection, removal and a
 * stored name that no longer exists in the icon set.
 */
jest.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'de',
    format: {},
    t: (key: string) =>
      ({
        'admin.customLinks.icon.none': 'Kein Icon',
        'admin.customLinks.icon.choose': 'Icon auswählen',
        'admin.customLinks.icon.search': 'Icon suchen...',
        'admin.customLinks.icon.empty': 'Keine Icons gefunden',
      })[key] ?? key,
  }),
}));

import { fireEvent, render, screen } from '@testing-library/react';
import * as lucideIcons from 'lucide-react';
import { IconSelector } from '../IconSelector';

const SOME_ICON = Object.keys(lucideIcons).find((name) => /^[A-Z][a-z]{4,}$/.test(name)) ?? 'Radio';

function openSelector() {
  fireEvent.click(screen.getByRole('button', { name: 'Icon auswählen' }));
}

describe('IconSelector', () => {
  it('shows the empty state and opens the picker', () => {
    render(<IconSelector value={null} onChange={jest.fn()} />);

    expect(screen.getByText('Kein Icon')).toBeInTheDocument();
    expect(screen.getByText('Icon auswählen')).toBeInTheDocument();

    openSelector();
    expect(screen.getByPlaceholderText('Icon suchen...')).toBeInTheDocument();
  });

  it('filters by search term and selects an icon', () => {
    const onChange = jest.fn();
    render(<IconSelector value={null} onChange={onChange} />);

    openSelector();
    fireEvent.change(screen.getByPlaceholderText('Icon suchen...'), {
      target: { value: SOME_ICON.toLowerCase() },
    });

    const option = screen.getByRole('button', { name: SOME_ICON });
    fireEvent.click(option);

    expect(onChange).toHaveBeenCalledWith(SOME_ICON);
  });

  it('shows an empty result message for a term without matches', () => {
    render(<IconSelector value={null} onChange={jest.fn()} />);

    openSelector();
    fireEvent.change(screen.getByPlaceholderText('Icon suchen...'), {
      target: { value: 'zzzzzzzznotanicon' },
    });

    expect(screen.getByText('Keine Icons gefunden')).toBeInTheDocument();
  });

  it('removes the icon through the "no icon" entry', () => {
    const onChange = jest.fn();
    render(<IconSelector value={SOME_ICON} onChange={onChange} />);

    openSelector();
    fireEvent.click(screen.getByRole('button', { name: 'Kein Icon' }));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('marks the current icon as selected', () => {
    render(<IconSelector value={SOME_ICON} onChange={jest.fn()} />);

    openSelector();
    expect(screen.getByRole('button', { name: SOME_ICON })).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders an unknown stored icon name without crashing', () => {
    render(<IconSelector value="NotARealIcon" onChange={jest.fn()} />);

    expect(screen.getByText('NotARealIcon')).toBeInTheDocument();
    expect(screen.getByText('Kein Icon')).toBeInTheDocument();
  });
});
