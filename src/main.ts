import * as core from '@actions/core'
import { getLatestTag, setupOctokit } from './services/github.js'
import { getNextVersion } from './services/version.js'
import { NEXT_VERSION } from './constants/version-constants.js'

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
  const latestTagName = latestTag.tag_name
  core.info('Latest tag name: ' + latestTagName)

  const newTagName = await getNextVersion(latestTag)
  core.info('Next version: ' + newTagName)

  core.setOutput(NEXT_VERSION, newTagName)
}
