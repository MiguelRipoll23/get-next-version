import * as core from '@actions/core'
import { getLatestTag, setupOctokit } from './services/github'
import { getNextVersion } from './services/version'
import { NEXT_VERSION } from './constants/version-constants'

export async function run(): Promise<void> {
  try {
    runAction()
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message)
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
