function isDaytimeNow(at = /* @__PURE__ */ new Date()) {
  const hour = at.getHours() + at.getMinutes() / 60 + at.getSeconds() / 3600;
  return hour >= 6 && hour < 18;
}
export {
  isDaytimeNow
};
