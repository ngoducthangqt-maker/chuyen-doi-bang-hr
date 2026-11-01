import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { ParsedEmployeeRow, SheetType } from '../types/attendance';

interface SourceSheetsPanelProps {
  hcEmployees: ParsedEmployeeRow[];
  sxEmployees: ParsedEmployeeRow[];
  daysInMonth: number;
}

export const SourceSheetsPanel: React.FC<SourceSheetsPanelProps> = ({
  hcEmployees,
  sxEmployees,
  daysInMonth,
}) => {
  const [activeSheet, setActiveSheet] = useState<SheetType>('HC');
  const [search, setSearch] = useState('');

  const sourceList = activeSheet === 'HC' ? hcEmployees : sxEmployees;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sourceList;
    return sourceList.filter(
      (e) =>
        e.employeeCode.toLowerCase().includes(q) ||
        e.fullName.toLowerCase().includes(q) ||
        e.rawDeptOrMachine.toLowerCase().includes(q) ||
        (e.summaryDeptName || '').toLowerCase().includes(q)
    );
  }, [sourceList, search]);

  const dayColumns = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center p-0.5 bg-slate-100 rounded-md">
            <button
              type="button"
              onClick={() => setActiveSheet('HC')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                activeSheet === 'HC'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Bảng HC ({hcEmployees.length} nhân viên)
            </button>
            <button
              type="button"
              onClick={() => setActiveSheet('SX')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                activeSheet === 'SX'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Bảng SX ({sxEmployees.length} nhân viên)
            </button>
          </div>
          <span className="text-xs text-slate-500 hidden sm:inline">
            {activeSheet === 'HC'
              ? 'Giờ hành chính 08:00 - 17:00 · Giá trị ô: số giờ (6, 7, 8, 9, 10...) hoặc L, P, Ô, VR, TS, X, Xn, NB, N'
              : 'Ca sản xuất C1 (06:00-14:00) · C2 (14:00-22:00) · C3 (22:00-06:00) hoặc L, P, Ô, VR, TS, NB, N'}
          </span>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm nhân viên trong sheet..."
            className="w-full h-9 pl-9 pr-3 text-sm bg-slate-50 border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-600"
          />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                <th className="py-2.5 px-3 sticky left-0 bg-slate-50 z-10 border-r border-slate-200 whitespace-nowrap">
                  Mã NV
                </th>
                <th className="py-2.5 px-3 sticky left-[76px] bg-slate-50 z-10 border-r border-slate-200 whitespace-nowrap min-w-[165px]">
                  Họ và tên
                </th>
                <th className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap">
                  {activeSheet === 'HC' ? 'Bộ phận' : 'Máy'}
                </th>
                {dayColumns.map((d) => (
                  <th
                    key={d}
                    className="py-2.5 px-2 text-center font-mono tabular-nums border-r border-slate-100 min-w-[34px]"
                  >
                    {String(d).padStart(2, '0')}
                  </th>
                ))}
                <th className="py-2.5 px-2.5 text-right whitespace-nowrap border-l border-slate-200">
                  Lễ
                </th>
                <th className="py-2.5 px-2.5 text-right whitespace-nowrap">Phép</th>
                <th className="py-2.5 px-2.5 text-right whitespace-nowrap">Ốm/VR/TS</th>
                <th className="py-2.5 px-2.5 text-right whitespace-nowrap">Công TT</th>
                <th className="py-2.5 px-2.5 text-right whitespace-nowrap">Tổng công</th>
                <th className="py-2.5 px-2.5 text-right whitespace-nowrap">Tăng ca (h)</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">
                  Đi muộn/về sớm (h)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={daysInMonth + 10} className="py-12 text-center text-slate-500">
                    Không có dữ liệu nhân viên trong sheet {activeSheet}.
                  </td>
                </tr>
              ) : (
                filtered.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2 px-3 sticky left-0 bg-white font-mono tabular-nums font-medium text-slate-900 border-r border-slate-200 whitespace-nowrap">
                      {emp.employeeCode}
                    </td>
                    <td className="py-2 px-3 sticky left-[76px] bg-white font-medium text-slate-900 border-r border-slate-200 whitespace-nowrap">
                      {emp.fullName}
                    </td>
                    <td className="py-2 px-3 text-slate-600 border-r border-slate-200 whitespace-nowrap font-mono">
                      {emp.rawDeptOrMachine}
                    </td>
                    {dayColumns.map((d) => {
                      const val = emp.dailyCells[d] ?? '';
                      const upper = val.toUpperCase();
                      const isLeave = ['L', 'P', 'Ô', 'O', 'VR', 'TS', 'NB'].includes(upper);
                      const isRest = upper === 'N';
                      return (
                        <td
                          key={d}
                          className={`py-2 px-1.5 text-center font-mono tabular-nums border-r border-slate-100 ${
                            isLeave
                              ? 'text-amber-700 font-semibold bg-amber-50/40'
                              : isRest
                              ? 'text-slate-300'
                              : 'text-slate-800'
                          }`}
                        >
                          {val}
                        </td>
                      );
                    })}
                    <td className="py-2 px-2.5 text-right font-mono tabular-nums text-slate-700 border-l border-slate-200">
                      {emp.holidays || 0}
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono tabular-nums text-slate-700">
                      {emp.paidLeave || 0}
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono tabular-nums text-slate-700">
                      {emp.sickOrUnpaidLeave || 0}
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono tabular-nums font-medium text-slate-900">
                      {emp.actualWorkDays}
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono tabular-nums text-slate-700">
                      {emp.totalWorkDays}
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono tabular-nums text-blue-700 font-medium">
                      {emp.overtimeHours || 0}
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-rose-700 font-medium">
                      {emp.lateEarlyHours ? emp.lateEarlyHours.toFixed(2) : '0.00'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-200 font-semibold text-slate-900">
                  <td
                    colSpan={3 + daysInMonth + 5}
                    className="py-2.5 px-3 text-right text-slate-600 whitespace-nowrap"
                  >
                    Tổng cộng ({filtered.length} nhân viên):
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-blue-700">
                    {filtered.reduce((s, e) => s + (e.overtimeHours || 0), 0).toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-rose-700">
                    {filtered.reduce((s, e) => s + (e.lateEarlyHours || 0), 0).toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};
