/**
 * Automated accessibility checks with axe-core.
 *
 * The checks run on the rendered markup of the shared public components. Two
 * rules are disabled on purpose:
 *   - `color-contrast` needs real layout and painting, which jsdom does not do;
 *     contrast is therefore not verified here and must be reviewed visually.
 *   - `region` expects a complete page with landmarks; a component fragment is
 *     not a page.
 */
import { render } from '@testing-library/react';
import axe from 'axe-core';
import Footer from '../public/Footer';
import ReleaseNotes from '../public/ReleaseNotes';
import DownloadButton from '../public/DownloadButton';
import { EmptyState } from '../ui/states';

const AXE_OPTIONS: axe.RunOptions = {
  rules: {
    'color-contrast': { enabled: false },
    region: { enabled: false },
  },
};

async function expectNoViolations(container: HTMLElement) {
  const results = await axe.run(container, AXE_OPTIONS);
  const summary = results.violations.map(
    (violation) => `${violation.id} (${violation.nodes.length}): ${violation.help}`,
  );
  expect(summary).toEqual([]);
}

describe('accessibility of shared public components', () => {
  it('footer has no detectable violations', async () => {
    const { container } = render(<Footer />);
    await expectNoViolations(container);
  });

  it('release notes have no detectable violations', async () => {
    const { container } = render(
      <ReleaseNotes
        notes={'## Neu\n\n- Sendersuche verbessert\n\n```\nnpm run build\n```'}
      />,
    );
    await expectNoViolations(container);
  });

  it('download button has no detectable violations', async () => {
    const { container } = render(
      <DownloadButton
        assets={[
          {
            name: 'WebRadio-1.0.6-win-x64.exe',
            platform: 'windows',
            platformLabel: 'Windows (x64)',
            downloadUrl:
              'https://github.com/YourEliteSystems/WebRadio/releases/download/v1.0.6/WebRadio-1.0.6-win-x64.exe',
            size: 136_641_014,
          },
        ]}
        version="1.0.6"
        otherPlatformsHref="#stable-heading"
      />,
    );
    await expectNoViolations(container);
  });

  it('empty state has no detectable violations', async () => {
    const { container } = render(
      <EmptyState
        title="Keine Einträge"
        description="Sobald etwas freigegeben ist, erscheint es hier."
      />,
    );
    await expectNoViolations(container);
  });
});
