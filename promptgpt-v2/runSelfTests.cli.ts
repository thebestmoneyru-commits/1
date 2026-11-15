import { runV2SelfTestSuite } from "./runSelfTests";

try {
  const result = await runV2SelfTestSuite();
  console.log(JSON.stringify(result, null, 2));
  console.log(
    `PROMPTGPT v2 self-tests summary: total=${result.totalGroups}, PASS=${result.passedGroups}, FAIL=${result.failedGroups}, checksPassed=${result.passed}`,
  );
  if (result.failedGroups > 0) {
    for (const failure of result.failures) {
      console.error(`FAIL [${failure.group}]: ${failure.reason}`);
    }
    process.exitCode = 1;
  }
} catch (error) {
  console.error("PROMPTGPT v2 regression suite failed:", error);
  process.exitCode = 1;
}
