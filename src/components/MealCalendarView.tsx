'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Moon,
  Plus,
  Sun,
} from 'lucide-react';
import { formatVnd, getMealDateVN } from '@/lib/calculations';
import { playClickSound } from '@/lib/sound';
import { AppState, MealSession, RoleKey } from '@/lib/types';

interface MealCalendarViewProps {
  state: AppState;
  month: string; // YYYY-MM or 'ALL'
  role: RoleKey;
  onShiftMonth: (delta: number) => void;
  onSelectMeal: (meal: MealSession) => void;
  onQuickAddMealForDate: (preset: {
    programId: string;
    dateVN: string;
    timeVN: string;
  }) => void;
}

interface DayCellData {
  dateStr: string; // YYYY-MM-DD
  dayNumber: number;
  dayOfWeek: number; // 1 = Mon ... 7 = Sun
  isCurrentMonth: boolean;
  isToday: boolean;
  isPastOrToday: boolean;
  isWeekday: boolean; // Mon - Fri
  isThursday: boolean; // Thu (dayOfWeek === 4)
  lunchMeals: MealSession[];
  dinnerMeals: MealSession[];
  missingLunch: boolean;
  missingThursdayDinner: boolean;
}

const WEEKDAY_HEADERS = [
  'Thứ 2',
  'Thứ 3',
  'Thứ 4',
  'Thứ 5 (Có Tối)',
  'Thứ 6',
  'Thứ 7',
  'Chủ Nhật',
];

function getTodayVN(): string {
  return getMealDateVN(new Date().toISOString());
}

