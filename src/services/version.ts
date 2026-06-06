import * as core from '@actions/core'
import * as semver from 'semver'
import {
  CHANNEL,
  INVALID_VERSION_NAME,
  MAJOR,
  MAJOR_LABELS,
  MINOR,
  MINOR_LABELS,
  NEW_BUILD_FOR_PRERELEASE,
  NO_CHANGES_FOUND,
  NO_MATCHING_LABELS,
  NO_MERGED_PRS,
  NONE,
  PATCH,
  PATCH_LABELS,
  PRERELEASE,
  STABLE,
  UNKNOWN,
  V
} from '../constants/version-constants.js'
import { PullRequest } from '../interfaces/pull-request-interface.js'
import { Label } from '../interfaces/label-interface.js'
import { getMergedPullRequestsFilteredByCreated } from './github.js'
import { Tag } from '../interfaces/tag-interface.js'
import { SemVer } from 'semver'

export async function getNextVersion(latestTag: Tag): Promise<string> {
  const tagName = latestTag.tag_name
  const tagCreatedAt = latestTag.created_at

  const nextVersion = await getNextVersionUsingLatestTag(tagName, tagCreatedAt)

  if (nextVersion === null) {
    throw new Error(NO_CHANGES_FOUND)
  }

  if (tagName.includes(V)) {
    return V + nextVersion
  }

  return nextVersion
}

async function getNextVersionUsingLatestTag(
  tagName: string,
  tagCreatedAt: string
): Promise<string | null> {
  let kind: 'unknown' | 'none' | 'major' | 'minor' | 'patch' | 'prerelease'

  const channel = core.getInput(CHANNEL, { required: true })
  const newBuildForPrerelease = core.getBooleanInput(NEW_BUILD_FOR_PRERELEASE)

  const version = parseVersionByName(tagName)
  const prereleaseId =
    version.prerelease.length > 0 ? version.prerelease[0] : STABLE

  const isStableChannel = channel === STABLE
  const isDifferentChannel = channel !== prereleaseId
  const hasPrereleaseId = version.prerelease.length > 0

  if (isStableChannel && isDifferentChannel) {
    // beta.1 -> stable
    kind = NONE
  } else if (newBuildForPrerelease && !isStableChannel && hasPrereleaseId) {
    // alpha.1 -> alpha.2 -> beta.1
    kind = PRERELEASE
  } else {
    // 1.0.0 -> 1.0.1 -> 1.1.0 -> 2.0.0
    kind = await getKindByPullRequestsLabels(tagCreatedAt)
  }

  core.debug('Kind: ' + kind)

  switch (kind) {
    case NONE:
      return getVersionNameWithoutPrerelease(version)

    case MAJOR:
      return getMajorVersionName(version, channel)

    case MINOR:
      return getMinorVersionName(version, channel)

    case PATCH:
      return getPatchVersionName(version, channel)

    case PRERELEASE:
      return getPrereleaseVersionName(version, channel)

    default:
      return null
  }
}

function parseVersionByName(tagName: string): SemVer {
  if (tagName.startsWith(V)) {
    tagName = tagName.substring(1)
  }

  const version = semver.parse(tagName)

  if (version === null) {
    throw new Error(INVALID_VERSION_NAME)
  }

  return version
}

async function getKindByPullRequestsLabels(
  tagCreatedAt: string
): Promise<'major' | 'minor' | 'patch' | 'unknown'> {
  let kind: 'major' | 'minor' | 'patch' | 'unknown' = UNKNOWN

  const majorLabels = getLabels(MAJOR_LABELS)
  const minorLabels = getLabels(MINOR_LABELS)
  const patchLabels = getLabels(PATCH_LABELS)

  const mergedPullRequests: PullRequest[] =
    await getMergedPullRequestsFilteredByCreated(tagCreatedAt, majorLabels)

  if (mergedPullRequests.length === 0) {
    throw new Error(NO_MERGED_PRS)
  }

  for (const mergedPullRequest of mergedPullRequests) {
    const { title, labels } = mergedPullRequest

    if (hasLabel(labels, majorLabels)) {
      kind = MAJOR
      logPullRequestTitleWithEmoji('🚨', title)
      break
    }

    if (hasLabel(labels, minorLabels)) {
      if (kind !== MINOR) kind = MINOR
      logPullRequestTitleWithEmoji('✨', title)
      continue
    }

    if (hasLabel(labels, patchLabels)) {
      if (kind === UNKNOWN) kind = PATCH
      logPullRequestTitleWithEmoji('🛠️', title)
      continue
    }

    logPullRequestTitleWithEmoji('🚫', title)
  }

  if (kind === UNKNOWN) {
    throw new Error(
      `${NO_MATCHING_LABELS}\nConfigured major labels: ${majorLabels.join(', ')}\nConfigured minor labels: ${minorLabels.join(', ')}\nConfigured patch labels: ${patchLabels.join(', ')}`
    )
  }

  return kind
}

function getLabels(inputName: string): string[] {
  return core
    .getInput(inputName)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

function hasLabel(labels: Label[], allowed: string[]): boolean {
  return labels.some(
    (label: Label) =>
      typeof label.name === 'string' && allowed.includes(label.name)
  )
}

function logPullRequestTitleWithEmoji(emoji: string, title: string): void {
  core.info(emoji + ' ' + title)
}

function getVersionNameWithoutPrerelease(version: SemVer): string {
  version.prerelease = []

  return version.format()
}

export function applyChannelAndFormat(
  version: SemVer,
  channel: string
): string {
  if (channel === STABLE) {
    version.prerelease = []
  } else {
    version.prerelease = [channel, 1]
  }

  return version.format()
}

function getMajorVersionName(version: SemVer, channel: string): string {
  version.major++
  version.minor = 0
  version.patch = 0

  return applyChannelAndFormat(version, channel)
}

function getMinorVersionName(version: SemVer, channel: string): string {
  version.minor++
  version.patch = 0

  return applyChannelAndFormat(version, channel)
}

function getPatchVersionName(version: SemVer, channel: string): string {
  version.patch++

  return applyChannelAndFormat(version, channel)
}

function getPrereleaseVersionName(version: SemVer, channel: string): string {
  const prereleaseId = version.prerelease[0]
  const prereleaseCount =
    typeof version.prerelease[1] === 'number' ? version.prerelease[1] : 0

  if (typeof prereleaseId === 'string' && prereleaseId === channel) {
    version.prerelease = [channel, prereleaseCount + 1]
  } else {
    version.prerelease = [channel, 1]
  }

  return version.format()
}
