import { useAppStore } from '../store/appStore';
import { todayISO } from '../lib/format';
import dayjs from 'dayjs';

export default function ReportDateFilter() {
  const filterMode = useAppStore((state) => state.reportFilterMode);
  const startDate = useAppStore((state) => state.reportStartDate);
  const endDate = useAppStore((state) => state.reportEndDate);
  const setReportFilter = useAppStore((state) => state.setReportFilter);

  const handleModeChange = (mode) => {
    const today = todayISO();
    let nextStart = today;
    let nextEnd = today;

    if (mode === 'yesterday') {
      const yes = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
      nextStart = yes;
      nextEnd = yes;
    } else if (mode === 'week') {
      nextStart = dayjs().subtract(6, 'day').format('YYYY-MM-DD');
      nextEnd = today;
    }

    setReportFilter({
      reportFilterMode: mode,
      reportStartDate: nextStart,
      reportEndDate: nextEnd
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-sm border border-[#eadfd7] bg-white p-4 shadow-sm mb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase text-text-muted">Report Duration</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {[
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: 'week', label: 'Last 1 Week' },
              { id: 'custom', label: 'Custom Range' }
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleModeChange(opt.id)}
                className={`h-9 px-3 rounded text-xs font-black uppercase transition-all ${
                  filterMode === opt.id
                    ? 'bg-primary text-white'
                    : 'bg-[#f7f1ec] text-text-muted hover:bg-[#eadfd7]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {filterMode === 'custom' && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="grid gap-0.5">
              <label className="text-[9px] font-black text-text-muted uppercase">From Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setReportFilter({ reportStartDate: e.target.value })}
                className="h-9 rounded border border-[#eadfd7] px-2 text-xs font-bold text-text-dark"
              />
            </div>
            <div className="grid gap-0.5">
              <label className="text-[9px] font-black text-text-muted uppercase">To Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setReportFilter({ reportEndDate: e.target.value })}
                className="h-9 rounded border border-[#eadfd7] px-2 text-xs font-bold text-text-dark"
              />
            </div>
          </div>
        )}
      </div>

      <div className="text-[11px] font-extrabold text-[#7a6051] bg-[#fffaf6] border border-[#eadfd7] px-3 py-1.5 rounded flex items-center justify-between">
        <span>Active Period:</span>
        <span>
          {dayjs(startDate).format('DD MMM YYYY')} 
          {startDate !== endDate ? ` to ${dayjs(endDate).format('DD MMM YYYY')}` : ''}
        </span>
      </div>
    </div>
  );
}
