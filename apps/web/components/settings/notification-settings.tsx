'use client';

import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Separator } from '../ui/separator';
import { userApi } from '../../lib/auth-service';
import type { NotificationPreferences } from '../../types/auth';

const DEFAULT_PREFS: NotificationPreferences = {
  emailNotifications: true,
  testCompletion: true,
  testFailure: true,
  weeklySummary: false,
};

interface PrefRowProps {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (v: boolean) => void;
}

function PrefRow({ id, title, description, checked, disabled, onCheckedChange }: PrefRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="space-y-0.5">
        <label htmlFor={id} className="text-sm font-medium leading-none cursor-pointer">
          {title}
        </label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-label={title}
      />
    </div>
  );
}

export function NotificationSettings() {
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    userApi
      .getNotificationPreferences()
      .then(setPrefs)
      .catch(() => {
        // Keep defaults on error
      })
      .finally(() => setIsLoading(false));
  }, []);

  function toggle(key: keyof NotificationPreferences) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
  }

  async function handleSave() {
    setIsSaving(true);
    setSaveStatus('idle');
    try {
      const saved = await userApi.updateNotificationPreferences(prefs);
      setPrefs(saved);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save preferences.');
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
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
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>Choose which emails you want to receive.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-0">
        <PrefRow
          id="emailNotifications"
          title="Email notifications"
          description="Master toggle for all email notifications."
          checked={prefs.emailNotifications}
          onCheckedChange={() => toggle('emailNotifications')}
        />
        <Separator />
        <PrefRow
          id="testCompletion"
          title="Test completion"
          description="Get notified when a test run finishes."
          checked={prefs.testCompletion}
          disabled={!prefs.emailNotifications}
          onCheckedChange={() => toggle('testCompletion')}
        />
        <Separator />
        <PrefRow
          id="testFailure"
          title="Test failures"
          description="Get notified when a test run has failures."
          checked={prefs.testFailure}
          disabled={!prefs.emailNotifications}
          onCheckedChange={() => toggle('testFailure')}
        />
        <Separator />
        <PrefRow
          id="weeklySummary"
          title="Weekly summary"
          description="Receive a weekly digest of your test activity."
          checked={prefs.weeklySummary}
          disabled={!prefs.emailNotifications}
          onCheckedChange={() => toggle('weeklySummary')}
        />

        <div className="flex items-center gap-3 pt-4">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save preferences
          </Button>
          {saveStatus === 'success' && (
            <span className="flex items-center gap-1 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              Saved
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="flex items-center gap-1 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {errorMessage}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
