import React from 'react';
import { RotateCcw } from 'lucide-react';
import {
  GeneratorConfig,
  LateEarlyDistributionMode,
  NoteDisplayStyle,
  ParsedEmployeeRow,
  ShiftKey,
} from '../types/attendance';
import {
  getDepartmentOverrideKey,
  inferDefaultDepartment,
} from '../utils/departmentHelper';
import { DEFAULT_GENERATOR_CONFIG } from '../utils/attendanceGenerator';

interface ConfigRulesPanelProps {
  config: GeneratorConfig;
  onUpdateConfig: (patch: Partial<GeneratorConfig>) => void;
  allEmployees: ParsedEmployeeRow[];
  deptOverrides: Record<string, { code: string; name: string }>;
  onUpdateDeptOverrides: (next: Record<string, { code: string; name: string }>) => void;
}

export const ConfigRulesPanel: React.FC<ConfigRulesPanelProps> = ({
  config,
  onUpdateConfig,
  allEmployees,
  deptOverrides,
  onUpdateDeptOverrides,
}) => {
  const uniqueDeptRows = React.useMemo(() => {
    const seen = new Map<
      string,
      {
        key: string;
        sheetType: 'HC' | 'SX';
        rawDeptOrMachine: string;
        summaryDeptName?: string;
        count: number;
      }
    >();

    for (const emp of allEmployees) {
      const key = getDepartmentOverrideKey(emp.sheetType, emp.rawDeptOrMachine);
      const existing = seen.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        seen.set(key, {
          key,
          sheetType: emp.sheetType,
          rawDeptOrMachine: emp.rawDeptOrMachine,
          summaryDeptName: emp.summaryDeptName,
          count: 1,
        });
      }
    }
    return Array.from(seen.values());
  }, [allEmployees]);

  const handleShiftChange = (
    shiftKey: ShiftKey,
    field: 'startTime' | 'endTime' | 'lunchMinutes',
    value: string | number
  ) => {
    onUpdateConfig({
      shifts: {
        ...config.shifts,
        [shiftKey]: {
          ...config.shifts[shiftKey],
          [field]: value,
        },
      },
    });
  };

  const handleLeaveLabelChange = (code: string, label: string) => {
    onUpdateConfig({
      leaveLabels: {
        ...config.leaveLabels,
        [code]: label,
      },
    });
  };

  const handleUseExactRawDeptNames = () => {
    const next: Record<string, { code: string; name: string }> = {};
    for (const row of uniqueDeptRows) {
      const raw = row.rawDeptOrMachine || row.sheetType;
      next[row.key] = {
        code: raw,
        name: row.summaryDeptName || raw,
      };
    }
    onUpdateDeptOverrides(next);
  };

  return (
    <div className="space-y-6">
      {/* Step 2 Settings */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
        <div className="pb-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Cấu hình Bước 2 — Quy tắc chia ngày Đi muộn / Về sớm & cột Ghi chú
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Tổng giờ Đi muộn về sớm &le; 1h: gộp vào duy nhất 1 ngày trong tháng · Tổng giờ &gt; 1h: chia ngẫu nhiên vào &lt; 5 ngày (từ 2 đến 4 ngày) bất kỳ trong tháng.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-900 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={config.enableStep2LateEarly}
              onChange={(e) => onUpdateConfig({ enableStep2LateEarly: e.target.checked })}
              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
            />
            Kích hoạt Bước 2
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Số ngày tối đa khi tổng &gt; 1 giờ (&lt; 5 ngày)
            </label>
            <select
              value={config.maxDaysWhenOverOneHour}
              onChange={(e) =>
                onUpdateConfig({
                  maxDaysWhenOverOneHour: Number(e.target.value) as 2 | 3 | 4,
                })
              }
              className="w-full h-9 px-3 text-xs font-medium bg-slate-50 border border-slate-200 rounded-md text-slate-900"
            >
              <option value={4}>Tối đa 4 ngày (2 – 4 ngày, &lt; 5 ngày)</option>
              <option value={3}>Tối đa 3 ngày (2 – 3 ngày, &lt; 5 ngày)</option>
              <option value={2}>Cố định 2 ngày (&lt; 5 ngày)</option>
            </select>
            <p className="text-xs text-slate-400 mt-1">
              Trường hợp &le; 1 giờ luôn cố định vào duy nhất 1 ngày.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Tỷ lệ Đi muộn vs Về sớm
            </label>
            <select
              value={config.lateEarlyDistributionMode}
              onChange={(e) =>
                onUpdateConfig({
                  lateEarlyDistributionMode: e.target.value as LateEarlyDistributionMode,
                })
              }
              className="w-full h-9 px-3 text-xs font-medium bg-slate-50 border border-slate-200 rounded-md text-slate-900"
            >
              <option value="natural">Kết hợp tự nhiên (~65% Đi muộn · ~35% Về sớm)</option>
              <option value="balanced">Cân bằng (50% Đi muộn · 50% Về sớm)</option>
              <option value="late-only">Chỉ tính Đi muộn (Vào trễ)</option>
              <option value="early-only">Chỉ tính Về sớm (Ra sớm)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Nội dung hiển thị ở cột Ghi chú
            </label>
            <select
              value={config.noteStyle}
              onChange={(e) =>
                onUpdateConfig({ noteStyle: e.target.value as NoteDisplayStyle })
              }
              className="w-full h-9 px-3 text-xs font-medium bg-slate-50 border border-slate-200 rounded-md text-slate-900"
            >
              <option value="label-only">Đi muộn / Về sớm (Mặc định)</option>
              <option value="with-minutes">Đi muộn 15 phút / Về sớm 20 phút</option>
              <option value="with-hours">Đi muộn (0.25h) / Về sớm (0.33h)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Tùy chọn xuất file Excel (.xlsx)
            </label>
            <label className="flex items-start gap-2.5 text-xs text-slate-600 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={config.exportOnlySingleStandardSheet}
                onChange={(e) =>
                  onUpdateConfig({ exportOnlySingleStandardSheet: e.target.checked })
                }
                className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
              />
              <span>
                Chỉ xuất duy nhất 1 Sheet chuẩn (8 cột có Ghi chú), ẩn các sheet phụ đối chiếu
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Shift Hours & Staggered Randomization Settings */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Quy định khung giờ ca chuẩn & biên độ chấm công ngày thường (Bước 1)
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Áp dụng cho những ngày đi làm đúng giờ (không phát sinh Đi muộn / Về sớm).
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              onUpdateConfig({
                shifts: DEFAULT_GENERATOR_CONFIG.shifts,
                earlyBufferMin: 1,
                earlyBufferMax: 15,
                lateOutBufferMin: 1,
                lateOutBufferMax: 15,
                timeFormat: 'HH:mm',
                dateFormat: 'D/M/YYYY',
              })
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Khôi phục mặc định
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-slate-200">
          {(['HC', 'C1', 'C2', 'C3'] as ShiftKey[]).map((key, idx) => {
            const s = config.shifts[key];
            return (
              <div
                key={key}
                className={`py-3 md:py-1 space-y-3 ${
                  idx === 0 ? 'md:pr-5' : idx === 3 ? 'md:pl-5' : 'md:px-5'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-blue-700">{key}</span>
                  <span className="text-xs text-slate-500">
                    {key === 'HC' ? 'Nghỉ trưa 60p' : 'Ca SX cố định 8h'}
                  </span>
                </div>
                <p className="text-xs font-medium text-slate-800">{s.label}</p>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Giờ vào chuẩn</label>
                    <input
                      type="time"
                      value={s.startTime}
                      onChange={(e) => handleShiftChange(key, 'startTime', e.target.value)}
                      className="w-full h-8 px-2 text-xs font-mono tabular-nums bg-slate-50 border border-slate-200 rounded text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Giờ ra chuẩn</label>
                    <input
                      type="time"
                      value={s.endTime}
                      onChange={(e) => handleShiftChange(key, 'endTime', e.target.value)}
                      className="w-full h-8 px-2 text-xs font-mono tabular-nums bg-slate-50 border border-slate-200 rounded text-slate-900"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Chấm vào sớm ngày thường (phút)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={45}
                value={config.earlyBufferMin}
                onChange={(e) =>
                  onUpdateConfig({ earlyBufferMin: Math.max(0, Number(e.target.value)) })
                }
                className="w-20 h-9 px-2.5 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-md"
              />
              <span className="text-xs text-slate-500">đến</span>
              <input
                type="number"
                min={1}
                max={60}
                value={config.earlyBufferMax}
                onChange={(e) =>
                  onUpdateConfig({ earlyBufferMax: Math.max(1, Number(e.target.value)) })
                }
                className="w-20 h-9 px-2.5 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-md"
              />
              <span className="text-xs text-slate-500">phút</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Chấm ra sau giờ tan ca (phút)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={45}
                value={config.lateOutBufferMin}
                onChange={(e) =>
                  onUpdateConfig({ lateOutBufferMin: Math.max(0, Number(e.target.value)) })
                }
                className="w-20 h-9 px-2.5 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-md"
              />
              <span className="text-xs text-slate-500">đến</span>
              <input
                type="number"
                min={1}
                max={60}
                value={config.lateOutBufferMax}
                onChange={(e) =>
                  onUpdateConfig({ lateOutBufferMax: Math.max(1, Number(e.target.value)) })
                }
                className="w-20 h-9 px-2.5 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-md"
              />
              <span className="text-xs text-slate-500">phút</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Định dạng Ngày & Giờ xuất ra
            </label>
            <div className="flex items-center gap-2">
              <select
                value={config.dateFormat}
                onChange={(e) =>
                  onUpdateConfig({ dateFormat: e.target.value as 'D/M/YYYY' | 'DD/MM/YYYY' })
                }
                className="h-9 px-2.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-md"
              >
                <option value="D/M/YYYY">1/2/2026 (D/M/YYYY)</option>
                <option value="DD/MM/YYYY">01/02/2026 (DD/MM/YYYY)</option>
              </select>
              <select
                value={config.timeFormat}
                onChange={(e) =>
                  onUpdateConfig({ timeFormat: e.target.value as 'HH:mm' | 'HH:mm:ss' })
                }
                className="h-9 px-2.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-md"
              >
                <option value="HH:mm">07:55 (HH:mm)</option>
                <option value="HH:mm:ss">07:55:18 (HH:mm:ss)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Xử lý số giờ tăng ca từng ngày ở bảng HC
            </label>
            <label className="flex items-start gap-2.5 text-xs text-slate-600 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={config.applyDailyHoursToCheckout}
                onChange={(e) =>
                  onUpdateConfig({ applyDailyHoursToCheckout: e.target.checked })
                }
                className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
              />
              <span>
                Tự cộng giờ tăng ca nằm sẵn trong ô ngày HC (VD: ô ghi <strong>10</strong> = 8h + 2h tăng ca → ra ~19:05)
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Leave Symbols & Department Mapping */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Diễn giải ký hiệu nghỉ tại cột Giờ vào
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Khi gặp các ký hiệu này trong ô ngày, cột Giờ vào hiển thị nội dung tương ứng và cột Giờ ra để trống.
            </p>
          </div>

          <div className="space-y-2.5 pt-2">
            {[
              { code: 'L', desc: 'Nghỉ lễ' },
              { code: 'N', desc: 'Nghỉ' },
              { code: 'P', desc: 'Nghỉ phép' },
              { code: 'Ô', desc: 'Nghỉ ốm' },
              { code: 'VR', desc: 'Nghỉ việc riêng' },
              { code: 'TS', desc: 'Nghỉ thai sản' },
              { code: 'NB', desc: 'Nghỉ bù' },
            ].map((item) => (
              <div key={item.code} className="flex items-center gap-3">
                <span className="w-12 text-center py-1.5 bg-slate-100 rounded font-mono text-xs font-semibold text-slate-800 shrink-0">
                  {item.code}
                </span>
                <input
                  type="text"
                  value={config.leaveLabels[item.code] ?? item.desc}
                  onChange={(e) => {
                    handleLeaveLabelChange(item.code, e.target.value);
                    if (item.code === 'Ô') {
                      handleLeaveLabelChange('O', e.target.value);
                    }
                  }}
                  className="flex-1 h-8 px-3 text-sm bg-slate-50 border border-slate-200 rounded text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Danh mục chuyển đổi Mã bộ phận ↔ Tên bộ phận
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Tự động trích xuất từ cột Bộ phận (sheet HC), cột Máy (sheet SX) và đối chiếu sheet Tổng hợp. Bạn có thể sửa trực tiếp.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleUseExactRawDeptNames}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                Giữ nguyên mã gốc
              </button>
              {Object.keys(deptOverrides).length > 0 && (
                <button
                  type="button"
                  onClick={() => onUpdateDeptOverrides({})}
                  className="px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 rounded-md transition-colors whitespace-nowrap shrink-0"
                >
                  Đặt lại tự động
                </button>
              )}
            </div>
          </div>

          <div className="max-h-[360px] overflow-y-auto border border-slate-200 rounded-md">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="py-2.5 px-3">Khối</th>
                  <th className="py-2.5 px-3">Giá trị gốc (Excel)</th>
                  <th className="py-2.5 px-3">Số NV</th>
                  <th className="py-2.5 px-3">Mã bộ phận xuất ra</th>
                  <th className="py-2.5 px-3">Tên bộ phận xuất ra</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {uniqueDeptRows.map((row) => {
                  const inferred = inferDefaultDepartment(
                    row.rawDeptOrMachine,
                    row.summaryDeptName,
                    row.sheetType
                  );
                  const current = deptOverrides[row.key] ?? inferred;
                  return (
                    <tr key={row.key} className="hover:bg-slate-50/70">
                      <td className="py-2 px-3 font-mono text-slate-500">{row.sheetType}</td>
                      <td className="py-2 px-3 font-medium text-slate-800">
                        {row.rawDeptOrMachine || '—'}
                      </td>
                      <td className="py-2 px-3 font-mono tabular-nums text-slate-500">
                        {row.count}
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={current.code}
                          onChange={(e) =>
                            onUpdateDeptOverrides({
                              ...deptOverrides,
                              [row.key]: {
                                code: e.target.value,
                                name: current.name,
                              },
                            })
                          }
                          className="w-28 h-7 px-2 font-mono text-xs bg-white border border-slate-200 rounded text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={current.name}
                          onChange={(e) =>
                            onUpdateDeptOverrides({
                              ...deptOverrides,
                              [row.key]: {
                                code: current.code,
                                name: e.target.value,
                              },
                            })
                          }
                          className="w-full min-w-[180px] h-7 px-2 text-xs bg-white border border-slate-200 rounded text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
