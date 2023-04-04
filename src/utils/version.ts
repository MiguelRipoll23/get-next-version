import * as core from "@actions/core";
import * as semver from "semver";
import {
  CHANNEL,
  INVALID_VERSION_NAME,
  MAJOR,
  MAJOR_LABELS,
  MINOR,
  MINOR_LABELS,
  NEW_BUILD_FOR_PRERELEASE,
  NO_CHANGES_FOUND,
  PATCH,
  PATCH_LABELS,
  PRERELEASE,
  STABLE,
  UNKNOWN,
  V,
} from "../constants/version-constants";
import { PullRequest } from "../interfaces/pull-request-interface";
import { Label } from "../interfaces/label-interface";
import { getMergedPullRequestsFilteredByCreated } from "./github";
import { Tag } from "../interfaces/tag-interface";

export async function getNewTagName(latestTag: Tag): Promise<string> {
  const tagName = latestTag.tag_name;
  const tagCreatedAt = latestTag.created_at;

  const newVersionName = await getNewVersionName(tagName, tagCreatedAt);

  if (newVersionName === null) {
    throw new Error(NO_CHANGES_FOUND);
  }

  if (tagName.includes(V)) {
    return V + newVersionName;
  }

  return newVersionName;
}

async function getNewVersionName(
  tagName: string,
  tagCreatedAt: string
): Promise<string | null> {
  const newBuildForPrerelease = core.getBooleanInput(NEW_BUILD_FOR_PRERELEASE);

  let kind: "unknown" | "major" | "minor" | "patch" | "prerelease" = UNKNOWN;

  if (hasPrerelease(tagName) && newBuildForPrerelease) {
    kind = PRERELEASE;
  } else {
    kind = await getKindByPullRequestsLabels(tagCreatedAt);
  }

  core.debug("Kind: " + kind);

  const channel = core.getInput(CHANNEL, { required: true });

  switch (kind) {
    case MAJOR:
      return getMajorVersionName(tagName, channel);

    case MINOR:
      return getMinorVersionName(tagName, channel);

    case PATCH:
      return getPatchVersionName(tagName, channel);

    case PRERELEASE:
      return getPrereleaseVersionName(tagName, channel);

    default:
      return null;
  }
}

function hasPrerelease(tagName: string): boolean {
  if (tagName.startsWith(V)) {
    tagName = tagName.substring(1);
  }

  const version = semver.parse(tagName);

  if (version === null) {
    throw new Error(INVALID_VERSION_NAME);
  }

  if (version.prerelease.length === 0) {
    return false;
  }

  return true;
}

async function getKindByPullRequestsLabels(tagCreatedAt: string) {
  let kind: "major" | "minor" | "patch" | "prerelease" | "unknown" = UNKNOWN;

  const mergedPullRequests: PullRequest[] =
    await getMergedPullRequestsFilteredByCreated(tagCreatedAt);

  const majorLabels = getMajorLabels();
  const minorLabels = getMinorLabels();
  const patchLabels = getPatchLabels();

  for (const mergedPullRequest of mergedPullRequests) {
    const { title, labels } = mergedPullRequest;

    const hasMajorLabel = labels.some((label: Label) => {
      if (typeof label.name === "string") {
        return majorLabels.includes(label.name);
      }
      return false;
    });

    if (hasMajorLabel) {
      kind = MAJOR;
      logPullRequestTitleWithEmoji("🚨", title);
      break;
    }

    const hasMinorLabel = labels.some((label: Label) => {
      if (typeof label.name === "string") {
        return minorLabels.includes(label.name);
      }

      return false;
    });

    if (hasMinorLabel) {
      kind = kind === UNKNOWN || kind === PATCH ? MINOR : kind;
      logPullRequestTitleWithEmoji("✨", title);
      continue;
    }

    const hasPatchLabel = labels.some((label: Label) => {
      if (typeof label.name === "string") {
        return patchLabels.includes(label.name);
      }

      return false;
    });

    if (hasPatchLabel) {
      kind = kind === UNKNOWN ? PATCH : kind;
      logPullRequestTitleWithEmoji("🛠️", title);
      continue;
    }

    logPullRequestTitleWithEmoji("🚫", title);
  }

  return kind;
}

function getMajorLabels(): string[] {
  const majorLabels = core.getInput(MAJOR_LABELS);

  return majorLabels.split(",");
}

function getMinorLabels(): string[] {
  const minorLabels = core.getInput(MINOR_LABELS);

  return minorLabels.split(",");
}

function getPatchLabels(): string[] {
  const patchLabels = core.getInput(PATCH_LABELS);

  return patchLabels.split(",");
}

function logPullRequestTitleWithEmoji(emoji: string, title: string): void {
  core.info(emoji + " " + title);
}

function getMajorVersionName(tagName: string, channel = ""): string | null {
  const version = semver.parse(tagName);

  if (version === null) {
    return null;
  }

  version.major++;
  version.minor = 0;
  version.patch = 0;

  if (channel === STABLE) {
    version.prerelease = [];
  } else {
    version.prerelease = [channel, 1];
  }

  return version.format();
}

function getMinorVersionName(tagName: string, channel = ""): string | null {
  const version = semver.parse(tagName);

  if (version === null) {
    return null;
  }

  version.minor++;
  version.patch = 0;

  if (channel === STABLE) {
    version.prerelease = [];
  } else {
    version.prerelease = [channel, 1];
  }

  return version.format();
}

function getPatchVersionName(tagName: string, channel = ""): string | null {
  const version = semver.parse(tagName);

  if (version === null) {
    return null;
  }

  version.patch++;

  if (channel === STABLE) {
    version.prerelease = [];
  } else {
    version.prerelease = [channel, 1];
  }

  return version.format();
}

function getPrereleaseVersionName(
  tagName: string,
  channel = ""
): string | null {
  const version = semver.parse(tagName);

  if (version === null) {
    return null;
  }

  const [prereleaseId, prereleaseCount] = version.prerelease as [
    string,
    number
  ];

  if (prereleaseId === channel) {
    version.prerelease = [channel, prereleaseCount + 1];
  } else {
    version.prerelease = [channel, 1];
  }

  return version.format();
}
