"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarIcon } from "@/components/Icons";

export type CalendarEvent = { id: string; title: string; date: string; detail: string | null };

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function todayKey(): string {
  const now = new Date();
  return dateKey(now.getFullYear(), now.getMonth(), now.getDate());
}

type Cell = { day: number; key: string } | null;

function buildCells(year: number, month: number): Cell[] {
  const firstWeekday = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const cells: Cell[] = Array.from({ length: firstWeekday }, () => null);
  for (let day = 1; day <= totalDays; day++) cells.push({ day, key: dateKey(year, month, day) });
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

async function fetchJSON(url: string, init?: RequestInit): Promise<{ events: CalendarEvent[] }> {
  const res = await fetch(url, init);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "요청이 실패했어요.");
  return data;
}

export default function SchedulePanel() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDetail, setNewDetail] = useState("");
  const [showNewDetail, setShowNewDetail] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDetail, setEditDetail] = useState("");

  useEffect(() => {
    fetchJSON("/api/calendar")
      .then((data) => setEvents(data.events))
      .catch(() => setEvents([]));
  }, []);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const cells = useMemo(() => buildCells(year, month), [year, month]);
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) map.set(event.date, [...(map.get(event.date) ?? []), event]);
    return map;
  }, [events]);
  const selectedEvents = selectedKey ? eventsByDate.get(selectedKey) ?? [] : [];
  const todayEvents = eventsByDate.get(todayKey()) ?? [];

  function changeMonth(delta: number) {
    setCursor(new Date(year, month + delta, 1));
  }

  function goToToday() {
    const now = new Date();
    setCursor(now);
    setSelectedKey(todayKey());
  }

  async function handleAdd() {
    const trimmed = newTitle.trim();
    if (!trimmed || !selectedKey) return;
    setNewTitle("");
    setNewDetail("");
    setShowNewDetail(false);
    const data = await fetchJSON("/api/calendar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: trimmed, date: selectedKey, detail: newDetail.trim() || null }),
    });
    setEvents(data.events);
  }

  function startEdit(event: CalendarEvent) {
    setEditingId(event.id);
    setEditTitle(event.title);
    setEditDetail(event.detail ?? "");
  }

  async function saveEdit() {
    if (!editingId) return;
    const trimmed = editTitle.trim();
    const id = editingId;
    setEditingId(null);
    if (!trimmed) return;
    const data = await fetchJSON(`/api/calendar/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: trimmed, detail: editDetail.trim() || null }),
    });
    setEvents(data.events);
  }

  async function handleDelete(id: string) {
    if (editingId === id) setEditingId(null);
    const data = await fetchJSON(`/api/calendar/${id}`, { method: "DELETE" });
    setEvents(data.events);
  }

  return (
    <div className="schedule-layout">
      <aside className="card schedule-panel">
      <div className="section-heading schedule-heading">
        <div>
          <p className="eyebrow">내 캘린더</p>
          <h3>일정</h3>
        </div>
        <span className="calendar-label"><CalendarIcon /></span>
      </div>

      <div className="schedule-cal-nav">
        <div className="schedule-cal-month-nav">
          <button type="button" className="btn-text-danger" onClick={() => changeMonth(-1)} aria-label="이전 달">‹</button>
          <strong>{year}년 {month + 1}월</strong>
          <button type="button" className="btn-text-danger" onClick={() => changeMonth(1)} aria-label="다음 달">›</button>
        </div>
        <button type="button" className="schedule-today-button" onClick={goToToday}>오늘</button>
      </div>

      <div className="schedule-cal-grid">
        {WEEKDAYS.map((w) => (
          <div key={w} className="schedule-cal-weekday">{w}</div>
        ))}
        {cells.map((cell, i) => {
          if (!cell) return <div key={i} className="schedule-cal-cell schedule-cal-cell-blank" />;
          const dayEvents = eventsByDate.get(cell.key) ?? [];
          const classes = ["schedule-cal-cell"];
          if (cell.key === todayKey()) classes.push("schedule-cal-cell-today");
          if (cell.key === selectedKey) classes.push("schedule-cal-cell-selected");
          return (
            <button
              key={cell.key}
              type="button"
              className={classes.join(" ")}
              onClick={() => setSelectedKey(cell.key === selectedKey ? null : cell.key)}
            >
              <span className="schedule-cal-day-num">{cell.day}</span>
              {dayEvents.length > 0 && <span className="schedule-cal-dot" aria-label={`${dayEvents.length}개 일정`} />}
            </button>
          );
        })}
      </div>

      {selectedKey && (
        <div className="schedule-day-panel">
          <p className="schedule-day-panel-date">{selectedKey}</p>

          {selectedEvents.length === 0 && <p className="schedule-message">등록된 일정이 없습니다.</p>}
          <ul className="schedule-day-panel-list">
            {selectedEvents.map((event) =>
              editingId === event.id ? (
                <li key={event.id} className="schedule-day-panel-item schedule-day-panel-item-editing">
                  <input
                    className="input"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                    autoFocus
                  />
                  <textarea
                    className="input schedule-detail-input"
                    placeholder="세부 내용"
                    value={editDetail}
                    onChange={(e) => setEditDetail(e.target.value)}
                    rows={2}
                  />
                  <div className="schedule-item-actions">
                    <button type="button" className="btn-text-danger" onClick={() => void saveEdit()}>저장</button>
                    <button type="button" className="btn-text-danger" onClick={() => setEditingId(null)}>취소</button>
                  </div>
                </li>
              ) : (
                <li key={event.id} className="schedule-day-panel-item">
                  <div className="schedule-event-content">
                    <strong>{event.title}</strong>
                    {event.detail && <p>{event.detail}</p>}
                  </div>
                  <div className="schedule-item-actions">
                    <button type="button" className="btn-text-danger" onClick={() => startEdit(event)}>수정</button>
                    <button type="button" className="btn-text-danger" onClick={() => void handleDelete(event.id)}>삭제</button>
                  </div>
                </li>
              ),
            )}
          </ul>

          <div className="schedule-composer">
            <div className="schedule-composer-row">
              <input
                className="input"
                placeholder="일정 제목"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
              <button
                type="button"
                className="schedule-detail-toggle"
                onClick={() => setShowNewDetail((previous) => !previous)}
              >
                {showNewDetail ? "세부 내용 닫기" : "세부 내용 추가"}
              </button>
              <button type="button" className="btn-primary" onClick={() => void handleAdd()} disabled={!newTitle.trim()}>
                추가
              </button>
            </div>
            {showNewDetail && (
              <textarea
                className="input schedule-detail-input"
                placeholder="세부 내용 (선택)"
                value={newDetail}
                onChange={(e) => setNewDetail(e.target.value)}
                rows={2}
                autoFocus
              />
            )}
          </div>
        </div>
      )}

        <p className="schedule-caption">내 캘린더 · 계정에 저장됨</p>
      </aside>

      <aside className="card schedule-today-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">오늘</p>
            <h3>오늘의 일정</h3>
          </div>
          <span className="schedule-today-count">{todayEvents.length}개</span>
        </div>
        {todayEvents.length === 0 ? (
          <p className="schedule-today-empty">오늘 등록된 일정이 없습니다.</p>
        ) : (
          <ul className="schedule-today-list">
            {todayEvents.map((event) => (
              <li key={event.id} className="schedule-today-item">
                <strong>{event.title}</strong>
                {event.detail && <p>{event.detail}</p>}
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
