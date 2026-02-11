import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

export const useCurrentStaffId = () => {
  const { user } = useAuth();
  const [staffId, setStaffId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStaffId = async () => {
      if (!user?.email) {
        setStaffId(null);
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('staff_members')
        .select('id')
        .eq('email', user.email)
        .maybeSingle();

      if (!error && data) {
        setStaffId(data.id);
      } else {
        setStaffId(null);
      }
      setIsLoading(false);
    };

    fetchStaffId();
  }, [user?.email]);

  return { staffId, isLoading };
};
