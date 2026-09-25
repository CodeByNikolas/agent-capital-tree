import assert from "node:assert/strict";
import { mobileTreeOrder } from "../apps/web/src/lib/mobile-tree-order.ts";

const nodes = [
  { id: "5", parentId: null },
  { id: "6", parentId: "5" },
  { id: "8", parentId: "5" },
  { id: "7", parentId: "6" },
];

assert.deepEqual(mobileTreeOrder(nodes).map((node) => node.id), ["5", "6", "7", "8"]);
console.log("Mobile tree keeps descendants beside their parent");
