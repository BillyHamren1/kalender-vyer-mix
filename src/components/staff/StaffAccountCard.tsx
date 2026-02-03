
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Key, UserPlus, RefreshCw, Trash2, Check, AlertCircle, Copy, Eye, EyeOff, Lock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface StaffAccountCardProps {
  staffId: string;
  staffName: string;
}

interface StaffAccount {
  id: string;
  username: string;
  created_at: string;
}

// Generate username from name
const generateUsername = (name: string): string => {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '.')
    .replace(/[^a-z.]/g, '');
};

// Generate secure random password
const generatePassword = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 8 }, () => 
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
};

const StaffAccountCard: React.FC<StaffAccountCardProps> = ({ staffId, staffName }) => {
  const queryClient = useQueryClient();
  const [showCredentials, setShowCredentials] = useState(false);
  const [credentials, setCredentials] = useState<{ username: string; password: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  
  // Custom password dialog state
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  // Fetch account for this staff member
  const { data: account, isLoading } = useQuery({
    queryKey: ['staffAccount', staffId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_accounts')
        .select('id, username, created_at')
        .eq('staff_id', staffId)
        .maybeSingle();
      
      if (error) throw error;
      return data as StaffAccount | null;
    },
  });

  // Create account mutation
  const createAccountMutation = useMutation({
    mutationFn: async () => {
      const username = generateUsername(staffName);
      const password = generatePassword();
      const passwordHash = btoa(password);

      // Check if username exists
      const { data: existing } = await supabase
        .from('staff_accounts')
        .select('id')
        .eq('username', username)
        .maybeSingle();

      if (existing) {
        throw new Error(`Användarnamn "${username}" finns redan`);
      }

      const { error } = await supabase
        .from('staff_accounts')
        .insert({
          staff_id: staffId,
          username,
          password_hash: passwordHash
        });

      if (error) throw error;

      return { username, password };
    },
    onSuccess: (data) => {
      setCredentials(data);
      setShowCredentials(true);
      queryClient.invalidateQueries({ queryKey: ['staffAccount', staffId] });
      queryClient.invalidateQueries({ queryKey: ['staffAccounts'] });
      toast.success('Konto skapat');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Kunde inte skapa konto');
    }
  });

  // Reset password mutation
  const resetPasswordMutation = useMutation({
    mutationFn: async () => {
      const newPassword = generatePassword();
      const passwordHash = btoa(newPassword);

      const { error } = await supabase
        .from('staff_accounts')
        .update({ password_hash: passwordHash })
        .eq('staff_id', staffId);

      if (error) throw error;

      return { username: account?.username || '', password: newPassword };
    },
    onSuccess: (data) => {
      setCredentials(data);
      setShowCredentials(true);
      toast.success('Lösenord återställt');
    },
    onError: () => {
      toast.error('Kunde inte återställa lösenord');
    }
  });

  // Set custom password mutation
  const setCustomPasswordMutation = useMutation({
    mutationFn: async (password: string) => {
      const passwordHash = btoa(password);

      const { error } = await supabase
        .from('staff_accounts')
        .update({ password_hash: passwordHash })
        .eq('staff_id', staffId);

      if (error) throw error;
    },
    onSuccess: () => {
      setShowPasswordDialog(false);
      setNewPassword('');
      setConfirmPassword('');
      setPasswordError('');
      toast.success('Lösenord uppdaterat');
    },
    onError: () => {
      toast.error('Kunde inte uppdatera lösenord');
    }
  });

  // Delete account mutation
  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('staff_accounts')
        .delete()
        .eq('staff_id', staffId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staffAccount', staffId] });
      queryClient.invalidateQueries({ queryKey: ['staffAccounts'] });
      toast.success('Konto borttaget');
    },
    onError: () => {
      toast.error('Kunde inte ta bort konto');
    }
  });

  const copyCredentials = () => {
    if (!credentials) return;
    const text = `Användarnamn: ${credentials.username}\nLösenord: ${credentials.password}`;
    navigator.clipboard.writeText(text);
    toast.success('Kopierat till urklipp');
  };

  const handleSetPassword = () => {
    // Validate
    if (newPassword.length < 6) {
      setPasswordError('Lösenordet måste vara minst 6 tecken');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Lösenorden matchar inte');
      return;
    }
    setPasswordError('');
    setCustomPasswordMutation.mutate(newPassword);
  };

  const openPasswordDialog = () => {
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setShowNewPassword(false);
    setShowPasswordDialog(true);
  };

  if (isLoading) {
    return (
      <Card className="bg-white shadow-sm border border-gray-200">
        <CardContent className="py-6">
          <div className="animate-pulse flex items-center gap-3">
            <div className="h-10 w-10 bg-gray-200 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 rounded w-1/3" />
              <div className="h-3 bg-gray-200 rounded w-1/2" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="bg-white shadow-sm border border-gray-200">
        <CardHeader className="pb-4 border-b border-gray-100">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Key className="h-5 w-5 text-primary" />
            Inloggningskonto
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          {account ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center">
                  <Check className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Konto aktivt</p>
                  <p className="text-sm text-muted-foreground">
                    Användarnamn: <code className="bg-muted px-1 rounded">{account.username}</code>
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openPasswordDialog}
                >
                  <Lock className="h-4 w-4 mr-2" />
                  Ändra lösenord
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => resetPasswordMutation.mutate()}
                  disabled={resetPasswordMutation.isPending}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Slumpa lösenord
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => deleteAccountMutation.mutate()}
                  disabled={deleteAccountMutation.isPending}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Ta bort konto
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-accent rounded-full flex items-center justify-center">
                  <AlertCircle className="h-5 w-5 text-accent-foreground" />
                </div>
                <div>
                  <p className="font-medium">Inget konto</p>
                  <p className="text-sm text-muted-foreground">
                    Denna person har inte tillgång till tidrapporteringsappen
                  </p>
                </div>
              </div>

              <Button
                onClick={() => createAccountMutation.mutate()}
                disabled={createAccountMutation.isPending}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Skapa inloggning
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Credentials Dialog */}
      <Dialog open={showCredentials} onOpenChange={setShowCredentials}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Inloggningsuppgifter
            </DialogTitle>
            <DialogDescription className="text-destructive font-medium">
              ⚠️ Spara dessa uppgifter nu - lösenordet kan inte visas igen!
            </DialogDescription>
          </DialogHeader>

          {credentials && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <div>
                  <span className="text-sm text-muted-foreground">Användarnamn:</span>
                  <p className="font-mono font-medium">{credentials.username}</p>
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Lösenord:</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </Button>
                  </div>
                  <p className="font-mono font-medium">
                    {showPassword ? credentials.password : '••••••••'}
                  </p>
                </div>
              </div>

              <Button onClick={copyCredentials} className="w-full">
                <Copy className="h-4 w-4 mr-2" />
                Kopiera uppgifter
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Custom Password Dialog */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Ändra lösenord
            </DialogTitle>
            <DialogDescription>
              Sätt ett eget lösenord för {staffName}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">Nytt lösenord</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minst 6 tecken"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Bekräfta lösenord</Label>
              <Input
                id="confirmPassword"
                type={showNewPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Upprepa lösenordet"
              />
            </div>

            {passwordError && (
              <p className="text-sm text-destructive">{passwordError}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPasswordDialog(false)}>
              Avbryt
            </Button>
            <Button 
              onClick={handleSetPassword}
              disabled={setCustomPasswordMutation.isPending}
            >
              Spara lösenord
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default StaffAccountCard;
