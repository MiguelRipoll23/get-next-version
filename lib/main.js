import * as core from '@actions/core'
import { getLatestTag, setupOctokit } from './utils/github'
import { getNewTagName } from './utils/version'
import { TAG_NAME } from './constants/version-constants'
async function run() {
  setupOctokit()
  const latestTag = await getLatestTag()
  const latestTagName = latestTag.tag_name
  core.info('Latest tag name: ' + latestTagName)
  const newTagName = await getNewTagName(latestTag)
  core.info('New tag name: ' + newTagName)
  core.setOutput(TAG_NAME, newTagName)
}
try {
  run()
} catch (error) {
  if (error instanceof Error) {
    core.setFailed(error.message)
  }
}
