/**
 * Plain-language explanations that sit next to every piece of data in the UI. The rule from
 * the redesign: our job isn't only to show the data, it's to explain it so a non-scientist
 * gets what it is, why it matters, and what it does (and doesn't) tell us. All of this is
 * general, well-established oceanography — the specific numbers always come from the real
 * rows and are interpolated in by the component, never invented here.
 */

export const ARGO_FLOAT_WHAT =
  "An ARGO float is a robotic buoy about the size of a person. It drifts freely with the " +
  "currents, and roughly every 10 days it sinks to around 2 km, then rises back to the surface " +
  "measuring temperature and saltiness the whole way up. At the surface it phones the numbers " +
  "home via satellite, then dives again. Nobody steers it.";

export const ARGO_FLOAT_WHY =
  "About 4,000 of them are out there right now. Together they are the ocean's thermometer: " +
  "over 90% of the extra heat trapped by climate change ends up in the sea, and floats are how " +
  "we actually measure it below the surface, where satellites can't see.";

export const PROFILE_WHAT =
  "One dive-and-rise is called a profile: a column of readings from the deep to the surface. " +
  "More profiles means a longer, more trustworthy record for this spot of ocean.";

export function depthMeaning(maxDepth: number | null): string {
  if (maxDepth === null) return "Depth range not reported for this float.";
  if (maxDepth >= 1800)
    return (
      "This one goes the full 2,000 m. Below about 1,000 m the water is cold, dark and changes " +
      "slowly — reaching it lets scientists track the deep ocean's steady, long-term warming."
    );
  if (maxDepth >= 900)
    return (
      "It dives to around 1 km — deep enough to pass through the warm surface layer and the " +
      "thermocline, the zone where temperature drops fastest."
    );
  return (
    "A shallow diver: it mostly samples the warm, sunlit upper ocean where weather, seasons " +
    "and heatwaves show up first."
  );
}

export const THERMOCLINE_WHAT =
  "The thermocline is the depth band where temperature drops fastest — the boundary between " +
  "the sun-warmed layer near the surface and the cold, dense deep ocean below. Drag along the " +
  "line to read the real temperature at any depth.";

export const THERMOCLINE_WHY =
  "It matters because it's a barrier: nutrients, oxygen and heat don't mix easily across it. " +
  "Its depth shifts with the seasons and with events like El Nino, and tracking those shifts is " +
  "one of the clearest signs of how a warming ocean is changing.";

export function thermoclineQualityNote(quality: "clear" | "weak" | "insufficient_data"): string {
  if (quality === "weak") {
    return "The signal here is weak — this profile reads close to isothermal (well-mixed), so the shaded band is only a rough estimate.";
  }
  return "A clear, well-defined thermocline — the shaded band is where the temperature drop is steepest.";
}

export const DATA_MODE_MEANING: Record<string, string> = {
  R: "Real-time: sent straight from the float with automatic checks only. Good for spotting things quickly; small errors possible.",
  D: "Delayed-mode: a scientist has reviewed and corrected these readings. The most trustworthy kind.",
  A: "Adjusted: automatically corrected with known calibration offsets.",
};

export interface EventExplainer {
  title: string;
  what: string;
  why: string;
  causes: string;
}

export const EVENT_EXPLAINERS: Record<string, EventExplainer> = {
  surface_warming: {
    title: "Surface warming",
    what: "The top layer of the sea here was warmer than is normal for this place and time of year.",
    why: "Warm surface water is what fish, corals and plankton live in. A stretch of unusually warm water — a marine heatwave — can shift fish stocks, bleach reefs and feed stronger storms.",
    causes: "Usual suspects: calm sunny weather with little wind to mix the heat down, warm water carried in by a current, or a broader climate pattern like El Niño.",
  },
  subsurface_warming: {
    title: "Subsurface warming",
    what: "Water below the surface — tens to hundreds of metres down — was warmer than the seasonal normal, even if the surface looked ordinary.",
    why: "Heat hiding below the surface is invisible to satellites and can persist for months. It's often the deeper 'reservoir' of a marine heatwave, and where long-term ocean warming really accumulates.",
    causes: "Often a warm current pushing water down or sideways (an eddy), a deepening of the warm upper layer, or heat mixed down from an earlier surface warm spell.",
  },
  cooling_event: {
    title: "Cooling",
    what: "Readings here were colder than the seasonal normal.",
    why: "Cold pulses matter too: they can mean nutrient-rich deep water rising up (great for fisheries) or a shift in a major current.",
    causes: "Typically upwelling — wind pushing surface water away so deep, cold water rises to replace it — or cold water carried in from higher latitudes.",
  },
  salinity_anomaly: {
    title: "Salinity shift",
    what: "The saltiness of the water was unusual for this place and season.",
    why: "Salt and heat together decide how dense water is, and density drives the ocean's slow global circulation. Freshening at high latitudes, for example, is watched closely as a climate signal.",
    causes: "Heavy rain or river floods (fresher), strong evaporation (saltier), melting ice, or a different water mass moving in.",
  },
  mixed_anomaly: {
    title: "Mixed signal",
    what: "Both temperature and saltiness were off their seasonal normals at the same time.",
    why: "When both change together it usually means a whole different body of water has moved in, rather than just heating or rain.",
    causes: "A current or eddy carrying water from somewhere else, or the boundary between two water masses shifting.",
  },
};

export const BASELINE_WHAT =
  "\"Normal\" here means the World Ocean Atlas 2023 (WOA23): decades of measurements averaged " +
  "for every spot, depth and season of the ocean. An anomaly is simply the real reading minus " +
  "that long-term average for the same place and season.";

export const HONESTY_LINE =
  "This is a detected pattern in real measurements, not a diagnosis. The data shows what " +
  "happened; the cause is the most likely explanation, not a certainty.";

export const COMPARE_HOW_TO_READ =
  "Bars grow outward from the middle, so the longer side is the bigger number. Floats and " +
  "profiles tell you how well-observed each region is; surface temperature and salinity tell " +
  "you what kind of water it is.";

export const COMPARE_WHY_DIFFERENT =
  "Regions differ mostly by latitude (closer to the equator is warmer), by the big currents " +
  "that feed them, and by how much rain and river water they get (fresher) versus evaporation " +
  "(saltier). Enclosed seas like the Mediterranean run saltier than the open ocean.";
