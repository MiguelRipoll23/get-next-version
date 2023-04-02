# generate-tag-name

Generate tag names with the help of semantic versioning and pull requests labels.

## Demo

    Latest tag name: v1.0.0
    Merged pull requests (4)
    ✨ Add feature requested way too many times
    🚫 Update developer dependency
    🛠️ Fix severe bug found after decades
    🚫 Improve code formatter
    New tag name: v1.1.0

## Usage

    - name: Generate tag name
      uses: MiguelRipoll23/generate-tag-name@v1.0.2
      id: generate-tag-name
      with:
        major-labels: breaking-change
        minor-labels: feature,enhancement
        patch-labels: bugfix

See the [examples/](/examples/) directory to learn how to use this action alongside other community actions to update the version name and create a new pull request automatically!

## Inputs

| Name                     | Description                                                          | Default             |
| ------------------------ | -------------------------------------------------------------------- | ------------------- |
| github-token             | Token from GitHub Actions or a Personal Access Token.                | github              |
| channel                  | Target channel (alpha/beta/stable/custom) of the version.            | stable              |
| new-build-for-prerelease | Create a new build if version name contains a prerelease identifier. | true                |
| major-labels             | Comma separated list of labels for major releases.                   | breaking-change     |
| minor-labels             | Comma separated list of labels for minor releases.                   | feature,enhancement |
| patch-labels             | Comma separated list of labels for patch releases.                   | bugfix              |

## Outputs

| Name     | Description                                          |
| -------- | ---------------------------------------------------- |
| tag-name | New generated tag name to use for your next version. |
