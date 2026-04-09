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
    const isNative = typeof (window as any)?.Capacitor !== 'undefined';
    console.log('[ScannerLogin] Submit started', { email: email?.substring(0, 3) + '***', isNative, userAgent: navigator.userAgent?.substring(0, 80) });
    try {
      await login(email, password);
      console.log('[ScannerLogin] Login succeeded');
      navigate('/scanner', { replace: true });
    } catch (err: any) {
      console.error('[ScannerLogin] Login error:', err?.name, err?.message, err?.cause, err?.stack?.substring?.(0, 300));
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
