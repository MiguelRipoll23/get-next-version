import * as core from "@actions/core";
import * as semver from "semver";
import { CHANNEL, INVALID_VERSION_NAME, MAJOR, MAJOR_LABELS, MINOR, MINOR_LABELS, NEW_BUILD_FOR_PRERELEASE, NO_CHANGES_FOUND, NONE, PATCH, PATCH_LABELS, PRERELEASE, STABLE, UNKNOWN, V, } from "../constants/version-constants";
import { getMergedPullRequestsFilteredByCreated } from "./github";
export async function getNewTagName(latestTag) {
    const tagName = latestTag.tag_name;
    const tagCreatedAt = latestTag.created_at;
    const newTagName = await getNewVersionName(tagName, tagCreatedAt);
    // Error if no changes found
    if (newTagName === null) {
        throw new Error(NO_CHANGES_FOUND);
    }
    // Add version prefix
    if (tagName.includes(V)) {
        return V + newTagName;
    }
    return newTagName;
}
async function getNewVersionName(tagName, tagCreatedAt) {
    let kind = UNKNOWN;
    const channel = core.getInput(CHANNEL, { required: true });
    const newBuildForPrerelease = core.getBooleanInput(NEW_BUILD_FOR_PRERELEASE);
    const version = parseVersionByName(tagName);
    const prereleaseId = version.prerelease.length > 0 ? version.prerelease[0] : STABLE;
    const isStableChannel = channel === STABLE;
    const isDifferentChannel = channel !== prereleaseId;
    const isPrereleaseChannel = channel !== STABLE;
    const hasPrereleaseId = version.prerelease.length > 0;
    if (isStableChannel && isDifferentChannel) {
        // beta.1 -> stable
        kind = NONE;
    }
    else if (newBuildForPrerelease && isPrereleaseChannel && hasPrereleaseId) {
        // alpha.1 -> alpha.2 -> beta.1
        kind = PRERELEASE;
    }
    else {
        // 1.0.0 -> 1.0.1 -> 1.1.0 -> 2.0.0
        kind = await getKindByPullRequestsLabels(tagCreatedAt);
    }
    core.debug("Kind: " + kind);
    switch (kind) {
        case NONE:
            return getVersionNameWithoutPrerelease(version);
        case MAJOR:
            return getMajorVersionName(version, channel);
        case MINOR:
            return getMinorVersionName(version, channel);
        case PATCH:
            return getPatchVersionName(version, channel);
        case PRERELEASE:
            return getPrereleaseVersionName(version, channel);
        default:
            return null;
    }
}
function parseVersionByName(tagName) {
    if (tagName.startsWith(V)) {
        tagName = tagName.substring(1);
    }
    const version = semver.parse(tagName);
    if (version === null) {
        throw new Error(INVALID_VERSION_NAME);
    }
    return version;
}
async function getKindByPullRequestsLabels(tagCreatedAt) {
    let kind = UNKNOWN;
    const mergedPullRequests = await getMergedPullRequestsFilteredByCreated(tagCreatedAt);
    const majorLabels = getMajorLabels();
    const minorLabels = getMinorLabels();
    const patchLabels = getPatchLabels();
    for (const mergedPullRequest of mergedPullRequests) {
        const { title, labels } = mergedPullRequest;
        const hasMajorLabel = labels.some((label) => {
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
        const hasMinorLabel = labels.some((label) => {
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
        const hasPatchLabel = labels.some((label) => {
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
function getMajorLabels() {
    const majorLabels = core.getInput(MAJOR_LABELS);
    return majorLabels.split(",");
}
function getMinorLabels() {
    const minorLabels = core.getInput(MINOR_LABELS);
    return minorLabels.split(",");
}
function getPatchLabels() {
    const patchLabels = core.getInput(PATCH_LABELS);
    return patchLabels.split(",");
}
function logPullRequestTitleWithEmoji(emoji, title) {
    core.info(emoji + " " + title);
}
function getVersionNameWithoutPrerelease(version) {
    version.prerelease = [];
    return version.format();
}
function getMajorVersionName(version, channel) {
    version.major++;
    version.minor = 0;
    version.patch = 0;
    if (channel === STABLE) {
        version.prerelease = [];
    }
    else {
        version.prerelease = [channel, 1];
    }
    return version.format();
}
function getMinorVersionName(version, channel) {
    version.minor++;
    version.patch = 0;
    if (channel === STABLE) {
        version.prerelease = [];
    }
    else {
        version.prerelease = [channel, 1];
    }
    return version.format();
}
function getPatchVersionName(version, channel) {
    version.patch++;
    if (channel === STABLE) {
        version.prerelease = [];
    }
    else {
        version.prerelease = [channel, 1];
    }
    return version.format();
}
function getPrereleaseVersionName(version, channel) {
    const [prereleaseId, prereleaseCount] = version.prerelease;
    if (prereleaseId === channel) {
        version.prerelease = [channel, prereleaseCount + 1];
    }
    else {
        version.prerelease = [channel, 1];
    }
    return version.format();
}
