import assert from "node:assert/strict";
import { partCount } from "./media_upload.js";

assert.equal(partCount(0, 5), 1);
assert.equal(partCount(11, 5), 3);
console.log("partCount keeps an empty file as one part and rounds up partial parts");
