import { describe, expect, it } from "vitest";
import {
  DEFAULT_MATCH_OPTIONS,
  classify,
  isConfidentLevel,
  isSubsequence,
  matchAll,
  normalize,
  resolveConflict,
} from "../src/core/MatchEngine";
import type { MatchHit } from "../src/types";

const options = DEFAULT_MATCH_OPTIONS;

describe("normalize", () => {
  it("folds full-width characters to half-width", () => {
    expect(normalize("ＡＢＣ１２３", options)).toBe("abc123");
  });

  it("lowercases when asked", () => {
    expect(normalize("Daily Note", options)).toBe("dailynote");
    expect(normalize("Daily Note", { ...options, ignoreCase: false })).toBe("DailyNote");
  });

  it("drops separators so hyphenated titles still match", () => {
    expect(normalize("my-note_2026", options)).toBe("mynote2026");
  });

  it("drops exactly the separators the setting promises", () => {
    // The setting description names the characters. This pins the list, so
    // the wording cannot drift away from what the code strips.
    expect(normalize("a_b-c.d·e f", options)).toBe("abcdef");
    for (const separator of [" ", "-", "_", "·", "."]) {
      expect(normalize(`a${separator}b`, options)).toBe("ab");
    }
    // And nothing else: a slash or a colon is part of the name.
    expect(normalize("a/b", options)).toBe("a/b");
    expect(normalize("a:b", options)).toBe("a:b");
  });

  it("keeps separators when the option is off", () => {
    expect(normalize("my note", { ...options, ignoreSeparators: false })).toBe("my note");
    expect(normalize("  my note  ", { ...options, ignoreSeparators: false })).toBe("my note");
  });

  it("leaves CJK characters alone", () => {
    expect(normalize("会议纪要", options)).toBe("会议纪要");
  });

  it("folds the ideographic space", () => {
    expect(normalize("会议　纪要", options)).toBe("会议纪要");
  });
});

describe("classify", () => {
  it("marks an identical string as exact", () => {
    const hit = classify("Daily Note", "Daily Note", "dailynote", options);
    expect(hit?.level).toBe("exact");
  });

  it("treats case-only differences as normalized", () => {
    const hit = classify("Daily Note", "daily note", "dailynote", options);
    expect(hit?.level).toBe("normalized");
  });

  it("matches across full-width punctuation", () => {
    const hit = classify("笔记：项目", "笔记:项目", normalize("笔记:项目", options), options);
    expect(hit?.level).toBe("normalized");
  });

  it("prefers a prefix over a mid-string hit", () => {
    expect(classify("Daily Note", "Daily", "daily", options)?.level).toBe("prefix");
    expect(classify("Daily Note", "Note", "note", options)?.level).toBe("contains");
  });

  it("falls back to fuzzy only for ordered subsequences", () => {
    expect(classify("Daily Note", "dnt", "dnt", options)?.level).toBe("fuzzy");
    expect(classify("Daily Note", "xyz", "xyz", options)).toBeNull();
  });

  it("returns null for an empty query", () => {
    expect(classify("Daily Note", "", "", options)).toBeNull();
  });
});

describe("isSubsequence", () => {
  it("respects order", () => {
    expect(isSubsequence("abc", "a1b2c3")).toBe(true);
    expect(isSubsequence("cba", "abc")).toBe(false);
  });

  it("handles empty needles", () => {
    expect(isSubsequence("", "anything")).toBe(true);
    expect(isSubsequence("a", "")).toBe(false);
  });
});

