const adjectives = [
  "amber", "arctic", "bold", "bright", "calm", "cedar", "clear", "coral",
  "cosmic", "crystal", "dawn", "deep", "eager", "early", "ember", "fair",
  "fern", "fleet", "forest", "fresh", "gentle", "golden", "grand", "green",
  "happy", "hidden", "indigo", "jade", "keen", "kind", "lively", "lunar",
  "mellow", "merry", "misty", "noble", "ocean", "olive", "opal", "patient",
  "pearl", "quiet", "rapid", "river", "rosy", "royal", "ruby", "silver",
  "solar", "steady", "still", "sunny", "swift", "teal", "tidal", "tiny",
  "vivid", "warm", "wild", "wise", "witty", "woven", "young", "zen",
] as const;
const nouns = [
  "acorn", "badger", "beacon", "birch", "bison", "bloom", "brook", "canyon",
  "cedar", "cliff", "cloud", "comet", "crane", "creek", "delta", "dove",
  "dune", "eagle", "elm", "falcon", "finch", "fjord", "fox", "glade",
  "grove", "harbor", "hawk", "heron", "hill", "island", "jaguar", "lake",
  "lark", "leaf", "lynx", "maple", "meadow", "moon", "moss", "oak",
  "orbit", "otter", "owl", "panda", "peak", "pine", "puma", "quartz",
  "raven", "reef", "ridge", "robin", "shore", "sparrow", "spruce", "star",
  "stone", "summit", "tiger", "trail", "valley", "wave", "willow", "wren",
] as const;

/** Two-word suggestions; the contract still enforces name availability. */
export function generateRootLabel(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(2));
  return `${adjectives[bytes[0] & 63]}-${nouns[bytes[1] & 63]}`;
}
