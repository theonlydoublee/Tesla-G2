/**
 * Tesla API credentials panel using @jappyjan/even-realities-ui.
 */

import { useState, type SyntheticEvent } from 'react';
import {
  Card,
  CardHeader,
  CardContent,
  Button,
  Input,
  Text,
} from '@jappyjan/even-realities-ui';
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';

const STORAGE_KEY_ACCESS_TOKEN = 'tesla_access_token';
const STORAGE_KEY_REFRESH_TOKEN = 'tesla_refresh_token';

export interface SettingsPanelProps {
  bridge: EvenAppBridge;
  onSaved: (accessToken: string, refreshToken: string) => void;
}

export function SettingsPanel({ bridge, onSaved }: SettingsPanelProps) {
  const [accessToken, setAccessToken] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackType, setFeedbackType] = useState<'success' | 'error'>('success');

  async function handleSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const accessVal = accessToken.trim();
    const refreshVal = refreshToken.trim();

    if (!accessVal || !refreshVal) {
      setFeedback('Please enter both access token and refresh token.');
      setFeedbackType('error');
      return;
    }

    setFeedback(null);
    await bridge.setLocalStorage(STORAGE_KEY_ACCESS_TOKEN, accessVal);
    await bridge.setLocalStorage(STORAGE_KEY_REFRESH_TOKEN, refreshVal);
    onSaved(accessVal, refreshVal);
  }

  return (
    <Card>
      <CardHeader>
        <Text variant="title-1">Tesla API Tokens</Text>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <Text as="label" variant="body-1" style={{ display: 'block', marginBottom: 6 }}>
            Access token <Text as="span" style={{ color: 'var(--color-tc-red)' }}>*</Text>
          </Text>
          <Input
            type="password"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder="Paste your Tesla access token"
            autoComplete="off"
            style={{
              width: '100%',
              maxWidth: '100%',
              boxSizing: 'border-box',
              display: 'block',
              marginBottom: 8,
            }}
          />
          <Text variant="detail" style={{ display: 'block', marginBottom: 20 }}>
            Required for Tesla Fleet API requests.
          </Text>

          <Text as="label" variant="body-1" style={{ display: 'block', marginBottom: 6 }}>
            Refresh token <Text as="span" style={{ color: 'var(--color-tc-red)' }}>*</Text>
          </Text>
          <Input
            type="password"
            value={refreshToken}
            onChange={(e) => setRefreshToken(e.target.value)}
            placeholder="Paste your Tesla refresh token"
            autoComplete="off"
            style={{
              width: '100%',
              maxWidth: '100%',
              boxSizing: 'border-box',
              display: 'block',
              marginBottom: 8,
            }}
          />
          <Text variant="detail" style={{ display: 'block', marginBottom: 20 }}>
            Used to obtain a new access token when it expires.
          </Text>

          <Button type="submit" variant="primary" style={{ width: '100%' }}>
            Save
          </Button>
        </form>

        {feedback && (
          <Text
            variant="body-2"
            role="status"
            aria-live="polite"
            style={{
              marginTop: 16,
              padding: '12px 16px',
              borderRadius: 8,
              backgroundColor: feedbackType === 'error' ? 'var(--color-bc-1st)' : 'var(--color-bc-accent)',
              color: feedbackType === 'error' ? 'var(--color-tc-red)' : 'var(--color-tc-1st)',
              border: feedbackType === 'error' ? '1px solid var(--color-tc-red)' : 'none',
            }}
          >
            {feedback}
          </Text>
        )}
      </CardContent>
    </Card>
  );
}
