const throwFont = {
  // The handwritten letter content itself, and any "penned" accents (kickers, signatures).
  hand400: "Caveat_400Regular",
  hand500: "Caveat_500Medium",
  hand600: "Caveat_600SemiBold",
  hand700: "Caveat_700Bold",
  // Everything else (labels, buttons, distance readouts) stays on the app's normal UI face.
  ui400: "Figtree_400Regular",
  ui500: "Figtree_500Medium",
  ui600: "Figtree_600SemiBold",
  ui700: "Figtree_700Bold",
  mono: "DMMono_400Regular",
  mono500: "DMMono_500Medium"
};
const throwColor = {
  // Warm cream paper — the letter's own surface, and the base background for Throw screens.
  paper: "#FBF6EC",
  paperShadow: "rgba(80,64,40,.16)",
  paperLine: "rgba(80,64,40,.08)",
  // Ink — a warm near-black, never the app's cool lime-adjacent ink.
  ink: "#2B231C",
  inkSoft: "rgba(43,35,28,.66)",
  inkMute: "rgba(43,35,28,.42)",
  inkFaint: "rgba(43,35,28,.28)",
  // The one accent — a muted clay/terracotta, warm and quiet rather than a bright CTA color.
  clay: "#C9714F",
  clayDeep: "#A85A3C",
  claySoft: "rgba(201,113,79,.14)",
  // Own pin vs. a friend's pin.
  pinSelf: "#2B231C",
  pinFriend: "#C9714F",
  pinRing: "rgba(201,113,79,.28)",
  // Unread / "new letter" indicator.
  unread: "#C9714F",
  // The recipient carousel's "currently selected" indicator — a deliberate cool blue, the one
  // place that breaks from the rest of Throw's warm palette, per explicit request with a
  // reference screenshot (an animated pulse ring, not the warm clay accent used elsewhere).
  activeBlue: "#3D7BFF",
  activeBlueSoft: "rgba(61,123,255,.16)",
  screenBg: "#F6F1E4",
  cardBg: "#FFFFFF",
  cardBorder: "rgba(80,64,40,.1)",
  // A story's "unseen, active" ring around a contact's avatar — a plain, saturated green rather
  // than any of Throw's own warm/blue accents, matching the universal status-ring convention
  // (WhatsApp/Instagram) per explicit reference screenshot. One story is a solid ring; more than
  // one splits it into that many equal segments (see StoryRing).
  storyRing: "#34C759",
  shadowSoft: {
    shadowColor: "#50402A",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4
  }
};
const throwGlass = {
  // Soft radial blobs a GlassSurface's blur actually picks up — muted versions of Home's lime,
  // same idea as gamesHubTokens' blobGreen/blobSecondary.
  blobLime: "rgba(195,234,79,.5)",
  blobPale: "rgba(237,253,255,.6)",
  // The tint layered over BlurView on light glass chrome (header, buttons, cards).
  tint: "rgba(195,234,79,.16)",
  tintStrong: "rgba(195,234,79,.26)",
  border: "rgba(195,234,79,.4)",
  // Same glass treatment, "water blue"-tinted (the same cool blue as throwColor.activeBlue)
  // instead of lime — for the letter's own bottom-controls row specifically (see FoldingLetter),
  // per explicit request. Was ink-tinted for one round, then explicitly changed to blue — kept as
  // its own tokens (not touching tint/tintStrong) so every other Throw glass surface (contact
  // rows, settings, search) stays lime-tinted regardless.
  tintWaterBlue: "rgba(61,123,255,.16)",
  tintWaterBlueStrong: "rgba(61,123,255,.26)",
  // Full-screen backdrop variant (ThrowGlassBackdrop's `fill` mode, replacing the real map when
  // the battery/data-saving "Show Map Background" setting is off) — day reuses the warm paper
  // background and lime/pale blobs above; night gets its own dark-sky base and cool blue/violet
  // blobs instead, since the warm lime pair would read as daytime regardless of the hour.
  fillBaseDay: throwColor.screenBg,
  fillBaseNight: "#14141C",
  blobNightBlue: "rgba(80,110,255,.4)",
  blobNightViolet: "rgba(160,120,255,.28)"
};
const throwGradient = {
  // The primary "THROW" button — a quiet warm gradient, not a bright brand-colored CTA.
  throwBtn: { colors: ["#D9885F", "#C9714F"], locations: [0, 1] },
  skyDawn: { colors: ["#F6F1E4", "#EDE3CE"], locations: [0, 1] }
};
const throwNightColor = {
  paper: "#3A3A3C",
  ink: "#F2F0EA",
  inkSoft: "rgba(242,240,234,.6)",
  placeholder: "rgba(242,240,234,.4)",
  iconBg: "#1C1C1E",
  iconColor: "#F2F0EA",
  badgeBg: "rgba(0,0,0,.55)",
  // The folded/flying paper plane's own night colour — a distinct, explicitly-specified hex
  // (not the same as `paper` above), per explicit request.
  planePaper: "#3D3D3D"
};
const throwRadius = {
  paper: 18,
  card: 20,
  pill: 999
};
const throwSpace = {
  gutter: 20
};
export {
  throwColor,
  throwFont,
  throwGlass,
  throwGradient,
  throwNightColor,
  throwRadius,
  throwSpace
};
