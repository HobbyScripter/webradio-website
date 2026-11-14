'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { CheckIcon, AlertIcon, ClockIcon } from '@/components/ui/icons';

export default function SyncButton() {
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const router = useRouter();

  async function handleSync() {
    setSyncing(true);
    setMessage(null);

    try {
      const res = await fetch('/api/admin/downloads/sync', {
        method: 'POST',
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage({
          text: data.message || 'Fehler beim Synchronisieren.',
          type: 'error',
        });
      } else {
        setMessage({
          text: `Erfolgreich synchronisiert: ${data.syncedAssetsCount} Assets (${data.totalGitHubDownloads} GitHub-Downloads).`,
          type: 'success',
        });
        router.refresh();
      }
    } catch {
      setMessage({
        text: 'Netzwerkfehler beim Starten der Synchronisierung.',
        type: 'error',
      });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <Button
        onClick={handleSync}
        disabled={syncing}
        size="sm"
        className="inline-flex items-center gap-1.5"
      >
        <ClockIcon className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
        {syncing ? 'Synchronisiere...' : 'Jetzt mit GitHub synchronisieren'}
      </Button>
      {message ? (
        <p
          className={`flex items-center gap-1.5 text-xs ${
            message.type === 'success' ? 'text-emerald-400' : 'text-rose-400'
          }`}
        >
          {message.type === 'success' ? (
            <CheckIcon className="h-3.5 w-3.5" />
          ) : (
            <AlertIcon className="h-3.5 w-3.5" />
          )}
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

