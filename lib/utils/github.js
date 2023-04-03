import * as core from "@actions/core";
import * as github from "@actions/github";
import { CLOSED, GITHUB_TOKEN, MERGED_CHECK_FAILED, NO_RELEASES_FOUND, NOT_FOUND, OCTOKIT_NOT_INITIALIZED, } from "../constants/github-constants";
let octokit = null;
export async function setupOctokit() {
    const token = core.getInput(GITHUB_TOKEN, { required: true });
    octokit = github.getOctokit(token);
}
export async function getLatestTagName() {
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
            core.error(message);
        }
        throw error;
    }
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
    let response = null;
    try {
        response = await octokit.rest.pulls.checkIfMerged({
            ...repo,
            pull_number: pullNumber,
        });
    }
    catch (error) {
        if (error instanceof Error) {
            const { message } = error;
            core.debug(message);
            core.warning(MERGED_CHECK_FAILED + " (#" + pullNumber + " )");
        }
        return;
    }
    const { status } = response;
    if (status === 204) {
        return true;
    }
    return false;
}
