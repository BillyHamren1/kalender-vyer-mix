import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Calendar, AlertCircle, Info, Mail, KeyRound, ArrowLeft } from 'lucide-react';
import { z } from 'zod';

const emailSchema = z.string().email('Ogiltig e-postadress');
const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(6, 'Lösenord måste vara minst 6 tecken'),
});

type AuthMode = 'password' | 'magic-link' | 'reset-request';

const Auth: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<{ email?: string; password?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mode, setMode] = useState<AuthMode>('password');

  const { signIn, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Get the intended destination from location state
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      navigate(from, { replace: true });
    }
  }, [user, navigate, from]);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setValidationErrors({});

    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      const errors: { email?: string; password?: string } = {};
      result.error.errors.forEach((err) => {
        if (err.path[0] === 'email') errors.email = err.message;
        if (err.path[0] === 'password') errors.password = err.message;
      });
      setValidationErrors(errors);
      return;
    }

    setIsSubmitting(true);

    try {
      const { error: signInError } = await signIn(email, password);
      
      if (signInError) {
        if (signInError.message.includes('Invalid login credentials')) {
          setError('Felaktig e-post eller lösenord. Prova "Skicka inloggningslänk" om du är osäker på lösenordet.');
        } else if (signInError.message.includes('Email not confirmed')) {
          setError('E-postadressen är inte bekräftad. Kontrollera din inkorg.');
        } else {
          setError(signInError.message);
        }
      }
    } catch (err) {
      setError('Ett oväntat fel uppstod. Försök igen.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setValidationErrors({});

    const result = emailSchema.safeParse(email);
    if (!result.success) {
      setValidationErrors({ email: 'Ogiltig e-postadress' });
      return;
    }

    setIsSubmitting(true);

    try {
      const redirectUrl = `${window.location.origin}/`;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectUrl,
        },
      });

      if (error) {
        setError(error.message);
      } else {
        setSuccess('En inloggningslänk har skickats till din e-post. Kontrollera din inkorg (och skräppost).');
      }
    } catch (err) {
      setError('Kunde inte skicka inloggningslänk. Försök igen.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setValidationErrors({});

    const result = emailSchema.safeParse(email);
    if (!result.success) {
      setValidationErrors({ email: 'Ogiltig e-postadress' });
      return;
    }

    setIsSubmitting(true);

    try {
      const redirectUrl = `${window.location.origin}/auth/reset`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });

      if (error) {
        setError(error.message);
      } else {
        setSuccess('Ett återställningsmail har skickats. Klicka på länken i mailet för att välja nytt lösenord.');
      }
    } catch (err) {
      setError('Kunde inte skicka återställningsmail. Försök igen.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setError(null);
    setSuccess(null);
    setValidationErrors({});
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-4 text-center">
          <div className="flex justify-center">
            <div className="h-16 w-16 rounded-xl bg-primary/10 flex items-center justify-center">
              <Calendar className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">EventFlow Planering</CardTitle>
          <CardDescription>
            {mode === 'password' && 'Logga in för att fortsätta till planeringsverktyget'}
            {mode === 'magic-link' && 'Få en inloggningslänk skickad till din e-post'}
            {mode === 'reset-request' && 'Återställ ditt lösenord'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {mode === 'password' && (
            <Alert className="bg-primary/5 border-primary/20">
              <Info className="h-4 w-4 text-primary" />
              <AlertDescription className="text-sm text-muted-foreground">
                Normalt loggas du in automatiskt via EventFlow Hub. 
                Denna sida är för manuell inloggning vid behov.
              </AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="bg-green-500/10 border-green-500/30">
              <Mail className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-700">{success}</AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {mode === 'password' && (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-post</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="din@email.se"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isSubmitting}
                  className={validationErrors.email ? 'border-destructive' : ''}
                />
                {validationErrors.email && (
                  <p className="text-sm text-destructive">{validationErrors.email}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Lösenord</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSubmitting}
                  className={validationErrors.password ? 'border-destructive' : ''}
                />
                {validationErrors.password && (
                  <p className="text-sm text-destructive">{validationErrors.password}</p>
                )}
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loggar in...
                  </>
                ) : (
                  'Logga in'
                )}
              </Button>

              <div className="flex flex-col gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => switchMode('magic-link')}
                >
                  <Mail className="mr-2 h-4 w-4" />
                  Skicka inloggningslänk istället
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-muted-foreground"
                  onClick={() => switchMode('reset-request')}
                >
                  <KeyRound className="mr-2 h-4 w-4" />
                  Glömt lösenord?
                </Button>
              </div>
            </form>
          )}

          {mode === 'magic-link' && (
            <form onSubmit={handleMagicLink} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-post</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="din@email.se"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isSubmitting}
                  className={validationErrors.email ? 'border-destructive' : ''}
                />
                {validationErrors.email && (
                  <p className="text-sm text-destructive">{validationErrors.email}</p>
                )}
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Skickar...
                  </>
                ) : (
                  <>
                    <Mail className="mr-2 h-4 w-4" />
                    Skicka inloggningslänk
                  </>
                )}
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => switchMode('password')}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Tillbaka till lösenordsinloggning
              </Button>
            </form>
          )}

          {mode === 'reset-request' && (
            <form onSubmit={handlePasswordReset} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-post</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="din@email.se"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isSubmitting}
                  className={validationErrors.email ? 'border-destructive' : ''}
                />
                {validationErrors.email && (
                  <p className="text-sm text-destructive">{validationErrors.email}</p>
                )}
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Skickar...
                  </>
                ) : (
                  <>
                    <KeyRound className="mr-2 h-4 w-4" />
                    Skicka återställningslänk
                  </>
                )}
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => switchMode('password')}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Tillbaka till lösenordsinloggning
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
