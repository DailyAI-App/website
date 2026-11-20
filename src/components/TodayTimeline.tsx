import type { StudySession } from "@/lib/study";

const HOUR_MARKS = [0, 6, 12, 18, 24];
const MINUTES_PER_DAY = 1440;

function minutesFromMidnight(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

// AirPods-detected presence score (0-10) decides the block color — this is
// the "열품타"-style day bar: good = focused, mid = distracted, neutral = no
// AirPods signal for that session.
function presenceClass(score: number | null): string {
  if (score == null) return "timeline-block-neutral";
  if (score >= 7) return "timeline-block-good";
  if (score >= 4) return "timeline-block-mid";
  return "timeline-block-low";
}

export default function TodayTimeline({ sessions }: { sessions: StudySession[] }) {
  const todaySessions = sessions.filter((s) => isToday(s.createdAt));

  return (
    <div className="today-timeline">
      <div className="today-timeline-track">
        {todaySessions.map((session) => {
          const endMinutes = minutesFromMidnight(session.createdAt);
          const startMinutes = Math.max(0, endMinutes - session.minutes);
          const left = (startMinutes / MINUTES_PER_DAY) * 100;
          const width = Math.max(0.4, ((endMinutes - startMinutes) / MINUTES_PER_DAY) * 100);
          return (
            <div
              key={session.id}
              className={`today-timeline-block ${presenceClass(session.postureScore)}`}
              style={{ left: `${left}%`, width: `${width}%` }}
              title={`${session.minutes}분 학습${session.postureScore != null ? ` · 감지 ${session.postureScore.toFixed(1)}점` : ""}`}
            />
          );
        })}
      </div>
      <div className="today-timeline-ticks">
        {HOUR_MARKS.map((hour) => (
          <span key={hour}>{hour}시</span>
        ))}
      </div>
      {todaySessions.length === 0 && <p className="today-timeline-empty">아직 오늘 기록된 학습이 없어요. 집중 시작을 눌러보세요.</p>}
    </div>
  );
}
