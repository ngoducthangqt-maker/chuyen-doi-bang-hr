import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import {
  DetailedAttendanceRecord,
  EmployeeReconciliationSummary,
} from '../types/attendance';

interface ReconciliationPanelProps {
  reconciliations: EmployeeReconciliationSummary[];
  records: DetailedAttendanceRecord[];
}

type RecFilter = 'all' | 'under-1h' | 'over-1h' | 'HC' | 'SX';

export const ReconciliationPanel: React.FC<ReconciliationPanelProps> = ({
  reconciliations,
  records,
}) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<RecFilter>('all');
  const [expandedEmpKey, setExpandedEmpKey] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reconciliations.filter((item) => {
      if (filter === 'HC' && item.sheetType !== 'HC') return false;
      if (filter === 'SX' && item.sheetType !== 'SX') return false;
      if (
        filter === 'under-1h' &&
        !(item.targetLateEarlyMinutes > 0 && item.targetLateEarlyMinutes <= 60)
      ) {
        return false;
      }
      if (filter === 'over-1h' && item.targetLateEarlyMinutes <= 60) return false;
      if (q) {
        return (
          item.employeeCode.toLowerCase().includes(q) ||
          item.fullName.toLowerCase().includes(q) ||
          item.departmentCode.toLowerCase().includes(q) ||
          item.departmentName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [reconciliations, filter, search]);

  const totals = useMemo(() => {
    let matchedCount = 0;
    let totalTargetMin = 0;
    let totalAllocMin = 0;
    let under1hCount = 0;
    let over1hCount = 0;

    for (const r of reconciliations) {
      if (r.isLateEarlyMatched) matchedCount++;
      totalTargetMin += r.targetLateEarlyMinutes;
      totalAllocMin += r.allocatedTotalMinutes;
      if (r.targetLateEarlyMinutes > 0 && r.targetLateEarlyMinutes <= 60) under1hCount++;
      if (r.targetLateEarlyMinutes > 60) over1hCount++;
    }

    return {
      matchedCount,
      totalEmployees: reconciliations.length,
      totalTargetMin,
      totalAllocMin,
      under1hCount,
      over1hCount,
    };
  }, [reconciliations]);

  const incidentRecordsByEmp = useMemo(() => {
    const map = new Map<string, DetailedAttendanceRecord[]>();
    for (const rec of records) {
      if (rec.lateMinutes > 0 || rec.earlyMinutes > 0 || rec.overtimeHoursDaily > 0) {
        const key = `${rec.sheetType}:${rec.employeeCode}`;
        const list = map.get(key) || [];
        list.push(rec);
        map.set(key, list);
      }
    }
    return map;
  }, [records]);

  return (
    <div className="space-y-5">
      {/* Top Aggregate Reconciliation Strip */}
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-6 pb-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Đối chiếu Bước 2 (&le;1h vào 1 ngày duy nhất · &gt;1h chia vào &lt;5 ngày)
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Bấm vào dòng nhân viên bất kỳ để xem chi tiết từng ngày Đi muộn / Về sớm và nội dung cột Ghi chú.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-right font-mono tabular-nums">
            <div>
              <p className="text-xs font-sans text-slate-500">Nhân viên &le; 1h (1 ngày)</p>
              <p className="text-base font-semibold text-slate-900">
                {totals.under1hCount} NV
              </p>
            </div>
            <div className="h-7 w-px bg-slate-200 hidden sm:block" />
            <div>
              <p className="text-xs font-sans text-slate-500">Nhân viên &gt; 1h (&lt;5 ngày)</p>
              <p className="text-base font-semibold text-slate-900">
                {totals.over1hCount} NV
              </p>
            </div>
            <div className="h-7 w-px bg-slate-200 hidden sm:block" />
            <div>
              <p className="text-xs font-sans text-slate-500">Khớp quy tắc & tổng phút</p>
              <p className="text-base font-semibold text-emerald-700">
                {totals.matchedCount}/{totals.totalEmployees} NV
              </p>
            </div>
          </div>
        </div>

        <div className="pt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm Mã NV, Họ tên, Bộ phận..."
              className="w-full h-9 pl-9 pr-3 text-sm bg-slate-50 border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="flex items-center p-0.5 bg-slate-100 rounded-md overflow-x-auto">
            {(
              [
                { id: 'all', label: 'Tất cả NV' },
                { id: 'under-1h', label: 'Nhóm ≤ 1h (1 ngày)' },
                { id: 'over-1h', label: 'Nhóm > 1h (< 5 ngày)' },
                { id: 'HC', label: 'Khối HC' },
                { id: 'SX', label: 'Khối SX' },
              ] as { id: RecFilter; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  filter === tab.id
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

      {/* Reconciliation Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                <th className="py-3 px-3 w-8" />
                <th className="py-3 px-3 whitespace-nowrap">Khối</th>
                <th className="py-3 px-3 whitespace-nowrap">Mã NV</th>
                <th className="py-3 px-3 whitespace-nowrap">Tên nhân viên</th>
                <th className="py-3 px-3 whitespace-nowrap">Bộ phận</th>
                <th className="py-3 px-3 text-right whitespace-nowrap">
                  Muộn/Sớm Bảng gốc (h)
                </th>
                <th className="py-3 px-3 whitespace-nowrap">Quy tắc áp dụng</th>
                <th className="py-3 px-3 text-right whitespace-nowrap">
                  Số ngày đã chia
                </th>
                <th className="py-3 px-3 text-right whitespace-nowrap">
                  Đi muộn + Về sớm (phút)
                </th>
                <th className="py-3 px-3 text-right whitespace-nowrap">
                  Tổng giờ đã sinh (h)
                </th>
                <th className="py-3 px-4 whitespace-nowrap">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-500">
                    Không tìm thấy nhân viên phù hợp với bộ lọc.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const empKey = `${item.sheetType}:${item.employeeCode}`;
                  const isExpanded = expandedEmpKey === empKey;
                  const empIncidents = incidentRecordsByEmp.get(empKey) || [];

                  return (
                    <React.Fragment key={item.employeeId}>
                      <tr
                        onClick={() =>
                          setExpandedEmpKey(isExpanded ? null : empKey)
                        }
                        className="hover:bg-slate-50 cursor-pointer transition-colors"
                      >
                        <td className="py-2.5 px-3 text-slate-400">
                          {empIncidents.length > 0 ? (
                            isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-slate-700" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )
                          ) : null}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-xs text-slate-500">
                          {item.sheetType}
                        </td>
                        <td className="py-2.5 px-3 font-mono tabular-nums font-medium text-slate-900">
                          {item.employeeCode}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-900 whitespace-nowrap">
                          {item.fullName}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap text-xs">
                          <span className="font-mono text-slate-800">
                            {item.departmentCode}
                          </span>{' '}
                          · {item.departmentName}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-medium text-slate-900">
                          {item.targetLateEarlyHours > 0
                            ? item.targetLateEarlyHours.toFixed(2)
                            : '0.00'}
                        </td>
                        <td className="py-2.5 px-3 text-xs text-slate-600 whitespace-nowrap">
                          {item.expectedDayRuleText}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-blue-700">
                          {item.incidentDaysCount > 0 ? `${item.incidentDaysCount} ngày` : '0'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-xs text-slate-700">
                          {item.allocatedTotalMinutes > 0 ? (
                            <span>
                              {item.allocatedLateMinutes}p muộn + {item.allocatedEarlyMinutes}p sớm ={' '}
                              <strong>{item.allocatedTotalMinutes}p</strong>
                            </span>
                          ) : (
                            <span className="text-slate-400">0p</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                          {item.allocatedTotalHours.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-4 whitespace-nowrap text-xs font-medium">
                          {item.isLateEarlyMatched ? (
                            <span className="text-emerald-700">Khớp 100%</span>
                          ) : (
                            <span className="text-amber-700" title={item.note}>
                              {item.note || 'Cần kiểm tra'}
                            </span>
                          )}
                        </td>
                      </tr>

                      {isExpanded && empIncidents.length > 0 && (
                        <tr className="bg-slate-50/80">
                          <td colSpan={11} className="px-8 py-4 border-t border-slate-100">
                            <p className="text-xs font-semibold text-slate-700 mb-2.5">
                              Các ngày phát sinh của {item.fullName} ({item.employeeCode}) — Tổng muộn/sớm:{' '}
                              <span className="font-mono text-rose-700">
                                {item.targetLateEarlyHours.toFixed(2)}h ({item.targetLateEarlyMinutes} phút)
                              </span>{' '}
                              chia vào <span className="font-mono text-blue-700">{item.incidentDaysCount} ngày</span>:
                            </p>
                            <div className="overflow-x-auto">
                              <table className="w-full max-w-4xl text-left border-collapse text-xs bg-white border border-slate-200">
                                <thead>
                                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                                    <th className="py-2 px-3">Ngày</th>
                                    <th className="py-2 px-3">Ca chuẩn</th>
                                    <th className="py-2 px-3">Giờ vào</th>
                                    <th className="py-2 px-3">Giờ ra</th>
                                    <th className="py-2 px-3">Cột Ghi chú</th>
                                    <th className="py-2 px-3 text-right">Đi muộn</th>
                                    <th className="py-2 px-3 text-right">Về sớm</th>
                                    <th className="py-2 px-3 text-right">Tăng ca HC</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                                  {empIncidents.map((inc) => (
                                    <tr key={inc.day}>
                                      <td className="py-1.5 px-3 text-slate-800">{inc.dateStr}</td>
                                      <td className="py-1.5 px-3 text-slate-600">{inc.shiftLabel}</td>
                                      <td
                                        className={`py-1.5 px-3 font-medium ${
                                          inc.lateMinutes > 0 ? 'text-rose-700' : 'text-slate-900'
                                        }`}
                                      >
                                        {inc.checkIn}
                                      </td>
                                      <td
                                        className={`py-1.5 px-3 font-medium ${
                                          inc.earlyMinutes > 0 ? 'text-rose-700' : 'text-slate-900'
                                        }`}
                                      >
                                        {inc.checkOut}
                                      </td>
                                      <td className="py-1.5 px-3 font-sans font-medium text-rose-700">
                                        {inc.note || '—'}
                                      </td>
                                      <td className="py-1.5 px-3 text-right text-rose-700">
                                        {inc.lateMinutes > 0 ? `+${inc.lateMinutes}p` : '—'}
                                      </td>
                                      <td className="py-1.5 px-3 text-right text-rose-700">
                                        {inc.earlyMinutes > 0 ? `-${inc.earlyMinutes}p` : '—'}
                                      </td>
                                      <td className="py-1.5 px-3 text-right text-blue-700">
                                        {inc.overtimeHoursDaily > 0 ? `+${inc.overtimeHoursDaily}h` : '—'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
