import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import AppLogo from '@/components/shared/AppLogo';

const ScannerLogin = () => {
  const { isAuthenticated, login, isLoading: authLoading } = useMobileAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/scanner', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      // Pre-flight connectivity check
      console.log('[ScannerLogin] Testing connectivity...');
      try {
        const pingRes = await fetch('https://pihrhltinhewhoxefjxv.supabase.co/functions/v1/mobile-app-api', {
          method: 'OPTIONS',
        });
        console.log('[ScannerLogin] Connectivity OK, status:', pingRes.status);
      } catch (pingErr: any) {
        console.error('[ScannerLogin] Connectivity test failed:', pingErr?.name, pingErr?.message, pingErr);
        setError(`Nätverksfel: ${pingErr?.message || 'Kan inte nå servern'}. Kontrollera att du har internetåtkomst.`);
        setIsLoading(false);
        return;
      }

      await login(email, password);
      navigate('/scanner', { replace: true });
    } catch (err: any) {
      console.error('[ScannerLogin] Login error:', err?.name, err?.message, err);
      setError(err.message || 'Inloggningen misslyckades');
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <AppLogo mode="scanner" size="lg" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}
          <Input
            type="text"
            placeholder="E-post eller användarnamn"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
          />
          <Input
            type="password"
            placeholder="Lösenord"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Logga in
          </Button>
        </form>
      </div>
    </div>
  );
};

export default ScannerLogin;
