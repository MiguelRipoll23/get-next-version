# get-next-version

Bump versions with the help of semantic versioning and pull requests labels.

    Latest tag name: v1.0.0
    Merged pull requests (4)
    ✨ Add feature requested way too many times
    🚫 Update developer dependency
    🛠️ Fix severe bug found after decades
    🚫 Improve code formatter
    Next version: v1.1.0

Voilà! That's your next version.

## Usage

    bump-version:
      name: Bump version
      runs-on: ubuntu-latest
      permissions:
        contents: write
        pull-requests: write

      steps:
      - name: Setup node
        uses: actions/setup-node@v4.0.1

      - name: Get next version
        uses: MiguelRipoll23/get-next-version@v3.0.0
        id: get-next-version

      - name: Update version
        run: |
          npm version --no-git-tag-version ${{ env.NEXT_VERSION }}
        env:
          NEXT_VERSION: ${{ steps.get-next-version.outputs.next-version }}

      - name: Create pull request
        uses: peter-evans/create-pull-request@v6
        with:
          branch: version/${{ steps.get-next-version.outputs.next-version }}
          commit-message: ${{ steps.get-next-version.outputs.next-version }}
          title: Bump version to ${{ steps.get-next-version.outputs.next-version }}
          body: Automated pull request triggered by a new release.
          labels: new-release,ignore-for-release
          draft: true

**See the [examples/](/examples/) directory for complete examples!**

### Inputs

| Name                      | Description                                                         | Default             |
| ------------------------- | ------------------------------------------------------------------- | ------------------- |
| github-token              | Token from GitHub Actions or a Personal Access Token                | github.token        |
| channel                   | Target channel (alpha/beta/stable/custom) of the version            | stable              |
| new-build-for-prerelease  | Create a new build if version name contains a prerelease identifier | true                |
| pull_requests_base_branch | Base branch used during pull requests search                        | github.ref          |
| major-labels              | Comma separated list of labels for major releases                   | breaking-change     |
| minor-labels              | Comma separated list of labels for minor releases                   | feature,enhancement |
| patch-labels              | Comma separated list of labels for patch releases                   | bugfix,dependencies |

### Outputs

| Name         | Description                           |
| ------------ | ------------------------------------- |
| next-version | Next version to use for a new release |

## Feedback

Any feedback or contributions to this repository are welcome! Please open an
issue or a pull request describing your suggestions along your use case.
