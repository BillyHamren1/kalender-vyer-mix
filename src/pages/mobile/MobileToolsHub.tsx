import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, ScanLine, Ruler, ChevronRight } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';

const MobileToolsHub: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();

  const tools = [
    {
      key: 'camera',
      icon: Camera,
      label: t('tools.camera'),
      desc: t('tools.cameraDesc'),
      path: '/m/tools/camera',
    },
    {
      key: 'scanner',
      icon: ScanLine,
      label: t('tools.scanner'),
      desc: t('tools.scannerDesc'),
      path: '/m/tools/scanner',
    },
    {
      key: 'measure',
      icon: Ruler,
      label: t('tools.measure'),
      desc: t('tools.measureDesc'),
      path: '/m/tools/measure',
    },
  ];

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="px-5 pt-6 pb-4">
        <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
          {t('tools.subtitle')}
        </p>
        <h1 className="text-2xl font-bold mt-1">{t('tools.title')}</h1>
      </header>

      <div className="px-4 space-y-3">
        {tools.map((tool) => (
          <button
            key={tool.key}
            onClick={() => navigate(tool.path)}
            className="w-full flex items-center gap-4 p-5 rounded-2xl bg-card border border-border/60 active:scale-[0.99] transition-transform text-left"
          >
            <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-primary/10 text-primary shrink-0">
              <tool.icon className="w-7 h-7" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-base">{tool.label}</div>
              <div className="text-sm text-muted-foreground mt-0.5">{tool.desc}</div>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
};

export default MobileToolsHub;