describe("matchAll", () => {
  const titles = ["Daily Note", "Daily Note Template", "Meeting Notes", "会议纪要", "会议纪要 2026"];

  it("sorts exact before prefix before contains", () => {
    const hits = matchAll(titles, "Daily Note", options);
    expect(hits.map((hit) => hit.level)).toEqual(["exact", "prefix"]);
    expect(hits[0]?.index).toBe(0);
  });

  it("keeps original indices intact", () => {
    const hits = matchAll(titles, "Meeting Notes", options);
    expect(hits[0]?.index).toBe(2);
  });

  it("matches Chinese titles without word separators", () => {
    const hits = matchAll(titles, "会议纪要", options);
    expect(hits[0]?.level).toBe("exact");
    expect(hits[0]?.index).toBe(3);
    expect(hits[1]?.level).toBe("prefix");
    expect(hits[1]?.index).toBe(4);
  });

  it("honours the minimum level", () => {
    const hits = matchAll(titles, "Daily", { ...options, minLevel: "exact" });
    expect(hits).toHaveLength(0);
  });

  it("returns nothing for an empty or whitespace query", () => {
    expect(matchAll(titles, "", options)).toHaveLength(0);
    expect(matchAll(titles, "   ", options)).toHaveLength(0);
  });

  it("is stable for identical scores", () => {
    const hits = matchAll(["aaa", "aaa"], "aaa", options);
    expect(hits.map((hit) => hit.index)).toEqual([0, 1]);
  });

  it("ranks a match that starts earlier above one that starts later", () => {
    // Both are contains hits, so the difference is the position penalty.
    // This test exists to pin the ranking down: a weight that changed
    // silently would move the highlight to a different note, and nothing
    // else in the suite would notice.
    const hits = matchAll(["aaaNote", "bNote"], "Note", { ...options, minLevel: "contains" });

    expect(hits.map((hit) => hit.text)).toEqual(["bNote", "aaaNote"]);
    expect(resolveConflict(hits, "first")?.text).toBe("bNote");
    expect(resolveConflict(hits, "last")?.text).toBe("aaaNote");
  });

  it("ranks a shorter title above a longer one at the same position", () => {
    const hits = matchAll(["Note", "Note but much longer"], "Note", {
      ...options,
      minLevel: "contains",
    });

    expect(hits.map((hit) => hit.text)).toEqual(["Note", "Note but much longer"]);
  });

  it("lets a near miss beat a far one, and a long title lose to a short one", () => {
    // "xNote" is one character away, "prefix Note long text" is far away but
    // the title itself is short enough to stay competitive. Which of the two
    // wins is decided by the position penalty against the length penalty.
    //
    // The score gap is asserted as well as the order, because the order
    // alone survives a weight change: the two penalties would have to swap
    // places for the ranking to flip, and the gap is what says how close it
    // is.
    const hits = matchAll(["prefix Note long text", "xNote"], "Note", {
      ...options,
      minLevel: "contains",
    });

    expect(hits.map((hit) => hit.text)).toEqual(["xNote", "prefix Note long text"]);
    expect(hits[0]?.score).toBe(695);
    expect(hits[1]?.score).toBe(662);
  });

  it("prefers a match at the front of a long title over one in the middle", () => {
    // The position penalty has to outvote the length penalty: a query at the
    // start of a long title is the title itself with a suffix, while one in
    // the middle is somewhere inside a phrase. If the weights were swapped,
    // the second would win — and that would be backwards.
    const hits = matchAll(["meeting notes for the team"], "meeting", {
      ...options,
      minLevel: "contains",
    });

    expect(hits[0]?.text).toBe("meeting notes for the team");

    // The same query inside the title loses to one at the front.
    const mixed = matchAll(["a very long note about meetings", "meeting"], "meeting", {
      ...options,
      minLevel: "contains",
    });
    expect(mixed[0]?.text).toBe("meeting");
  });

  it("keeps the ranking when the weights are retuned for a good reason", () => {
    // A test that asserted the score would break on any retune. Asserting
    // the outcome is what makes the weights meaningful: a retune that
    // inverts the ranking fails here.
    const hits = matchAll(["prefix Note long text", "xNote"], "Note", {
      ...options,
      minLevel: "contains",
    });

    expect(resolveConflict(hits, "first")?.text).toBe("xNote");
    expect(resolveConflict(hits, "last")?.text).toBe("prefix Note long text");
  });
});

describe("resolveConflict", () => {
  const hit = (index: number, level: MatchHit["level"], score = 0): MatchHit => ({
    index,
    level,
    score,
    text: `t${index}`,
  });

  it("refuses to guess when two candidates tie at the best level", () => {
    const hits = [hit(0, "exact"), hit(1, "exact")];
    expect(resolveConflict(hits, "unique")).toBeNull();
  });

  it("accepts a single best hit", () => {
    const hits = [hit(0, "exact"), hit(1, "prefix")];
    expect(resolveConflict(hits, "unique")?.index).toBe(0);
  });

  it("takes the first or last of the tie", () => {
    const hits = [hit(0, "exact"), hit(3, "exact")];
    expect(resolveConflict(hits, "first")?.index).toBe(0);
    expect(resolveConflict(hits, "last")?.index).toBe(3);
  });

  it("never acts under the none policy", () => {
    expect(resolveConflict([hit(0, "exact")], "none")).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(resolveConflict([], "first")).toBeNull();
  });
});

describe("isConfidentLevel", () => {
  it("only trusts exact and normalized hits", () => {
    expect(isConfidentLevel("exact")).toBe(true);
    expect(isConfidentLevel("normalized")).toBe(true);
    expect(isConfidentLevel("prefix")).toBe(false);
    expect(isConfidentLevel("contains")).toBe(false);
    expect(isConfidentLevel("fuzzy")).toBe(false);
  });
});
