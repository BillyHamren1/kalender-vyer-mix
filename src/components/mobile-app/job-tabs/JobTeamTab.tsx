import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { mobileApi } from '@/services/mobileApiService';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { Users, Phone, MessageSquare, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface JobTeamTabProps {
  bookingId: string;
}

const JobTeamTab = ({ bookingId }: JobTeamTabProps) => {
  const navigate = useNavigate();
  const { staff } = useMobileAuth();
  const [team, setTeam] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    mobileApi.getBookingDetails(bookingId)
      .then(res => {
        setTeam(res.planning?.assigned_staff || res.booking?.assigned_staff || []);
      })
      .catch(() => toast.error('Could not load team'))
      .finally(() => setIsLoading(false));
  }, [bookingId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (team.length === 0) {
    return (
      <div className="text-center py-12">
        <Users className="w-10 h-10 mx-auto text-muted-foreground/20 mb-2" />
        <p className="text-sm text-muted-foreground">No staff assigned</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {team.map((member: any) => (
        <div key={member.id || member.staff_id} className="rounded-xl border bg-card p-3">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-primary-foreground"
              style={{ backgroundColor: member.color || 'hsl(184 60% 38%)' }}
            >
              {(member.name || '?').charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{member.name}</p>
              {member.role && <p className="text-xs text-muted-foreground">{member.role}</p>}
            </div>
            <div className="flex items-center gap-1">
              {member.phone && (
                <button
                  type="button"
                  onClick={() => { window.open(`tel:${member.phone}`, '_system') || (window.location.href = `tel:${member.phone}`); }}
                  className="p-2 rounded-lg hover:bg-muted transition-colors"
                >
                  <Phone className="w-4 h-4 text-primary" />
                </button>
              )}
              {member.email && (
                <button
                  type="button"
                  onClick={() => { window.open(`mailto:${member.email}`, '_system') || (window.location.href = `mailto:${member.email}`); }}
                  className="p-2 rounded-lg hover:bg-muted transition-colors"
                >
                  <Mail className="w-4 h-4 text-primary" />
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default JobTeamTab;
