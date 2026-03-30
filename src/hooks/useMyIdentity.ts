import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface MyIdentity {
  /** staff_members.id — primary identity for messaging */
  staffId: string | null;
  /** auth.users.id — Supabase Auth UUID */
  userId: string | null;
  /** Display name from staff_members or profile */
  displayName: string;
  /** All known IDs for this person (for dual-identity queries) */
  allIds: string[];
  /** Primary ID to use as sender_id (prefers staffId) */
  primaryId: string | null;
  isLoading: boolean;
}

export const useMyIdentity = (): MyIdentity => {
  const { user } = useAuth();
  const [staffId, setStaffId] = useState<string | null>(null);
  const [staffName, setStaffName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const resolve = async () => {
      if (!user?.email) {
        setStaffId(null);
        setStaffName(null);
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('staff_members')
        .select('id, name')
        .eq('email', user.email)
        .maybeSingle();

      if (!error && data) {
        setStaffId(data.id);
        setStaffName(data.name);

        // Auto-link user_id if not already set
        if (user.id) {
          supabase
            .from('staff_members')
            .update({ user_id: user.id })
            .eq('id', data.id)
            .is('user_id', null)
            .then(({ error: linkErr }) => {
              if (linkErr) console.warn('Could not auto-link user_id:', linkErr);
            });
        }
      } else {
        setStaffId(null);
        setStaffName(null);
      }
      setIsLoading(false);
    };

    resolve();
  }, [user?.email, user?.id]);

  const userId = user?.id || null;
  const primaryId = staffId || userId;
  const displayName = staffName || user?.email?.split('@')[0] || 'Admin';

  const allIds = useMemo(() => {
    const ids: string[] = [];
    if (staffId) ids.push(staffId);
    if (userId && userId !== staffId) ids.push(userId);
    return ids;
  }, [staffId, userId]);

  return { staffId, userId, displayName, allIds, primaryId, isLoading };
};
