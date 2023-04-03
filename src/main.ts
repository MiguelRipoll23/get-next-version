import * as core from "@actions/core";
import { getLatestTagName, setupOctokit } from "./utils/github";
import { getNewTagName } from "./utils/version";
import { TAG_NAME } from "./constants/version-constants";

async function run() {
  setupOctokit();

  const tagName = await getLatestTagName();
  core.info("Latest tag name: " + tagName);

  const newTagName = await getNewTagName(tagName);
  core.info("New tag name: " + newTagName);

  core.setOutput(TAG_NAME, newTagName);
}

try {
  run();
} catch (error) {
  if (error instanceof Error) {
    core.setFailed(error.message);
  }
}
