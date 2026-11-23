/**
 * Regression tests for the pre-hydration form leak.
 *
 * A native form without `method` submits as GET. Before React hydrates, that
 * put the entered password into the URL of the login and registration pages.
 * These tests render the real server markup (where hydration has not happened)
 * and require POST plus a disabled submit control; the client test then proves
 * that the normal NextAuth flow still works after hydration.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';

jest.mock('@/lib/env', () => ({
  env: { REGISTRATION_ENABLED: true },
}));

jest.mock('next-auth/react', () => ({
  signIn: jest.fn(),
  getSession: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
  useSearchParams: () => new URLSearchParams('token=test-reset-token'),
}));

import { getSession, signIn } from 'next-auth/react';
import LoginPage from '../auth/login/page';
import RegisterPage from '../auth/register/page';
import ForgotPasswordPage from '../auth/forgot-password/page';
import ResetPasswordPage from '../auth/reset-password/page';

const mockSignIn = jest.mocked(signIn);
const mockGetSession = jest.mocked(getSession);

function serverMarkup(element: React.ReactElement): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(element);
  return container;
}

function submitButton(container: HTMLElement): HTMLButtonElement {
  const button = container.querySelector('button[type="submit"]');
  expect(button).not.toBeNull();
  return button as HTMLButtonElement;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('auth forms before hydration', () => {
  it.each([
    ['login', () => <LoginPage />, '/auth/login'],
    ['registration', () => <RegisterPage />, '/auth/register'],
    ['forgot password', () => <ForgotPasswordPage />, '/auth/forgot-password'],
    ['reset password', () => <ResetPasswordPage />, '/auth/reset-password'],
  ])('%s form is POST-only and cannot be submitted', (_name, renderForm, action) => {
    const container = serverMarkup(renderForm());
    const form = container.querySelector('form');

    expect(form).not.toBeNull();
    expect(form?.getAttribute('method')).toBe('post');
    expect(form?.getAttribute('action')).toBe(action);
    // The action is a fixed path, never a URL carrying query data.
    expect(form?.getAttribute('action')).not.toContain('?');
    expect(form?.getAttribute('action')).not.toContain('=');
    expect(submitButton(container)).toBeDisabled();
  });
});

describe('login after hydration', () => {
  it('submits through NextAuth instead of navigating with a GET', async () => {
    mockSignIn.mockResolvedValue({
      error: 'CredentialsSignin',
      status: 401,
      ok: false,
      url: null,
    });

    const { container } = render(<LoginPage />);

    expect(submitButton(container)).toBeEnabled();

    fireEvent.change(screen.getByLabelText('E-Mail-Adresse'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Passwort'), {
      target: { value: 'Geheim123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Anmelden' }));

    await waitFor(() =>
      expect(mockSignIn).toHaveBeenCalledWith('credentials', {
        redirect: false,
        email: 'user@example.com',
        password: 'Geheim123!',
      }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ungültige Anmeldedaten',
    );
    expect(mockGetSession).not.toHaveBeenCalled();
  });
});
