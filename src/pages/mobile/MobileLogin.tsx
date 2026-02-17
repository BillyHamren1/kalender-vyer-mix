import { useState } from 'react';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, LogIn, Zap } from 'lucide-react';

const MobileLogin = () => {
  const { isAuthenticated, login, isLoading: authLoading } = useMobileAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/m" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!email.trim() || !password.trim()) {
      setError('Fyll i e-postadress och lösenord');
      return;
    }

    setIsLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err: any) {
      setError(err.message === 'Invalid email or password' 
        ? 'Fel e-postadress eller lösenord' 
        : 'Inloggningen misslyckades');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top section */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-16 pb-8">
        <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mb-6 shadow-lg"
             style={{ boxShadow: '0 8px 32px hsl(184 60% 38% / 0.25)' }}>
          <Zap className="w-8 h-8 text-primary-foreground" />
        </div>
        
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground mb-0.5">EventFlow</h1>
        <p className="text-sm text-muted-foreground font-medium">Tidrapportering för fältpersonal</p>

        {/* Login form */}
        <form onSubmit={handleSubmit} className="w-full max-w-sm mt-10 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">E-postadress</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="namn@foretag.se"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="email"
              inputMode="email"
              className="h-12 text-sm rounded-xl border-border/60 bg-card shadow-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Lösenord</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="h-12 text-sm rounded-xl border-border/60 bg-card shadow-sm"
            />
          </div>

          {error && (
            <div className="px-3 py-2.5 rounded-xl bg-destructive/8 border border-destructive/15">
              <p className="text-sm text-destructive font-medium">{error}</p>
            </div>
          )}

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full h-12 text-sm font-semibold rounded-xl shadow-lg transition-all active:scale-[0.98]"
            style={{ boxShadow: '0 4px 20px hsl(184 60% 38% / 0.25)' }}
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <LogIn className="w-4.5 h-4.5 mr-2" />
                Logga in
              </>
            )}
          </Button>
        </form>
      </div>

      {/* Footer */}
      <div className="text-center pb-10 px-6">
        <p className="text-[11px] text-muted-foreground/50">
          Kontakta din administratör om du saknar inloggningsuppgifter
        </p>
      </div>
    </div>
  );
};

export default MobileLogin;
