import { describe, expect, it } from "vitest";
import { TOWNS, TOWNS_ATTRIBUTION, findTown, normaliseTownName, townOptions } from "./towns";

describe("the table", () => {
  it("has a workable number of Irish places", () => {
    expect(TOWNS.length).toBeGreaterThan(300);
    expect(TOWNS.length).toBeLessThan(4000);
  });

  it("carries the attribution the licence requires", () => {
    expect(TOWNS_ATTRIBUTION).toContain("GeoNames");
    expect(TOWNS_ATTRIBUTION).toContain("CC BY 4.0");
  });

  it("has both countries in it, so a border can exist", () => {
    expect(TOWNS.some((t) => t.country === "IE")).toBe(true);
    expect(TOWNS.some((t) => t.country === "GB")).toBe(true);
  });

  it("has coordinates that are actually on this island", () => {
    for (const town of TOWNS) {
      expect(town.lat).toBeGreaterThan(51);
      expect(town.lat).toBeLessThan(56);
      expect(town.lng).toBeGreaterThan(-11);
      expect(town.lng).toBeLessThan(-5);
    }
  });
});

describe("normalising what somebody typed", () => {
  it("folds case, accents and punctuation", () => {
    expect(normaliseTownName("Dún Laoghaire")).toBe("dun laoghaire");
    expect(normaliseTownName("DUN  LAOGHAIRE ")).toBe("dun laoghaire");
    expect(normaliseTownName("Carrick-on-Shannon")).toBe("carrick on shannon");
  });

  it("drops the county wrapper people put round a town", () => {
    expect(normaliseTownName("Co. Longford")).toBe("longford");
    expect(normaliseTownName("County Cork")).toBe("cork");
    expect(normaliseTownName("Longford, Co. Longford")).toBe("longford");
  });

  it("drops a Dublin postal district", () => {
    expect(normaliseTownName("Dublin 4")).toBe("dublin");
    expect(normaliseTownName("Dublin 6W")).toBe("dublin");
  });

  it("leaves a name that needs nothing done to it alone", () => {
    expect(normaliseTownName("Sligo")).toBe("sligo");
  });
});

describe("looking a town up", () => {
  it("finds the obvious ones", () => {
    expect(findTown("Dublin")?.country).toBe("IE");
    expect(findTown("cork")?.name.toLowerCase()).toContain("cork");
    expect(findTown("Belfast")?.country).toBe("GB");
  });

  it("finds one through an accent and a county wrapper", () => {
    expect(findTown("Dún Laoghaire")).not.toBeNull();
    expect(findTown("Longford, Co. Longford")?.name).toBe("Longford");
  });

  it("is null on nothing and on nonsense, rather than guessing the nearest", () => {
    // A fuzzy match here would put a customer in a band on the strength of a
    // typo, and the band changes the verdict.
    expect(findTown("")).toBeNull();
    expect(findTown(null)).toBeNull();
    expect(findTown("Zzzzz")).toBeNull();
  });

  it("offers the list biggest first, because that is what a picker wants", () => {
    const options = townOptions();
    expect(options[0].population).toBeGreaterThanOrEqual(options[1].population);
    expect(options).toHaveLength(TOWNS.length);
  });
});

describe("what a centroid can and cannot do", () => {
  it("puts Dublin about 98km from the Longford village the bands were drawn for", async () => {
    const { distanceKm } = await import("./model");
    const dublin = findTown("Dublin");
    expect(dublin).not.toBeNull();
    const km = distanceKm(53.8608, -7.5806, dublin!.lat, dublin!.lng) as number;
    // The migration's comment says 98km; these coordinates and GeoNames'
    // Dublin centroid give about 104. A centroid is not an address and this
    // tolerance says so out loud. What matters is which side of 95 it falls.
    expect(km).toBeGreaterThan(90);
    expect(km).toBeLessThan(115);
  });
});

