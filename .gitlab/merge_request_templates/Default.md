## Description

<!---
This MR needs to produce conventional commit(s) in the main branch.
Ensure one of the following:
- the MR title is a conventional commit message and the MR is set to squash
- the MR is not set to squash and all MR commits have valid conventional commit messages

Docs: https://gitlab.com/gitlab-org/gitlab-vscode-extension/blob/main/docs/developer/commits.md?plain=0#commit-conventions
-->

<!--- Describe your changes in detail -->

## Related Issues

<!--- This project only accepts merge requests related to open issues
If suggesting a new feature or change, please discuss it in an issue first
If fixing a bug, there should be an issue describing it with steps to reproduce -->

Resolves #[issue_number]

## How has this been tested?

<!--- Please describe in detail how you tested your changes. -->
<!--- Include details of your testing environment, and the tests you ran to -->
<!--- see how your change affects other areas of the code, etc. -->

## Screenshots (if appropriate)

### Types of changes

<!--- What types of changes does your code introduce? Put an `x` in all the boxes that apply: -->

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Documentation
- [ ] Chore (Related to CI or Packaging to platforms)
- [ ] Test gap

/label ~"devops::create" ~"group::editor extensions" ~"Category:Editor Extensions" ~"Editor Extensions::VS Code"
/assign me
