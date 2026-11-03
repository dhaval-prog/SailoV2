const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}
function computeNextTrigger(schedule, from = /* @__PURE__ */ new Date()) {
  const isPast = (d) => d.getTime() <= from.getTime();
  if (schedule.recurrence === "weekly") {
    const days = schedule.daysOfWeek.length > 0 ? schedule.daysOfWeek : [from.getDay()];
    for (let i = 0; i < 8; i++) {
      const candidate2 = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i, schedule.hour, schedule.minute, 0, 0);
      if (days.includes(candidate2.getDay()) && !isPast(candidate2)) return candidate2;
    }
    return new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7, schedule.hour, schedule.minute, 0, 0);
  }
  if (schedule.recurrence === "monthly") {
    const dom = schedule.dayOfMonth ?? from.getDate();
    let year = from.getFullYear();
    let month = from.getMonth();
    let candidate2 = new Date(year, month, Math.min(dom, daysInMonth(year, month)), schedule.hour, schedule.minute, 0, 0);
    if (isPast(candidate2)) {
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
      candidate2 = new Date(year, month, Math.min(dom, daysInMonth(year, month)), schedule.hour, schedule.minute, 0, 0);
    }
    return candidate2;
  }
  let candidate = new Date(from.getFullYear(), from.getMonth(), from.getDate(), schedule.hour, schedule.minute, 0, 0);
  if (isPast(candidate)) candidate = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1, schedule.hour, schedule.minute, 0, 0);
  return candidate;
}
function formatTime(hour, minute) {
  const period = hour >= 12 ? "PM" : "AM";
  const h12 = (hour + 11) % 12 + 1;
  return `${h12}:${String(minute).padStart(2, "0")} ${period}`;
}
function formatAlertSchedule(schedule) {
  const time = formatTime(schedule.hour, schedule.minute);
  switch (schedule.recurrence) {
    case "once":
      return `Once at ${time}`;
    case "everyday":
      return `Everyday at ${time}`;
    case "weekly": {
      const days = schedule.daysOfWeek.length > 0 ? [...schedule.daysOfWeek].sort().map((d) => WEEKDAY_LABELS[d]).join(", ") : "every day";
      return `Every ${days} at ${time}`;
    }
    case "monthly":
      return `Monthly on day ${schedule.dayOfMonth} at ${time}`;
  }
}
export {
  WEEKDAY_LABELS,
  computeNextTrigger,
  formatAlertSchedule
};
