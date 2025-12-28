'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Settings,
  Bell,
  Shield,
  Database,
  Cloud,
  Mail,
  Palette,
  Globe,
  Save,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { settingsApi } from '@/lib/api';

const settingsSections = [
  { id: 'general', name: 'General', icon: Settings },
  { id: 'notifications', name: 'Notifications', icon: Bell },
  { id: 'security', name: 'Security', icon: Shield },
  { id: 'integrations', name: 'Integrations', icon: Cloud },
  { id: 'email', name: 'Email', icon: Mail },
  { id: 'appearance', name: 'Appearance', icon: Palette },
];

interface TenantSettings {
  timezone?: string;
  dateFormat?: string;
  theme?: 'light' | 'dark' | 'system';
  primaryColor?: string;
  logoUrl?: string | null;
  notifications?: {
    email?: boolean;
    slack?: boolean;
    slaBreachAlerts?: boolean;
  };
  security?: {
    require2FA?: boolean;
    sessionTimeoutMinutes?: number;
    passwordPolicy?: 'standard' | 'strong' | 'strict';
  };
  email?: {
    senderEmail?: string;
    senderName?: string;
    provider?: 'sendgrid' | 'ses' | 'mailgun' | 'smtp';
  };
}

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState('general');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [tenantName, setTenantName] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [settings, setSettings] = useState<TenantSettings>({});

  const loadSettings = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await settingsApi.get();
      setTenantName(data.tenant.name);
      setTenantSlug(data.tenant.slug);
      setSettings(data.settings || {});
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await settingsApi.update({
        name: tenantName,
        settings: settings as Record<string, unknown>,
      });
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const updateSetting = (path: string, value: unknown) => {
    setSettings((prev) => {
      const parts = path.split('.');
      if (parts.length === 1) {
        return { ...prev, [parts[0]]: value };
      }
      const [section, key] = parts;
      return {
        ...prev,
        [section]: {
          ...(prev[section as keyof TenantSettings] as Record<string, unknown> || {}),
          [key]: value,
        },
      };
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="mt-1 text-sm text-gray-500">
            Configure your tenant settings
          </p>
        </div>
        <Button onClick={handleSave} isLoading={isSaving}>
          <Save className="h-4 w-4 mr-2" />
          Save Changes
        </Button>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <nav className="w-64 flex-shrink-0">
          <ul className="space-y-1">
            {settingsSections.map((section) => {
              const Icon = section.icon;
              return (
                <li key={section.id}>
                  <button
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md ${
                      activeSection === section.id
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="h-5 w-5 mr-3" />
                    {section.name}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Content */}
        <div className="flex-1 bg-white rounded-lg shadow">
          {activeSection === 'general' && (
            <div className="p-6 space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">General Settings</h2>
                <div className="space-y-4">
                  <Input
                    id="tenantName"
                    type="text"
                    label="Organization Name"
                    placeholder="My Company"
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                  />
                  <Input
                    id="tenantSlug"
                    type="text"
                    label="Organization Slug"
                    placeholder="my-company"
                    value={tenantSlug}
                    disabled
                  />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Timezone
                    </label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={settings.timezone || 'UTC'}
                      onChange={(e) => updateSetting('timezone', e.target.value)}
                    >
                      <option value="UTC">UTC</option>
                      <option value="America/New_York">Eastern Time (US)</option>
                      <option value="America/Chicago">Central Time (US)</option>
                      <option value="America/Denver">Mountain Time (US)</option>
                      <option value="America/Los_Angeles">Pacific Time (US)</option>
                      <option value="Europe/London">London</option>
                      <option value="Europe/Paris">Paris</option>
                      <option value="Asia/Tokyo">Tokyo</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Date Format
                    </label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={settings.dateFormat || 'MM/DD/YYYY'}
                      onChange={(e) => updateSetting('dateFormat', e.target.value)}
                    >
                      <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                      <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                      <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'notifications' && (
            <div className="p-6 space-y-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Notification Settings</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-gray-200">
                  <div>
                    <p className="font-medium text-gray-900">Email Notifications</p>
                    <p className="text-sm text-gray-500">Receive email updates for important events</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={settings.notifications?.email ?? true}
                      onChange={(e) => updateSetting('notifications.email', e.target.checked)}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
                <div className="flex items-center justify-between py-3 border-b border-gray-200">
                  <div>
                    <p className="font-medium text-gray-900">Slack Notifications</p>
                    <p className="text-sm text-gray-500">Send notifications to Slack channels</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={settings.notifications?.slack ?? false}
                      onChange={(e) => updateSetting('notifications.slack', e.target.checked)}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
                <div className="flex items-center justify-between py-3 border-b border-gray-200">
                  <div>
                    <p className="font-medium text-gray-900">SLA Breach Alerts</p>
                    <p className="text-sm text-gray-500">Get notified before SLA breaches</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={settings.notifications?.slaBreachAlerts ?? true}
                      onChange={(e) => updateSetting('notifications.slaBreachAlerts', e.target.checked)}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'security' && (
            <div className="p-6 space-y-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Security Settings</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-gray-200">
                  <div>
                    <p className="font-medium text-gray-900">Two-Factor Authentication</p>
                    <p className="text-sm text-gray-500">Require 2FA for all users</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Session Timeout (minutes)
                  </label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="30">30 minutes</option>
                    <option value="60">1 hour</option>
                    <option value="120">2 hours</option>
                    <option value="480">8 hours</option>
                    <option value="1440">24 hours</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Password Policy
                  </label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="standard">Standard (8+ characters)</option>
                    <option value="strong">Strong (12+ chars, mixed case, numbers)</option>
                    <option value="strict">Strict (16+ chars, special characters)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'integrations' && (
            <div className="p-6 space-y-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Integrations</h2>
              <div className="space-y-4">
                <div className="p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                        <Cloud className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">AWS</p>
                        <p className="text-sm text-gray-500">Amazon Web Services integration</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm">Configure</Button>
                  </div>
                </div>
                <div className="p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                        <Database className="h-5 w-5 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">Slack</p>
                        <p className="text-sm text-gray-500">Slack workspace integration</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm">Connect</Button>
                  </div>
                </div>
                <div className="p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
                        <Globe className="h-5 w-5 text-purple-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">PagerDuty</p>
                        <p className="text-sm text-gray-500">PagerDuty incident management</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm">Connect</Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'email' && (
            <div className="p-6 space-y-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Email Settings</h2>
              <div className="space-y-4">
                <Input
                  id="senderEmail"
                  type="email"
                  label="Sender Email"
                  placeholder="noreply@company.com"
                  defaultValue="noreply@acme-corp.com"
                />
                <Input
                  id="senderName"
                  type="text"
                  label="Sender Name"
                  placeholder="IT Support"
                  defaultValue="FireLater IT Support"
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Provider
                  </label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="sendgrid">SendGrid</option>
                    <option value="ses">Amazon SES</option>
                    <option value="mailgun">Mailgun</option>
                    <option value="smtp">Custom SMTP</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'appearance' && (
            <div className="p-6 space-y-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Appearance</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Theme
                  </label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                    <option value="system">System</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Primary Color
                  </label>
                  <div className="flex space-x-2">
                    {['blue', 'green', 'purple', 'orange', 'red'].map((color) => (
                      <button
                        key={color}
                        className={`h-8 w-8 rounded-full bg-${color}-500 border-2 ${
                          color === 'blue' ? 'border-gray-900' : 'border-transparent'
                        }`}
                        style={{
                          backgroundColor:
                            color === 'blue'
                              ? '#3b82f6'
                              : color === 'green'
                              ? '#22c55e'
                              : color === 'purple'
                              ? '#a855f7'
                              : color === 'orange'
                              ? '#f97316'
                              : '#ef4444',
                        }}
                      />
                    ))}
                  </div>
                </div>
                <Input
                  id="logoUrl"
                  type="url"
                  label="Custom Logo URL"
                  placeholder="https://example.com/logo.png"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
