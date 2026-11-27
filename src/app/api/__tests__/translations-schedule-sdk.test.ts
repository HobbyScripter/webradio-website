/**
 * @jest-environment node
 *
 * Exercises the real `@vercel/schedules` wrapper of the translation schedule
 * instead of mocking it: the CloudEvent headers are parsed by the SDK, a
 * successful run answers 200 and a failing run throws so the execution is not
 * reported as green.
 */
import { POST } from '../schedules/translations/route';
import { executeTranslationSchedule } from '@/lib/translation/schedule-execution';
import type { TranslationScheduleResult } from '@/lib/translation/schedule-execution';

jest.mock('@/lib/translation/schedule-execution', () => ({
  executeTranslationSchedule: jest.fn(),
}));

const runMock = executeTranslationSchedule as jest.MockedFunction<
  typeof executeTranslationSchedule
>;

const HEADERS: Record<string, string> = {
  'ce-specversion': '1.0',
  'ce-type': 'com.vercel.schedule.v1beta',
  'ce-source': '/vercel/schedules',
  'ce-id': 'exec-1',
  'ce-vssscheduledat': '2026-11-27T05:30:00.000Z',
  'ce-vssscheduleid': 'sched-1',
  'ce-vssschedulename': 'translations-worker',
  'ce-vssnamespace': 'default',
  'ce-vssschedulesource': 'static',
  'ce-vssexpression': '30 5 * * *',
};

function dispatch(headers: Record<string, string> = HEADERS): Request {
  return new Request('https://webradio.example/api/schedules/translations', {
    method: 'POST',
    headers,
  });
}

function run(overrides: Partial<TranslationScheduleResult> = {}): TranslationScheduleResult {
  return {
    ok: true,
    errorCode: null,
    provider: 'deepl',
    limit: 20,
    outdated: 0,
    attempted: 3,
    translated: 3,
    skipped: 0,
    blocked: 0,
    failed: 0,
    characters: 120,
    durationMs: 900,
    ...overrides,
  };
}

beforeEach(() => {
  runMock.mockReset();
  runMock.mockResolvedValue(run());
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('translations schedule function (real SDK)', () => {
  it('parses the dispatch and answers 200', async () => {
    const response = await POST(dispatch());

    expect(response.status).toBe(200);
    expect(runMock).toHaveBeenCalledTimes(1);
  });

  it('throws when the run fails, so the execution is not green', async () => {
    runMock.mockResolvedValue(run({ ok: false, errorCode: 'NOT_CONFIGURED' }));

    await expect(POST(dispatch())).rejects.toThrow('failed: NOT_CONFIGURED');
  });

  it('rejects a request without schedule headers with 400', async () => {
    const response = await POST(dispatch({ 'ce-specversion': '1.0' }));

    expect(response.status).toBe(400);
    expect(runMock).not.toHaveBeenCalled();
  });

  it('never logs translated text or the API key', async () => {
    process.env['DEEPL_API_KEY'] = 'deepl-key-9f3c';

    await POST(dispatch());

    const logged = [
      ...(console.info as jest.Mock).mock.calls.flat(),
      ...(console.error as jest.Mock).mock.calls.flat(),
    ]
      .map((entry) => String(entry))
      .join('\n');

    expect(logged).not.toContain('deepl-key-9f3c');
    delete process.env['DEEPL_API_KEY'];
  });
});
