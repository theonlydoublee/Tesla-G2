/**
 * Sign-in view when no Tesla tokens are stored.
 * Single "Sign in with Tesla" button triggers OAuth redirect.
 */

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent, Button, Text } from '@jappyjan/even-realities-ui';
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { resolveTeslaOAuthConfig } from '../tesla-oauth-config';
import { startTeslaAuthorizeRedirectWithConfig } from '../tesla-authorize-redirect';

export interface SignInViewProps {
  bridge: EvenAppBridge;
}

export function SignInView({ bridge: _bridge }: SignInViewProps) {
  const [oauth, setOauth] = useState<{ clientId: string; redirectUri: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void resolveTeslaOAuthConfig().then((result) => {
      if (result.ok) setOauth({ clientId: result.clientId, redirectUri: result.redirectUri });
      else setError(result.message);
    });
  }, []);

  if (error) {
    return (
      <Card>
        <CardContent>
          <Text variant="body-2" style={{ color: 'var(--color-tc-red)' }}>
            {error}
          </Text>
        </CardContent>
      </Card>
    );
  }

  if (!oauth) {
    return (
      <Card>
        <CardContent>
          <Text variant="body-2">Loading…</Text>
        </CardContent>
      </Card>
    );
  }
  function handleSignIn() {
    if (!oauth) return;
    startTeslaAuthorizeRedirectWithConfig(oauth);
  }

  return (
    <Card>
      <CardHeader>
        <Text variant="title-1">Tesla API</Text>
      </CardHeader>
      <CardContent>
        <Text variant="body-2" style={{ marginBottom: 16, display: 'block' }}>
          Sign in with your Tesla account to access vehicle status and controls on your glasses.
        </Text>
        <Button
          type="button"
          variant="primary"
          onClick={handleSignIn}
          style={{ width: '100%' }}
        >
          Sign in with Tesla
        </Button>
      </CardContent>
    </Card>
  );
}
