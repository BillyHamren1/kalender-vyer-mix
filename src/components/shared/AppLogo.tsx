import React from 'react';
import { Clock, ScanLine } from 'lucide-react';
import { cn } from '@/lib/utils';

type AppMode = 'time' | 'scanner';

interface AppLogoProps {
  mode?: AppMode;
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
}

const config = {
  time: {
    Icon: Clock,
    label: 'Time',
    tagline: 'Tidrapportering',
    iconBg: 'bg-primary',
    iconColor: 'text-primary-foreground',
  },
  scanner: {
    Icon: ScanLine,
    label: 'Scanner',
    tagline: 'Packlista & skanning',
    iconBg: 'bg-amber-500',
    iconColor: 'text-white',
  },
} as const;

const sizes = {
  sm: { box: 'w-10 h-10 rounded-xl', icon: 'h-5 w-5', title: 'text-sm', gap: 'gap-2' },
  md: { box: 'w-14 h-14 rounded-2xl', icon: 'h-7 w-7', title: 'text-lg', gap: 'gap-3' },
  lg: { box: 'w-16 h-16 rounded-2xl', icon: 'h-8 w-8', title: 'text-2xl', gap: 'gap-4' },
} as const;

const AppLogo: React.FC<AppLogoProps> = ({ mode = 'time', size = 'md', showTagline = true }) => {
  const { Icon, label, tagline, iconBg, iconColor } = config[mode];
  const s = sizes[size];

  return (
    <div className={cn('flex flex-col items-center', s.gap)}>
      <div className={cn(s.box, iconBg, 'flex items-center justify-center shadow-lg')}>
        <Icon className={cn(s.icon, iconColor)} />
      </div>
      <div className="text-center space-y-0.5">
        <h1 className={cn(s.title, 'font-extrabold tracking-tight text-foreground')}>
          EventFlow <span className="font-bold">{label}</span>
        </h1>
        {showTagline && (
          <p className="text-sm text-muted-foreground font-medium">{tagline}</p>
        )}
      </div>
    </div>
  );
};

export default AppLogo;
