import React, { useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCw,
  Search,
} from 'lucide-react';
import {
  DetailedAttendanceRecord,
  GeneratorConfig,
  NoteDisplayStyle,
} from '../types/attendance';
import { getDaysInMonth } from '../utils/attendanceGenerator';

interface DetailedTablePanelProps {
  records: DetailedAttendanceRecord[];
  config: GeneratorConfig;
  onUpdateConfig: (patch: Partial<GeneratorConfig>) => void;
  onExportExcel: (recordsToExport: DetailedAttendanceRecord[], onlyFiltered: boolean) => void;
}

type QuickFilter = 'all' | 'HC' | 'SX' | 'late-early' | 'overtime' | 'leave';

export const DetailedTablePanel: React.FC<DetailedTablePanelProps> = ({
  records,
  config,
  onUpdateConfig,
  onExportExcel,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [selectedDay, setSelectedDay] = useState<number | 'all'>('all');
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [showAuditCols, setShowAuditCols] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  const daysInMonth = getDaysInMonth(config.month, config.year);

  const uniqueDepts = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of records) {
      if (!map.has(r.departmentCode)) {
        map.set(r.departmentCode, r.departmentName);
      }
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [records]);

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return records.filter((r) => {
      if (quickFilter === 'HC' && r.sheetType !== 'HC') return false;
      if (quickFilter === 'SX' && r.sheetType !== 'SX') return false;
      if (quickFilter === 'late-early' && r.lateMinutes === 0 && r.earlyMinutes === 0) {
        return false;
      }
      if (quickFilter === 'overtime' && r.overtimeHoursDaily === 0) return false;
      if (quickFilter === 'leave' && r.recordKind === 'work') return false;
      if (selectedDay !== 'all' && r.day !== selectedDay) return false;
      if (selectedDept !== 'all' && r.departmentCode !== selectedDept) return false;
      if (q) {
        const match =
          r.employeeCode.toLowerCase().includes(q) ||
          r.fullName.toLowerCase().includes(q) ||
          r.departmentCode.toLowerCase().includes(q) ||
          r.departmentName.toLowerCase().includes(q) ||
          r.checkIn.toLowerCase().includes(q) ||
          r.note.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [records, quickFilter, selectedDay, selectedDept, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedRecords = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, safePage, pageSize]);

  const summaryCounts = useMemo(() => {
    let workCount = 0;
    let lateEarlyDays = 0;
    let otDays = 0;
    for (const r of filteredRecords) {
      if (r.recordKind === 'work') {
        workCount++;
        if (r.lateMinutes > 0 || r.earlyMinutes > 0) lateEarlyDays++;
        if (r.overtimeHoursDaily > 0) otDays++;
      }
    }
    return { workCount, lateEarlyDays, otDays };
  }, [filteredRecords]);

  const handleFilterChange = (fn: () => void) => {
    fn();
    setPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Parameter Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex flex-wrap items-end justify-between gap-4 pb-4 border-b border-slate-200">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Kỳ chấm công (Tháng / Năm)
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={config.month}
                  onChange={(e) => onUpdateConfig({ month: Number(e.target.value) })}
                  className="h-9 px-3 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      Tháng {m}
                    </option>
                  ))}
                </select>
                <select
                  value={config.year}
                  onChange={(e) => onUpdateConfig({ year: Number(e.target.value) })}
                  className="h-9 px-3 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  {[2024, 2025, 2026, 2027, 2028].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Thứ tự sắp xếp dòng
              </label>
              <div className="flex items-center p-0.5 bg-slate-100 rounded-md">
                <button
                  type="button"
                  onClick={() => onUpdateConfig({ sortOrder: 'by-date' })}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    config.sortOrder === 'by-date'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Theo từng ngày (HC + SX)
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateConfig({ sortOrder: 'by-employee' })}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    config.sortOrder === 'by-employee'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Theo từng nhân viên
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Kiểu hiển thị cột Ghi chú
              </label>
              <select
                value={config.noteStyle}
                onChange={(e) =>
                  onUpdateConfig({ noteStyle: e.target.value as NoteDisplayStyle })
                }
                className="h-9 px-3 text-xs font-medium bg-slate-50 border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="label-only">Đi muộn / Về sớm (Mặc định)</option>
                <option value="with-minutes">Kèm số phút (VD: Đi muộn 15 phút)</option>
                <option value="with-hours">Kèm số giờ (VD: Đi muộn 0.25h)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Đảo ngẫu nhiên ngày & giờ
              </label>
              <button
                type="button"
                onClick={() =>
                  onUpdateConfig({ seed: Math.floor(Math.random() * 900000) + 100000 })
                }
                className="h-9 px-3.5 inline-flex items-center gap-2 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Sinh lại bộ giờ
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={config.enableStep2LateEarly}
                onChange={(e) => onUpdateConfig({ enableStep2LateEarly: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
              />
              Bước 2 (&le;1h: 1 ngày · &gt;1h: &lt;5 ngày)
            </label>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showAuditCols}
                onChange={(e) => setShowAuditCols(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
              />
              Hiện cột kiểm tra
            </label>
          </div>
        </div>

        {/* Search & Filter Row */}
        <div className="pt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleFilterChange(() => setSearchQuery(e.target.value))}
                placeholder="Tìm Mã NV, Họ tên, Ghi chú..."
                className="w-full h-9 pl-9 pr-3 text-sm bg-slate-50 border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <select
              value={selectedDay}
              onChange={(e) =>
                handleFilterChange(() =>
                  setSelectedDay(e.target.value === 'all' ? 'all' : Number(e.target.value))
                )
              }
              className="h-9 px-3 text-xs font-medium bg-slate-50 border border-slate-200 rounded-md text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="all">Tất cả {daysInMonth} ngày</option>
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  Ngày {d}/{config.month}/{config.year}
                </option>
              ))}
            </select>

            <select
              value={selectedDept}
              onChange={(e) => handleFilterChange(() => setSelectedDept(e.target.value))}
              className="h-9 px-3 text-xs font-medium bg-slate-50 border border-slate-200 rounded-md text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600 max-w-[200px] truncate"
            >
              <option value="all">Tất cả bộ phận / máy</option>
              {uniqueDepts.map(([code, name]) => (
                <option key={code} value={code}>
                  {code} — {name}
                </option>
              ))}
            </select>
          </div>

          {/* Interactive Segmented Filter */}
          <div className="flex items-center p-0.5 bg-slate-100 rounded-md overflow-x-auto">
            {(
              [
                { id: 'all', label: 'Tất cả' },
                { id: 'HC', label: 'Khối HC' },
                { id: 'SX', label: 'Khối SX' },
                { id: 'late-early', label: 'Đi muộn / Về sớm' },
                { id: 'overtime', label: 'Tăng ca HC' },
                { id: 'leave', label: 'Nghỉ / Lễ / Phép' },
              ] as { id: QuickFilter; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleFilterChange(() => setQuickFilter(tab.id))}
                className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  quickFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Data Grid Container */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 font-mono tabular-nums">
            <span className="font-sans font-semibold text-sm text-slate-900 mr-1">
              Bảng chi tiết chấm công (8 cột chuẩn)
            </span>
            <span>{filteredRecords.length.toLocaleString('vi-VN')} dòng</span>
            <span aria-hidden="true">·</span>
            <span className="text-emerald-700">
              {summaryCounts.workCount.toLocaleString('vi-VN')} lượt đi làm
            </span>
            <span aria-hidden="true">·</span>
            <span className="text-rose-700">
              {summaryCounts.lateEarlyDays.toLocaleString('vi-VN')} ngày có Đi muộn / Về sớm
            </span>
            <span aria-hidden="true">·</span>
            <span className="text-blue-700">
              {summaryCounts.otDays.toLocaleString('vi-VN')} lượt tăng ca HC
            </span>
          </div>

          {filteredRecords.length < records.length && filteredRecords.length > 0 && (
            <button
              type="button"
              onClick={() => onExportExcel(filteredRecords, true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Xuất riêng {filteredRecords.length.toLocaleString('vi-VN')} dòng đang lọc
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-2.5 px-4 w-14 text-right font-mono">#</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Mã nhân viên</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Tên nhân viên</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Mã bộ phận</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Tên bộ phận</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Ngày</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Giờ vào</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Giờ ra</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Ghi chú</th>
                {showAuditCols && (
                  <th className="py-2.5 px-4 whitespace-nowrap text-slate-500 bg-slate-100/70 border-l border-slate-200">
                    Kiểm tra (Ô gốc · Số phút)
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {paginatedRecords.length === 0 ? (
                <tr>
                  <td
                    colSpan={showAuditCols ? 10 : 9}
                    className="py-12 px-6 text-center text-slate-500"
                  >
                    Không có bản ghi chấm công nào khớp với bộ lọc hiện tại.
                  </td>
                </tr>
              ) : (
                paginatedRecords.map((rec) => {
                  const isLeave = rec.recordKind === 'leave';
                  const hasLateIn = rec.lateMinutes > 0;
                  const hasEarlyOut = rec.earlyMinutes > 0;
                  const hasOt = rec.overtimeHoursDaily > 0;

                  return (
                    <tr
                      key={`${rec.sheetType}-${rec.employeeCode}-${rec.day}`}
                      className="hover:bg-slate-50/90 transition-colors"
                    >
                      <td className="py-2.5 px-4 text-right text-xs text-slate-400 font-mono tabular-nums">
                        {rec.rowNumber}
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums font-medium text-slate-900 whitespace-nowrap">
                        {rec.employeeCode}
                      </td>
                      <td className="py-2.5 px-4 font-medium text-slate-900 whitespace-nowrap">
                        {rec.fullName}
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {rec.departmentCode}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 whitespace-nowrap">
                        {rec.departmentName}
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-slate-800 whitespace-nowrap">
                        {rec.dateStr}
                      </td>
                      <td
                        className={`py-2.5 px-4 whitespace-nowrap ${
                          rec.recordKind === 'work'
                            ? hasLateIn
                              ? 'font-mono tabular-nums font-semibold text-rose-700'
                              : 'font-mono tabular-nums font-medium text-slate-900'
                            : isLeave
                            ? 'font-medium text-amber-700'
                            : 'text-slate-500'
                        }`}
                      >
                        {rec.checkIn}
                      </td>
                      <td
                        className={`py-2.5 px-4 font-mono tabular-nums whitespace-nowrap ${
                          hasEarlyOut
                            ? 'font-semibold text-rose-700'
                            : hasOt
                            ? 'font-semibold text-blue-700'
                            : 'font-medium text-slate-900'
                        }`}
                      >
                        {rec.checkOut || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap text-sm">
                        {rec.note ? (
                          <span className="font-medium text-rose-700">{rec.note}</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      {showAuditCols && (
                        <td className="py-2.5 px-4 text-xs text-slate-500 bg-slate-50/50 border-l border-slate-100 whitespace-nowrap font-mono tabular-nums">
                          <span>{rec.sheetType}</span>
                          <span className="mx-1.5 text-slate-300">·</span>
                          <span className="text-slate-700">
                            Ô {String(rec.day).padStart(2, '0')}: &quot;{rec.rawCode}&quot;
                          </span>
                          {hasLateIn && (
                            <>
                              <span className="mx-1.5 text-slate-300">·</span>
                              <span className="text-rose-700">+{rec.lateMinutes}p muộn</span>
                            </>
                          )}
                          {hasEarlyOut && (
                            <>
                              <span className="mx-1.5 text-slate-300">·</span>
                              <span className="text-rose-700">-{rec.earlyMinutes}p sớm</span>
                            </>
                          )}
                          {hasOt && (
                            <>
                              <span className="mx-1.5 text-slate-300">·</span>
                              <span className="text-blue-700">+{rec.overtimeHoursDaily}h TC</span>
                            </>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/60 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-xs text-slate-600">
            <span>Hiển thị mỗi trang:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="h-8 px-2 bg-white border border-slate-200 rounded text-xs font-mono tabular-nums text-slate-800"
            >
              {[50, 100, 200, 500].map((size) => (
                <option key={size} value={size}>
                  {size} dòng
                </option>
              ))}
            </select>
            <span className="text-slate-400" aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              Trang {safePage} / {totalPages}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-8 px-3 inline-flex items-center gap-1 text-xs font-medium bg-white border border-slate-200 rounded text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap shrink-0"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Trang trước
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="h-8 px-3 inline-flex items-center gap-1 text-xs font-medium bg-white border border-slate-200 rounded text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap shrink-0"
            >
              Trang sau
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
