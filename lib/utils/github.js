import * as core from "@actions/core";
import * as github from "@actions/github";
import { GITHUB_TOKEN, PULL_REQUEST_SEARCH_FAILED as PULL_REQUEST_SEARCH_FAILED, NO_RELEASES_FOUND, NOT_FOUND, OCTOKIT_NOT_INITIALIZED, } from "../constants/github-constants";
let octokit = null;
export async function setupOctokit() {
    const token = core.getInput(GITHUB_TOKEN, { required: true });
    octokit = github.getOctokit(token);
}
export async function getLatestTag() {
    if (octokit === null)
        throw new Error(OCTOKIT_NOT_INITIALIZED);
    const { context } = github;
    const { repo } = context;
    let response = null;
    try {
        response = await octokit.rest.repos.getLatestRelease(repo);
    }
    catch (error) {
        if (error instanceof Error) {
            const { message } = error;
            if (message.includes(NOT_FOUND)) {
                throw new Error(NO_RELEASES_FOUND, {
                    cause: error,
                });
            }
        }
        throw error;
    }
    const { data } = response;
    return data;
}
export async function getMergedPullRequestsFilteredByCreated(createdAt) {
    if (octokit === null)
        throw new Error(OCTOKIT_NOT_INITIALIZED);
    const { context } = github;
    const { owner, repo } = context.repo;
    const q = `repo:${owner}/${repo} is:pr is:merged created:>=${createdAt}`;
    core.debug("Query: " + q);
    let response = null;
    try {
        response = await octokit.rest.search.issuesAndPullRequests({
            q: query
        });
    }
    catch (error) {
        throw new Error(PULL_REQUEST_SEARCH_FAILED, {
            cause: error,
        });
    }
    const { data } = response;
    const { items } = data;
    core.info("Merged pull requests (" + items.length + ")");
    return items;
}
