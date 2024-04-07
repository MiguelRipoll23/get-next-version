import * as core from '@actions/core'
import * as github from '@actions/github'
import { GitHub } from '@actions/github/lib/utils'
import {
  GITHUB_TOKEN,
  NO_RELEASES_FOUND,
  NOT_FOUND,
  OCTOKIT_NOT_INITIALIZED,
  PULL_REQUESTS_BASE_BRANCH,
  PULL_REQUESTS_SEARCH_FAILED,
  REFS_HEADS,
  RELEASES_LISTING_FAILED
} from '../constants/github-constants'
import { Tag } from '../interfaces/tag-interface'
import { PullRequest } from '../interfaces/pull-request-interface'

let octokit: InstanceType<typeof GitHub> | null = null

export async function setupOctokit(): Promise<void> {
  const token = core.getInput(GITHUB_TOKEN, { required: true })
  octokit = github.getOctokit(token)
}

export async function getLatestTag(): Promise<Tag> {
  if (octokit === null) throw new Error(OCTOKIT_NOT_INITIALIZED)

  const { context } = github
  const { repo } = context

  let response = null

  try {
    response = await octokit.rest.repos.listReleases({
      ...repo,
      per_page: 1
    })
  } catch (error) {
    if (error instanceof Error) {
      const { message } = error

      if (message.includes(NOT_FOUND)) {
        throw new Error(NO_RELEASES_FOUND)
      } else {
        throw new Error(RELEASES_LISTING_FAILED + ' (' + message + ')')
      }
    }

    throw error
  }

  const { data } = response

  if (data.length === 0) {
    throw new Error(NO_RELEASES_FOUND)
  }

  return data[0]
}

export async function getMergedPullRequestsFilteredByCreated(
  createdAt: string
): Promise<PullRequest[]> {
  if (octokit === null) throw new Error(OCTOKIT_NOT_INITIALIZED)

  const { context } = github
  const { ref } = context
  const { owner, repo } = context.repo

  let base = core.getInput(PULL_REQUESTS_BASE_BRANCH)

  if (base.length === 0) {
    base = ref.replace(REFS_HEADS, '')
  }

  const query = `repo:${owner}/${repo} is:pr is:merged base:${base} created:>=${createdAt}`
  core.debug('Query: ' + query)

  let response = null

  try {
    response = await octokit.paginate(
      octokit.rest.search.issuesAndPullRequests,
      {
        q: query
      }
    )
  } catch (error) {
    if (error instanceof Error) {
      const { message } = error
      throw new Error(PULL_REQUESTS_SEARCH_FAILED + ' (' + message + ')')
    }

    throw error
  }

  core.info('Merged pull requests (' + response.length + ')')

  return response
}
