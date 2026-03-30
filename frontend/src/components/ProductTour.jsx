import { useEffect, useCallback, useMemo, useState } from 'react';
import { useJoyride, STATUS } from 'react-joyride';
import { useLanguage } from '../contexts/LanguageContext';

const STORAGE_KEY = 'onboarding_completed';

function DontShowCheckbox({ label }) {
  const [checked, setChecked] = useState(() => localStorage.getItem(STORAGE_KEY) === 'true');

  const toggle = () => {
    const next = !checked;
    setChecked(next);
    if (next) {
      localStorage.setItem(STORAGE_KEY, 'true');
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  return (
    <div
      role="checkbox"
      aria-checked={checked}
      tabIndex={0}
      onClick={toggle}
      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } }}
      className="flex items-center gap-2.5 mt-3 pt-3 border-t border-gray-200 cursor-pointer select-none group"
    >
      <span className={`flex items-center justify-center w-4 h-4 rounded border-2 transition-all shrink-0 ${
        checked ? 'bg-[#F0B90B] border-[#F0B90B]' : 'border-gray-300 group-hover:border-[#F0B90B]/60'
      }`}>
        {checked && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </span>
      <span className="text-[12px] text-gray-500">{label}</span>
    </div>
  );
}

const joyrideStyles = {
  options: {
    arrowColor: '#FFFFFF',
    backgroundColor: '#FFFFFF',
    overlayColor: 'rgba(0, 0, 0, 0.65)',
    primaryColor: '#F0B90B',
    textColor: '#1F2937',
    zIndex: 10000,
  },
  tooltip: {
    borderRadius: '14px',
    padding: '24px',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
    maxWidth: '380px',
  },
  tooltipTitle: {
    fontSize: '17px',
    fontWeight: 700,
    marginBottom: '6px',
    color: '#111827',
  },
  tooltipContent: {
    fontSize: '14px',
    lineHeight: '1.7',
    color: '#374151',
    padding: '6px 0 0',
  },
  buttonNext: {
    backgroundColor: '#F0B90B',
    color: '#181A20',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 700,
    padding: '9px 22px',
    border: 'none',
  },
  buttonBack: {
    color: '#6B7280',
    fontSize: '13px',
    fontWeight: 500,
    marginRight: '10px',
  },
  buttonSkip: {
    color: '#6B7280',
    fontSize: '12px',
  },
  buttonClose: {
    color: '#9CA3AF',
  },
  spotlight: {
    borderRadius: '12px',
  },
  tooltipFooter: {
    marginTop: '16px',
  },
};

export default function ProductTour({ run, onFinish }) {
  const { t } = useLanguage();
  const dontShowLabel = t('tour.dontShowAgain');

  const makeContent = useCallback((textKey) => (
    <div>
      <p>{t(textKey)}</p>
      <DontShowCheckbox label={dontShowLabel} />
    </div>
  ), [t, dontShowLabel]);

  const steps = useMemo(
    () => [
      {
        target: 'body',
        placement: 'center',
        title: t('tour.steps.welcome.title'),
        content: makeContent('tour.steps.welcome.content'),
        disableBeacon: true,
      },
      {
        target: '[data-tour="sidebar"]',
        placement: 'right',
        title: t('tour.steps.navigation.title'),
        content: makeContent('tour.steps.navigation.content'),
        disableBeacon: true,
      },
      {
        target: '[data-tour="summary-cards"]',
        placement: 'bottom',
        title: t('tour.steps.summary.title'),
        content: makeContent('tour.steps.summary.content'),
        disableBeacon: true,
      },
      {
        target: '[data-tour="charts"]',
        placement: 'top',
        title: t('tour.steps.charts.title'),
        content: makeContent('tour.steps.charts.content'),
        disableBeacon: true,
      },
      {
        target: '[data-tour="new-transaction"]',
        placement: 'bottom',
        title: t('tour.steps.newBuy.title'),
        content: makeContent('tour.steps.newBuy.content'),
        disableBeacon: true,
      },
      {
        target: '[data-tour="snapshot-csv"]',
        placement: 'bottom',
        title: t('tour.steps.snapshotCsv.title'),
        content: makeContent('tour.steps.snapshotCsv.content'),
        disableBeacon: true,
      },
      {
        target: '[data-tour="refresh-prices"]',
        placement: 'bottom',
        title: t('tour.steps.refreshPrices.title'),
        content: makeContent('tour.steps.refreshPrices.content'),
        disableBeacon: true,
      },
      {
        target: '[data-tour="notifications"]',
        placement: 'bottom-end',
        title: t('tour.steps.notifications.title'),
        content: makeContent('tour.steps.notifications.content'),
        disableBeacon: true,
      },
    ],
    [t, makeContent],
  );

  const joyrideLocale = useMemo(
    () => ({
      back: t('tour.locale.back'),
      close: t('tour.locale.close'),
      last: t('tour.locale.last'),
      next: t('tour.locale.next'),
      skip: t('tour.locale.skip'),
    }),
    [t],
  );

  const handleCallback = useCallback((data) => {
    const { status } = data;
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      onFinish?.();
    }
  }, [onFinish]);

  const { controls, Tour } = useJoyride({
    steps,
    continuous: true,
    showSkipButton: true,
    showProgress: true,
    scrollToFirstStep: true,
    disableOverlayClose: true,
    styles: joyrideStyles,
    locale: joyrideLocale,
    callback: handleCallback,
  });

  useEffect(() => {
    if (run) {
      controls.start();
    }
  }, [run, controls]);

  return Tour;
}

export function shouldRunTour() {
  return localStorage.getItem(STORAGE_KEY) !== 'true';
}

export function resetTour() {
  localStorage.removeItem(STORAGE_KEY);
}
