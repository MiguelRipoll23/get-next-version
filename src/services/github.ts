import * as core from '@actions/core'
import * as github from '@actions/github'
import { GitHub } from '@actions/github/lib/utils'
import {
  GITHUB_TOKEN,
  NOT_FOUND,
  OCTOKIT_NOT_INITIALIZED,
  PULL_REQUESTS_BASE_BRANCH,
  PULL_REQUESTS_SEARCH_FAILED,
  REFS_HEADS,
  RELEASES_LISTING_FAILED
} from '../constants/github-constants.js'
import { Tag } from '../interfaces/tag-interface.js'
import { PullRequest } from '../interfaces/pull-request-interface.js'

let octokit: InstanceType<typeof GitHub> | null = null

export function setupOctokit(): void {
  const token = core.getInput(GITHUB_TOKEN, { required: true })
  octokit = github.getOctokit(token)
}

export async function getLatestTag(): Promise<Tag | null> {
  if (octokit === null) throw new Error(OCTOKIT_NOT_INITIALIZED)

  const { context } = github
  const { repo } = context

  try {
    const response = await octokit.rest.repos.listReleases({
      ...repo,
      per_page: 1
    })

    if (response.data.length === 0) {
      return null
    }

    return response.data[0]
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes(NOT_FOUND)) {
        return null
      }
      throw new Error(RELEASES_LISTING_FAILED + ' (' + error.message + ')', {
        cause: error
      })
    }
    throw error
  }
}

export async function getMergedPullRequestsFilteredByCreated(
  createdAt: string,
  stopOnLabels: string[] = []
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

  try {
    const response = (await octokit.paginate(
      octokit.rest.search.issuesAndPullRequests,
      { q: query, per_page: 100 },
      (pageResponse, done) => {
        if (stopOnLabels.length > 0) {
          const foundStop = pageResponse.data.some(item =>
            item.labels.some(
              l => typeof l.name === 'string' && stopOnLabels.includes(l.name)
            )
          )
          if (foundStop) done()
        }
        return pageResponse.data
      }
    )) as unknown as PullRequest[]

    if (response.length === 1000) {
      core.warning(
        'Pull request search returned 1,000 results (GitHub Search API hard limit). ' +
          'Some PRs may have been omitted — version bump may be under-calculated.'
      )
    }

    core.info('Merged pull requests (' + response.length + ')')

    return response
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        PULL_REQUESTS_SEARCH_FAILED + ' (' + error.message + ')',
        {
          cause: error
        }
      )
    }
    throw error
  }
}
