# Workflows

Workflows are Markdown Standard Operating Procedures (SOPs) that define processes in plain language. They guide the agent on what to do, not how to code it.

## Directory Structure

```
workflows/
├── admin/        # Administrative workflows (review updates, reconciliation)
├── children/     # Child update intake and publishing
├── donation/     # Donation processing workflows
├── email/        # Email notification workflows
├── health/       # Site health monitoring
├── social/       # Social content rules
├── sponsor/      # Sponsor-related workflows
└── README.md     # This file
```

## Workflow Categories

| Category | Purpose | Key Workflows |
|----------|---------|---------------|
| **admin** | Staff operations | Review updates, reconciliation |
| **children** | Child updates | Field intake, academic intake, verification |
| **donation** | Payments | Recurring processing |
| **email** | Notifications | Sponsor welcome, update alerts |
| **health** | Monitoring | Link checks |
| **social** | Content | Posting rules |
| **sponsor** | Sponsor ops | Login verification, onboarding |

Many of these files still describe Airtable tables and tools under `src/lib/tools/` that were deleted on 2026-09-14 when Airtable was retired. Where a file names a tool that no longer exists, the process still stands but the data lives in Postgres (`src/lib/db/`). Update the file when you next touch that process.

## Workflow Format

Each workflow should include:

1. **Objective**: What this workflow accomplishes
2. **Inputs**: What data is needed to start
3. **Steps**: Sequential actions to perform
4. **Tools**: Which tools from `src/lib/tools/` to use
5. **Outputs**: What the workflow produces
6. **Error Handling**: How to handle failures

## Example Workflow Structure

```markdown
# Workflow Name

## Objective
Brief description of what this workflow accomplishes.

## Inputs
- Input 1: Description
- Input 2: Description

## Steps
1. Step description
   - Tool: `tool-name`
   - Input: What to pass
   - Output: What to expect

2. Next step...

## Outputs
- Output 1: Description

## Error Handling
- Error scenario: How to handle
```

## Creating New Workflows

1. Create a new `.md` file in the appropriate subdirectory
2. Follow the workflow format above
3. Reference only existing tools from `src/lib/tools/`
4. Document edge cases and error handling
5. Test with sample data before use

## Key Principles

- **Plain language**: Write like you're briefing a team member
- **Deterministic execution**: Tools do the work, agent orchestrates
- **Error recovery**: Document how to handle failures
- **Continuous improvement**: Update workflows as you learn
