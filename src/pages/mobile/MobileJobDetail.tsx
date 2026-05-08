import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useMobileBookingDetails, useInvalidateMobileData } from '@/hooks/useMobileData';
import { MapPin, Navigation, Phone, Mail, User, Loader2, FolderOpen, CheckCircle2 } from 'lucide-react';
import { MobileBackHeader } from '@/components/mobile-app/MobileHeader';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import JobInfoTab from '@/components/mobile-app/job-tabs/JobInfoTab';
import JobTeamTab from '@/components/mobile-app/job-tabs/JobTeamTab';
import JobPhotosTab from '@/components/mobile-app/job-tabs/JobPhotosTab';
import JobCostsTab from '@/components/mobile-app/job-tabs/JobCostsTab';
import JobTimeTab from '@/components/mobile-app/job-tabs/JobTimeTab';
import { useLanguage } from '@/i18n/LanguageContext';

const tabs = ['Info', 'Team', 'Photos', 'Costs', 'Time'] as const;
type TabKey = typeof tabs[number];

/**
 * MobileJobDetail
 * ---------------
 * Single-timer policy: jobbdetalj startar/stoppar INTE timer. All
 * arbetsdagsstart/-stopp sker i WorkDayPanel. Här visas jobbinfo,
 * kontakt, tabs och länk till projekt om bookingen tillhör ett.
 */
const MobileJobDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { staff } = useMobileAuth();
  const { data: bookingData, isLoading } = useMobileBookingDetails(id);
  const { t } = useLanguage();
  const { invalidateBookingDetails } = useInvalidateMobileData();
  const booking = bookingData?.booking ?? null;
  const [activeTab, setActiveTab] = useState<TabKey>('Info');

  const largeProjectId = (booking as any)?.large_project_id ?? null;
  const isProjectBooking = Boolean(largeProjectId);

  const openNavigation = () => {
    if (!booking) return;
    const { delivery_latitude, delivery_longitude, deliveryaddress } = booking;
    if (delivery_latitude && delivery_longitude) {
      window.open(`https://maps.google.com/maps?daddr=${delivery_latitude},${delivery_longitude}`, '_blank');
    } else if (deliveryaddress) {
      window.open(`https://maps.google.com/maps?daddr=${encodeURIComponent(deliveryaddress)}`, '_blank');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-card">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-card">
        <p className="text-muted-foreground">Job not found</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-card pb-24">
      <MobileBackHeader
        title={booking.client}
        subtitle={booking.booking_number ? `#${booking.booking_number}` : undefined}
        backTo="/m"
        rightAction={
          isProjectBooking ? (
            <button
              onClick={() => navigate(`/m/project/${largeProjectId}`)}
              className="h-9 px-3 rounded-full flex items-center justify-center gap-1.5 bg-primary-foreground text-primary text-xs font-semibold active:scale-95 transition-all shadow-md"
              title="Del av stort projekt"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              Projekt
            </button>
          ) : null
        }
      />

      {isProjectBooking && (
        <div className="mx-4 mt-3 p-3 rounded-xl bg-primary/5 border border-primary/20 flex items-start gap-2.5">
          <FolderOpen className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-foreground">Del av stort projekt</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
              Den här vyn visar adress, kontakt och leveransinfo. Arbetsdagen startar och avslutar du i WorkDayPanel.
            </p>
          </div>
        </div>
      )}

      {booking.deliveryaddress && (
        <button
          onClick={openNavigation}
          className="mx-4 mt-3 p-3.5 rounded-2xl bg-card border border-primary flex items-center gap-2.5 w-[calc(100%-2rem)] text-left active:scale-[0.98] transition-all"
        >
          <MapPin className="w-4 h-4 text-primary shrink-0" />
          <span className="text-foreground font-medium text-sm flex-1">{booking.deliveryaddress}</span>
          <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shrink-0">
            <Navigation className="w-4 h-4 text-primary-foreground" />
          </div>
        </button>
      )}

      {(booking.contact_name || booking.contact_phone || booking.contact_email) && (
        <div className="mx-4 mt-2 p-3 rounded-2xl bg-card border border-border space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <User className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              {t('contact.label' as any) || 'Kontaktperson'}
            </span>
          </div>
          {booking.contact_name && (
            <p className="text-sm font-semibold text-foreground">{booking.contact_name}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {booking.contact_phone && (
              <a
                href={`tel:${booking.contact_phone.replace(/\s+/g, '')}`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium active:scale-95 transition-all"
              >
                <Phone className="w-3.5 h-3.5" />
                {booking.contact_phone}
              </a>
            )}
            {booking.contact_email && (
              <a
                href={`mailto:${booking.contact_email}`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-foreground text-xs font-medium active:scale-95 transition-all"
              >
                <Mail className="w-3.5 h-3.5" />
                <span className="truncate max-w-[180px]">{booking.contact_email}</span>
              </a>
            )}
          </div>
        </div>
      )}

      <div className="px-4 pt-2.5">
        <div className="flex gap-0.5 bg-muted/50 rounded-xl p-0.5">
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex-1 py-2 text-[11px] font-semibold rounded-lg transition-all duration-200",
                activeTab === tab
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground"
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 px-4 py-3">
        {activeTab === 'Info' && <JobInfoTab booking={booking} bookingId={booking.id} establishmentTasks={bookingData?.establishment_tasks} onCommentsUpdated={() => invalidateBookingDetails(booking.id)} onTaskToggled={() => invalidateBookingDetails(booking.id)} />}
        {activeTab === 'Team' && <JobTeamTab bookingId={booking.id} />}
        {activeTab === 'Photos' && <JobPhotosTab bookingId={booking.id} />}
        {activeTab === 'Costs' && <JobCostsTab bookingId={booking.id} />}
        {activeTab === 'Time' && <JobTimeTab bookingId={booking.id} timeReports={bookingData?.my_time_reports} />}
      </div>

      <div className="px-4 pb-4">
        <Button
          onClick={() => navigate(`/m/job/${id}/complete`)}
          variant="outline"
          className="w-full h-12 rounded-xl border-primary text-primary font-semibold text-base"
        >
          <CheckCircle2 className="w-5 h-5 mr-2" />
          Complete job
        </Button>
      </div>
    </div>
  );
};

export default MobileJobDetail;
