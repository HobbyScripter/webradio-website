import { ImageResponse } from 'next/og';
import { SITE_DESCRIPTION, SITE_TAGLINE } from '@/lib/site';

/**
 * Site-wide social preview image (1200×630).
 *
 * Rendered by Next from code, so it always matches the brand colours and the
 * tagline instead of drifting from a hand-exported file. Pages that set their
 * own image (plugin/theme detail pages use the first preview screenshot)
 * override this default.
 */
export const alt = 'WebRadio – Internetradio für Windows und Linux';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px',
          background:
            'radial-gradient(circle at 18% 12%, #3b1d6e 0%, #0b0b10 46%, #050507 100%)',
          color: '#ffffff',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 72,
              height: 72,
              borderRadius: 20,
              background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
              fontSize: 40,
              fontWeight: 700,
            }}
          >
            W
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 30,
              letterSpacing: 6,
              textTransform: 'uppercase',
              color: '#c4b5fd',
            }}
          >
            {SITE_TAGLINE}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', fontSize: 132, fontWeight: 800, letterSpacing: -3 }}>
            WebRadio
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 34,
              lineHeight: 1.35,
              color: '#d4d4d8',
              maxWidth: 940,
            }}
          >
            {SITE_DESCRIPTION}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 26, color: '#a1a1aa' }}>
          <div style={{ display: 'flex', width: 12, height: 12, borderRadius: 6, background: '#34d399' }} />
          <div style={{ display: 'flex' }}>Windows · Linux · Open Source · Apache-2.0</div>
        </div>
      </div>
    ),
    size,
  );
}
