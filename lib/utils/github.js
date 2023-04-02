import * as core from "@actions/core";
import * as github from "@actions/github";
import { CLOSED, GITHUB_TOKEN, OCTOKIT_NOT_INITIALIZED, } from "../constants/github-constants";
let octokit = null;
export async function setupOctokit() {
    const token = core.getInput(GITHUB_TOKEN);
    octokit = github.getOctokit(token);
}
export async function getLatestTagName() {
    if (octokit === null)
        throw new Error(OCTOKIT_NOT_INITIALIZED);
    const { context } = github;
    const { repo } = context;
    const response = await octokit.rest.repos.getLatestRelease(repo);
    const { data } = response;
    const { tag_name } = data;
    return tag_name;
}
export async function getMergedPullRequestsSinceTagName(tagName) {
    if (octokit === null)
        throw new Error(OCTOKIT_NOT_INITIALIZED);
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
async function isPulLRequestMerged(repo, pullNumber) {
    if (octokit === null)
        throw new Error(OCTOKIT_NOT_INITIALIZED);
    try {
        const response = await octokit.rest.pulls.checkIfMerged({
            ...repo,
            pull_number: pullNumber,
        });
        const { status } = response;
        if (status === 204) {
            return true;
        }
    }
    catch (error) {
        if (error instanceof Error) {
            core.debug(error.message);
        }
    }
    return false;
}
