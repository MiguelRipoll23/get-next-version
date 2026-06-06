import * as core from '@actions/core'
import * as semver from 'semver'
import { getLatestTag, setupOctokit } from './services/github.js'
import { applyChannelAndFormat, getNextVersion } from './services/version.js'
import {
  CHANNEL,
  DEFAULT_INITIAL_VERSION,
  NEXT_VERSION
} from './constants/version-constants.js'

export async function run(): Promise<void> {
  try {
    await runAction()
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message)
    } else {
      core.setFailed(String(error))
    }
  }
}

async function runAction(): Promise<void> {
  setupOctokit()

  const latestTag = await getLatestTag()

  if (latestTag === null) {
    const defaultVersion = core.getInput(DEFAULT_INITIAL_VERSION)
    const parsed = semver.parse(defaultVersion)
    if (parsed === null) {
      throw new Error(
        `Invalid default initial version: ${defaultVersion} (must be semver-valid)`
      )
    }
    const channel = core.getInput(CHANNEL, { required: true })
    const version = applyChannelAndFormat(parsed, channel)
    core.info('No releases found, using default initial version: ' + version)
    core.setOutput(NEXT_VERSION, version)
    return
  }

  const latestTagName = latestTag.tag_name
  core.info('Latest tag name: ' + latestTagName)

  const newTagName = await getNextVersion(latestTag)
  core.info('Next version: ' + newTagName)

  core.setOutput(NEXT_VERSION, newTagName)
}
