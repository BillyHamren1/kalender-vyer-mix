
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Key, UserPlus, Users, Copy, Download, Trash2, RefreshCw, Check, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { fetchStaffMembers } from '@/services/staffService';
import { toast } from 'sonner';

interface StaffAccount {
  id: string;
  staff_id: string;
  username: string;
  created_at: string;
}

interface CreatedCredential {
  staffName: string;
  staffId: string;
  username: string;
  password: string;
}

// Generate username from name (e.g., "Billy Hamrén" -> "billy.hamren")
const generateUsername = (name: string): string => {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/\s+/g, '.')             // Spaces to dots
    .replace(/[^a-z.]/g, '');         // Keep only a-z and dots
};

// Generate secure random password (8 chars)
const generatePassword = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 8 }, () => 
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
};

const StaffAccountsPanel: React.FC = () => {
  const queryClient = useQueryClient();
  const [createdCredentials, setCreatedCredentials] = useState<CreatedCredential[]>([]);
  const [showCredentialsDialog, setShowCredentialsDialog] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const [isCreatingBulk, setIsCreatingBulk] = useState(false);

  // Fetch staff members
  const { data: staffMembers = [] } = useQuery({
    queryKey: ['staffMembers'],
    queryFn: fetchStaffMembers,
  });

  // Fetch existing staff accounts
  const { data: staffAccounts = [], isLoading: accountsLoading, refetch: refetchAccounts } = useQuery({
    queryKey: ['staffAccounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_accounts')
        .select('id, staff_id, username, created_at');
      
      if (error) throw error;
      return data as StaffAccount[];
    },
  });

  // Get staff without accounts
  const staffWithoutAccounts = staffMembers.filter(
    staff => !staffAccounts.some(account => account.staff_id === staff.id)
  );

  // Get staff with accounts
  const staffWithAccounts = staffMembers.filter(
    staff => staffAccounts.some(account => account.staff_id === staff.id)
  );

  // Create single account mutation
  const createAccountMutation = useMutation({
    mutationFn: async (staffMember: { id: string; name: string }) => {
      const username = generateUsername(staffMember.name);
      const password = generatePassword();
      const passwordHash = btoa(password); // Base64 for demo - use bcrypt in production

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
          staff_id: staffMember.id,
          username,
          password_hash: passwordHash
        });

      if (error) throw error;

      return { staffName: staffMember.name, staffId: staffMember.id, username, password };
    },
    onSuccess: (data) => {
      setCreatedCredentials([data]);
      setShowCredentialsDialog(true);
      queryClient.invalidateQueries({ queryKey: ['staffAccounts'] });
      toast.success(`Konto skapat för ${data.staffName}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Kunde inte skapa konto');
    }
  });

  // Create all accounts
  const handleCreateAllAccounts = async () => {
    if (staffWithoutAccounts.length === 0) return;
    
    setIsCreatingBulk(true);
    const credentials: CreatedCredential[] = [];
    const errors: string[] = [];

    for (const staff of staffWithoutAccounts) {
      try {
        const username = generateUsername(staff.name);
        const password = generatePassword();
        const passwordHash = btoa(password);

        // Check if username exists
        const { data: existing } = await supabase
          .from('staff_accounts')
          .select('id')
          .eq('username', username)
          .maybeSingle();

        if (existing) {
          errors.push(`${staff.name}: användarnamn finns redan`);
          continue;
        }

        const { error } = await supabase
          .from('staff_accounts')
          .insert({
            staff_id: staff.id,
            username,
            password_hash: passwordHash
          });

        if (error) {
          errors.push(`${staff.name}: ${error.message}`);
        } else {
          credentials.push({ staffName: staff.name, staffId: staff.id, username, password });
        }
      } catch (err) {
        errors.push(`${staff.name}: okänt fel`);
      }
    }

    setIsCreatingBulk(false);
    
    if (credentials.length > 0) {
      setCreatedCredentials(credentials);
      setShowCredentialsDialog(true);
      queryClient.invalidateQueries({ queryKey: ['staffAccounts'] });
      toast.success(`${credentials.length} konton skapade`);
    }
    
    if (errors.length > 0) {
      toast.error(`${errors.length} fel uppstod`);
      console.error('Account creation errors:', errors);
    }
  };

  // Delete account mutation
  const deleteAccountMutation = useMutation({
    mutationFn: async (staffId: string) => {
      const { error } = await supabase
        .from('staff_accounts')
        .delete()
        .eq('staff_id', staffId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staffAccounts'] });
      toast.success('Konto borttaget');
    },
    onError: () => {
      toast.error('Kunde inte ta bort konto');
    }
  });

  // Reset password mutation
  const resetPasswordMutation = useMutation({
    mutationFn: async (staffMember: { id: string; name: string }) => {
      const newPassword = generatePassword();
      const passwordHash = btoa(newPassword);

      const { error } = await supabase
        .from('staff_accounts')
        .update({ password_hash: passwordHash })
        .eq('staff_id', staffMember.id);

      if (error) throw error;

      const account = staffAccounts.find(a => a.staff_id === staffMember.id);
      return { 
        staffName: staffMember.name, 
        staffId: staffMember.id, 
        username: account?.username || '', 
        password: newPassword 
      };
    },
    onSuccess: (data) => {
      setCreatedCredentials([data]);
      setShowCredentialsDialog(true);
      toast.success(`Lösenord återställt för ${data.staffName}`);
    },
    onError: () => {
      toast.error('Kunde inte återställa lösenord');
    }
  });

  // Copy credentials to clipboard
  const copyCredentials = () => {
    const text = createdCredentials
      .map(c => `${c.staffName}\nAnvändarnamn: ${c.username}\nLösenord: ${c.password}\n`)
      .join('\n---\n');
    navigator.clipboard.writeText(text);
    toast.success('Kopierat till urklipp');
  };

  // Download credentials as CSV
  const downloadCredentials = () => {
    const csv = 'Namn,Användarnamn,Lösenord\n' + 
      createdCredentials.map(c => `"${c.staffName}","${c.username}","${c.password}"`).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `inloggningsuppgifter_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    toast.success('CSV nedladdad');
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Personalkonton
          </CardTitle>
          <CardDescription>
            Hantera inloggningsuppgifter för tidrapporteringsappen
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Stats */}
          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                {staffWithAccounts.length}
              </Badge>
              <span className="text-muted-foreground">med konto</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                {staffWithoutAccounts.length}
              </Badge>
              <span className="text-muted-foreground">utan konto</span>
            </div>
          </div>

          {/* Bulk create button */}
          {staffWithoutAccounts.length > 0 && (
            <Button
              onClick={handleCreateAllAccounts}
              disabled={isCreatingBulk}
              className="w-full"
              variant="default"
            >
              <Users className="h-4 w-4 mr-2" />
              {isCreatingBulk 
                ? 'Skapar konton...' 
                : `Skapa konton för alla (${staffWithoutAccounts.length})`}
            </Button>
          )}

          {/* Staff without accounts */}
          {staffWithoutAccounts.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Saknar konto:</h4>
              <ScrollArea className="h-[200px]">
                <div className="space-y-2">
                  {staffWithoutAccounts.map(staff => (
                    <div 
                      key={staff.id} 
                      className="flex items-center justify-between p-2 bg-muted/50 rounded-md"
                    >
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-orange-500" />
                        <span className="text-sm font-medium">{staff.name}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => createAccountMutation.mutate(staff)}
                        disabled={createAccountMutation.isPending}
                      >
                        <UserPlus className="h-3 w-3 mr-1" />
                        Skapa
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Staff with accounts */}
          {staffWithAccounts.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Har konto:</h4>
              <ScrollArea className="h-[200px]">
                <div className="space-y-2">
                  {staffWithAccounts.map(staff => {
                    const account = staffAccounts.find(a => a.staff_id === staff.id);
                    return (
                      <div 
                        key={staff.id} 
                        className="flex items-center justify-between p-2 bg-green-50 rounded-md"
                      >
                        <div className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-green-600" />
                          <div>
                            <span className="text-sm font-medium">{staff.name}</span>
                            <span className="text-xs text-muted-foreground ml-2">
                              @{account?.username}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => resetPasswordMutation.mutate(staff)}
                            disabled={resetPasswordMutation.isPending}
                            title="Återställ lösenord"
                          >
                            <RefreshCw className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteAccountMutation.mutate(staff.id)}
                            disabled={deleteAccountMutation.isPending}
                            className="text-destructive hover:text-destructive"
                            title="Ta bort konto"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          )}

          {staffMembers.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Inga personalmedlemmar hittades
            </p>
          )}
        </CardContent>
      </Card>

      {/* Credentials Dialog */}
      <Dialog open={showCredentialsDialog} onOpenChange={setShowCredentialsDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Inloggningsuppgifter
            </DialogTitle>
            <DialogDescription className="text-destructive font-medium">
              ⚠️ Spara dessa uppgifter nu - lösenorden kan inte visas igen!
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPasswords(!showPasswords)}
              >
                {showPasswords ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
                {showPasswords ? 'Dölj' : 'Visa'} lösenord
              </Button>
            </div>

            <ScrollArea className="max-h-[300px]">
              <div className="space-y-3">
                {createdCredentials.map((cred, idx) => (
                  <div key={idx} className="p-3 bg-muted rounded-md space-y-1">
                    <p className="font-medium">{cred.staffName}</p>
                    <div className="text-sm space-y-0.5">
                      <p>
                        <span className="text-muted-foreground">Användarnamn:</span>{' '}
                        <code className="bg-background px-1 rounded">{cred.username}</code>
                      </p>
                      <p>
                        <span className="text-muted-foreground">Lösenord:</span>{' '}
                        <code className="bg-background px-1 rounded">
                          {showPasswords ? cred.password : '••••••••'}
                        </code>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="flex gap-2">
              <Button onClick={copyCredentials} variant="outline" className="flex-1">
                <Copy className="h-4 w-4 mr-2" />
                Kopiera
              </Button>
              <Button onClick={downloadCredentials} variant="outline" className="flex-1">
                <Download className="h-4 w-4 mr-2" />
                Ladda ner CSV
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default StaffAccountsPanel;
