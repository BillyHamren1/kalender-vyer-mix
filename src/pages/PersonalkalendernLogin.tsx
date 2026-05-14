import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { MobileAuthProvider, useMobileAuth } from '@/contexts/MobileAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, LogIn, Calendar } from 'lucide-react';

/**
 * Inloggning för publika personalkalendern.
 * Försöker FÖRST mobile-app-API (alla anställda) — om det misslyckas,
 * faller tillbaka på Supabase auth (admin/SSO).
 */
const InnerLogin = () => {
  const navigate = useNavigate();
  const { user, isLoading: supaLoading } = useAuth();
  const { isAuthenticated: mobileAuthed, isLoading: mobileLoading, login: mobileLogin } = useMobileAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (supaLoading || mobileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  if (user || mobileAuthed) {
    return <Navigate to="/personalkalendern" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password.trim()) {
      setError('Fyll i e-post och lösenord.');
      return;
    }
    setSubmitting(true);

    // 1) Försök mobile-API (personal-konton)
    try {
      await mobileLogin(email.trim(), password);
      navigate('/personalkalendern', { replace: true });
      return;
    } catch (err: any) {
      // 2) Faller tillbaka på Supabase (admin)
      try {
        const { error: supaErr } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (supaErr) throw supaErr;
        navigate('/personalkalendern', { replace: true });
        return;
      } catch (supaErr: any) {
        setError('Fel e-post eller lösenord.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-8">
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Personalkalendern</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-8">
          Logga in med samma e-post och lösenord som i appen.
        </p>

        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              E-post
            </Label>
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
            <Label htmlFor="password" className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              Lösenord
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="h-12 text-sm rounded-xl border-border/60 bg-card shadow-sm"
            />
          </div>

          {error && (
            <div className="px-3 py-2.5 rounded-xl bg-destructive/10 border border-destructive/20">
              <p className="text-sm text-destructive font-medium">{error}</p>
            </div>
          )}

          <Button
            type="submit"
            disabled={submitting}
            className="w-full h-12 text-sm font-semibold rounded-xl shadow-lg transition-all active:scale-[0.98]"
          >
            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : (
              <>
                <LogIn className="w-4 h-4 mr-2" />
                Logga in
              </>
            )}
          </Button>
        </form>
      </div>

      <div className="text-center pb-10 px-6">
        <p className="text-[11px] text-muted-foreground/60">
          Read-only vy — endast för att titta. Ändringar görs i appen eller i admin.
        </p>
      </div>
    </div>
  );
};

const PersonalkalendernLogin = () => (
  <AuthProvider>
    <MobileAuthProvider>
      <InnerLogin />
    </MobileAuthProvider>
  </AuthProvider>
);

export default PersonalkalendernLogin;
