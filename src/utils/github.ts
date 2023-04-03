import * as core from "@actions/core";
import * as github from "@actions/github";
import { GitHub } from "@actions/github/lib/utils";
import {
  CLOSED,
  GITHUB_TOKEN,
  NO_RELEASES_FOUND,
  NOT_FOUND,
  OCTOKIT_NOT_INITIALIZED,
} from "../constants/github-constants";
import { Repo } from "../interfaces/repo-interface";

let octokit: InstanceType<typeof GitHub> | null = null;

export async function setupOctokit() {
  const token = core.getInput(GITHUB_TOKEN, { required: true });
  octokit = github.getOctokit(token);
}

export async function getLatestTagName() {
  if (octokit === null) throw new Error(OCTOKIT_NOT_INITIALIZED);

  const { context } = github;
  const { repo } = context;

  let response = null;

  try {
    response = await octokit.rest.repos.getLatestRelease(repo);
  } catch (error) {
    if (error instanceof Error) {
      const { message } = error;

      if (message.includes(NOT_FOUND)) {
        throw new Error(NO_RELEASES_FOUND, {
          cause: error,
        });
      }

      core.error(message);
    }

    throw error;
  }

  const { data } = response;
  const { tag_name } = data;

  return tag_name;
}

export async function getMergedPullRequestsSinceTagName(tagName: string) {
  if (octokit === null) throw new Error(OCTOKIT_NOT_INITIALIZED);

  const mergedPullRequests = [];

  const { context } = github;
  const { repo } = context;

  const response = await octokit.rest.pulls.list({
    ...repo,
    state: CLOSED,
    head: tagName,
  });

  const closedPullRequests = response.data;

  for (const closedPullRequest of closedPullRequests) {
    const { number } = closedPullRequest;

    if (await isPulLRequestMerged(repo, number)) {
      mergedPullRequests.push(closedPullRequest);
    }
  }

  core.info("Merged pull requests (" + mergedPullRequests.length + ")");

  return mergedPullRequests;
}

async function isPulLRequestMerged(repo: Repo, pullNumber: number) {
  if (octokit === null) throw new Error(OCTOKIT_NOT_INITIALIZED);

  try {
    const response = await octokit.rest.pulls.checkIfMerged({
      ...repo,
      pull_number: pullNumber,
    });

    const { status } = response;

    if (status === 204) {
      return true;
    }
  } catch (error) {
    if (error instanceof Error) {
      core.debug(error.message);
    }
  }

  return false;
}
