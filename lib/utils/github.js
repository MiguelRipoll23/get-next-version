import * as core from "@actions/core";
import * as github from "@actions/github";
import { GITHUB_TOKEN, NO_RELEASES_FOUND, NOT_FOUND, OCTOKIT_NOT_INITIALIZED, PULL_REQUESTS_BASE_BRANCH, PULL_REQUESTS_SEARCH_FAILED, REFS_HEADS, } from "../constants/github-constants";
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
    const { ref } = context;
    const { owner, repo } = context.repo;
    let base = core.getInput(PULL_REQUESTS_BASE_BRANCH);
    if (base.length === 0) {
        base = ref.replace(REFS_HEADS, "");
    }
    const query = `repo:${owner}/${repo} is:pr is:merged base:${base} created:>=${createdAt}`;
    core.debug("Query: " + query);
    let response = null;
    try {
        response = await octokit.rest.search.issuesAndPullRequests({
            q: query,
        });
    }
    catch (error) {
        throw new Error(PULL_REQUESTS_SEARCH_FAILED, {
            cause: error,
        });
    }
    const { data } = response;
    const { items } = data;
    core.info("Merged pull requests (" + items.length + ")");
    return items;
}
