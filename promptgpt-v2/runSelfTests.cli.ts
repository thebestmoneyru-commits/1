import { runV2SelfTestSuite } from "./runSelfTests";

try {
  const result = await runV2SelfTestSuite();
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error("PROMPTGPT v2 regression suite failed:", error);
  throw error;
}
