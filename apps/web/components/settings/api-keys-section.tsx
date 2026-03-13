'use client';

import { useEffect, useState } from 'react';
import { Loader2, Plus, Copy, Trash2, Check, AlertCircle, Key } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { userApi } from '../../lib/auth-service';
import type { ApiKey, ApiKeyCreated } from '../../types/auth';
import { formatDate } from '../../lib/utils';

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button type="button" variant="ghost" size="icon" onClick={handleCopy} aria-label="Copy to clipboard">
      {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
}

export function ApiKeysSection() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createdKey, setCreatedKey] = useState<ApiKeyCreated | null>(null);

  // Delete confirmation state
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    userApi
      .listApiKeys()
      .then(setKeys)
      .catch((err: unknown) =>
        setLoadError(err instanceof Error ? err.message : 'Failed to load API keys.'),
      )
      .finally(() => setIsLoading(false));
  }, []);

  async function handleCreate() {
    if (!newKeyName.trim()) return;
    setIsCreating(true);
    setCreateError('');
    try {
      const created = await userApi.createApiKey(newKeyName.trim());
      setCreatedKey(created);
      setKeys((prev) => [created, ...prev]);
      setNewKeyName('');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create API key.');
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      await userApi.deleteApiKey(deleteId);
      setKeys((prev) => prev.filter((k) => k.id !== deleteId));
      setDeleteId(null);
    } catch {
      // Keep dialog open on error
    } finally {
      setIsDeleting(false);
    }
  }

  function handleCloseCreate() {
    setCreateOpen(false);
    setCreatedKey(null);
    setCreateError('');
    setNewKeyName('');
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div className="space-y-1">
            <CardTitle>API Keys</CardTitle>
            <CardDescription>
              Generate API keys for programmatic access to your account.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New key
          </Button>
        </CardHeader>
        <CardContent>
          {loadError && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {loadError}
            </div>
          )}

          {keys.length === 0 && !loadError && (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
              <Key className="h-8 w-8" />
              <p className="text-sm">No API keys yet.</p>
            </div>
          )}

          {keys.length > 0 && (
            <div className="divide-y">
              {keys.map((key) => (
                <div key={key.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-medium leading-none truncate">{key.name}</p>
                    <p className="text-xs font-mono text-muted-foreground">{key.prefix}…</p>
                    <p className="text-xs text-muted-foreground">
                      Created {formatDate(key.createdAt)}
                      {key.lastUsedAt && ` · Last used ${formatDate(key.lastUsedAt)}`}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Revoke API key"
                    onClick={() => setDeleteId(key.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={handleCloseCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{createdKey ? 'API key created' : 'Create API key'}</DialogTitle>
            <DialogDescription>
              {createdKey
                ? 'Copy your new API key now. You won\'t be able to see it again.'
                : 'Give your API key a descriptive name.'}
            </DialogDescription>
          </DialogHeader>

          {createdKey ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={createdKey.secret}
                  className="font-mono text-xs bg-muted"
                />
                <CopyButton value={createdKey.secret} />
              </div>
              <p className="text-xs text-muted-foreground">
                Store this key securely — it won&apos;t be shown again.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="keyName">Key name</Label>
              <Input
                id="keyName"
                placeholder="e.g. CI/CD pipeline"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleCreate();
                }}
              />
              {createError && (
                <p className="text-xs text-destructive">{createError}</p>
              )}
            </div>
          )}

          <DialogFooter>
            {createdKey ? (
              <Button onClick={handleCloseCreate}>Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={handleCloseCreate}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={isCreating || !newKeyName.trim()}>
                  {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke API key</DialogTitle>
            <DialogDescription>
              This action cannot be undone. Any applications using this key will lose access
              immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Revoke key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
