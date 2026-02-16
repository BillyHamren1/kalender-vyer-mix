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
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
      {/* Decorative top gradient */}
      <div className="absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-primary/8 via-primary/3 to-transparent pointer-events-none" />
      
      {/* Top section with branding */}
      <div className="relative flex-1 flex flex-col items-center justify-center px-6 pt-16 pb-8">
        <div className="relative mb-10">
          <div className="absolute -inset-4 rounded-3xl bg-primary/5 blur-2xl" />
          <div className="relative w-[72px] h-[72px] rounded-[20px] bg-gradient-to-br from-primary via-primary to-primary-foreground/10 flex items-center justify-center shadow-xl"
               style={{ boxShadow: '0 12px 40px hsl(184 60% 38% / 0.25)' }}>
            <Zap className="w-9 h-9 text-primary-foreground" />
          </div>
        </div>
        
        <h1 className="text-[28px] font-extrabold tracking-tight text-foreground mb-1">EventFlow</h1>
        <p className="text-sm text-muted-foreground font-medium">Tidrapportering för fältpersonal</p>

        {/* Login form */}
        <form onSubmit={handleSubmit} className="w-full max-w-sm mt-10 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-semibold text-foreground">E-postadress</Label>
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
              className="h-[52px] text-base rounded-2xl border-border/80 bg-card shadow-sm focus:shadow-md transition-shadow"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-semibold text-foreground">Lösenord</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="h-[52px] text-base rounded-2xl border-border/80 bg-card shadow-sm focus:shadow-md transition-shadow"
            />
          </div>

          {error && (
            <div className="px-4 py-3 rounded-2xl bg-destructive/8 border border-destructive/15">
              <p className="text-sm text-destructive font-medium">{error}</p>
            </div>
          )}

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full h-[52px] text-[15px] font-semibold rounded-2xl bg-primary hover:bg-primary/90 shadow-xl transition-all active:scale-[0.98]"
            style={{ boxShadow: '0 6px 24px hsl(184 60% 38% / 0.3)' }}
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <LogIn className="w-5 h-5 mr-2" />
                Logga in
              </>
            )}
          </Button>
        </form>
      </div>

      {/* Footer */}
      <div className="text-center pb-10 px-6">
        <p className="text-xs text-muted-foreground/60">
          Kontakta din administratör om du saknar inloggningsuppgifter
        </p>
      </div>
    </div>
  );
};

export default MobileLogin;
