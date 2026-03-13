import type { Metadata } from 'next';
import { SettingsShell } from '../../components/settings/settings-shell';

export const metadata: Metadata = {
  title: 'Settings · SemkiEst',
};

export default function SettingsPage() {
  return <SettingsShell />;
}