function buildMonthGrid(
  yyyyMm: string,
  meals: MealSession[],
  lunchProgIds: Set<string>,
  dinnerProgIds: Set<string>
): DayCellData[] {
  const validMonth = /^\d{4}-\d{2}$/.test(yyyyMm) ? yyyyMm : '2026-10';
  const [year, month] = validMonth.split('-').map(Number);
  const todayVN = getTodayVN();

  // Ngày đầu tháng
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  // Chuyển Chủ Nhật (0) thành 7, Thứ 2 (1) thành 1
  const firstDow = firstDay.getUTCDay() === 0 ? 7 : firstDay.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  // Nhóm bữa ăn theo ngày YYYY-MM-DD (không tính bữa VOIDED)
  const mealsByDate: Record<string, MealSession[]> = {};
  for (const m of meals) {
    if (m.status === 'VOIDED') continue;
    const dStr = getMealDateVN(m.occurredAt);
    if (!mealsByDate[dStr]) mealsByDate[dStr] = [];
    mealsByDate[dStr].push(m);
  }

  const cells: DayCellData[] = [];

  // Các ô đệm tháng trước để bắt đầu từ Thứ 2
  const prevMonthDays = firstDow - 1;
  const prevMonthLastDate = new Date(Date.UTC(year, month - 1, 0)).getUTCDate();
  for (let i = prevMonthDays - 1; i >= 0; i--) {
    const dNum = prevMonthLastDate - i;
    const dObj = new Date(Date.UTC(year, month - 2, dNum));
    const y = dObj.getUTCFullYear();
    const m = String(dObj.getUTCMonth() + 1).padStart(2, '0');
    const d = String(dObj.getUTCDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    const dow = dObj.getUTCDay() === 0 ? 7 : dObj.getUTCDay();
    const dayMeals = mealsByDate[dateStr] || [];
    const lunchMeals = dayMeals.filter((x) => lunchProgIds.has(x.programId));
    const dinnerMeals = dayMeals.filter((x) => dinnerProgIds.has(x.programId));

    cells.push({
      dateStr,
      dayNumber: dNum,
      dayOfWeek: dow,
      isCurrentMonth: false,
      isToday: dateStr === todayVN,
      isPastOrToday: dateStr <= todayVN,
      isWeekday: dow >= 1 && dow <= 5,
      isThursday: dow === 4,
      lunchMeals,
      dinnerMeals,
      missingLunch: false,
      missingThursdayDinner: false,
    });
  }

  // Các ngày trong tháng hiện tại
  for (let dNum = 1; dNum <= daysInMonth; dNum++) {
    const dObj = new Date(Date.UTC(year, month - 1, dNum));
    const dow = dObj.getUTCDay() === 0 ? 7 : dObj.getUTCDay();
    const dateStr = `${validMonth}-${String(dNum).padStart(2, '0')}`;
    const isPastOrToday = dateStr <= todayVN;
    const isWeekday = dow >= 1 && dow <= 5;
    const isThursday = dow === 4;

    const dayMeals = mealsByDate[dateStr] || [];
    const lunchMeals = dayMeals.filter((x) => lunchProgIds.has(x.programId));
    const dinnerMeals = dayMeals.filter((x) => dinnerProgIds.has(x.programId));

    cells.push({
      dateStr,
      dayNumber: dNum,
      dayOfWeek: dow,
      isCurrentMonth: true,
      isToday: dateStr === todayVN,
      isPastOrToday,
      isWeekday,
      isThursday,
      lunchMeals,
      dinnerMeals,
      missingLunch: isPastOrToday && isWeekday && lunchMeals.length === 0,
      missingThursdayDinner: isPastOrToday && isThursday && dinnerMeals.length === 0,
    });
  }

  // Các ô đệm tháng sau để tròn bội số 7
  const trailing = (7 - (cells.length % 7)) % 7;
  for (let i = 1; i <= trailing; i++) {
    const dObj = new Date(Date.UTC(year, month, i));
    const y = dObj.getUTCFullYear();
    const m = String(dObj.getUTCMonth() + 1).padStart(2, '0');
    const d = String(dObj.getUTCDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    const dow = dObj.getUTCDay() === 0 ? 7 : dObj.getUTCDay();
    const dayMeals = mealsByDate[dateStr] || [];
    const lunchMeals = dayMeals.filter((x) => lunchProgIds.has(x.programId));
    const dinnerMeals = dayMeals.filter((x) => dinnerProgIds.has(x.programId));

    cells.push({
      dateStr,
      dayNumber: i,
      dayOfWeek: dow,
      isCurrentMonth: false,
      isToday: dateStr === todayVN,
      isPastOrToday: dateStr <= todayVN,
      isWeekday: dow >= 1 && dow <= 5,
      isThursday: dow === 4,
      lunchMeals,
      dinnerMeals,
      missingLunch: false,
      missingThursdayDinner: false,
    });
  }

  return cells;
}

export default function MealCalendarView({
  state,
  month,
  role,
  onShiftMonth,
  onSelectMeal,
  onQuickAddMealForDate,
}: MealCalendarViewProps) {
  const [viewMode, setViewMode] = useState<'MONTH' | 'WEEK'>('MONTH');
  const [selectedWeekIndex, setSelectedWeekIndex] = useState<number>(0);

  const activeMonth = month === 'ALL' ? '2026-10' : month;
  const lunchProg = state.programs.find((p) => p.code === 'LEADERSHIP_LUNCH') || state.programs[0];
  const dinnerProg =
    state.programs.find((p) => p.code === 'GAME_STRATEGY_DINNER') || state.programs[1];

  const lunchProgIds = useMemo(
    () => new Set(state.programs.filter((p) => p.code === 'LEADERSHIP_LUNCH').map((p) => p.id)),
    [state.programs]
  );
  const dinnerProgIds = useMemo(
    () =>
      new Set(state.programs.filter((p) => p.code === 'GAME_STRATEGY_DINNER').map((p) => p.id)),
    [state.programs]
  );

  const allCells = useMemo(
    () => buildMonthGrid(activeMonth, state.meals, lunchProgIds, dinnerProgIds),
    [activeMonth, state.meals, lunchProgIds, dinnerProgIds]
  );

  // Chia thành các tuần (mỗi tuần 7 ngày)
  const weeks = useMemo(() => {
    const result: DayCellData[][] = [];
    for (let i = 0; i < allCells.length; i += 7) {
      result.push(allCells.slice(i, i + 7));
    }
    return result;
  }, [allCells]);

  // Thống kê nhanh các ngày đã note / còn sót trong tháng đang xem
  const monthSummary = useMemo(() => {
    const currentMonthCells = allCells.filter((c) => c.isCurrentMonth);
    const loggedLunchDays = currentMonthCells.filter((c) => c.lunchMeals.length > 0);
    const loggedDinnerDays = currentMonthCells.filter((c) => c.dinnerMeals.length > 0);
    const missingLunchDays = currentMonthCells.filter((c) => c.missingLunch);
    const missingThursdayDinnerDays = currentMonthCells.filter((c) => c.missingThursdayDinner);

    const totalLunchVnd = loggedLunchDays.reduce(
      (s, c) => s + c.lunchMeals.reduce((acc, m) => acc + m.totalPaidVnd, 0),
      0
    );
    const totalDinnerVnd = loggedDinnerDays.reduce(
      (s, c) => s + c.dinnerMeals.reduce((acc, m) => acc + m.totalPaidVnd, 0),
      0
    );

    return {
      loggedLunchDays,
      loggedDinnerDays,
      missingLunchDays,
      missingThursdayDinnerDays,
      totalLunchVnd,
      totalDinnerVnd,
    };
  }, [allCells]);

  const displayedCells = useMemo(() => {
    if (viewMode === 'MONTH') return allCells;
    const safeIdx = Math.min(Math.max(0, selectedWeekIndex), Math.max(0, weeks.length - 1));
    return weeks[safeIdx] || allCells.slice(0, 7);
  }, [viewMode, allCells, weeks, selectedWeekIndex]);

  const formatShortDate = (yyyyMmDd: string) => {
    const parts = yyyyMmDd.split('-');
    return `${parts[2]}/${parts[1]}`;
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3.5 animate-slide-up">
      {/* Header Lịch + Chú thích 2 màu (Teal = Ăn trưa, Tím Indigo = Ăn tối T5) */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-slate-900">
              <CalendarIcon className="w-4 h-4 text-teal-600" />
              Lịch Theo Dõi Note Tiền & Rà Soát Ngày Còn Sót — Tháng {activeMonth}
            </span>

            {/* Chú thích 2 màu rõ ràng */}
            <div className="flex items-center gap-2 ml-1">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-600 text-white text-[11px] font-bold shadow-2xs">
                <Sun className="w-3 h-3" /> Màu Xanh Teal: Ăn trưa (Hằng ngày)
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-600 text-white text-[11px] font-bold shadow-2xs">
                <Moon className="w-3 h-3" /> Màu Tím Indigo: Ăn tối Thứ 5
              </span>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Ô có viền nét đứt cảnh báo những ngày trong tuần (T2–T6) hoặc tối Thứ 5 đã qua mà bạn <strong>chưa note tiền</strong>. Bấm trực tiếp vào bất kỳ ngày nào để thêm bữa ăn cho ngày đó.
          </p>
        </div>

        {/* Điều khiển Chế độ Xem (Tháng / Tuần) & Chuyển tháng */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {viewMode === 'WEEK' && weeks.length > 0 && (
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
              {weeks.map((w, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    playClickSound();
                    setSelectedWeekIndex(idx);
                  }}
                  className={`px-2 py-1 rounded-lg text-[11px] font-bold transition ${
                    selectedWeekIndex === idx
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-white'
                  }`}
                >
                  Tuần {idx + 1} ({formatShortDate(w[0].dateStr)})
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => {
                playClickSound();
                setViewMode('MONTH');
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                viewMode === 'MONTH'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-white'
              }`}
            >
              Lịch Tháng
            </button>
            <button
              type="button"
              onClick={() => {
                playClickSound();
                setViewMode('WEEK');
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                viewMode === 'WEEK'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-white'
              }`}
            >
              Lịch Tuần
            </button>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => {
                playClickSound();
                onShiftMonth(-1);
              }}
              className="p-1 rounded-lg hover:bg-white text-slate-700"
              title="Tháng trước"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 text-xs font-extrabold text-slate-900">{activeMonth}</span>
            <button
              type="button"
              onClick={() => {
                playClickSound();
                onShiftMonth(1);
              }}
              className="p-1 rounded-lg hover:bg-white text-slate-700"
              title="Tháng sau"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Thanh Tổng hợp & Phát hiện Ngày còn sót (Rất trực quan) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Hộp 1: Trạng thái Ăn trưa (Màu Xanh Teal) */}
        <div className="p-3 rounded-xl bg-teal-50/60 border border-teal-200 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-teal-600 shrink-0" />
              <span className="text-xs font-extrabold text-teal-950">
                1. Ăn trưa BOD (Leadership Lunch)
              </span>
            </div>
            <div className="text-xs font-bold text-teal-800">
              Đã note: <strong>{monthSummary.loggedLunchDays.length} ngày</strong> (
              {formatVnd(monthSummary.totalLunchVnd)})
            </div>
          </div>

          {monthSummary.missingLunchDays.length === 0 ? (
            <div className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Đã note đủ tất cả các ngày làm việc trong tháng!
            </div>
          ) : (
            <div>
              <div className="text-[11px] font-bold text-amber-800 mb-1 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>
                  Còn trống {monthSummary.missingLunchDays.length} ngày làm việc (T2–T6) chưa note ăn trưa — Bấm vào ngày để nhập bù:
                </span>
              </div>
              <div className="flex flex-wrap gap-1 max-h-14 overflow-y-auto pr-1">
                {monthSummary.missingLunchDays.map((cell) => (
                  <button
                    key={cell.dateStr}
                    type="button"
                    disabled={role === 'VIEWER'}
                    onClick={() => {
                      playClickSound();
                      onQuickAddMealForDate({
                        programId: lunchProg?.id || 'prog-lunch',
                        dateVN: cell.dateStr,
                        timeVN: '12:15',
                      });
                    }}
                    className="px-2 py-0.5 rounded bg-white hover:bg-teal-600 hover:text-white text-teal-800 border border-teal-300 text-[10px] font-bold transition"
                    title={`Bấm để note Ăn trưa ngày ${cell.dateStr}`}
                  >
                    + {formatShortDate(cell.dateStr)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Hộp 2: Trạng thái Ăn tối Thứ 5 (Màu Tím Indigo) */}
        <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-200 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-indigo-600 shrink-0" />
              <span className="text-xs font-extrabold text-indigo-950">
                2. Ăn tối Thứ 5 (Game Strategy Dinner)
              </span>
            </div>
            <div className="text-xs font-bold text-indigo-800">
              Đã note: <strong>{monthSummary.loggedDinnerDays.length} buổi</strong> (
              {formatVnd(monthSummary.totalDinnerVnd)})
            </div>
          </div>

          {monthSummary.missingThursdayDinnerDays.length === 0 ? (
            <div className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Đã note đủ tất cả các tối Thứ 5 trong tháng!
            </div>
          ) : (
            <div>
              <div className="text-[11px] font-bold text-indigo-900 mb-1 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>
                  Còn trống {monthSummary.missingThursdayDinnerDays.length} tối Thứ 5 chưa note tiền — Bấm vào ngày để nhập bù:
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {monthSummary.missingThursdayDinnerDays.map((cell) => (
                  <button
                    key={cell.dateStr}
                    type="button"
                    disabled={role === 'VIEWER'}
                    onClick={() => {
                      playClickSound();
                      onQuickAddMealForDate({
                        programId: dinnerProg?.id || 'prog-dinner',
                        dateVN: cell.dateStr,
                        timeVN: '19:00',
                      });
                    }}
                    className="px-2 py-0.5 rounded bg-white hover:bg-indigo-600 hover:text-white text-indigo-800 border border-indigo-300 text-[10px] font-bold transition"
                    title={`Bấm để note Ăn tối Thứ 5 ngày ${cell.dateStr}`}
                  >
                    + Tối T5 ({formatShortDate(cell.dateStr)})
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lưới Lịch 7 cột (Thứ 2 → Chủ Nhật) */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        {/* Header Thứ trong tuần */}
        <div className="grid grid-cols-7 bg-slate-900 text-white text-[11px] font-bold">
          {WEEKDAY_HEADERS.map((label, idx) => (
            <div
              key={label}
              className={`py-2 px-2 text-center border-r border-slate-800 last:border-r-0 ${
                idx === 3 ? 'bg-indigo-950 text-indigo-200' : ''
              }`}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Các ô ngày */}
        <div className="grid grid-cols-7 divide-x divide-y divide-slate-200 bg-slate-50">
          {displayedCells.map((cell) => {
            const hasLunch = cell.lunchMeals.length > 0;
            const hasDinner = cell.dinnerMeals.length > 0;

            return (
              <div
                key={cell.dateStr}
                className={`min-h-[96px] p-1.5 flex flex-col justify-between transition group relative ${
                  !cell.isCurrentMonth
                    ? 'bg-slate-100/60 opacity-45'
                    : cell.isToday
                    ? 'bg-teal-50/40 ring-2 ring-inset ring-teal-500'
                    : cell.isThursday
                    ? 'bg-indigo-50/15 hover:bg-slate-50'
                    : 'bg-white hover:bg-slate-50'
                }`}
              >
                {/* Dòng trên cùng của ô ngày: Số ngày + Nút thêm nhanh khi hover */}
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-extrabold ${
                        cell.isToday
                          ? 'bg-teal-600 text-white'
                          : cell.dayOfWeek >= 6
                          ? 'text-slate-400'
                          : 'text-slate-800'
                      }`}
                    >
                      {cell.dayNumber}
                    </span>
                    {cell.isToday && (
                      <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-teal-100 text-teal-800">
                        Hôm nay
                      </span>
                    )}
                  </div>

                  {/* Nút +Trưa (Xanh) và +Tối (Tím) hiện lên khi rê chuột vào ngày bất kỳ */}
                  {role !== 'VIEWER' && cell.isCurrentMonth && (
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          playClickSound();
                          onQuickAddMealForDate({
                            programId: lunchProg?.id || 'prog-lunch',
                            dateVN: cell.dateStr,
                            timeVN: '12:15',
                          });
                        }}
                        className="px-1.5 py-0.5 rounded bg-teal-600 hover:bg-teal-700 text-white text-[9px] font-bold"
                        title={`Thêm Ăn trưa ngày ${cell.dateStr}`}
                      >
                        +Trưa
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          playClickSound();
                          onQuickAddMealForDate({
                            programId: dinnerProg?.id || 'prog-dinner',
                            dateVN: cell.dateStr,
                            timeVN: '19:00',
                          });
                        }}
                        className="px-1.5 py-0.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-[9px] font-bold"
                        title={`Thêm Ăn tối ngày ${cell.dateStr}`}
                      >
                        +Tối
                      </button>
                    </div>
                  )}
                </div>

                {/* Nội dung các bữa đã note hoặc cảnh báo chưa note trong ô ngày */}
                <div className="space-y-1 mt-1">
                  {/* 1. Các bữa ĂN TRƯA đã note (MÀU XANH TEAL) */}
                  {cell.lunchMeals.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        playClickSound();
                        onSelectMeal(m);
                      }}
                      className="w-full text-left px-1.5 py-1 rounded-md bg-teal-600 hover:bg-teal-700 text-white shadow-2xs transition flex items-center justify-between gap-1"
                      title={`Ăn trưa: ${m.venue} — ${formatVnd(m.totalPaidVnd)} (${m.status})`}
                    >
                      <span className="text-[10px] font-bold truncate flex items-center gap-1">
                        <Sun className="w-2.5 h-2.5 shrink-0" />
                        {m.venue}
                      </span>
                      <span className="text-[10px] font-extrabold shrink-0">
                        {Math.round(m.totalPaidVnd / 1000)}k
                      </span>
                    </button>
                  ))}

                  {/* Cảnh báo CHƯA NOTE ĂN TRƯA (Nếu ngày T2-T6 đã qua mà chưa có bữa trưa) */}
                  {cell.isCurrentMonth && !hasLunch && cell.missingLunch && (
                    <button
                      type="button"
                      disabled={role === 'VIEWER'}
                      onClick={() => {
                        playClickSound();
                        onQuickAddMealForDate({
                          programId: lunchProg?.id || 'prog-lunch',
                          dateVN: cell.dateStr,
                          timeVN: '12:15',
                        });
                      }}
                      className="w-full text-left px-1.5 py-1 rounded-md border border-dashed border-teal-400 bg-teal-50/50 hover:bg-teal-100/80 text-teal-800 transition flex items-center justify-between"
                      title="Ngày làm việc chưa ghi nhận bữa trưa — Bấm để note ngay"
                    >
                      <span className="text-[10px] font-semibold truncate">
                        Chưa note Trưa
                      </span>
                      <Plus className="w-3 h-3 shrink-0 text-teal-700" />
                    </button>
                  )}

                  {/* 2. Các bữa ĂN TỐI THỨ 5 đã note (MÀU TÍM INDIGO) */}
                  {cell.dinnerMeals.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        playClickSound();
                        onSelectMeal(m);
                      }}
                      className="w-full text-left px-1.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs transition flex items-center justify-between gap-1"
                      title={`Ăn tối T5: ${m.venue} — ${formatVnd(m.totalPaidVnd)} (${m.status})`}
                    >
                      <span className="text-[10px] font-bold truncate flex items-center gap-1">
                        <Moon className="w-2.5 h-2.5 shrink-0" />
                        {m.venue}
                      </span>
                      <span className="text-[10px] font-extrabold shrink-0">
                        {Math.round(m.totalPaidVnd / 1000)}k
                      </span>
                    </button>
                  ))}

                  {/* Cảnh báo CHƯA NOTE TỐI THỨ 5 (Nếu là ngày Thứ 5 đã qua mà chưa có bữa tối) */}
                  {cell.isCurrentMonth && !hasDinner && cell.missingThursdayDinner && (
                    <button
                      type="button"
                      disabled={role === 'VIEWER'}
                      onClick={() => {
                        playClickSound();
                        onQuickAddMealForDate({
                          programId: dinnerProg?.id || 'prog-dinner',
                          dateVN: cell.dateStr,
                          timeVN: '19:00',
                        });
                      }}
                      className="w-full text-left px-1.5 py-1 rounded-md border border-dashed border-indigo-400 bg-indigo-50/60 hover:bg-indigo-100/80 text-indigo-800 transition flex items-center justify-between"
                      title="Tối Thứ 5 chưa ghi nhận bữa tối Ban Chiến lược Game — Bấm để note ngay"
                    >
                      <span className="text-[10px] font-semibold truncate">
                        Chưa note Tối T5
                      </span>
                      <Plus className="w-3 h-3 shrink-0 text-indigo-700" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
