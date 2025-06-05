
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { User, Lock } from 'lucide-react';
import { fetchStaffMembers } from '@/services/staffService';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const CreateStaffAccountCard: React.FC = () => {
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Fetch staff members for the dropdown
  const { data: staffMembers = [] } = useQuery({
    queryKey: ['staffMembers'],
    queryFn: fetchStaffMembers,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedStaffId || !username || !password) {
      toast.error('Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      toast.error('Password must be at least 6 characters long');
      return;
    }

    setIsLoading(true);

    try {
      // Hash the password (simple approach - in production use proper hashing)
      const passwordHash = btoa(password); // Base64 encoding for demo purposes

      const { error } = await supabase
        .from('staff_accounts')
        .insert({
          staff_id: selectedStaffId,
          username,
          password_hash: passwordHash
        });

      if (error) {
        if (error.code === '23505') {
          toast.error('Username already exists');
        } else {
          toast.error('Failed to create staff account');
        }
        return;
      }

      toast.success('Staff account created successfully');
      
      // Reset form
      setSelectedStaffId('');
      setUsername('');
      setPassword('');
      setConfirmPassword('');
    } catch (error) {
      console.error('Error creating staff account:', error);
      toast.error('Failed to create staff account');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          Create Staff Account
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="staff-select">Select Staff Member</Label>
            <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a staff member..." />
              </SelectTrigger>
              <SelectContent>
                {staffMembers.map((staff) => (
                  <SelectItem key={staff.id} value={staff.id}>
                    {staff.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              required
            />
          </div>

          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
            />
          </div>

          <div>
            <Label htmlFor="confirm-password">Confirm Password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
              required
            />
          </div>

          <Button 
            type="submit" 
            className="w-full" 
            disabled={isLoading}
          >
            <Lock className="h-4 w-4 mr-2" />
            {isLoading ? 'Creating Account...' : 'Create Account'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default CreateStaffAccountCard;
